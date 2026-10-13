import { type Clock, jitter, systemClock } from './clock.ts';

export type BreakerState = 'closed' | 'open' | 'half-open';

export class BreakerOpenError extends Error {
  readonly retryAfterMs: number;
  constructor(name: string, retryAfterMs: number) {
    super(`circuit open for ${name}`);
    this.name = 'BreakerOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface BreakerOptions {
  name: string;
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  /** First cool-down; doubles on every consecutive trip up to `maxCooldownMs`. */
  baseCooldownMs?: number;
  maxCooldownMs?: number;
  clock?: Clock;
  rand?: () => number;
  onChange?: (state: BreakerState, info: { trips: number; cooldownMs: number }) => void;
}

/**
 * Per-upstream circuit breaker. Closed: calls flow. After `failureThreshold` consecutive failures it opens
 * and rejects instantly for a cool-down that doubles on each consecutive trip (with jitter). After the
 * cool-down exactly one trial call is let through (half-open); success closes it, failure re-opens it.
 */
export class CircuitBreaker {
  readonly name: string;
  readonly #threshold: number;
  readonly #base: number;
  readonly #max: number;
  readonly #clock: Clock;
  readonly #rand: () => number;
  readonly #onChange?: BreakerOptions['onChange'];
  #state: BreakerState = 'closed';
  #failures = 0;
  #trips = 0;
  #openUntil = 0;
  #trialInFlight = false;

  constructor(opts: BreakerOptions) {
    this.name = opts.name;
    this.#threshold = opts.failureThreshold ?? 5;
    this.#base = opts.baseCooldownMs ?? 5_000;
    this.#max = opts.maxCooldownMs ?? 120_000;
    this.#clock = opts.clock ?? systemClock;
    this.#rand = opts.rand ?? Math.random;
    this.#onChange = opts.onChange;
  }

  get state(): BreakerState {
    return this.#state;
  }

  /** Milliseconds until a trial call is allowed (0 when calls may flow). */
  get retryAfterMs(): number {
    return this.#state === 'open' ? Math.max(0, this.#openUntil - this.#clock.now()) : 0;
  }

  /** True when a call may proceed. In half-open state only one trial is admitted at a time. */
  allow(): boolean {
    if (this.#state === 'closed') return true;
    if (this.#state === 'open') {
      if (this.#clock.now() < this.#openUntil) return false;
      this.#state = 'half-open';
      this.#trialInFlight = false;
    }
    if (this.#trialInFlight) return false;
    this.#trialInFlight = true;
    return true;
  }

  success(): void {
    this.#failures = 0;
    this.#trialInFlight = false;
    if (this.#state !== 'closed') {
      this.#state = 'closed';
      this.#trips = 0;
      this.#onChange?.('closed', { trips: 0, cooldownMs: 0 });
    }
  }

  failure(): void {
    this.#trialInFlight = false;
    this.#failures += 1;
    if (this.#state === 'half-open' || (this.#state === 'closed' && this.#failures >= this.#threshold)) {
      this.#trips += 1;
      const raw = Math.min(this.#max, this.#base * 2 ** (this.#trips - 1));
      const cooldownMs = jitter(raw, 0.2, this.#rand);
      this.#state = 'open';
      this.#openUntil = this.#clock.now() + cooldownMs;
      this.#onChange?.('open', { trips: this.#trips, cooldownMs });
    }
  }

  /** Runs `fn` under the breaker. Throws BreakerOpenError without calling `fn` when open. */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allow()) throw new BreakerOpenError(this.name, this.retryAfterMs);
    try {
      const out = await fn();
      this.success();
      return out;
    } catch (err) {
      this.failure();
      throw err;
    }
  }
}
