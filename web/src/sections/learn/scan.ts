/**
 * The "network looks across many nodes" beat of the Place step, as pure functions of the scan's
 * progress. A line sweeps across the map from the card's side; each candidate cell comes up to full
 * light as the line crosses it and stays lit; the cells that were only considered then dim away.
 *
 * Nothing here is random and nothing oscillates. Every cell's light only ever rises with the scan
 * (plus one smooth, one-way "just touched" highlight that decays) and only ever falls with the
 * settle, which is what keeps the picture reading as a scan and not as sparkle.
 */
import { clamp01 } from '@/lib/math';

/** The line starts and ends this far outside the map, in map widths, so every cell is crossed. */
export const SCAN_OVERSHOOT = 0.1;
/** A cell comes up to full light over this much of the map width after the line has crossed it. */
export const SCAN_RISE = 0.07;
/** And carries a little extra brightness for this long after, which is the line touching it. */
export const SCAN_FRESH = 0.2;

/** Where the line is, in map widths from the map's left edge: -OVERSHOOT at scan 0, 1 + OVERSHOOT at 1. */
export function linePosition(scan: number): number {
  return -SCAN_OVERSHOOT + clamp01(scan) * (1 + 2 * SCAN_OVERSHOOT);
}

/**
 * How lit a cell is, 0..1, given the scan progress and the cell's position (`at`, in map widths).
 * Zero until the line reaches it, a short ease-out rise as the line crosses it, then 1 for good.
 */
export function cellLight(scan: number, at: number): number {
  const since = linePosition(scan) - at;
  if (since <= 0) return 0;
  const k = clamp01(since / SCAN_RISE);
  return 1 - (1 - k) * (1 - k);
}

/**
 * The extra brightness a cell has right after the line crosses it, 0..1. It grows from nothing with
 * the cell's own rise and then decays over `SCAN_FRESH`: one smooth hump per cell, never a flash.
 */
export function cellFresh(scan: number, at: number): number {
  const since = linePosition(scan) - at;
  if (since <= 0) return 0;
  const decay = 1 - clamp01(since / SCAN_FRESH);
  return cellLight(scan, at) * decay * decay;
}

/** The light of a cell that was considered and not chosen, as the settle (0..1) takes it away. */
export function consideredLight(light: number, settle: number): number {
  return light * (1 - clamp01(settle));
}

/**
 * How visible the line itself is, 0..1, for its position: it fades in over the first few percent of
 * the map and out over the last few, so it is never cut off at an edge.
 */
export function lineVisibility(scan: number): number {
  const pos = linePosition(scan);
  const edge = 0.07;
  const smooth = (x: number) => {
    const k = clamp01(x);
    return k * k * (3 - 2 * k);
  };
  return smooth(pos / edge) * smooth((1 - pos) / edge);
}
