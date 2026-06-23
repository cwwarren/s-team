import WebSocket from "ws";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOLS, runHerdr, HERDR_SKILL_TEXT } from "./herdr";

const INSTRUCTIONS = `${SYSTEM_PROMPT}\n\n# herdr reference\n\n${HERDR_SKILL_TEXT}`;

export type RealtimeHandlers = {
  onOutputAudio?: (pcm: Buffer) => void;
  onInterrupt?: () => void;
  onAssistantText?: (text: string, done: boolean) => void;
  onUserText?: (text: string) => void;
  onToolCall?: (name: string, args: string, callId: string) => void;
  onTool?: (name: string, args: string, callId: string, result: unknown) => void;
  onClose?: (code: number) => void;
  onLog?: (msg: string) => void;
};

const URL = "wss://api.openai.com/v1/realtime";

export class Realtime {
  private ws!: WebSocket;
  constructor(
    private apiKey: string,
    private model: string,
    private voice: string,
    private h: RealtimeHandlers,
  ) {}

  private ready = false;
  private closing = false;
  private responseEpoch = 0;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${URL}?model=${encodeURIComponent(this.model)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      this.ws.on("open", () => {
        this.log("websocket open");
        this.send({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: INSTRUCTIONS,
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                turn_detection: { type: "semantic_vad" },
                transcription: { model: "gpt-4o-mini-transcribe" },
              },
              output: {
                format: { type: "audio/pcm", rate: 24000 },
                voice: this.voice,
              },
            },
            tools: TOOLS,
            tool_choice: "auto",
            reasoning: { effort: "high" },
          },
        });
      });
      this.ws.on("message", (raw) =>
        this.onMessage(raw.toString(), () => {
          this.ready = true;
          resolve();
        }, reject),
      );
      this.ws.on("error", (e) => reject(e));
      this.ws.on("close", (code) => {
        this.log(`websocket closed (${code})`);
        if (!this.closing) this.h.onClose?.(code);
      });
    });
  }

  send(event: object) {
    this.ws.send(JSON.stringify(event));
  }

  appendAudio(pcm: Buffer) {
    this.send({ type: "input_audio_buffer.append", audio: pcm.toString("base64") });
  }

  seedItems(items: object[]) {
    for (const it of items) this.send({ type: "conversation.item.create", item: it });
  }

  sendText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    this.send({ type: "response.create" });
  }

  close() {
    this.closing = true;
    this.ws?.close();
  }

  private log(m: string) {
    this.h.onLog?.(m);
  }

  private async onMessage(raw: string, resolveConnect: () => void, rejectConnect: (e: Error) => void) {
    let ev: any;
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      await this.dispatch(ev, resolveConnect, rejectConnect);
    } catch (e) {
      this.log(`handler error for ${ev?.type}: ${(e as Error).message}`);
    }
  }

  private async dispatch(ev: any, resolveConnect: () => void, rejectConnect: (e: Error) => void) {
    switch (ev.type) {
      case "session.created":
        this.log("session created");
        break;
      case "session.updated":
        this.log("session ready");
        resolveConnect();
        break;
      case "input_audio_buffer.speech_started":
        this.h.onInterrupt?.();
        break;
      case "response.output_audio.delta":
        if (ev.delta) this.h.onOutputAudio?.(Buffer.from(ev.delta, "base64"));
        break;
      case "response.output_audio_transcript.delta":
        this.h.onAssistantText?.(ev.delta ?? "", false);
        break;
      case "response.output_audio_transcript.done":
        this.h.onAssistantText?.(ev.transcript ?? "", true);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.h.onUserText?.(ev.transcript ?? "");
        break;
      case "response.created":
        this.responseEpoch++;
        break;
      case "response.function_call_arguments.done":
        this.log(`tool args complete: ${ev.call_id} (${(ev.arguments ?? "").length} chars)`);
        break;
      case "response.done":
        await this.handleResponseDone(ev);
        break;
      case "error":
        this.log(`ERROR: ${JSON.stringify(ev.error ?? ev)}`);
        if (!this.ready) rejectConnect(new Error(JSON.stringify(ev.error ?? ev)));
        break;
    }
  }

  private async handleResponseDone(ev: any) {
    const status = ev.response?.status;
    const calls = (ev.response?.output ?? []).filter((o: any) => o.type === "function_call");

    if (status !== "completed") {
      for (const call of calls) {
        this.log(`skip tool ${call.name}: response ${status} (${(call.arguments ?? "").length} chars delivered)`);
      }
      this.h.onInterrupt?.();
      return;
    }

    if (calls.length === 0) return;

    const epoch = this.responseEpoch;

    let dispatched = false;
    for (const call of calls) {
      let parsed: any;
      try {
        parsed = JSON.parse(call.arguments || "{}");
      } catch {
        this.log(`MALFORMED tool args for ${call.name} (${(call.arguments ?? "").length} chars): ${call.arguments}`);
        this.reply(call.call_id, { ok: false, error: "arguments were not valid JSON; rebuild and retry" });
        dispatched = true;
        continue;
      }

      this.h.onToolCall?.(call.name, call.arguments, call.call_id);
      let result: unknown;
      try {
        result = await runHerdr(parsed);
      } catch (e) {
        result = { ok: false, error: `tool failed: ${(e as Error).message}` };
      }
      this.reply(call.call_id, result);
      this.h.onTool?.(call.name, call.arguments, call.call_id, result);
      dispatched = true;
    }

    if (dispatched && this.responseEpoch === epoch) {
      this.send({ type: "response.create" });
    }
  }

  private reply(callId: string, output: unknown) {
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
  }
}
