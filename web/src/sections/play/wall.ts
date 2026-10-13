/**
 * Marquee maths for the game wall. Pure, so a node test can pin the seam: the track holds an
 * EVEN number of identical runs and slides by half of its own width, which is a frame
 * identical to the start, so the loop has no visible jump at any viewport width.
 */

/** Runs needed so the track is at least one viewport plus one run wide, rounded up to even. */
export function runsNeeded(viewWidth: number, runWidth: number): number {
  if (!(runWidth > 0) || !(viewWidth > 0)) return 2;
  const needed = Math.max(2, Math.ceil(viewWidth / runWidth) + 1);
  return needed % 2 === 0 ? needed : needed + 1;
}

/**
 * Seconds for the track to travel half of itself (one full seam to seam loop) at `speed`
 * px per second. The floor on speed stops a zero or tiny speed producing an endless loop.
 */
export function loopSeconds(runWidth: number, runs: number, speed: number): number {
  if (!(runWidth > 0)) return 40;
  return (runWidth * runs) / 2 / Math.max(8, speed);
}

/** The two rows move opposite ways at slightly different speeds so they never lock step. */
export interface RowMotion {
  direction: 'left' | 'right';
  speed: number;
}

export const ROW_MOTION: readonly [RowMotion, RowMotion] = [
  { direction: 'left', speed: 46 },
  { direction: 'right', speed: 36 },
];

/** Allows an event at most once per `minIntervalMs`. The clock is injectable for tests. */
export function createLimiter(minIntervalMs: number, now: () => number = () => performance.now()) {
  let last = Number.NEGATIVE_INFINITY;
  return (): boolean => {
    const t = now();
    if (t - last < minIntervalMs) return false;
    last = t;
    return true;
  };
}

/** At most four ripples a second (the brief). */
export const RIPPLE_MIN_INTERVAL_MS = 250;
