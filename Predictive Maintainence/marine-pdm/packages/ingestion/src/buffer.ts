import type { EngineSnapshot } from '@marine-pdm/shared';

const BUFFER_SIZE = 300;
const STALE_THRESHOLD_MS = 5000; // mark stale if no update for 5s

export interface BufferedSnapshot {
  snapshot: EngineSnapshot;
  quality: 'GOOD' | 'STALE' | 'BAD';
}

export class RingBuffer {
  private buf: BufferedSnapshot[] = [];
  private head = 0;
  private size = 0;
  private lastUpdateMs = 0;

  push(snap: EngineSnapshot): void {
    const entry: BufferedSnapshot = { snapshot: snap, quality: 'GOOD' };
    if (this.size < BUFFER_SIZE) {
      this.buf.push(entry);
      this.size++;
    } else {
      this.buf[this.head] = entry;
    }
    this.head = (this.head + 1) % BUFFER_SIZE;
    this.lastUpdateMs = Date.now();
  }

  getLatest(): BufferedSnapshot | null {
    if (this.size === 0) return null;
    const idx = (this.head - 1 + BUFFER_SIZE) % BUFFER_SIZE;
    const entry = this.buf[idx]!;
    const age = Date.now() - this.lastUpdateMs;
    return { snapshot: entry.snapshot, quality: age > STALE_THRESHOLD_MS ? 'STALE' : 'GOOD' };
  }

  getAll(): BufferedSnapshot[] {
    if (this.size < BUFFER_SIZE) return [...this.buf];
    const result: BufferedSnapshot[] = [];
    for (let i = 0; i < BUFFER_SIZE; i++) {
      result.push(this.buf[(this.head + i) % BUFFER_SIZE]!);
    }
    return result;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }
}
