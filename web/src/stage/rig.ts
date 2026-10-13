// Camera rig maths: pose from a look and the page state, plus the ray, projection and mapping helpers
// the stage uses to tie DOM positions to lattice positions. Plain numbers in, plain numbers out, so it
// is unit tested in node and shares nothing with three's camera classes.
//
// Conventions: y is up, the camera looks down -z at yaw 0, positive yaw turns left (counter clockwise
// seen from above), positive pitch looks up. The lattice plane is y = 0.

import { DEG, lerp, smoothstep } from './math';

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Radians. */
  yaw: number;
  /** Radians. */
  pitch: number;
  /** Vertical field of view, radians. */
  fov: number;
  aspect: number;
}

export interface Basis {
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
}

export function makePose(): CameraPose {
  return { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 36 * DEG, aspect: 16 / 9 };
}

/** Forward, right and up vectors of the pose. */
export function basis(p: CameraPose, out: Basis = {} as Basis): Basis {
  const cp = Math.cos(p.pitch);
  const sp = Math.sin(p.pitch);
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  out.fx = -sy * cp;
  out.fy = sp;
  out.fz = -cy * cp;
  // right = normalize(cross(forward, worldUp)), which is horizontal.
  out.rx = cy;
  out.ry = 0;
  out.rz = -sy;
  // up = cross(right, forward)
  out.ux = out.ry * out.fz - out.rz * out.fy;
  out.uy = out.rz * out.fx - out.rx * out.fz;
  out.uz = out.rx * out.fy - out.ry * out.fx;
  return out;
}

/**
 * Widens the vertical field of view on narrow (portrait) viewports so the horizontal view does not
 * collapse into a keyhole. Landscape (at or above 1.35) keeps the look's own value.
 */
export function fovForAspect(fovDeg: number, aspect: number): number {
  const t = smoothstep(1.35, 0.5, aspect);
  return lerp(fovDeg, fovDeg * 1.55, t);
}

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/** World ray through normalised device coordinates (-1..1, y up). */
export function ndcRay(p: CameraPose, nx: number, ny: number, out: Ray = {} as Ray, b?: Basis): Ray {
  const bs = b ?? basis(p);
  const th = Math.tan(p.fov / 2);
  const sx = nx * th * p.aspect;
  const sy = ny * th;
  let dx = bs.fx + bs.rx * sx + bs.ux * sy;
  let dy = bs.fy + bs.ry * sx + bs.uy * sy;
  let dz = bs.fz + bs.rz * sx + bs.uz * sy;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  out.ox = p.x;
  out.oy = p.y;
  out.oz = p.z;
  out.dx = dx;
  out.dy = dy;
  out.dz = dz;
  return out;
}

export interface PlaneHit {
  x: number;
  z: number;
  /** Distance along the ray. */
  t: number;
  /** True when the ray really hits the plane in front of the camera; false when it was clamped. */
  hit: boolean;
}

/**
 * Where a ray meets the plane y = `planeY`. Rays that point at or above the horizon never hit, so they
 * are clamped to `maxDist` along the horizontal heading (with `hit` false): a click in the sky still
 * rings the far field instead of nowhere.
 */
export function rayPlane(r: Ray, planeY: number, maxDist: number, out: PlaneHit = {} as PlaneHit): PlaneHit {
  if (r.dy < -1e-4) {
    const t = (planeY - r.oy) / r.dy;
    if (t > 0 && t <= maxDist) {
      out.x = r.ox + r.dx * t;
      out.z = r.oz + r.dz * t;
      out.t = t;
      out.hit = true;
      return out;
    }
  }
  const h = Math.hypot(r.dx, r.dz) || 1;
  out.x = r.ox + (r.dx / h) * maxDist;
  out.z = r.oz + (r.dz / h) * maxDist;
  out.t = maxDist;
  out.hit = false;
  return out;
}

export interface Screen {
  /** Client pixels, origin top left. */
  x: number;
  y: number;
  /** Distance along the view direction. */
  depth: number;
}

/** Projects a world point to client pixels. Returns null when it is behind the camera. */
export function project(
  p: CameraPose,
  vw: number,
  vh: number,
  x: number,
  y: number,
  z: number,
  out: Screen = {} as Screen,
  b?: Basis,
): Screen | null {
  const bs = b ?? basis(p);
  const dx = x - p.x;
  const dy = y - p.y;
  const dz = z - p.z;
  const depth = dx * bs.fx + dy * bs.fy + dz * bs.fz;
  if (depth <= 1e-4) return null;
  const th = Math.tan(p.fov / 2);
  const nx = (dx * bs.rx + dy * bs.ry + dz * bs.rz) / (depth * th * p.aspect);
  const ny = (dx * bs.ux + dy * bs.uy + dz * bs.uz) / (depth * th);
  out.x = (nx * 0.5 + 0.5) * vw;
  out.y = (0.5 - ny * 0.5) * vh;
  out.depth = depth;
  return out;
}

/** World point at `depth` along the view direction that appears at client pixel (cx, cy). */
export function unprojectAtDepth(
  p: CameraPose,
  vw: number,
  vh: number,
  cx: number,
  cy: number,
  depth: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  b?: Basis,
): { x: number; y: number; z: number } {
  const bs = b ?? basis(p);
  const th = Math.tan(p.fov / 2);
  const nx = (cx / vw) * 2 - 1;
  const ny = 1 - (cy / vh) * 2;
  const sx = nx * th * p.aspect * depth;
  const sy = ny * th * depth;
  out.x = p.x + bs.fx * depth + bs.rx * sx + bs.ux * sy;
  out.y = p.y + bs.fy * depth + bs.ry * sx + bs.uy * sy;
  out.z = p.z + bs.fz * depth + bs.rz * sx + bs.uz * sy;
  return out;
}

/** World size that spans `px` client pixels (vertically) at `depth`. */
export function worldSizeForPixels(p: CameraPose, vh: number, px: number, depth: number): number {
  return (px / vh) * 2 * Math.tan(p.fov / 2) * depth;
}

/** Screen row (0 top, 1 bottom) of the horizon for a pose: where y = const planes vanish. */
export function horizonRow(p: CameraPose): number {
  // A ray with dy = 0 has pitch angle -pose.pitch relative to the optical axis.
  const ny = -Math.tan(p.pitch) / Math.tan(p.fov / 2);
  return 0.5 - ny * 0.5;
}
