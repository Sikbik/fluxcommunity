/**
 * Keeps a navigation target in place while the page settles.
 *
 * Sections below the hero mount lazily and are much taller than their placeholders. So after a jump
 * (a nav click, a shared #hash link, Back) the sections just above the target mount and grow, and push
 * the target away from where the visitor was taken. The browser's scroll anchoring does not rescue this:
 * the jump is programmatic and the content that grows is ahead of the viewport, not under it.
 *
 * `pinTarget` re-aligns the target whenever the document's layout changes, until layout has been quiet
 * for a moment, a hard cap passes, or the visitor takes over (wheel, touch, keyboard, pointer).
 *
 * The environment is injected so the logic is unit-testable without a browser (see pin.test.ts).
 */
export interface PinEnv {
  now(): number;
  /** How far the target sits from where it belongs, in px (positive: below). Null when it is missing. */
  offset(): number | null;
  /** Puts the target back where it belongs. Instant. */
  align(): void;
  /** Calls `cb` whenever the document's layout size changes. Returns the disconnect function. */
  watchLayout(cb: () => void): () => void;
  /** Calls `cb` on the first input that means the visitor scrolls by hand. Returns the removal function. */
  watchInput(cb: () => void): () => void;
  /** One-shot timer. Returns the cancel function. */
  after(ms: number, cb: () => void): () => void;
}

/** Why a pin ended: the page went quiet, the age cap hit, the visitor took over, or the caller stopped it. */
export type PinStopReason = 'quiet' | 'cap' | 'input' | 'released';

export interface PinOptions {
  /** Stop once layout has not changed for this long. Default 900 ms. */
  quietMs?: number;
  /** Stop at this age no matter what. Default 4500 ms. */
  maxMs?: number;
  /** Offsets within this many px count as aligned. Default 2. */
  tolerancePx?: number;
  /** Called once, when the pin ends. */
  onStop?: (reason: PinStopReason) => void;
}

/** How often the pin double-checks alignment between layout events. */
const CHECK_MS = 120;

/** Starts pinning. Returns a function that stops it (safe to call more than once). */
export function pinTarget(env: PinEnv, opts: PinOptions = {}): () => void {
  const quietMs = opts.quietMs ?? 900;
  const maxMs = opts.maxMs ?? 4500;
  const tolerance = opts.tolerancePx ?? 2;
  const startedAt = env.now();
  let lastActiveAt = startedAt;
  let stopped = false;
  let cancelTimer: () => void = () => {};
  const cleanups: Array<() => void> = [];

  const stop = (reason: PinStopReason): void => {
    if (stopped) return;
    stopped = true;
    cancelTimer();
    for (const c of cleanups) c();
    opts.onStop?.(reason);
  };

  /** Re-aligns when the target has drifted. True when it had. */
  const realign = (): boolean => {
    const off = env.offset();
    if (off === null || Math.abs(off) <= tolerance) return false;
    env.align();
    return true;
  };

  const check = (): void => {
    if (stopped) return;
    const t = env.now();
    // Layout shifts that resize nothing the observer watches still move the target; catch them here.
    if (realign()) lastActiveAt = t;
    if (t - startedAt >= maxMs) {
      stop('cap');
      return;
    }
    if (t - lastActiveAt >= quietMs) {
      stop('quiet');
      return;
    }
    cancelTimer = env.after(CHECK_MS, check);
  };

  cleanups.push(
    env.watchLayout(() => {
      if (stopped) return;
      lastActiveAt = env.now();
      realign();
    }),
  );
  cleanups.push(env.watchInput(() => stop('input')));
  cancelTimer = env.after(CHECK_MS, check);
  return () => stop('released');
}
