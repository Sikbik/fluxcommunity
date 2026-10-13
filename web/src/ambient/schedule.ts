/**
 * The caption scheduler: time in, which caption and how far through it out. A pure function of
 * elapsed time, so there is no drift to accumulate and nothing to unit test with a fake timer.
 * The component only needs to wake up at the next boundary.
 */

/** How long each caption holds (DESIGN 7). */
export const CAPTION_MS = 8000;
/** How long the outgoing caption stays mounted after the next begins (its fade is shorter). */
export const CROSSFADE_MS = 1400;

export interface CaptionTick {
  /** Index into the playlist. */
  index: number;
  /** 0..1 through the current caption. */
  progress: number;
  /** Milliseconds until the next caption begins (always at least 1). */
  nextInMs: number;
}

/**
 * Which caption is showing `elapsedMs` after the tour began. `startIndex` is where the tour
 * began (so a second visit does not always open on the same build).
 */
export function captionAt(
  elapsedMs: number,
  count: number,
  startIndex = 0,
  durationMs: number = CAPTION_MS,
): CaptionTick {
  if (count <= 0) return { index: 0, progress: 0, nextInMs: durationMs };
  const t = Math.max(0, elapsedMs);
  const slot = Math.floor(t / durationMs);
  const into = t - slot * durationMs;
  const start = ((Math.trunc(startIndex) % count) + count) % count;
  return {
    index: (start + slot) % count,
    progress: into / durationMs,
    nextInMs: Math.max(1, Math.ceil(durationMs - into)),
  };
}

/** Where the next tour should start: the caption after the last one shown, or the first. */
export function nextStart(lastShown: number | null, count: number): number {
  if (count <= 0 || lastShown === null) return 0;
  return (((lastShown + 1) % count) + count) % count;
}

/**
 * A few pixels of drift, changing once a minute, so nothing sits on the same pixels for hours.
 * Deterministic from the minute number; always within +-6 px.
 */
export function driftOffset(minute: number): { x: number; y: number } {
  const m = Math.trunc(minute);
  return {
    x: Math.round(5 * Math.sin(m * 1.7 + 0.4)),
    y: Math.round(4 * Math.cos(m * 1.1 + 1.3)),
  };
}
