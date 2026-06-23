import WebSocket from "ws";
import { TOOLS } from "./herdr";

const key = process.env.OPENAI_API_KEY!;
const model = process.env.STEAM_MODEL ?? "gpt-realtime-2";
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
  headers: { Authorization: `Bearer ${key}` },
});
const send = (o: object) => ws.send(JSON.stringify(o));
const item = (it: object) => send({ type: "conversation.item.create", item: it });

let errors = 0;

ws.on("open", () => {
  send({
    type: "session.update",
    session: {
      type: "realtime",
      instructions: "You are a test assistant. Be terse.",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          turn_detection: { type: "semantic_vad" },
          transcription: { model: "gpt-4o-mini-transcribe" },
        },
        output: { format: { type: "audio/pcm", rate: 24000 }, voice: "cedar" },
      },
      tools: TOOLS,
      tool_choice: "auto",
    },
  });
});

ws.on("message", (raw) => {
  const ev: any = JSON.parse(raw.toString());
  switch (ev.type) {
    case "session.updated":
      console.log("[seed] session.updated OK — transcription field accepted");
      // seed a prior conversation as structured items
      item({ type: "message", role: "user", content: [{ type: "input_text", text: "Earlier I asked you to review the auth tests in pane w1:p2." }] });
      item({ type: "message", role: "assistant", content: [{ type: "output_text", text: "I delegated that review to pane w1:p2." }] });
      item({ type: "function_call", name: "herdr", call_id: "seed_call_1", arguments: JSON.stringify({ args: ["pane", "read", "w1:p2"] }), status: "completed" });
      item({ type: "function_call_output", call_id: "seed_call_1", output: JSON.stringify({ ok: true, stdout: "12 tests passing" }) });
      // now ask a question that requires the seeded context
      item({ type: "message", role: "user", content: [{ type: "input_text", text: "In one sentence: what did I ask you to do earlier, and what was the result?" }] });
      send({ type: "response.create" });
      break;
    case "response.output_audio_transcript.done":
      console.log("[seed] assistant:", ev.transcript);
      break;
    case "response.done":
      console.log("[seed] response.done status:", ev.response?.status, "| item-create errors:", errors);
      ws.close();
      process.exit(0);
    case "error":
      errors++;
      console.log("[seed] ERROR:", JSON.stringify(ev.error ?? ev));
      break;
  }
});

setTimeout(() => { console.log("[seed] timeout"); process.exit(1); }, 25000);
