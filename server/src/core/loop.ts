import { jitter } from './clock.ts';

export interface LoopOptions {
  name: string;
  intervalMs: number;
  /** One iteration. Return false (or throw) to count a failure and back off. */
  run: () => Promise<boolean | undefined>;
  jitterRatio?: number;
  /** Delay before the first iteration. Default: jittered interval / 4, so boot is not a thundering herd. */
  initialDelayMs?: number;
  /** Cap for exponential backoff on consecutive failures. Default 10x interval, at most 5 minutes. */
  maxBackoffMs?: number;
  rand?: () => number;
  onError?: (err: unknown, failures: number) => void;
}

export interface Loop {
  stop(): void;
  readonly stopped: boolean;
}

/** Delay before the next iteration given consecutive failures: interval * 2^failures, capped, jittered. */
export function nextDelay(
  intervalMs: number,
  failures: number,
  maxBackoffMs: number,
  ratio: number,
  rand: () => number = Math.random,
): number {
  const base = failures <= 0 ? intervalMs : Math.min(maxBackoffMs, intervalMs * 2 ** Math.min(failures, 16));
  return jitter(Math.max(base, intervalMs), ratio, rand);
}

/**
 * A self-rescheduling jittered loop that never overlaps itself, backs off exponentially on failure and
 * never throws. The next iteration is scheduled only after the previous one finishes.
 */
export function startLoop(opts: LoopOptions): Loop {
  const ratio = opts.jitterRatio ?? 0.15;
  const rand = opts.rand ?? Math.random;
  const maxBackoff = opts.maxBackoffMs ?? Math.min(300_000, opts.intervalMs * 10);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let failures = 0;

  const tick = async () => {
    if (stopped) return;
    let ok = true;
    try {
      const r = await opts.run();
      ok = r !== false;
    } catch (err) {
      ok = false;
      opts.onError?.(err, failures + 1);
    }
    failures = ok ? 0 : failures + 1;
    if (stopped) return;
    timer = setTimeout(tick, nextDelay(opts.intervalMs, failures, maxBackoff, ratio, rand));
  };

  const first = opts.initialDelayMs ?? jitter(opts.intervalMs / 4, 0.5, rand);
  timer = setTimeout(tick, Math.max(0, first));

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    get stopped() {
      return stopped;
    },
  };
}
