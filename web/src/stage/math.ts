// Small, framework-free numeric helpers shared by the stage's pure modules and its engine.
// Nothing here allocates in a hot path and nothing imports three.

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const saturate = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Inverse of lerp, clamped to 0..1. Returns 0 when the range is empty. */
export function invLerp(a: number, b: number, x: number): number {
  return a === b ? 0 : saturate((x - a) / (b - a));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = invLerp(e0, e1, x);
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t: number): number => 1 - (1 - saturate(t)) ** 3;
export const easeInCubic = (t: number): number => saturate(t) ** 3;
export function easeInOutCubic(t: number): number {
  const x = saturate(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
/** Overshoots slightly past 1 before settling; used for the shards locking in. */
export function easeOutBack(t: number, s = 1.4): number {
  const x = saturate(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}

/** Frame-rate independent exponential approach: `lambda` is the rate in 1/s. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Wraps an angle difference into -PI..PI. */
export function wrapAngle(a: number): number {
  return a - TAU * Math.round(a / TAU);
}

export interface Velocity {
  v: number;
}

/**
 * Critically damped spring toward `target` (the "smooth damp" used by game cameras). `smoothTime` is
 * roughly the time to cover most of the distance; about 4x of it to settle. No overshoot, continuous
 * velocity, so retargeting mid flight stays smooth.
 */
export function smoothDamp(
  current: number,
  target: number,
  vel: Velocity,
  smoothTime: number,
  dt: number,
): number {
  if (dt <= 0) return current;
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * e;
  return target + (change + temp) * e;
}

/** Cheap deterministic hash of an integer pair to 0..1, mirrored in the shaders. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** A tiny seeded generator (mulberry32) so layouts and spawns are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
