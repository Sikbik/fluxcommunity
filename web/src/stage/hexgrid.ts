// Hex grid layout and instance culling maths for the Lattice. Pointy-top hexagons in axial (q, r)
// coordinates on the x/z plane, matching the orientation of the Flux symbol's big hexagon.
//
// The lattice is endless but only a disc of cells is ever instanced. The instances are sorted by
// distance from the disc centre, so truncating the draw range (a tier change, a thicker fog) simply
// trims the outer ring and the shape stays round. The disc is re-centred on the snapped axial cell
// under a point ahead of the camera, so the field slides under the camera without popping.

export const SQRT3 = 1.7320508075688772;

/** World x/z of the centre of cell (q, r); `size` is the circumradius (centre to corner). */
export function axialToXZ(q: number, r: number, size = 1): [number, number] {
  return [size * SQRT3 * (q + r / 2), size * 1.5 * r];
}

/** The axial cell containing a world x/z point (cube rounding). */
export function xzToAxial(x: number, z: number, size = 1): [number, number] {
  const qf = ((SQRT3 / 3) * x - z / 3) / size;
  const rf = ((2 / 3) * z) / size;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q + 0, r + 0]; // + 0 normalises -0
}

/** Cells in a hexagonal disc of `n` rings around a centre cell. */
export function hexNumber(n: number): number {
  return 3 * n * (n + 1) + 1;
}

/** Smallest ring count whose hexagonal disc holds at least `count` cells. */
export function ringsForCount(count: number): number {
  let n = 0;
  while (hexNumber(n) < count) n++;
  return n;
}

export interface Disc {
  /** Interleaved axial (q, r) per cell, nearest to the centre first. Length is 2 * count. */
  cells: Float32Array;
  /** Euclidean distance of each cell from the centre in world units (size 1), ascending. */
  dist: Float32Array;
  count: number;
  /** Distance of the outermost cell. */
  radius: number;
}

/** The first `count` cells of the axial lattice ordered by distance from the centre cell. */
export function buildDisc(count: number, size = 1): Disc {
  const n = ringsForCount(count);
  const all: { q: number; r: number; d: number; a: number }[] = [];
  for (let q = -n; q <= n; q++) {
    const r1 = Math.max(-n, -q - n);
    const r2 = Math.min(n, -q + n);
    for (let r = r1; r <= r2; r++) {
      const [x, z] = axialToXZ(q, r, size);
      all.push({ q, r, d: Math.hypot(x, z), a: Math.atan2(z, x) });
    }
  }
  // Distances of mirrored cells are equal up to float noise, so quantise before the angular tie break.
  all.sort((p, o) => {
    const dp = Math.round(p.d * 1e4);
    const dq = Math.round(o.d * 1e4);
    return dp !== dq ? dp - dq : p.a - o.a;
  });
  const take = Math.min(count, all.length);
  const cells = new Float32Array(take * 2);
  const dist = new Float32Array(take);
  for (let i = 0; i < take; i++) {
    const c = all[i]!;
    cells[i * 2] = c.q;
    cells[i * 2 + 1] = c.r;
    dist[i] = c.d;
  }
  return { cells, dist, count: take, radius: dist[take - 1] ?? 0 };
}

/** How many of the (ascending) disc cells lie within `radius` of the centre. Binary search. */
export function cellsWithin(dist: Float32Array, radius: number): number {
  let lo = 0;
  let hi = dist.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid]! <= radius) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Where the disc is centred: ahead of the camera along its ground heading, so the instance budget
 * is spent on what is in front of the lens instead of behind it. `yaw` is radians, 0 = looking -z.
 */
export function discCentre(camX: number, camZ: number, yaw: number, reach: number): [number, number] {
  return [camX - Math.sin(yaw) * reach, camZ - Math.cos(yaw) * reach];
}

/** Fog is `1 - exp(-(d / scale)^2)`; this is the distance where it passes `coverage` (default 99.7 percent). */
export function fogCutDistance(fogScale: number, coverage = 0.997): number {
  return fogScale * Math.sqrt(-Math.log(1 - coverage));
}

/**
 * Fog scale that hides the edge of a disc of `radius` seen from `reach` ahead of its centre: the
 * nearest visible part of the boundary is about `radius + reach` away along the view direction.
 */
export function fogScaleFor(radius: number, reach: number, coverage = 0.985): number {
  const edge = Math.max(1, radius + reach * 0.35);
  return edge / Math.sqrt(-Math.log(1 - coverage));
}

/** Instances worth drawing: those inside the fog cut around the camera, capped by the tier budget. */
export function visibleCount(disc: Disc, reach: number, fogScale: number, budget: number): number {
  const need = cellsWithin(disc.dist, reach + fogCutDistance(fogScale));
  return Math.max(0, Math.min(budget, need, disc.count));
}

