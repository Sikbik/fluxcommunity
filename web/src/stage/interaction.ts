// Bus interaction helpers: picking the symbol anchor, easing focus regions, the symbol's drag spring
// and the intro timeline. Pure and framework-free so the behaviour is unit tested in node.

import type { FocusRegion } from './bus';
import {
  clamp,
  damp,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  saturate,
  smoothstep,
  TAU,
  wrapAngle,
} from './math';

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Area of the rect that lies inside the viewport. */
export function visibleArea(r: RectLike, vw: number, vh: number): number {
  const w = Math.min(r.left + r.width, vw) - Math.max(r.left, 0);
  const h = Math.min(r.top + r.height, vh) - Math.max(r.top, 0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Chooses the anchor to follow: the one with the largest visible area. Ties go to the earlier one in
 * document order. Returns the index, or -1 when nothing has size (an anchor that is not laid out).
 */
export function pickAnchor(rects: readonly RectLike[], vw: number, vh: number): number {
  let best = -1;
  let bestArea = 0;
  let bestFull = 0;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (!(r.width > 1 && r.height > 1)) continue;
    const area = visibleArea(r, vw, vh);
    // An anchor wholly off screen still wins over nothing (the symbol parks near it), but a visible one
    // always wins over an off screen one.
    const full = r.width * r.height;
    if (area > bestArea || (area === bestArea && bestArea === 0 && full > bestFull)) {
      best = i;
      bestArea = area;
      bestFull = full;
    }
  }
  return best;
}

export function pointInRect(x: number, y: number, r: RectLike, pad = 0): boolean {
  return x >= r.left - pad && x <= r.left + r.width + pad && y >= r.top - pad && y <= r.top + r.height + pad;
}

// ---- focus regions ----------------------------------------------------------------------------

export interface EasedFocus {
  id: string;
  /** Centre and half size in client pixels. */
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  /** Eased strength 0..1. */
  s: number;
  /** Soft edge width in pixels. */
  soft: number;
}

export const MAX_FOCUS = 8;
const FOCUS_IN = 9;
const FOCUS_OUT = 5.5;

/** Eases focus regions in and out so a hover never pops, and keeps a fading ghost after removal. */
export class FocusEaser {
  readonly items: EasedFocus[] = [];

  update(regions: readonly FocusRegion[], dt: number): readonly EasedFocus[] {
    const seen = new Set<string>();
    for (const r of regions) {
      seen.add(r.id);
      let it = this.items.find((i) => i.id === r.id);
      if (!it) {
        if (this.items.length >= MAX_FOCUS) this.evictWeakest();
        it = { id: r.id, cx: 0, cy: 0, hw: 0, hh: 0, s: 0, soft: 0 };
        this.items.push(it);
      }
      it.cx = r.x + r.w / 2;
      it.cy = r.y + r.h / 2;
      it.hw = r.w / 2;
      it.hh = r.h / 2;
      it.soft = clamp(Math.min(r.w, r.h) * 0.3, 28, 140);
      it.s = damp(it.s, saturate(r.strength), FOCUS_IN, dt);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (seen.has(it.id)) continue;
      it.s = damp(it.s, 0, FOCUS_OUT, dt);
      if (it.s < 0.01) this.items.splice(i, 1);
    }
    return this.items;
  }

  private evictWeakest(): void {
    let w = 0;
    for (let i = 1; i < this.items.length; i++) if (this.items[i]!.s < this.items[w]!.s) w = i;
    this.items.splice(w, 1);
  }

  /** Writes A = (cx, cy, hw, hh) and B = (strength, soft, 0, 0) per region; returns the count. */
  pack(a: Float32Array, b: Float32Array): number {
    const n = Math.min(this.items.length, MAX_FOCUS);
    for (let i = 0; i < n; i++) {
      const it = this.items[i]!;
      a[i * 4] = it.cx;
      a[i * 4 + 1] = it.cy;
      a[i * 4 + 2] = it.hw;
      a[i * 4 + 3] = it.hh;
      b[i * 4] = it.s;
      b[i * 4 + 1] = it.soft;
      b[i * 4 + 2] = 0;
      b[i * 4 + 3] = 0;
    }
    return n;
  }
}

// ---- the symbol's drag spring -------------------------------------------------------------------

const SPRING_K = 17;
const SPRING_C = 4.6;
const MAX_PITCH = 0.9;

/**
 * Drag rotation with inertia and a spring back to upright. While dragging the angles follow the
 * pointer; on release the velocity carries on and a damped spring pulls the symbol to the nearest
 * whole turn, with a small ring-back. Hover and the separation of the shards ease with `hover`.
 */
export class SymbolMotion {
  yaw = 0;
  pitch = 0;
  vYaw = 0;
  vPitch = 0;
  dragging = false;
  /** 0..1, eased toward the hover target. */
  hover = 0;
  /** 0..1, press compression while the pointer is down on the symbol. */
  press = 0;
  private pressTarget = 0;

  beginDrag(): void {
    this.dragging = true;
    this.vYaw = 0;
    this.vPitch = 0;
    this.pressTarget = 1;
  }

  /** Pointer moved by (dx, dy) client pixels over `dt` seconds while dragging. */
  drag(dx: number, dy: number, dt: number): void {
    if (!this.dragging) return;
    const ay = dx * 0.0085;
    const ap = dy * 0.006;
    this.yaw += ay;
    this.pitch = clamp(this.pitch + ap, -MAX_PITCH, MAX_PITCH);
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / 0.06);
      this.vYaw += (ay / dt - this.vYaw) * k;
      this.vPitch += (ap / dt - this.vPitch) * k;
    }
  }

  endDrag(): void {
    this.dragging = false;
    this.pressTarget = 0;
    // A hard flick should spin, but never so fast it looks broken.
    this.vYaw = clamp(this.vYaw, -14, 14);
    this.vPitch = clamp(this.vPitch, -4, 4);
  }

  /** A click that is not a drag gives the symbol a small kick. */
  kick(strength = 1): void {
    this.vYaw += 3.2 * strength;
    this.pressTarget = 0;
    this.press = Math.max(this.press, 0.6);
  }

  step(dt: number, hoverTarget: number): void {
    const d = Math.min(dt, 0.05);
    this.hover = damp(this.hover, hoverTarget, 7, d);
    this.press = damp(this.press, this.pressTarget, 14, d);
    if (this.dragging) return;
    // Spring toward the nearest whole turn in yaw and toward level in pitch.
    const restYaw = Math.round(this.yaw / TAU) * TAU;
    const ay = -SPRING_K * (this.yaw - restYaw) - SPRING_C * this.vYaw;
    const ap = -SPRING_K * this.pitch - SPRING_C * this.vPitch;
    this.vYaw += ay * d;
    this.vPitch += ap * d;
    this.yaw += this.vYaw * d;
    this.pitch = clamp(this.pitch + this.vPitch * d, -MAX_PITCH, MAX_PITCH);
    // Keep the angle small over time so long sessions never lose float precision.
    if (Math.abs(this.yaw) > TAU * 8) this.yaw = wrapAngle(this.yaw);
  }

  /** True while the spring is still moving noticeably (the engine can idle when everything is calm). */
  get settling(): boolean {
    return (
      this.dragging ||
      Math.abs(this.vYaw) > 0.01 ||
      Math.abs(this.vPitch) > 0.01 ||
      Math.abs(wrapAngle(this.yaw)) > 0.002
    );
  }
}

