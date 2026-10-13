// Pulse lifetime and normalisation maths, and the tracker that turns bus pulses into the ring slots the
// lattice shader reads. Pure: no three, no DOM. The GLSL in engine/shaders mirrors `ringValue` and is
// generated from the same `PULSE_PARAMS` table, so tuning one place tunes both.
//
// A ring is a wavefront expanding over the lattice plane from (x, z). Cells near the front rise
// (`lift`) and glow (`heat`); behind it a short damped ripple trails off. Kinds differ only in speed,
// width and loudness. Block waves are broad and slow, clicks are tight and quick.

import type { Pulse, PulseKind } from './bus';

export type RingKind = PulseKind | 'land';

export interface PulseParams {
  /** Wavefront speed, world units per second. */
  speed: number;
  /** Half width of the front at birth, world units. */
  width: number;
  /** Width growth per second. */
  grow: number;
  /** Peak lift of a cell under the front, world units, at strength 1. */
  lift: number;
  /** Seconds until the ring is gone. */
  life: number;
  /** Emission boost under the front. */
  heat: number;
  /** Default tint index (see TINTS in the engine). */
  tint: number;
}

/** Kind order is also the index the shader uses. */
export const RING_KINDS: readonly RingKind[] = ['block', 'click', 'success', 'warn', 'land'];

export const PULSE_PARAMS: Record<RingKind, PulseParams> = {
  block: { speed: 12, width: 1.5, grow: 0.9, lift: 0.34, life: 4.2, heat: 0.6, tint: 0 },
  click: { speed: 9, width: 0.85, grow: 0.5, lift: 0.38, life: 2.4, heat: 0.65, tint: 1 },
  success: { speed: 7, width: 1.1, grow: 0.6, lift: 0.3, life: 2.8, heat: 0.7, tint: 1 },
  warn: { speed: 5, width: 1.4, grow: 0.4, lift: 0.25, life: 2.6, heat: 0.6, tint: 2 },
  land: { speed: 3, width: 0.7, grow: 0.5, lift: 0.34, life: 1.6, heat: 0.9, tint: 3 },
};

/** Tint slots shared by the shader: accent-hot, white-hot, amber, then the three tier colours. */
export const TINT = { accent: 0, white: 1, warn: 2, cumulus: 3, nimbus: 4, stratus: 5 } as const;

export const MAX_BUS_RINGS = 8;
export const MAX_LAND_RINGS = 6;
export const MAX_RINGS = MAX_BUS_RINGS + MAX_LAND_RINGS;

/** Seconds since a pulse fired. Never negative (a pulse stamped slightly in the future reads as 0). */
export function pulseAge(nowMs: number, atMs: number): number {
  return Math.max(0, (nowMs - atMs) / 1000);
}

/** Pulse strength is a 0..1 loudness from the page; the stage tolerates a little overdrive. */
export function pulseStrength(strength: number): number {
  if (!Number.isFinite(strength)) return 1;
  return Math.min(1.5, Math.max(0, strength));
}

export function ringRadius(age: number, p: PulseParams): number {
  return age * p.speed;
}

