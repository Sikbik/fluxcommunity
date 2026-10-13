/** Time source, injectable so tests can be deterministic. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  #t: number;
  constructor(start = 0) {
    this.#t = start;
  }
  now(): number {
    return this.#t;
  }
  advance(ms: number): void {
    this.#t += ms;
  }
  set(ms: number): void {
    this.#t = ms;
  }
}

/** Uniform jitter: returns `ms` scaled by a factor in [1 - ratio, 1 + ratio]. */
export function jitter(ms: number, ratio = 0.15, rand: () => number = Math.random): number {
  const f = 1 + (rand() * 2 - 1) * ratio;
  return Math.max(0, Math.round(ms * f));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
