/**
 * Honeycomb geometry for the channel cluster. Pure and framework free.
 *
 * Cells are regular pointy-top hexagons (a vertex at the top: the Flux symbol's own angle). Every length
 * here is in units of the PITCH `p`, the centre to centre distance of two same-size neighbours
 * (`p = W + g`, cell width plus gap). CSS multiplies these unitless numbers by one custom property, so
 * the whole cluster scales with its container and can never overflow it.
 *
 * Two layouts of the same seven slots, in DOM order (the primary door first, then clockwise):
 *
 *   flower   the primary at the centre, six cells touching its six faces (rows of 2, 3, 2). Desktop.
 *   zigzag   the primary on top, then rows of 2, 1, 2, 1: a honeycomb two cells wide. Phones.
 */

export interface Slot {
  /** Centre, in pitches, relative to the layout box centre. x grows right, y grows down. */
  x: number;
  y: number;
  /** Cell width in pitches (the scale already applied). */
  w: number;
  /** Scale relative to a regular cell: 1 for a ring cell, `big` for the primary. */
  scale: number;
}

export interface Layout {
  slots: Slot[];
  /** Box size in pitches. */
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** Scale of the primary cell relative to the others. Default 1.3. */
  big?: number;
  /** Gap between touching cells as a fraction of a cell's width. Default 0.05. */
  gap?: number;
}

/** sin 60 degrees: the vertical row step of a honeycomb in units of the pitch. */
export const SIN60 = Math.sqrt(3) / 2;
/** Height of a pointy-top hexagon divided by its width. */
export const HEX_ASPECT = 2 / Math.sqrt(3);

/** The six ring directions of the flower, clockwise from the upper left, in screen coordinates. */
const RING_DEG = [-120, -60, 0, 60, 120, 180] as const;

/** Number of slots both layouts produce. The primary is slot 0. */
export const SLOT_COUNT = 7;

function finish(raw: Array<{ x: number; y: number; scale: number }>, unit: number, gap: number): Layout {
  // `unit` is the width of a regular cell in the working units; the pitch is unit * (1 + gap).
  const pitch = unit * (1 + gap);
  const halfH = (HEX_ASPECT * unit) / 2;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const s of raw) {
    const hw = (s.scale * unit) / 2;
    const hh = s.scale * halfH;
    minX = Math.min(minX, s.x - hw);
    maxX = Math.max(maxX, s.x + hw);
    minY = Math.min(minY, s.y - hh);
    maxY = Math.max(maxY, s.y + hh);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    slots: raw.map((s) => ({
      x: (s.x - cx) / pitch,
      y: (s.y - cy) / pitch,
      w: (s.scale * unit) / pitch,
      scale: s.scale,
    })),
    width: (maxX - minX) / pitch,
    height: (maxY - minY) / pitch,
  };
}

/** The primary at the centre and six cells around it, each touching one of its faces. */
export function flowerLayout({ big = 1.3, gap = 0.05 }: LayoutOptions = {}): Layout {
  // Working units: a regular cell is 1 wide. The ring sits one apothem of each cell plus the gap away.
  const d = (big + 1) / 2 + gap;
  const raw = [{ x: 0, y: 0, scale: big }];
  for (const deg of RING_DEG) {
    const a = (deg * Math.PI) / 180;
    raw.push({ x: d * Math.cos(a), y: d * Math.sin(a), scale: 1 });
  }
  return finish(raw, 1, gap);
}

/** A honeycomb two cells wide: the primary, then 2, 1, 2, 1 below it. */
export function zigzagLayout({ big = 1.3, gap = 0.05 }: LayoutOptions = {}): Layout {
  const p = 1 + gap;
  const d = (big + 1) / 2 + gap;
  // The first row nestles against the primary's lower faces: project the offset onto the face normal
  // (cos 120, sin 120) and solve for the row's depth.
  const y1 = (d - 0.25 * p) / SIN60;
  const step = SIN60 * p;
  const y2 = y1 + step;
  const y3 = y2 + step;
  const y4 = y3 + step;
  const raw = [
    { x: 0, y: 0, scale: big },
    { x: -0.5 * p, y: y1, scale: 1 },
    { x: 0.5 * p, y: y1, scale: 1 },
    { x: 0, y: y2, scale: 1 },
    { x: -0.5 * p, y: y3, scale: 1 },
    { x: 0.5 * p, y: y3, scale: 1 },
    { x: 0, y: y4, scale: 1 },
  ];
  return finish(raw, 1, gap);
}

/**
 * True when two same-orientation regular hexagons do not overlap (they may touch). Separating axis
 * test over the three face normals; `aw` and `bw` are the cell widths (flat to flat) in the same unit
 * as the centre distances.
 */
export function hexSeparation(
  a: { x: number; y: number; w: number },
  b: { x: number; y: number; w: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let best = 0;
  for (const deg of [0, 60, 120]) {
    const r = (deg * Math.PI) / 180;
    best = Math.max(best, Math.abs(dx * Math.cos(r) + dy * Math.sin(r)));
  }
  // Positive when separated by a gap, zero when touching, negative when overlapping.
  return best - (a.w + b.w) / 2;
}