// ---- the prism ---------------------------------------------------------------------------------

export interface PrismOptions {
  /** Circumradius of the prism's outer hexagon (a little under the grid size leaves the gap). */
  radius: number;
  /** Horizontal width of the bevel, in apothem units. */
  bevel: number;
  /** Vertical drop of the bevel. */
  bevelDrop: number;
  /** How far the walls extend below the top (cells are tall so a lifted cell never shows its base). */
  depth: number;
}

export interface PrismMesh {
  position: Float32Array;
  normal: Float32Array;
  /** Per vertex: kind (0 top, 1 bevel, 2 wall), param along the face (walls 0 top to 1 bottom), 0, 0. */
  meta: Float32Array;
  index: Uint16Array;
  vertexCount: number;
}

/**
 * A hexagonal prism with a bevelled top edge, flat shaded (every face has its own vertices). The top
 * sits at y = 0 and the walls drop to y = -depth. Pointy-top, matching `axialToXZ`.
 */
export function buildPrism(o: PrismOptions): PrismMesh {
  const apothem = o.radius * (SQRT3 / 2);
  const topApothem = Math.max(0.05, apothem - o.bevel);
  const topRadius = topApothem / (SQRT3 / 2);
  const pos: number[] = [];
  const nrm: number[] = [];
  const meta: number[] = [];
  const idx: number[] = [];

  const corner = (k: number, radius: number): [number, number] => {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  };
  const edgeNormal = (k: number): [number, number] => {
    const a = Math.PI / 3 + (k * Math.PI) / 3;
    return [Math.cos(a), Math.sin(a)];
  };
  const push = (
    x: number,
    y: number,
    z: number,
    n: readonly number[],
    kind: number,
    param: number,
  ): number => {
    pos.push(x, y, z);
    nrm.push(n[0]!, n[1]!, n[2]!);
    meta.push(kind, param, 0, 0);
    return pos.length / 3 - 1;
  };
  // Adds a triangle wound so that its geometric normal agrees with `n`.
  const tri = (a: number, b: number, c: number, n: readonly number[]): void => {
    const ax = pos[a * 3]!;
    const ay = pos[a * 3 + 1]!;
    const az = pos[a * 3 + 2]!;
    const ux = pos[b * 3]! - ax;
    const uy = pos[b * 3 + 1]! - ay;
    const uz = pos[b * 3 + 2]! - az;
    const vx = pos[c * 3]! - ax;
    const vy = pos[c * 3 + 1]! - ay;
    const vz = pos[c * 3 + 2]! - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * n[0]! + cy * n[1]! + cz * n[2]! >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };

  // Top face: a fan of four triangles over six corners.
  const up = [0, 1, 0];
  const top: number[] = [];
  for (let k = 0; k < 6; k++) {
    const [x, z] = corner(k, topRadius);
    top.push(push(x, 0, z, up, 0, 1));
  }
  for (let k = 1; k < 5; k++) tri(top[0]!, top[k]!, top[k + 1]!, up);

  for (let k = 0; k < 6; k++) {
    const k2 = (k + 1) % 6;
    const [ex, ez] = edgeNormal(k);
    // Bevel: from the inset top ring down and out to the full radius.
    const bn = normalize3(ex * o.bevelDrop, o.bevel, ez * o.bevelDrop);
    const [ax, az] = corner(k, topRadius);
    const [bx, bz] = corner(k2, topRadius);
    const [cx, cz] = corner(k, o.radius);
    const [dx, dz] = corner(k2, o.radius);
    const a = push(ax, 0, az, bn, 1, 0);
    const b = push(bx, 0, bz, bn, 1, 0);
    const c = push(cx, -o.bevelDrop, cz, bn, 1, 1);
    const d = push(dx, -o.bevelDrop, dz, bn, 1, 1);
    tri(a, b, c, bn);
    tri(b, d, c, bn);
    // Wall: from the bevel foot down to the base.
    const wn = [ex, 0, ez];
    const w0 = push(cx, -o.bevelDrop, cz, wn, 2, 0);
    const w1 = push(dx, -o.bevelDrop, dz, wn, 2, 0);
    const w2 = push(cx, -o.depth, cz, wn, 2, 1);
    const w3 = push(dx, -o.depth, dz, wn, 2, 1);
    tri(w0, w1, w2, wn);
    tri(w1, w3, w2, wn);
  }

  return {
    position: new Float32Array(pos),
    normal: new Float32Array(nrm),
    meta: new Float32Array(meta),
    index: new Uint16Array(idx),
    vertexCount: pos.length / 3,
  };
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
