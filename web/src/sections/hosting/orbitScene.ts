/**
 * The moving layer of the tier explainer: the sample nodes circulating on each orbit, the block
 * clock sweep and the payout flashes. Plain canvas 2D with pre-rendered sprites, so a frame is a
 * few dozen drawImage calls and allocates nothing. The static drawing (rings, ticks, gates) is SVG
 * and lives in OrbitStage.tsx; React never runs per frame.
 */
import type { Tier } from '@shared/api';
import { TIERS } from '@shared/api';
import { clamp, clamp01 } from '@/lib/math';
import { useStageBus } from '@/stage/bus';
import {
  CENTER,
  DOT_R,
  dotCountFor,
  dotPosition,
  GATE_HALF,
  HUB_R,
  hexPerimeterPoint,
  nextPayeeIndex,
  ORBIT_R,
  orbitPeriodSec,
  PHASE_OFFSET,
  VIEW,
  type XY,
} from './orbit';

/** How long a payout flash lasts at a gate. */
export const FLASH_MS = 1150;
/** Weight of an orbit that is not the focused one. */
const DIM_WEIGHT = 0.2;
/** Fraction of the perimeter either side of the gate that is lit by a flash. */
const FLASH_ARC = 0.045;
/** Angle (radians) the sweep trails behind its leading edge. */
const SWEEP_TRAIL = (58 * Math.PI) / 180;
/** Sprite glow radius as a multiple of the dot radius. */
const GLOW = 3.1;

type RGB = readonly [number, number, number];

/** Draw order for each focus: the focused orbit last, so it is always on top. No per-frame arrays. */
const DRAW_ORDER: Record<Tier | 'none', readonly Tier[]> = {
  none: TIERS,
  cumulus: ['nimbus', 'stratus', 'cumulus'],
  nimbus: ['cumulus', 'stratus', 'nimbus'],
  stratus: ['cumulus', 'nimbus', 'stratus'],
};

interface Palette {
  tier: Record<Tier, RGB>;
  hot: RGB;
  /** The white-hot of the system (`--hot-rgb`). */
  white: RGB;
}

interface Sprite {
  normal: HTMLCanvasElement;
  hot: HTMLCanvasElement;
  /** Half extent in diagram units. */
  half: number;
}

export interface OrbitCounts {
  cumulus: number;
  nimbus: number;
  stratus: number;
}

function parseRgb(raw: string, fallback: RGB): RGB {
  const m = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (m.length >= 3 && m.every((n) => Number.isFinite(n))) return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
  return fallback;
}

