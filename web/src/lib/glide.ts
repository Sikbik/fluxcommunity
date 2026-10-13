/**
 * A programmatic scroll that re-aims every frame.
 *
 * A browser smooth scroll is aimed once, at the layout of the moment. Here the sections the glide
 * passes through mount and grow while it runs, so a one-shot scroll lands short (sometimes a full
 * screen or more). `startGlide` asks for the destination again on every frame and spends the remaining
 * distance by the easing's remaining progress, so the motion stays continuous when the target moves
 * and ends exactly on it.
 *
 * The environment is injected so the logic is unit-testable without a browser (see glide.test.ts).
 */
export interface GlideEnv {
  now(): number;
  /** Current scroll position in px. */
  position(): number;
  /** Where the page should end up, re-measured on every call. Null when the target is not in the page. */
  destination(): number | null;
  /** Jumps to a position. Instant. */
  scrollTo(y: number): void;
  /** Calls `cb` on the next animation frame. Returns the cancel function. */
  frame(cb: () => void): () => void;
  /** Calls `cb` on the first input that means the visitor scrolls by hand. Returns the removal function. */
  watchInput(cb: () => void): () => void;
}

export const GLIDE_MIN_MS = 380;
export const GLIDE_MAX_MS = 1100;

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Longer trips take longer, with a firm ceiling so a jump across the whole page never drags. */
export function glideDuration(distancePx: number): number {
  const d = Math.abs(distancePx);
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, GLIDE_MIN_MS + Math.sqrt(d) * 11));
}

/**
 * Starts a glide. `onEnd(true)` when it arrived, `onEnd(false)` when the visitor took over, the
 * target vanished or the caller stopped it. Returns the stop function (safe to call more than once).
 */
export function startGlide(env: GlideEnv, onEnd: (arrived: boolean) => void): () => void {
  const first = env.destination();
  if (first === null) {
    onEnd(false);
    return () => {};
  }
  const startedAt = env.now();
  const duration = glideDuration(first - env.position());
  let progress = 0;
  let ended = false;
  let cancelFrame: () => void = () => {};
  let unwatch: () => void = () => {};

  const end = (arrived: boolean): void => {
    if (ended) return;
    ended = true;
    cancelFrame();
    unwatch();
    onEnd(arrived);
  };

  const step = (): void => {
    if (ended) return;
    const dest = env.destination();
    if (dest === null) {
      end(false);
      return;
    }
    const t = Math.min(1, (env.now() - startedAt) / duration);
    const eased = easeInOutCubic(t);
    if (t >= 1 || eased >= 1) {
      env.scrollTo(dest);
      end(true);
      return;
    }
    // Cover the same share of what is left as the easing covers of what is left of its curve.
    // With a fixed destination this is exactly from + (dest - from) * eased.
    const here = env.position();
    const share = (eased - progress) / (1 - progress);
    progress = eased;
    env.scrollTo(here + (dest - here) * share);
    cancelFrame = env.frame(step);
  };

  unwatch = env.watchInput(() => end(false));
  cancelFrame = env.frame(step);
  return () => end(false);
}
