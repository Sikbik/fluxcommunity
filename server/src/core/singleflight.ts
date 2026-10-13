/** Collapses concurrent calls into one in-flight promise. */
export class SingleFlight<T> {
  #inflight: Promise<T> | null = null;

  get active(): boolean {
    return this.#inflight !== null;
  }

  run(fn: () => Promise<T>): Promise<T> {
    if (this.#inflight) return this.#inflight;
    const p = (async () => fn())().finally(() => {
      if (this.#inflight === p) this.#inflight = null;
    });
    this.#inflight = p;
    return p;
  }
}

/** Single-flight per key (for example per compressed variant of one file). */
export class KeyedSingleFlight<T> {
  readonly #inflight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.#inflight.get(key);
    if (existing) return existing;
    const p = (async () => fn())().finally(() => {
      if (this.#inflight.get(key) === p) this.#inflight.delete(key);
    });
    this.#inflight.set(key, p);
    return p;
  }

  get size(): number {
    return this.#inflight.size;
  }
}
