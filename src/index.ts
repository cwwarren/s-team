import { Realtime } from "./realtime";
import { Audio } from "./audio";
import { Store, type Msg } from "./store";
import { pickSession } from "./startup";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("Missing OPENAI_API_KEY — add it to .env (see .env.example).");
  process.exit(1);
}
const model = process.env.STEAM_MODEL ?? "gpt-realtime-2";
const voice = process.env.STEAM_VOICE ?? "cedar";
const dbPath = process.env.STEAM_DB ?? "s-team.db";

const releaseLock = acquireLock(dbPath);

let store: Store;
try {
  store = new Store(dbPath);
} catch (e) {
  console.error(`Could not open database at ${dbPath}: ${(e as Error).message}`);
  releaseLock();
  process.exit(1);
}

const { sessionId, resumed } = await pickSession(store);

let audio: Audio;
let shuttingDown = false;

function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nShutting down…");
  audio?.stop();
  rt.close();
  setTimeout(() => {
    store.close();
    releaseLock();
    process.exit(code);
  }, 250);
}

const rt = new Realtime(key, model, voice, {
  onLog: (m) => console.log(`\x1b[2m· ${m}\x1b[0m`),
  onOutputAudio: (pcm) => audio.play(pcm),
  onInterrupt: () => audio.clearPlayback(),
  onAssistantText: (t, done) => {
    if (!done) return;
    console.log(`\n\x1b[36m${t}\x1b[0m\n`);
    store.recordAssistant(sessionId, t);
  },
  onUserText: (t) => {
    console.log(`\x1b[2myou: ${t}\x1b[0m`);
    store.recordUser(sessionId, t);
  },
  onToolCall: (n, a) => console.log(`\x1b[33m  ↪ ${n}(${a})\x1b[0m`),
  onTool: (n, a, id, result) => store.recordTool(sessionId, id, n, a, result),
  onClose: (code) => {
    console.error(`\nSession closed unexpectedly (code ${code}). Exiting.`);
    shutdown(1);
  },
});

audio = new Audio((pcm) => rt.appendAudio(pcm));

process.on("SIGINT", () => shutdown(0));

console.log(resumed ? "Resuming thread…" : "New thread.");
await rt.connect();
if (resumed) {
  const history = store.load(sessionId);
  rt.seedItems(history.flatMap(toItems));
  console.log(`\x1b[2m(restored ${history.length} prior turns)\x1b[0m`);
}
console.log("Starting audio (first run will prompt for microphone access)…");
await audio.start();
console.log("\nListening. Talk to your Chief of Staff.  (Ctrl+C to exit)\n");

function toItems(m: Msg): object[] {
  switch (m.kind) {
    case "user":
      return [{ type: "message", role: "user", content: [{ type: "input_text", text: m.data.text ?? "" }] }];
    case "assistant":
      return [{ type: "message", role: "assistant", content: [{ type: "output_text", text: m.data.text ?? "" }] }];
    case "tool":
      return [
        { type: "function_call", name: m.data.name, call_id: m.data.call_id, arguments: m.data.arguments ?? "{}", status: "completed" },
        { type: "function_call_output", call_id: m.data.call_id, output: JSON.stringify(m.data.result ?? {}) },
      ];
    default:
      return [];
  }
}

function acquireLock(path: string): () => void {
  const lock = `${path}.lock`;
  const release = () => {
    try {
      rmSync(lock);
    } catch {}
  };
  try {
    writeFileSync(lock, String(process.pid), { flag: "wx" });
    return release;
  } catch {
    const pid = Number(readFileSync(lock, "utf8").trim());
    if (pid && isAlive(pid)) {
      console.error(`Another s-team is running (pid ${pid}). Close it first, or set STEAM_DB to a different file.`);
      process.exit(1);
    }
    writeFileSync(lock, String(process.pid));
    return release;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
