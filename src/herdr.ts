import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadSkillText(): string {
  const path = process.env.STEAM_HERDR_SKILL ?? fileURLToPath(new URL("./herdr.skill.md", import.meta.url));
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "(herdr skill text unavailable)";
  }
}

export const HERDR_SKILL_TEXT = loadSkillText();

const ALLOWED = new Set(["workspace", "worktree", "tab", "pane", "agent", "wait", "notification", "status"]);
const MAX_OUTPUT = 6000;
const TIMEOUT_MS = 30_000;

export const TOOLS = [
  {
    type: "function",
    name: "herdr",
    description:
      'Run a herdr CLI command to control the agent workspace. Pass the argument vector as `args`, e.g. ["pane","list"] or ["pane","split","w1:p1","--direction","right","--no-focus"]. The full command reference is in your instructions under "# herdr reference". Returns the raw CLI result (usually JSON).',
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "array",
          items: { type: "string" },
          description: 'Argument vector passed verbatim to the herdr CLI. The first element must be a herdr noun such as pane, workspace, tab, agent, or wait.',
        },
      },
      required: ["args"],
    },
  },
];

export async function runHerdr(parsed: any): Promise<unknown> {
  const args = parsed?.args;
  if (!Array.isArray(args) || args.length === 0 || !args.every((a: unknown) => typeof a === "string")) {
    return { ok: false, error: "args must be a non-empty array of strings" };
  }
  if (!ALLOWED.has(args[0])) {
    return { ok: false, error: `'${args[0]}' is not an allowed herdr command. Allowed: ${[...ALLOWED].join(", ")}` };
  }

  const proc = Bun.spawn(["herdr", ...args], {
    env: { ...process.env, HERDR_ENV: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const collect = Promise.all([
    new Response(proc.stdout).text().catch(() => ""),
    new Response(proc.stderr).text().catch(() => ""),
  ]).then(async ([out, err]) => {
    const code = await proc.exited;
    return { ok: code === 0, exit_code: code, stdout: truncate(out.trim()), stderr: truncate(err.trim()) };
  });

  const timeout = new Promise<"timeout">((resolve) => setTimeout(resolve, TIMEOUT_MS, "timeout"));
  const result = await Promise.race([collect, timeout]);
  if (result === "timeout") {
    proc.kill();
    collect.catch(() => {});
    return { ok: false, timed_out: true, error: `herdr ${args[0]} exceeded ${TIMEOUT_MS / 1000}s and was stopped; poll with a shorter timeout instead of one long wait` };
  }
  return result;
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…[truncated ${s.length - MAX_OUTPUT} chars]` : s;
}
