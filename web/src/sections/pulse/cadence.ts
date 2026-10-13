/**
 * The block cadence dial: its state from the chain clock and its geometry. A hexagon has six edges and
 * the protocol block time is 30 s, so each edge is exactly 5 s and the six vertices are the 0, 5, 10,
 * 15, 20 and 25 second marks. Framework-free.
 */
import { hexVertices, type Point } from '@/lib/hex';

/** The protocol target the ring is drawn against. The measured value is shown beside it, never faked in. */
export const DIAL_TARGET_SEC = 30;
/** How long past the target before the dial says it is waiting for the block. */
export const WAIT_AFTER_OVERDUE_SEC = 10;

export type DialPhase =
  /** Between blocks, the ring is filling. */
  | 'sweeping'
  /** The target has passed and no block has arrived: the ring holds full. */
  | 'complete'
  /** More than `WAIT_AFTER_OVERDUE_SEC` past the target. */
  | 'waiting'
  /** There is no live chain clock (offline, or nothing yet): the ring is empty and says so. */
  | 'offline';

export interface DialState {
  phase: DialPhase;
  /** Whole seconds since the tip block, null when the clock is not live. */
  sinceSec: number | null;
  /** Whole seconds past the target (0 while sweeping). */
  overdueSec: number;
  /** How many of the 30 ticks are lit. */
  litTicks: number;
  /** 0..1 fill of the ring at `sinceSec`. */
  fill: number;
}

export function dialState(
  sinceSec: number | null,
  live: boolean,
  targetSec = DIAL_TARGET_SEC,
  waitAfterSec = WAIT_AFTER_OVERDUE_SEC,
): DialState {
  if (!live || sinceSec === null || !Number.isFinite(sinceSec)) {
    return { phase: 'offline', sinceSec: null, overdueSec: 0, litTicks: 0, fill: 0 };
  }
  const since = Math.max(0, Math.floor(sinceSec));
  const overdue = Math.max(0, since - targetSec);
  const phase: DialPhase = since < targetSec ? 'sweeping' : overdue >= waitAfterSec ? 'waiting' : 'complete';
  return {
    phase,
    sinceSec: since,
    overdueSec: overdue,
    litTicks: Math.min(targetSec, since + 1),
    fill: Math.min(1, since / targetSec),
  };
}

/** Where along the ring (0..1) a head that started `elapsedMs` ago is, clamped, for the sweep animation. */
export function sweepFraction(elapsedMs: number, targetSec = DIAL_TARGET_SEC): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / (targetSec * 1000));
}

export interface DialTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The tick marks second `second` (0..29). */
  second: number;
  /** Every fifth second sits on a vertex and is longer. */
  major: boolean;
}

export interface DialLabel {
  x: number;
  y: number;
  text: string;
}

export interface DialGeometry {
  /** viewBox is `0 0 size size`. */
  size: number;
  centre: number;
  radius: number;
  vertices: Point[];
  /** The closed hexagon path starting at the top vertex and running clockwise. */
  path: string;
  ticks: DialTick[];
  labels: DialLabel[];
}

const f = (n: number) => Number(n.toFixed(2));

/** The point at fraction `t` (0..1) of the way round the hexagon, clockwise from the top vertex. */
export function perimeterPoint(vertices: readonly Point[], t: number): Point {
  const scaled = (((t % 1) + 1) % 1) * vertices.length;
  const k = Math.floor(scaled);
  const u = scaled - k;
  const a = vertices[k % vertices.length] as Point;
  const b = vertices[(k + 1) % vertices.length] as Point;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export function dialGeometry(size = 220, radius = 82, seconds = DIAL_TARGET_SEC): DialGeometry {
  const centre = size / 2;
  const vertices = hexVertices(centre, centre, radius);
  const edges = vertices.length;
  const perEdge = seconds / edges;
  const ticks: DialTick[] = [];
  for (let s = 0; s < seconds; s++) {
    const p = perimeterPoint(vertices, s / seconds);
    const major = s % perEdge === 0;
    const k = Math.floor(s / perEdge);
    const a = vertices[k % edges] as Point;
    const b = vertices[(k + 1) % edges] as Point;
    // Inward direction: toward the centre from a vertex, along the edge's normal elsewhere.
    let nx: number;
    let ny: number;
    if (major) {
      nx = centre - p.x;
      ny = centre - p.y;
    } else {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      nx = centre - mx;
      ny = centre - my;
    }
    const len = Math.hypot(nx, ny) || 1;
    const tick = major ? 11 : 5.5;
    ticks.push({
      x1: f(p.x),
      y1: f(p.y),
      x2: f(p.x + (nx / len) * tick),
      y2: f(p.y + (ny / len) * tick),
      second: s,
      major,
    });
  }
  const labels: DialLabel[] = vertices.map((v, k) => {
    const dx = v.x - centre;
    const dy = v.y - centre;
    const len = Math.hypot(dx, dy) || 1;
    const out = 15;
    return { x: f(v.x + (dx / len) * out), y: f(v.y + (dy / len) * out), text: String(k * perEdge) };
  });
  const path = `${vertices.map((v, i) => `${i === 0 ? 'M' : 'L'}${f(v.x)} ${f(v.y)}`).join('')}Z`;
  return { size, centre, radius, vertices, path, ticks, labels };
}

/**
 * A y-domain for the interval sparkline: tight enough that the variation reads, always containing the
 * target line, snapped to whole 5 s steps so it does not twitch on every block.
 */
export function intervalDomain(
  minSec: number | null,
  maxSec: number | null,
  targetSec = DIAL_TARGET_SEC,
): { min: number; max: number } {
  const lo = Math.min(minSec ?? targetSec, targetSec);
  const hi = Math.max(maxSec ?? targetSec, targetSec);
  const min = Math.max(0, Math.floor((lo - 4) / 5) * 5);
  const max = Math.max(min + 20, Math.ceil((hi + 4) / 5) * 5);
  return { min, max };
}
