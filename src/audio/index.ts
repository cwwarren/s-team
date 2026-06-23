import { Worker } from "node:worker_threads";
import { createRing, Ring } from "./ring";
import { PA } from "./portaudio";

const WORKER = new URL("./worker.ts", import.meta.url);
const RING_SAMPLES = 24000 * 2;

export class Audio {
  private capture?: Worker;
  private playback?: Worker;
  private stopSab = new SharedArrayBuffer(4);
  private stopFlag = new Int32Array(this.stopSab);
  private ringSab = createRing(RING_SAMPLES);
  private ring = new Ring(this.ringSab);

  private pending: Int16Array[] = [];
  private drainTimer?: ReturnType<typeof setInterval>;

  constructor(private onCapture: (pcm: Buffer) => void) {}

  async start(): Promise<void> {
    if (PA.Pa_Initialize() !== 0) throw new Error("Pa_Initialize failed");

    this.capture = new Worker(WORKER, { workerData: { role: "capture", stopSab: this.stopSab } });
    this.capture.on("message", (m: any) => {
      if (m.type === "audio") {
        const i16: Int16Array = m.buf;
        this.onCapture(Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength));
      } else if (m.type === "error") {
        console.error("[audio:capture]", m.msg);
      }
    });
    await ready(this.capture);

    this.playback = new Worker(WORKER, {
      workerData: { role: "playback", stopSab: this.stopSab, ringSab: this.ringSab },
    });
    this.playback.on("message", (m: any) => {
      if (m.type === "error") console.error("[audio:playback]", m.msg);
    });
    await ready(this.playback);

    this.drainTimer = setInterval(() => this.drain(), 10);
  }

  play(pcm: Buffer): void {
    const i16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1);
    this.pending.push(i16);
    this.drain();
  }

  private drain(): void {
    while (this.pending.length > 0) {
      const head = this.pending[0]!;
      const n = this.ring.write(head);
      if (n < head.length) {
        this.pending[0] = head.subarray(n);
        break;
      }
      this.pending.shift();
    }
  }

  clearPlayback(): void {
    this.pending.length = 0;
    this.ring.clear();
  }

  stop(): void {
    Atomics.store(this.stopFlag, 0, 1);
    if (this.drainTimer) clearInterval(this.drainTimer);

    const workers = [this.capture, this.playback].filter(Boolean) as Worker[];
    if (workers.length === 0) {
      PA.Pa_Terminate();
      return;
    }
    let exited = 0;
    for (const w of workers) {
      w.once("exit", () => {
        if (++exited === workers.length) PA.Pa_Terminate();
      });
    }
  }
}

function ready(w: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMsg = (m: any) => {
      if (m.type === "ready") {
        w.off("message", onMsg);
        resolve();
      } else if (m.type === "error") {
        reject(new Error(m.msg));
      }
    };
    w.on("message", onMsg);
    w.once("error", reject);
    w.once("exit", (code) => code !== 0 && reject(new Error(`audio worker exited (${code})`)));
  });
}
