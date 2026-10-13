/**
 * Orbit geometry for the tier explainer. Pure and allocation-free in the hot paths: everything the
 * per-frame canvas loop calls writes into a caller-owned object.
 *
 * Three nested pointy-top hexagons (the Flux symbol's own angle) share one centre in a 600 x 600
 * unit space. A position on an orbit is a fraction `u` in [0, 1) of its perimeter, clockwise from
 * the top vertex, so `u = 0` is the payout gate.
 */
import type { Tier } from '@shared/api';
import { clamp } from '@/lib/math';
import { NODES_PER_DOT } from './payout';

export const VIEW = 600;
export const CENTER = VIEW / 2;
/** Radius of the hub (the block clock) in the middle. */
export const HUB_R = 50;

/** Circumradius of each orbit, outermost first. Cumulus is the busiest tier, so it gets the long ring. */
export const ORBIT_R: Readonly<Record<Tier, number>> = { cumulus: 262, nimbus: 184, stratus: 106 };

/** Orbit order from the outside in, which is also the order of the tier chips and the pops. */
export const ORBIT_ORDER: readonly Tier[] = ['cumulus', 'nimbus', 'stratus'];

/** Node radius per tier: a bigger tier is a bigger node, so tier is never carried by colour alone. */
export const DOT_R: Readonly<Record<Tier, number>> = { cumulus: 5, nimbus: 6.2, stratus: 7.6 };

const SQRT3 = Math.sqrt(3);

// ---------------------------------------------------------------------------
// Hexagon maths (pointy-top)
// ---------------------------------------------------------------------------

/**
 * The hexagonal "distance" of an offset from the centre: the circumradius of the pointy-top hexagon
 * through that point. A vertex of an orbit of radius R has hexNorm R, and so does every point on its
 * outline.
 */
export function hexNorm(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return Math.max((2 * ax) / SQRT3, ay + ax / SQRT3);
}

export interface XY {
  x: number;
  y: number;
}

/**
 * Writes the offset (from the centre) of the point at fraction `u` of the perimeter of a pointy-top
 * hexagon with circumradius `r`, clockwise from the top vertex. `u` wraps.
 */
export function hexPerimeterPoint(r: number, u: number, out: XY): XY {
  const w = u - Math.floor(u);
  const f = w * 6;
  const edge = Math.floor(f);
  const k = f - edge;
  // Vertex i sits at angle -90 + 60 i degrees.
  const a0 = ((-90 + edge * 60) * Math.PI) / 180;
  const a1 = ((-90 + (edge + 1) * 60) * Math.PI) / 180;
  const x0 = r * Math.cos(a0);
  const y0 = r * Math.sin(a0);
  const x1 = r * Math.cos(a1);
  const y1 = r * Math.sin(a1);
  out.x = x0 + (x1 - x0) * k;
  out.y = y0 + (y1 - y0) * k;
  return out;
}

/** Unit vectors to the six vertices of a pointy-top hexagon, clockwise from the top. */
export function hexVertexOffsets(): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    out.push({ x: round2(Math.cos(a)), y: round2(Math.sin(a)) });
  }
  return out;
}

/** The six vertices of a pointy-top hexagon as an SVG `points` string. */
export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    pts.push(`${round2(cx + r * Math.cos(a))},${round2(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/** Where one orbit's zone ends and the next begins: midway between the two rings. */
export const ZONE_EDGE = {
  /** Between Cumulus (outside) and Nimbus. */
  outer: (ORBIT_R.cumulus + ORBIT_R.nimbus) / 2,
  /** Between Nimbus and Stratus. */
  inner: (ORBIT_R.nimbus + ORBIT_R.stratus) / 2,
  /** Past this the pointer is not over the diagram at all. */
  limit: ORBIT_R.cumulus + (ORBIT_R.cumulus - ORBIT_R.nimbus) / 2,
} as const;

/**
 * Which orbit a point (an offset from the centre, in diagram units) belongs to, or null when it is
 * outside the outermost zone. The zones tile the diagram with no gaps, so moving between rings never
 * flickers through "nothing".
 */
export function tierAtOffset(dx: number, dy: number): Tier | null {
  const n = hexNorm(dx, dy);
  if (n > ZONE_EDGE.limit) return null;
  if (n > ZONE_EDGE.outer) return 'cumulus';
  if (n > ZONE_EDGE.inner) return 'nimbus';
  return 'stratus';
}

// ---------------------------------------------------------------------------
// The sample of nodes on each orbit
// ---------------------------------------------------------------------------

export const MIN_DOTS = 5;
export const MAX_DOTS = 36;

/** How many dots represent `nodes` nodes: about one per NODES_PER_DOT, never fewer than a readable ring. */
export function dotCountFor(nodes: number): number {
  if (!Number.isFinite(nodes) || nodes <= 0) return MIN_DOTS;
  return clamp(Math.round(nodes / NODES_PER_DOT), MIN_DOTS, MAX_DOTS);
}

/** Seconds per revolution of one orbit's sample. See `ORBIT_SPEEDUP`. */
export const MIN_PERIOD_S = 40;
export const MAX_PERIOD_S = 240;

/**
 * A tier with N nodes takes N blocks to pay each node once, so its orbit turns at 1/N of the pace.
 * The diagram runs that about 900 times faster than real time (N / 30 seconds a turn) and clamps the
 * result so a tiny tier does not whirl and a huge one does not stand still. The relative speeds of
 * the three orbits are therefore honest.
 */
export function orbitPeriodSec(nodes: number): number {
  if (!Number.isFinite(nodes) || nodes <= 0) return MAX_PERIOD_S;
  return clamp(nodes / 30, MIN_PERIOD_S, MAX_PERIOD_S);
}

/** Each orbit starts rotated by a different amount so the gate never lines three dots up. */
export const PHASE_OFFSET: Readonly<Record<Tier, number>> = { cumulus: 0.04, nimbus: 0.36, stratus: 0.71 };

/** Fraction of the perimeter of dot `i` of `n` when the orbit has turned by `phase`. */
export function dotPosition(i: number, n: number, phase: number): number {
  const u = i / n + phase;
  return u - Math.floor(u);
}

/**
 * The dot that will reach the gate next: the one with the largest `u` below 1. Returns its index.
 */
export function nextPayeeIndex(n: number, phase: number): number {
  let best = 0;
  let bestU = -1;
  for (let i = 0; i < n; i++) {
    const u = dotPosition(i, n, phase);
    if (u > bestU) {
      bestU = u;
      best = i;
    }
  }
  return best;
}

/** Distance (as a fraction of the perimeter) from a position to the gate it is approaching. */
export function distanceToGate(u: number): number {
  const w = u - Math.floor(u);
  return w === 0 ? 0 : 1 - w;
}

/** Half-extent of the vertical hairline across a ring at its gate, in diagram units. */
export const GATE_HALF = 12;

/** Where the pop for a tier appears: the gate, as a fraction of the diagram. */
export function gateFraction(tier: Tier): { x: number; y: number } {
  return { x: CENTER / VIEW, y: (CENTER - ORBIT_R[tier]) / VIEW };
}

/** The bottom vertex of a ring, as a fraction of the diagram: where its tier chip hangs. */
export function chipFraction(tier: Tier): { x: number; y: number } {
  return { x: CENTER / VIEW, y: (CENTER + ORBIT_R[tier]) / VIEW };
}
