// The official Flux symbol as four polygons: the slanted bar, the cap, the big hexagon and the small
// hexagon. The path data below is copied verbatim from web/public/brand/mark/flux-mark-white.svg (the
// four `path` elements and their translate transforms) so the stage never fetches or redraws the mark:
// it only extrudes it. Pure and framework-free; the engine turns these polygons into geometry.

export type Pt = readonly [number, number];

export type ShardId = 'bar' | 'cap' | 'hex' | 'gem';

/** The SVG viewBox of the official mark. */
export const MARK_VIEWBOX = { w: 279.714, h: 322.975 } as const;
/** Width over height of the mark. */
export const MARK_ASPECT = MARK_VIEWBOX.w / MARK_VIEWBOX.h;

interface RawShard {
  id: ShardId;
  d: string;
  tx: number;
  ty: number;
}

// Order matters: it is the channel order of the baked distance texture (r, g, b, a).
export const RAW_SHARDS: readonly RawShard[] = [
  {
    id: 'bar',
    d: 'M175.03,202.425l-28.9,16.7L84.03,183.28l28.2-16.285.7-.414,1.077.622Z',
    tx: -6.271,
    ty: 103.85,
  },
  {
    id: 'cap',
    d: 'M326.213,116.8v33.607L265.09,115.125l-16.576-9.572-16.576,9.572-77.7,44.858-16.576,9.572v19.787l-29.9-17.259-16.576-9.572-16.576,9.572L46.5,188.307V116.8L186.356,36.06Z',
    tx: -46.5,
    ty: -36.06,
  },
  {
    id: 'hex',
    d: 'M261.9,132.948v89.715l-77.7,44.858-.1-.062-77.594-44.8V132.948L184.2,88.07Z',
    tx: 17.819,
    ty: 19.693,
  },
  {
    id: 'gem',
    d: 'M135.884,141.366v51.591L91.192,218.774,46.5,192.957V141.366l44.692-25.8Z',
    tx: -46.5,
    ty: 49.17,
  },
];

/** Parses the straight-line subset of SVG path data these shards use (M m L l H h V v Z z). */
export function parsePath(d: string): Pt[] {
  const re = /([MmLlHhVvZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;
  const tokens: (string | number)[] = [];
  for (let m = re.exec(d); m; m = re.exec(d)) {
    tokens.push(m[1] ?? Number(m[2]));
  }
  const pts: [number, number][] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  const num = (): number => {
    const t = tokens[i++];
    return typeof t === 'number' ? t : 0;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') continue;
    }
    switch (cmd) {
      case 'M':
        x = num();
        y = num();
        pts.push([x, y]);
        cmd = 'L';
        break;
      case 'm':
        x += num();
        y += num();
        pts.push([x, y]);
        cmd = 'l';
        break;
      case 'L':
        x = num();
        y = num();
        pts.push([x, y]);
        break;
      case 'l':
        x += num();
        y += num();
        pts.push([x, y]);
        break;
      case 'H':
        x = num();
        pts.push([x, y]);
        break;
      case 'h':
        x += num();
        pts.push([x, y]);
        break;
      case 'V':
        y = num();
        pts.push([x, y]);
        break;
      case 'v':
        y += num();
        pts.push([x, y]);
        break;
      default:
        // Unknown command: stop rather than loop forever.
        i = tokens.length;
    }
  }
  return pts;
}

export function signedArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(pts: readonly Pt[]): Pt {
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / pts.length, sy / pts.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const k = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * k;
    cy += (p[1] + q[1]) * k;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Removes vertices that add nothing: points that are collinear within `collinearDeg`, then near
 * duplicates (closer than `minEdge`, keeping the one with the sharper turn). The official outlines
 * carry a few sub-unit notches from the vector export; those would make bevel offsets self-intersect,
 * and they are invisible at any real size.
 */
export function cleanPolygon(pts: readonly Pt[], minEdge: number, collinearDeg: number): Pt[] {
  const cosLimit = Math.cos((collinearDeg * Math.PI) / 180);
  const turnCos = (a: Pt, b: Pt, c: Pt): number => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const vx = c[0] - b[0];
    const vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    return lu * lv > 0 ? (ux * vx + uy * vy) / (lu * lv) : 1;
  };
  const cur = pts.slice();
  for (let pass = 0; pass < 8 && cur.length > 3; pass++) {
    let changed = false;
    // Collinear vertices (one at a time: removing one changes its neighbours' turns).
    for (let i = 0; i < cur.length && cur.length > 3; ) {
      const a = cur[(i + cur.length - 1) % cur.length]!;
      const b = cur[i]!;
      const c = cur[(i + 1) % cur.length]!;
      if (turnCos(a, b, c) > cosLimit) {
        cur.splice(i, 1);
        changed = true;
      } else {
        i++;
      }
    }
    // Near duplicates: of two vertices closer than minEdge keep the sharper corner.
    for (let i = 0; i < cur.length && cur.length > 3; ) {
      const j = (i + 1) % cur.length;
      const p = cur[i]!;
      const q = cur[j]!;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minEdge) {
        i++;
        continue;
      }
      const pc = turnCos(cur[(i + cur.length - 1) % cur.length]!, p, q);
      const qc = turnCos(p, q, cur[(j + 1) % cur.length]!);
      cur.splice(pc < qc ? j : i, 1);
      changed = true;
    }
    if (!changed) break;
  }
  return cur;
}

