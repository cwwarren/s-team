import { ptr, type Pointer } from "bun:ffi";
import { workerData, parentPort } from "node:worker_threads";
import { PA, PA_INT16, SAMPLE_RATE, FRAMES_PER_BUFFER, paErr } from "./portaudio";
import { Ring } from "./ring";

const role: "capture" | "playback" = workerData.role;
const stop = new Int32Array(workerData.stopSab);
const port = parentPort!;

function fail(msg: string): never {
  port.postMessage({ type: "error", msg });
  process.exit(1);
}

const streamRef = new BigUint64Array(1);
const numIn = role === "capture" ? 1 : 0;
const numOut = role === "capture" ? 0 : 1;
const openErr = PA.Pa_OpenDefaultStream(
  ptr(streamRef), numIn, numOut, PA_INT16, SAMPLE_RATE, FRAMES_PER_BUFFER, null, null,
);
if (openErr !== 0) fail(`Pa_OpenDefaultStream(${role}) failed: ${paErr(openErr)}`);
const stream = Number(streamRef[0]!) as Pointer;
if (PA.Pa_StartStream(stream) !== 0) fail(`Pa_StartStream(${role}) failed`);
port.postMessage({ type: "ready", role });

if (role === "capture") {
  while (Atomics.load(stop, 0) === 0) {
    const buf = new Int16Array(FRAMES_PER_BUFFER);
    PA.Pa_ReadStream(stream, ptr(buf), FRAMES_PER_BUFFER);
    port.postMessage({ type: "audio", buf }, [buf.buffer]);
  }
} else {
  const ring = new Ring(workerData.ringSab);
  const out = new Int16Array(FRAMES_PER_BUFFER);
  while (Atomics.load(stop, 0) === 0) {
    const n = ring.read(out);
    if (n < FRAMES_PER_BUFFER) out.fill(0, n);
    PA.Pa_WriteStream(stream, ptr(out), FRAMES_PER_BUFFER);
  }
}

PA.Pa_CloseStream(stream);
process.exit(0);
