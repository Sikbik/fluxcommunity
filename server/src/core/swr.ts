import { type Clock, systemClock } from './clock.ts';
import { errText } from './log.ts';
import { SingleFlight } from './singleflight.ts';

export interface SwrOptions<T> {
  name: string;
  /** Freshness window: younger than this is `fresh`. */
  ttlMs: number;
  /** Beyond this age the value is dropped (reads return null). Default: never. */
  maxAgeMs?: number;
  load: () => Promise<T>;
  clock?: Clock;
  /** Called after a successful load with the new value. */
  onUpdate?: (value: T) => void;
  /** Called after a failed load. */
  onError?: (err: unknown) => void;
  /** Minimum gap between read-triggered revalidations after a failure. Default min(ttlMs, 5000). */
  retryGapMs?: number;
}

export interface SwrRead<T> {
  value: T | null;
  /** Epoch ms of the last successful load, null when never loaded. */
  fetchedAt: number | null;
  ageMs: number | null;
  /** Younger than ttl. */
  fresh: boolean;
}

/**
 * A single cached value with TTL + stale-while-revalidate semantics and single-flight refresh.
 * `read()` is synchronous and never throws: it returns whatever is held and, when older than the TTL,
 * kicks off one background revalidation. A failed refresh keeps the previous value.
 */
export class SwrCell<T> {
  readonly name: string;
  readonly #opts: SwrOptions<T>;
  readonly #clock: Clock;
  readonly #flight = new SingleFlight<boolean>();
  #value: T | null = null;
  #fetchedAt: number | null = null;
  #lastError: string | null = null;
  #lastOkAt: number | null = null;
  #nextAttemptAt = 0;
  failures = 0;

  constructor(opts: SwrOptions<T>) {
    this.name = opts.name;
    this.#opts = opts;
    this.#clock = opts.clock ?? systemClock;
  }

  get lastError(): string | null {
    return this.#lastError;
  }

  get lastOkAt(): number | null {
    return this.#lastOkAt;
  }

  get refreshing(): boolean {
    return this.#flight.active;
  }

  peek(): SwrRead<T> {
    const now = this.#clock.now();
    if (this.#value === null || this.#fetchedAt === null) {
      return { value: null, fetchedAt: null, ageMs: null, fresh: false };
    }
    const ageMs = Math.max(0, now - this.#fetchedAt);
    if (this.#opts.maxAgeMs !== undefined && ageMs > this.#opts.maxAgeMs) {
      return { value: null, fetchedAt: this.#fetchedAt, ageMs, fresh: false };
    }
    return { value: this.#value, fetchedAt: this.#fetchedAt, ageMs, fresh: ageMs <= this.#opts.ttlMs };
  }

  /** peek() plus a background revalidation when stale (or empty). */
  read(): SwrRead<T> {
    const r = this.peek();
    if (!r.fresh && this.#clock.now() >= this.#nextAttemptAt) void this.refresh();
    return r;
  }

  /** Store a value pushed from elsewhere (for example the block watcher). */
  set(value: T, at: number = this.#clock.now()): void {
    this.#value = value;
    this.#fetchedAt = at;
    this.#lastOkAt = at;
    this.#lastError = null;
    this.failures = 0;
  }

  /** Single-flight refresh. Resolves true on success, false on failure; never rejects. */
  refresh(): Promise<boolean> {
    return this.#flight.run(async () => {
      try {
        const v = await this.#opts.load();
        this.set(v);
        this.#opts.onUpdate?.(v);
        return true;
      } catch (err) {
        this.failures += 1;
        this.#lastError = errText(err);
        const gap = this.#opts.retryGapMs ?? Math.min(this.#opts.ttlMs, 5_000);
        this.#nextAttemptAt = this.#clock.now() + gap;
        this.#opts.onError?.(err);
        return false;
      }
    });
  }
}