export interface Shard {
  id: ShardId;
  /** Outline in mark units: y up, centred on the mark, overall height 1. */
  points: Pt[];
  centroid: Pt;
  area: number;
  /** Unit-ish direction from the mark centre to this shard, for the hover separation. */
  outward: Pt;
}

let cache: Shard[] | null = null;

/** The four shards, cleaned, flipped to y-up, centred and scaled so the mark is 1 unit tall. */
export function buildShards(): Shard[] {
  if (cache) return cache;
  const cx = MARK_VIEWBOX.w / 2;
  const cy = MARK_VIEWBOX.h / 2;
  const k = 1 / MARK_VIEWBOX.h;
  const out: Shard[] = [];
  for (const raw of RAW_SHARDS) {
    const world = parsePath(raw.d).map((p): Pt => [p[0] + raw.tx, p[1] + raw.ty]);
    const clean = cleanPolygon(world, 1.6, 4);
    const pts = clean.map((p): Pt => [(p[0] - cx) * k, -(p[1] - cy) * k]);
    const c = centroid(pts);
    const len = Math.hypot(c[0], c[1]) || 1;
    out.push({
      id: raw.id,
      points: pts,
      centroid: c,
      area: Math.abs(signedArea(pts)),
      outward: [c[0] / len, c[1] / len],
    });
  }
  cache = out;
  return out;
}

/** Signed distance from `p` to the polygon outline: positive inside, negative outside. */
export function polygonSdf(pts: readonly Pt[], px: number, py: number): number {
  let best = Number.POSITIVE_INFINITY;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const wx = px - a[0];
    const wy = py - a[1];
    const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey || 1));
    const dx = wx - ex * t;
    const dy = wy - ey * t;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
    if (a[1] > py !== b[1] > py && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  const d = Math.sqrt(best);
  return inside ? d : -d;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Extent of the baked distance texture in mark units: x in [-X, X], y in [-Y, Y]. */
export const SDF_EXTENT = { x: 0.56, y: 0.6 } as const;
/** Distance (mark units) that maps to 1.0 in the baked texture. */
export const SDF_RANGE = 0.14;

/**
 * Bakes the inside distance of every shard into one RGBA8 texture, one shard per channel in
 * `RAW_SHARDS` order: 0 on or outside the outline, rising to 1 at `SDF_RANGE` inside. The symbol
 * shader uses it for the edge-lit gradient (bright at the rim, fading inward, like lit acrylic).
 * Row 0 is the bottom (y = -Y), which is what a WebGL texture upload expects.
 */
export function bakeShardDistance(size: number): Uint8Array {
  const shards = buildShards();
  const data = new Uint8Array(size * size * 4);
  for (let iy = 0; iy < size; iy++) {
    const y = (((iy + 0.5) / size) * 2 - 1) * SDF_EXTENT.y;
    for (let ix = 0; ix < size; ix++) {
      const x = (((ix + 0.5) / size) * 2 - 1) * SDF_EXTENT.x;
      const o = (iy * size + ix) * 4;
      for (let c = 0; c < 4; c++) {
        const shard = shards[c];
        if (!shard) continue;
        const d = polygonSdf(shard.points, x, y);
        data[o + c] = Math.round(clamp01(d / SDF_RANGE) * 255);
      }
    }
  }
  return data;
}