// ---- the intro timeline -------------------------------------------------------------------------

/** Seconds of the intro (DESIGN 5.0: about 1.8 s). */
export const INTRO_DURATION = 1.8;
/** How long a skip takes to fast forward to the end, seconds (under 200 ms). */
export const INTRO_SKIP_SECONDS = 0.15;

export interface IntroFrame {
  /** 0..1: cells ignite from the centre outward. */
  ignite: number;
  /** Per shard 0..1: 0 far out and spinning, 1 locked in place (overshoots slightly past 1). */
  assemble: [number, number, number, number];
  /** 0..1 white flash, peaking as the shards lock. */
  flash: number;
  /** 0..1 camera push-in. */
  camera: number;
  /** Symbol overall presence 0..1 (fades in as the shards start to arrive). */
  presence: number;
  done: boolean;
}

export function makeIntroFrame(): IntroFrame {
  return { ignite: 0, assemble: [0, 0, 0, 0], flash: 0, camera: 0, presence: 0, done: false };
}

const SHARD_START = 0.32;
const SHARD_STAGGER = 0.07;
const SHARD_TRAVEL = 0.82;
const FLASH_AT = 1.22;

/** Intro state at `t` seconds. The settled state (t at or past the duration) is the normal look. */
export function introFrame(t: number, out: IntroFrame = makeIntroFrame()): IntroFrame {
  out.ignite = easeInOutCubic((t - 0.08) / 1.25);
  for (let i = 0; i < 4; i++) {
    const s = (t - SHARD_START - i * SHARD_STAGGER) / SHARD_TRAVEL;
    out.assemble[i] = s <= 0 ? 0 : easeOutBack(s, 1.1);
  }
  const dFlash = t - FLASH_AT;
  out.flash = dFlash < 0 ? 0 : Math.exp(-dFlash * 8.5) * (1 - Math.exp(-dFlash * 60));
  out.camera = easeOutCubic(t / INTRO_DURATION);
  out.presence = smoothstep(0.2, 0.7, t);
  out.done = t >= INTRO_DURATION;
  if (out.done) {
    out.ignite = 1;
    out.assemble[0] = out.assemble[1] = out.assemble[2] = out.assemble[3] = 1;
    out.flash = 0;
    out.camera = 1;
    out.presence = 1;
  }
  return out;
}

/**
 * Playback rate for the intro clock while skipping: finishes the remainder in `INTRO_SKIP_SECONDS`.
 * Evaluate once, at the moment the skip begins, and hold the rate.
 */
export function introSkipRate(tAtSkip: number): number {
  return Math.max(1, (INTRO_DURATION - tAtSkip) / INTRO_SKIP_SECONDS);
}
