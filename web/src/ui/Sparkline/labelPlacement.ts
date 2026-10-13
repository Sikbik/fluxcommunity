/**
 * Where a Sparkline puts the caption of its target line.
 *
 * The caption used to sit at the start of the line, above it, always. A series that runs along the
 * target there (block intervals do: they hover around 30 s) drew straight through the text. This
 * picks, from the four spots that touch the target line (start or end of the line, above or below
 * it), the one with the least data running through it, in a fixed order of preference so a clear
 * line keeps the caption where it was.
 *
 * Pure geometry: it knows boxes and polylines, not React.
 */

export type LabelSide = 'start' | 'end';
export type LabelEdge = 'above' | 'below';

export interface LabelPlacement {
  side: LabelSide;
  edge: LabelEdge;
  /** Length of the series, in px, that still passes through the chosen spot. 0 is clear. */
  overlap: number;
}

export interface LabelPlacementInput {
  /** The series in plot units (0..100 on both axes, y down), oldest first. */
  points: readonly (readonly [number, number])[];
  /** The target line, in plot units (y). */
  ty: number;
  /** The plot box, px. */
  width: number;
  height: number;
  /** The caption box, px. */
  labelWidth: number;
  labelHeight: number;
  /** Stay this far from the newest point, which wears the marker. px. Default 8. */
  markerRadius?: number;
}

/** Space between the caption and the target line, px. Must match `.targetLabel` in the CSS. */
export const LABEL_GAP = 2;
/** The caption's halo and the line's stroke reach this far beyond the box, px. */
const HALO = 2;
/** Charged for each side on which the caption would leave the plot box (it would sit on a neighbour). */
const OUT_OF_BOX = 40;
/** A clear spot counts as clear below this much line, px (rounding, a grazing stroke). */
const CLEAR = 0.5;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Length of the segment (ax, ay) to (bx, by) that lies inside the box (Liang-Barsky). */
export function lengthInside(box: Box, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (
    clip(-dx, ax - box.x0) &&
    clip(dx, box.x1 - ax) &&
    clip(-dy, ay - box.y0) &&
    clip(dy, box.y1 - ay) &&
    t1 > t0
  ) {
    return (t1 - t0) * Math.hypot(dx, dy);
  }
  return 0;
}

const ORDER: readonly (readonly [LabelSide, LabelEdge])[] = [
  ['start', 'above'],
  ['start', 'below'],
  ['end', 'above'],
  ['end', 'below'],
];

/**
 * Picks the caption spot. The first spot in the order (start, above; start, below; end, above;
 * end, below) with no data through it wins; if none is clear, the one with the least line through
 * it, charged extra for leaving the plot box or covering the newest point.
 */
export function placeTargetLabel(input: LabelPlacementInput): LabelPlacement {
  const { points, ty, width, height, labelWidth, labelHeight, markerRadius = 8 } = input;
  const sx = width / 100;
  const sy = height / 100;
  const line = points.map(([x, y]) => [x * sx, y * sy] as const);
  const yt = ty * sy;
  const newest = line[line.length - 1];

  let best: LabelPlacement = { side: 'start', edge: 'above', overlap: Number.POSITIVE_INFINITY };
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [side, edge] of ORDER) {
    const x0 = side === 'start' ? 0 : width - labelWidth;
    const y0 = edge === 'above' ? yt - LABEL_GAP - labelHeight : yt + LABEL_GAP;
    const box: Box = {
      x0: x0 - HALO,
      y0: y0 - HALO,
      x1: x0 + labelWidth + HALO,
      y1: y0 + labelHeight + HALO,
    };

    let overlap = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (a && b) overlap += lengthInside(box, a[0], a[1], b[0], b[1]);
    }

    let score = overlap;
    if (y0 < 0 || y0 + labelHeight > height) score += OUT_OF_BOX;
    if (newest) {
      const nx = Math.max(box.x0, Math.min(newest[0], box.x1));
      const ny = Math.max(box.y0, Math.min(newest[1], box.y1));
      if (Math.hypot(newest[0] - nx, newest[1] - ny) < markerRadius) score += labelWidth;
    }

    if (score <= CLEAR) return { side, edge, overlap };
    if (score < bestScore) {
      bestScore = score;
      best = { side, edge, overlap };
    }
  }
  return best;
}
