const HEADER_INTS = 3;
const HEADER_BYTES = HEADER_INTS * 4;

export function createRing(capacitySamples: number): SharedArrayBuffer {
  return new SharedArrayBuffer(HEADER_BYTES + capacitySamples * 2);
}

export class Ring {
  private hdr: Int32Array;
  private data: Int16Array;
  private cap: number;

  constructor(sab: SharedArrayBuffer) {
    this.hdr = new Int32Array(sab, 0, HEADER_INTS);
    this.data = new Int16Array(sab, HEADER_BYTES);
    this.cap = this.data.length;
  }

  write(src: Int16Array): number {
    const w = Atomics.load(this.hdr, 0);
    const r = Atomics.load(this.hdr, 1);
    const free = (r - w - 1 + this.cap) % this.cap;
    const n = Math.min(src.length, free);
    for (let i = 0; i < n; i++) this.data[(w + i) % this.cap] = src[i]!;
    Atomics.store(this.hdr, 0, (w + n) % this.cap);
    return n;
  }

  clear(): void {
    Atomics.store(this.hdr, 2, 1);
  }

  read(out: Int16Array): number {
    if (Atomics.exchange(this.hdr, 2, 0) === 1) {
      Atomics.store(this.hdr, 1, Atomics.load(this.hdr, 0));
    }
    const w = Atomics.load(this.hdr, 0);
    const r = Atomics.load(this.hdr, 1);
    const used = (w - r + this.cap) % this.cap;
    const n = Math.min(out.length, used);
    for (let i = 0; i < n; i++) out[i] = this.data[(r + i) % this.cap]!;
    Atomics.store(this.hdr, 1, (r + n) % this.cap);
    return n;
  }
}