function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class OrbitScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private k = 1;
  private palette: Palette = {
    tier: { cumulus: [54, 211, 255], nimbus: [199, 125, 255], stratus: [255, 200, 87] },
    hot: [174, 198, 255],
    white: [255, 255, 255],
  };
  private sprites: Record<Tier, Sprite> | null = null;
  private sweep: HTMLCanvasElement | null = null;
  private clip: Path2D | null = null;
  private readonly tmp: XY = { x: 0, y: 0 };

  private readonly phase: Record<Tier, number> = {
    cumulus: PHASE_OFFSET.cumulus,
    nimbus: PHASE_OFFSET.nimbus,
    stratus: PHASE_OFFSET.stratus,
  };
  private readonly weight: Record<Tier, number> = { cumulus: 1, nimbus: 1, stratus: 1 };
  private readonly flashAt: Record<Tier, number> = { cumulus: -1e9, nimbus: -1e9, stratus: -1e9 };
  private readonly dots: Record<Tier, number> = { cumulus: 24, nimbus: 11, stratus: 12 };
  private readonly period: Record<Tier, number> = { cumulus: 120, nimbus: 56, stratus: 61 };

  private hasCounts = false;
  private focus: Tier | null = null;
  private reduced = false;
  private animating = true;
  private lastNow = 0;
  private lastHeight = 0;

  /** Called once for each real block that lands while the clock is live. */
  onBlock: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.readPalette();
  }

  // ---- inputs ---------------------------------------------------------------------------

  /** Square CSS size of the stage. Rebuilds the sprites at the new pixel density. */
  resize(cssSize: number, dpr: number): void {
    const px = Math.max(1, Math.round(cssSize * dpr));
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    this.k = px / VIEW;
    this.readPalette();
    this.buildSprites();
    this.buildSweep();
    this.buildClip();
  }

  /** Null while there is no snapshot at all: the rings show, the sample does not. */
  setCounts(counts: OrbitCounts | null): void {
    this.hasCounts = counts !== null;
    if (!counts) return;
    for (const t of TIERS) {
      this.dots[t] = dotCountFor(counts[t]);
      this.period[t] = orbitPeriodSec(counts[t]);
    }
  }

  setFocus(tier: Tier | null): void {
    this.focus = tier;
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** False freezes the circulation (paused, off screen) without clearing the canvas. */
  setAnimating(on: boolean): void {
    this.animating = on;
  }

  /** True while any weight is still easing toward its target, so a paused scene keeps drawing. */
  isSettling(): boolean {
    for (const t of TIERS) {
      if (Math.abs(this.weight[t] - this.targetWeight(t)) > 0.004) return true;
    }
    return false;
  }

  /** Colours follow the active accent (the sweep) and the tier tokens. */
  refreshPalette(): void {
    this.readPalette();
    this.buildSprites();
    this.buildSweep();
  }

  dispose(): void {
    this.onBlock = null;
    this.sprites = null;
    this.sweep = null;
    this.clip = null;
  }

  // ---- frame -----------------------------------------------------------------------------

  private targetWeight(t: Tier): number {
    return this.focus === null || this.focus === t ? 1 : DIM_WEIGHT;
  }

  /** Draws one frame at `now` (a performance.now timestamp). */
  frame(now: number): void {
    const dt = this.lastNow === 0 ? 0 : clamp((now - this.lastNow) / 1000, 0, 0.1);
    this.lastNow = now;
    const bus = useStageBus.getState().chain;

    // Real blocks only: no clock, no flash.
    if (bus.live && bus.height > 0) {
      if (this.lastHeight !== 0 && bus.height > this.lastHeight) this.flash(now);
      this.lastHeight = bus.height;
    }

    const ease = this.reduced ? 1 : 1 - Math.exp(-9 * dt);
    for (const t of TIERS) {
      this.weight[t] += (this.targetWeight(t) - this.weight[t]) * (dt === 0 && !this.reduced ? 0 : ease);
      if (this.animating && !this.reduced && dt > 0) {
        const p = this.phase[t] + dt / this.period[t];
        this.phase[t] = p - Math.floor(p);
      }
    }

    let sweepProgress = -1;
    if (!this.reduced && bus.live && bus.lastBlockAt !== null && bus.intervalMs > 0) {
      sweepProgress = clamp01((Date.now() - bus.lastBlockAt) / bus.intervalMs);
    }
    this.draw(now, sweepProgress);
  }

  /** Jump every weight to its target and draw once. For reduced motion and first paint. */
  snap(now = 0): void {
    for (const t of TIERS) this.weight[t] = this.targetWeight(t);
    this.draw(now, -1);
  }

  private flash(now: number): void {
    if (this.reduced) {
      // Calm twin: no travelling light, but the payout is still marked by the pops (DOM).
      this.onBlock?.();
      return;
    }
    for (const t of TIERS) this.flashAt[t] = now;
    this.onBlock?.();
  }

  // ---- drawing ---------------------------------------------------------------------------

  private draw(now: number, sweepProgress: number): void {
    const { ctx, k } = this;
    const sprites = this.sprites;
    if (!sprites) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (!this.hasCounts) return;

    // The block clock: a wedge that trails a leading edge once around per block.
    if (sweepProgress >= 0 && this.sweep && this.clip) {
      const angle = sweepProgress * Math.PI * 2;
      ctx.save();
      ctx.clip(this.clip);
      ctx.translate(CENTER, CENTER);
      ctx.rotate(angle);
      ctx.drawImage(this.sweep, -CENTER, -CENTER, VIEW, VIEW);
      ctx.restore();
    }

    for (const tier of DRAW_ORDER[this.focus ?? 'none']) this.drawOrbit(tier, sprites[tier], now);
  }

  private drawOrbit(tier: Tier, sprite: Sprite, now: number): void {
    const { ctx, tmp } = this;
    const r = ORBIT_R[tier];
    const n = this.dots[tier];
    const phase = this.phase[tier];
    const w = this.weight[tier];
    const focused = this.focus === tier;
    const half = sprite.half;
    const payee = nextPayeeIndex(n, phase);

    for (let i = 0; i < n; i++) {
      const u = dotPosition(i, n, phase);
      hexPerimeterPoint(r, u, tmp);
      const x = CENTER + tmp.x;
      const y = CENTER + tmp.y;
      const near = i === payee;
      // The node about to reach the gate swells a little.
      const toGate = u === 0 ? 0 : 1 - u;
      const lift = near && toGate < 0.07 ? 1 + 0.45 * (1 - toGate / 0.07) : 1;
      const s = (focused ? 1.12 : 1) * lift;
      ctx.globalAlpha = (near ? 1 : 0.82) * w;
      const img = near && w > 0.5 ? sprite.hot : sprite.normal;
      ctx.drawImage(img, x - half * s, y - half * s, half * 2 * s, half * 2 * s);
    }

    // A thin ring marks the next payee.
    if (w > 0.35) {
      const u = dotPosition(payee, n, phase);
      hexPerimeterPoint(r, u, tmp);
      ctx.globalAlpha = 0.7 * w;
      ctx.strokeStyle = rgba(this.palette.hot, 0.9);
      ctx.lineWidth = 1;
      hexPath(ctx, CENTER + tmp.x, CENTER + tmp.y, DOT_R[tier] + 5);
      ctx.stroke();
    }

    // The payout flash at the gate.
    const age = now - this.flashAt[tier];
    if (age >= 0 && age < FLASH_MS) {
      const a = 1 - age / FLASH_MS;
      const e = 1 - (1 - age / FLASH_MS) ** 3; // ease-out expand
      const gx = CENTER;
      const gy = CENTER - r;
      ctx.globalAlpha = 1;
      // The lit arc of the ring either side of the gate.
      ctx.strokeStyle = rgba(this.palette.hot, 0.85 * a);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        const u = (-FLASH_ARC + (2 * FLASH_ARC * s) / steps) * (0.4 + 0.6 * e);
        hexPerimeterPoint(r, u, tmp);
        if (s === 0) ctx.moveTo(CENTER + tmp.x, CENTER + tmp.y);
        else ctx.lineTo(CENTER + tmp.x, CENTER + tmp.y);
      }
      ctx.stroke();
      // The expanding ring.
      ctx.strokeStyle = rgba(this.palette.tier[tier], 0.9 * a);
      ctx.lineWidth = 1.6;
      hexPath(ctx, gx, gy, 6 + 30 * e);
      ctx.stroke();
      // The flare.
      const fh = half * 2.2;
      ctx.globalAlpha = 0.95 * a;
      ctx.drawImage(sprite.hot, gx - fh, gy - fh, fh * 2, fh * 2);
      // The gate hairline brightens.
      ctx.globalAlpha = a;
      ctx.strokeStyle = rgba(this.palette.hot, 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy - GATE_HALF);
      ctx.lineTo(gx, gy + GATE_HALF);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- pre-rendering ---------------------------------------------------------------------

  private readPalette(): void {
    const cs = getComputedStyle(this.canvas);
    const read = (name: string, fallback: RGB) => parseRgb(cs.getPropertyValue(name), fallback);
    this.palette = {
      tier: {
        cumulus: read('--tier-cumulus-rgb', [54, 211, 255]),
        nimbus: read('--tier-nimbus-rgb', [199, 125, 255]),
        stratus: read('--tier-stratus-rgb', [255, 200, 87]),
      },
      hot: read('--accent-hot-rgb', [174, 198, 255]),
      white: read('--hot-rgb', [255, 255, 255]),
    };
  }

  private makeCanvas(sizeUnits: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
    const c = document.createElement('canvas');
    const px = Math.max(2, Math.ceil(sizeUnits * this.k));
    c.width = px;
    c.height = px;
    const g = c.getContext('2d');
    if (!g) throw new Error('2d context unavailable');
    return { c, g };
  }

  private buildSprites(): void {
    const out = {} as Record<Tier, Sprite>;
    for (const tier of TIERS) {
      const r = DOT_R[tier];
      const half = r * GLOW;
      const col = this.palette.tier[tier];
      const hot = this.palette.hot;
      const white = this.palette.white;
      const make = (hotCore: boolean): HTMLCanvasElement => {
        const { c, g } = this.makeCanvas(half * 2);
        g.scale(c.width / (half * 2), c.height / (half * 2));
        // Soft glow.
        const grad = g.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0, rgba(hotCore ? hot : col, hotCore ? 0.7 : 0.5));
        grad.addColorStop(0.35, rgba(col, hotCore ? 0.32 : 0.2));
        grad.addColorStop(1, rgba(col, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, half * 2, half * 2);
        // The node: a small hex cell.
        hexPath(g, half, half, r);
        g.fillStyle = rgba(hotCore ? white : col, hotCore ? 0.96 : 0.92);
        g.fill();
        g.lineWidth = 0.9;
        g.strokeStyle = rgba(hotCore ? col : white, hotCore ? 0.95 : 0.55);
        g.stroke();
        // A lighter core.
        hexPath(g, half, half, r * 0.45);
        g.fillStyle = rgba(white, hotCore ? 0.9 : 0.55);
        g.fill();
        return c;
      };
      out[tier] = { normal: make(false), hot: make(true), half };
    }
    this.sprites = out;
  }

  private buildSweep(): void {
    const { c, g } = this.makeCanvas(VIEW);
    const s = c.width / VIEW;
    g.scale(s, s);
    const hot = this.palette.hot;
    // Trailing wedge ending at 12 o'clock (canvas angle -90 degrees), fading backwards.
    const start = -Math.PI / 2 - SWEEP_TRAIL;
    const grad = g.createConicGradient(start, CENTER, CENTER);
    const f = SWEEP_TRAIL / (Math.PI * 2);
    grad.addColorStop(0, rgba(hot, 0));
    grad.addColorStop(f, rgba(hot, 0.2));
    grad.addColorStop(Math.min(1, f + 0.0005), rgba(hot, 0));
    grad.addColorStop(1, rgba(hot, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW, VIEW);
    // The leading edge: a hairline up the 12 o'clock axis.
    const edge = g.createLinearGradient(0, CENTER - HUB_R, 0, CENTER - ORBIT_R.cumulus - 20);
    edge.addColorStop(0, rgba(hot, 0.2));
    edge.addColorStop(0.4, rgba(hot, 0.55));
    edge.addColorStop(1, rgba(hot, 0.15));
    g.strokeStyle = edge;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(CENTER, CENTER - HUB_R);
    g.lineTo(CENTER, CENTER - ORBIT_R.cumulus - 20);
    g.stroke();
    // Fade it in from the hub outward.
    g.globalCompositeOperation = 'destination-in';
    const radial = g.createRadialGradient(CENTER, CENTER, HUB_R, CENTER, CENTER, ORBIT_R.cumulus + 4);
    radial.addColorStop(0, 'rgba(0,0,0,0)');
    radial.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    radial.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = radial;
    g.fillRect(0, 0, VIEW, VIEW);
    this.sweep = c;
  }

  private buildClip(): void {
    const p = new Path2D();
    // The sweep fills the outermost orbit and stops at its line.
    const r = ORBIT_R.cumulus + 0.5;
    for (let i = 0; i < 6; i++) {
      const a = ((-90 + i * 60) * Math.PI) / 180;
      const x = CENTER + r * Math.cos(a);
      const y = CENTER + r * Math.sin(a);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    this.clip = p;
  }
}
