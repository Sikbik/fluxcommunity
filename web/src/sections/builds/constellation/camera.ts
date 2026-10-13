/**
 * Camera and picking for the constellation. Pure maths, no canvas.
 *
 * A turntable camera looks down at the origin from `distance` world units: `yaw` turns the scene
 * about the vertical axis, `pitch` tilts the view down (0 is level, PI/2 straight down). Points
 * project with a simple perspective, so nearer things are bigger and brighter.
 */
import type { Vec3 } from './graph';

export interface Camera {
  yaw: number;
  pitch: number;
  /** 1 fits the whole graph; the engine bounds it. */
  zoom: number;
  /** Screen-space pan, px. */
  panX: number;
  panY: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Pixels per world unit at zoom 1 and depth 0. */
  unit: number;
  /** Moves the whole picture down by this many px (the field sits a little above the origin). */
  shiftY?: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Perspective scale: 1 at depth 0, bigger when nearer. */
  scale: number;
  /** View-space depth: negative is nearer the viewer. */
  depth: number;
}

/** Distance from the eye to the origin, world units. */
export const DISTANCE = 4.4;

export const PITCH_MIN = 0.16;
export const PITCH_MAX = 1.12;
export const ZOOM_MIN = 0.72;
export const ZOOM_MAX = 2.7;

export const DEFAULT_CAMERA: Readonly<Camera> = { yaw: 0.35, pitch: 0.5, zoom: 1, panX: 0, panY: 0 };

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function project(p: Vec3, cam: Camera, vp: Viewport, out: Projected): Projected {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const viewY = p.y * cp + z1 * sp;
  const depth = -p.y * sp + z1 * cp;
  const scale = DISTANCE / Math.max(0.5, DISTANCE + depth);
  const k = scale * vp.unit * cam.zoom;
  out.x = vp.width / 2 + cam.panX + x1 * k;
  out.y = vp.height / 2 + (vp.shiftY ?? 0) + cam.panY - viewY * k;
  out.scale = scale;
  out.depth = depth;
  return out;
}

/**
 * How much to widen the world for a viewport: a wide frame gets a wide ring, so the picture fills it
 * instead of floating in the middle. 1 for a square or tall frame.
 */
export function stretchFor(aspect: number): number {
  return clamp(aspect / 1.25, 1, 1.85);
}

export interface FitInput {
  /** Largest horizontal distance of a node from the centre, in world units. */
  extent: number;
  /** Largest height of a node from the plane of the hubs, in world units. */
  height: number;
  /** The world is widened sideways by this factor. */
  stretch: number;
  pitch: number;
}

/**
 * Pixels per world unit so the graph fits the viewport with room for its labels: the horizontal
 * reach across, and the squashed ring plus the heights up and down.
 */
export function fitUnit(width: number, height: number, g: FitInput): number {
  const halfW = Math.max(0.1, g.extent * g.stretch + (width < 520 ? 0.3 : 0.42));
  const halfH = Math.max(0.1, g.extent * Math.sin(g.pitch) + g.height * Math.cos(g.pitch) + 0.3);
  return Math.max(40, Math.min((width * 0.5) / halfW, (height * 0.5) / halfH));
}

/** The resting pitch for a viewport: shallow when it is wide, steeper as it gets taller. */
export function pitchFor(aspect: number): number {
  const t = clamp((1.5 - aspect) / 0.9, 0, 1);
  return 0.52 + t * 0.34;
}

/** Zooms by `factor` keeping the screen point (px, py) where it is. Mutates `cam`. */
export function zoomAbout(cam: Camera, vp: Viewport, px: number, py: number, factor: number): void {
  const next = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const k = next / cam.zoom;
  const ox = px - vp.width / 2 - cam.panX;
  const oy = py - vp.height / 2 - cam.panY;
  cam.panX -= ox * (k - 1);
  cam.panY -= oy * (k - 1);
  cam.zoom = next;
}

/** Keeps the pan within reach so the graph can never be dragged out of sight. Mutates `cam`. */
export function clampPan(cam: Camera, vp: Viewport): void {
  const limX = vp.width * 0.42 * cam.zoom;
  const limY = vp.height * 0.42 * cam.zoom;
  cam.panX = clamp(cam.panX, -limX, limX);
  cam.panY = clamp(cam.panY, -limY, limY);
}

/** The yaw that brings a point to the front (nearest the viewer). */
export function yawToFace(p: Vec3): number {
  return Math.PI - Math.atan2(p.x, p.z);
}

/** The shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export interface Target {
  x: number;
  y: number;
  /** Hit radius in px. */
  r: number;
  depth: number;
}

/**
 * The target under (px, py), nearest the viewer first among those within their hit radius, or the
 * one whose centre is closest when several overlap at equal depth. Returns the index, or -1.
 */
export function pick(targets: ReadonlyArray<Target | null>, px: number, py: number, slack = 0): number {
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t) continue;
    const d = Math.hypot(px - t.x, py - t.y);
    if (d > t.r + slack) continue;
    // Prefer the nearer (more negative depth) and the closer to the pointer.
    const score = d + t.depth * 6;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