export function ringWidth(age: number, p: PulseParams): number {
  return p.width + p.grow * age;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Fast attack, hold, then a smooth release that reaches zero exactly at `life`. 0..1. */
export function pulseEnvelope(age: number, p: PulseParams): number {
  if (age <= 0 || age >= p.life) return 0;
  return (1 - Math.exp(-age * 16)) * (1 - smooth(p.life * 0.5, p.life, age));
}

/**
 * The lift profile of a ring at distance `d` from its origin, before strength and `lift` are applied.
 * About 1 at the front, a damped ripple behind it (down to roughly -0.3), 0 far ahead of it. The
 * shader computes the same expression per cell.
 */
export function ringValue(d: number, age: number, p: PulseParams): number {
  const env = pulseEnvelope(age, p);
  if (env === 0) return 0;
  const r = ringRadius(age, p);
  const w = ringWidth(age, p);
  const x = d - r;
  const front = Math.exp(-(x * x) / (w * w));
  const trail = x < 0 ? 0.32 * Math.cos((x * 1.9) / (0.6 + w * 0.4)) * Math.exp(x / (w * 2.6)) : 0;
  const atten = 1 / (1 + 0.035 * r);
  return (front + trail) * env * atten;
}

export function isAlive(age: number, p: PulseParams): boolean {
  return age < p.life;
}

export interface Ring {
  active: boolean;
  id: number;
  kind: number;
  tint: number;
  x: number;
  z: number;
  at: number;
  strength: number;
}

export interface AcceptedPulse {
  id: number;
  kind: RingKind;
  x: number;
  z: number;
  strength: number;
}

/** Maps a pulse to lattice-plane x/z. Return false to drop it (no usable mapping). */
export type Locate = (pulse: Pulse, out: [number, number]) => boolean;

const NONE: readonly AcceptedPulse[] = Object.freeze([]);
/** Two pulses of one kind this close in time and place are the same gesture seen twice (see dedupe). */
const DEDUPE_MS = 140;
const DEDUPE_DIST = 2.5;

export class PulseTracker {
  readonly rings: Ring[] = [];
  /** Highest bus pulse id consumed so far. */
  lastId: number;
  /** `at` of the newest block pulse accepted, or -Infinity. */
  lastBlockAt = Number.NEGATIVE_INFINITY;
  private readonly tmp: [number, number] = [0, 0];

  constructor(startAfterId = 0) {
    this.lastId = startAfterId;
    for (let i = 0; i < MAX_RINGS; i++) {
      this.rings.push({ active: false, id: 0, kind: 0, tint: 0, x: 0, z: 0, at: 0, strength: 0 });
    }
  }

  /**
   * Consume bus pulses newer than the last one seen. Duplicates (the page and the stage both reporting
   * the same click) are merged into the louder one. Returns the pulses newly accepted this call.
   */
  ingest(pulses: readonly Pulse[], nowMs: number, locate: Locate): readonly AcceptedPulse[] {
    let out: AcceptedPulse[] | null = null;
    for (const p of pulses) {
      if (p.id <= this.lastId) continue;
      this.lastId = p.id;
      const kind = RING_KINDS.indexOf(p.kind);
      if (kind < 0) continue;
      const params = PULSE_PARAMS[p.kind];
      if (pulseAge(nowMs, p.at) >= params.life) continue;
      if (!locate(p, this.tmp)) continue;
      const strength = pulseStrength(p.strength);
      if (this.mergeDuplicate(kind, p.at, this.tmp[0], this.tmp[1], strength)) continue;
      const slot = this.freeSlot(0, MAX_BUS_RINGS, nowMs);
      slot.active = true;
      slot.id = p.id;
      slot.kind = kind;
      slot.tint = params.tint;
      slot.x = this.tmp[0];
      slot.z = this.tmp[1];
      slot.at = p.at;
      slot.strength = strength;
      if (p.kind === 'block') this.lastBlockAt = Math.max(this.lastBlockAt, p.at);
      if (!out) out = [];
      out.push({ id: p.id, kind: p.kind, x: slot.x, z: slot.z, strength });
    }
    return out ?? NONE;
  }

  /** A decorative landing glow (payout beams). Uses its own slots so it never evicts a real wave. */
  addLanding(x: number, z: number, nowMs: number, tint: number, strength = 1): void {
    const slot = this.freeSlot(MAX_BUS_RINGS, MAX_RINGS, nowMs);
    slot.active = true;
    slot.id = -1;
    slot.kind = RING_KINDS.indexOf('land');
    slot.tint = tint;
    slot.x = x;
    slot.z = z;
    slot.at = nowMs;
    slot.strength = strength;
  }

  /**
   * Writes the active rings into two uniform arrays (vec4 each): A = (x, z, age, strength) and
   * B = (kind index, tint index, 0, 0). Expired rings are released. Returns the count written.
   */
  pack(nowMs: number, a: Float32Array, b: Float32Array): number {
    let n = 0;
    for (const r of this.rings) {
      if (!r.active) continue;
      const kind = RING_KINDS[r.kind] ?? 'click';
      const params = PULSE_PARAMS[kind];
      const age = pulseAge(nowMs, r.at);
      if (!isAlive(age, params)) {
        r.active = false;
        continue;
      }
      const o = n * 4;
      a[o] = r.x;
      a[o + 1] = r.z;
      a[o + 2] = age;
      a[o + 3] = r.strength;
      b[o] = r.kind;
      b[o + 1] = r.tint;
      b[o + 2] = 0;
      b[o + 3] = 0;
      n++;
    }
    return n;
  }

  /** Number of live rings, for the debug overlay. */
  activeCount(): number {
    let n = 0;
    for (const r of this.rings) if (r.active) n++;
    return n;
  }

  /** 0..1 flash that decays after the newest block pulse (the lattice's global beat). */
  beat(nowMs: number): number {
    if (!Number.isFinite(this.lastBlockAt)) return 0;
    const age = pulseAge(nowMs, this.lastBlockAt);
    return Math.exp(-age * 1.6) * (1 - Math.exp(-age * 22));
  }

  reset(): void {
    for (const r of this.rings) r.active = false;
    this.lastBlockAt = Number.NEGATIVE_INFINITY;
  }

  private mergeDuplicate(kind: number, at: number, x: number, z: number, strength: number): boolean {
    for (let i = 0; i < MAX_BUS_RINGS; i++) {
      const r = this.rings[i]!;
      if (!r.active || r.kind !== kind) continue;
      if (Math.abs(r.at - at) > DEDUPE_MS) continue;
      if (Math.hypot(r.x - x, r.z - z) > DEDUPE_DIST) continue;
      r.strength = Math.max(r.strength, strength);
      return true;
    }
    return false;
  }

  private freeSlot(from: number, to: number, nowMs: number): Ring {
    let oldest = this.rings[from]!;
    for (let i = from; i < to; i++) {
      const r = this.rings[i]!;
      if (!r.active) return r;
      const kind = RING_KINDS[r.kind] ?? 'click';
      if (!isAlive(pulseAge(nowMs, r.at), PULSE_PARAMS[kind])) return r;
      if (r.at < oldest.at) oldest = r;
    }
    return oldest;
  }
}

/** GLSL constant tables generated from `PULSE_PARAMS`, so the shader never drifts from the TS maths. */
export function ringTablesGlsl(): string {
  const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
  const k0 = RING_KINDS.map((k) => {
    const p = PULSE_PARAMS[k];
    return `vec4(${f(p.speed)}, ${f(p.width)}, ${f(p.grow)}, ${f(p.lift)})`;
  });
  const k1 = RING_KINDS.map((k) => {
    const p = PULSE_PARAMS[k];
    return `vec4(${f(p.life)}, ${f(p.heat)}, 0.0, 0.0)`;
  });
  const n = RING_KINDS.length;
  return `const vec4 RING_K0[${n}] = vec4[${n}](${k0.join(', ')});\nconst vec4 RING_K1[${n}] = vec4[${n}](${k1.join(', ')});`;
}
