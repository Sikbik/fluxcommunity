/**
 * Everything the constellation paints, in painter's order: the floor, the edges, the light of a
 * block, the nodes, the labels. Stateless: the engine hands over a `Scene` each frame.
 *
 * Nodes are billboards (always facing the viewer) positioned and scaled by the turntable camera.
 * Status is a colour AND a shape inside the node, so it reads without colour.
 */
import { hexPath } from '@/lib/hex';
import { MARK_VIEWBOX, RAW_SHARDS } from '@/stage/mark';
import { GLYPHS, type GlyphName } from '@/ui/Glyph/glyphs';
import { CATEGORY_GLYPH } from '../presentation';
import { type Camera, type Projected, project, type Viewport } from './camera';
import { FLOOR_Y, type Graph, HUB_RADIUS, type Vec3 } from './graph';
import {
  type LabelPlacement,
  type LabelRect,
  type LabelRequest,
  layoutLabels,
  type NodeLook,
  type NodeTone,
  type RGB,
  rgba,
} from './look';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export interface Palette {
  accent: RGB;
  accentStrong: RGB;
  hot: RGB;
  deep: RGB;
  ok: RGB;
  warn: RGB;
  crit: RGB;
  off: RGB;
  pending: RGB;
  ink: RGB;
  ink1: RGB;
  text1: RGB;
  text2: RGB;
  text3: RGB;
  /** The Flux symbol's own blue and white: the mark takes no other colour. */
  fluxBlue: RGB;
  mono: string;
}

export const FALLBACK_PALETTE: Palette = {
  accent: [79, 122, 212],
  accentStrong: [171, 190, 228],
  hot: [174, 198, 255],
  deep: [43, 97, 209],
  ok: [63, 220, 149],
  warn: [255, 154, 61],
  crit: [255, 84, 112],
  off: [113, 113, 113],
  pending: [134, 161, 218],
  ink: [8, 10, 15],
  ink1: [15, 19, 25],
  text1: [255, 255, 255],
  text2: [213, 215, 219],
  text3: [161, 165, 171],
  fluxBlue: [43, 97, 209],
  mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
};

export function toneColour(pal: Palette, tone: NodeTone): RGB {
  switch (tone) {
    case 'ok':
      return pal.ok;
    case 'warn':
      return pal.warn;
    case 'crit':
      return pal.crit;
    case 'pending':
      return pal.pending;
    case 'self':
      return pal.accentStrong;
    default:
      return pal.off;
  }
}

// ---------------------------------------------------------------------------
// Sprites (soft light, drawn additively)
// ---------------------------------------------------------------------------

export class Sprites {
  private cache = new Map<string, HTMLCanvasElement>();

  /** A radial glow of one colour on a transparent square; scale it when drawing. */
  glow(c: RGB): HTMLCanvasElement {
    const key = `${c[0]},${c[1]},${c[2]}`;
    let sprite = this.cache.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = 96;
      sprite.height = 96;
      const g = sprite.getContext('2d');
      if (g) {
        const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
        grad.addColorStop(0, rgba(c, 1));
        grad.addColorStop(0.22, rgba(c, 0.5));
        grad.addColorStop(0.55, rgba(c, 0.12));
        grad.addColorStop(1, rgba(c, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, 96, 96);
      }
      this.cache.set(key, sprite);
    }
    return sprite;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export interface ActiveLeg {
  from: number;
  to: number;
  /** performance.now() when the light leaves `from`. */
  t0: number;
  /** ms to cross. */
  dur: number;
  strength: number;
}

export interface Scene {
  width: number;
  height: number;
  /** Simulated seconds (orbits, rotating rings). Stands still when motion is off. */
  t: number;
  /** performance.now(). */
  now: number;
  motion: boolean;
  low: boolean;
  pal: Palette;
  sprites: Sprites;
  graph: Graph;
  cam: Camera;
  vp: Viewport;
  proj: Projected[];
  pos: Vec3[];
  looks: ReadonlyArray<NodeLook | null>;
  lit: Float32Array;
  presence: Float32Array;
  flash: Float32Array;
  visible: Uint8Array;
  hover: number;
  selected: number;
  category: string | null;
  /** The build that was just flown to, with seconds since. */
  ping: { index: number; age: number } | null;
  legs: readonly ActiveLeg[];
  /** Node indices, farthest first. */
  order: readonly number[];
  /** Pixels per world unit including zoom. */
  scale: number;
  /** The world is widened by this factor along x (a wide frame gets a wide ring). */
  stretch: number;
}

const TAU = Math.PI * 2;
const COS6 = [0, 1, 2, 3, 4, 5].map((i) => Math.cos(((-90 + i * 60) * Math.PI) / 180));
const SIN6 = [0, 1, 2, 3, 4, 5].map((i) => Math.sin(((-90 + i * 60) * Math.PI) / 180));

const at = (a: Float32Array, i: number): number => a[i] ?? 0;

/** 0 (far) .. 1 (near) from a projected depth. */
const nearOf = (depth: number): number => {
  const n = 0.5 - depth / 3.8;
  return n < 0 ? 0 : n > 1 ? 1 : n;
};

function hex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r * (COS6[0] ?? 0), y + r * (SIN6[0] ?? 0));
  for (let i = 1; i < 6; i++) ctx.lineTo(x + r * (COS6[i] ?? 0), y + r * (SIN6[i] ?? 0));
  ctx.closePath();
}

function glow(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  c: RGB,
  x: number,
  y: number,
  r: number,
  a: number,
): void {
  if (a <= 0.003) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(s.sprites.glow(c), x - r, y - r, r * 2, r * 2);
}

/** Node radius in px for a size factor, before perspective: grows gently with the zoomed scale. */
export function nodeRadius(scale: number, size: number): number {
  return (6 + 0.05 * scale) * size;
}

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

const FLOOR_R = 2.05;

interface Lattice {
  x: Float32Array;
  z: Float32Array;
  a: Float32Array;
  n: number;
}

function buildLattice(spacing: number): Lattice {
  const xs: number[] = [];
  const zs: number[] = [];
  const as: number[] = [];
  const rowH = spacing * 0.866;
  const rows = Math.ceil(FLOOR_R / rowH);
  const cols = Math.ceil(FLOOR_R / spacing);
  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const x = (c + (r & 1 ? 0.5 : 0)) * spacing;
      const z = r * rowH;
      const d = Math.hypot(x, z) / FLOOR_R;
      if (d > 1) continue;
      xs.push(x);
      zs.push(z);
      as.push((1 - d * d) ** 1.4);
    }
  }
  return { x: Float32Array.from(xs), z: Float32Array.from(zs), a: Float32Array.from(as), n: xs.length };
}

const LATTICE_FULL = buildLattice(0.15);
const LATTICE_LOW = buildLattice(0.24);

const P = (): Projected => ({ x: 0, y: 0, scale: 1, depth: 0 });
const tmp = P();
const tmp2 = P();
const v3: Vec3 = { x: 0, y: 0, z: 0 };
const v3b: Vec3 = { x: 0, y: 0, z: 0 };

function drawFloor(ctx: CanvasRenderingContext2D, s: Scene): void {
  const lat = s.low ? LATTICE_LOW : LATTICE_FULL;
  const focus = s.hover >= 0 ? s.hover : s.selected;
  const fp = focus >= 0 ? s.pos[focus] : undefined;
  const fx = fp ? fp.x : 0;
  const fz = fp ? fp.z : 0;
  const boost = fp ? Math.max(at(s.lit, focus), 0.0) : 0;
  const dot = Math.max(1.1, s.scale * 0.0075);

  ctx.fillStyle = rgba(s.pal.accent, 1);
  v3.y = FLOOR_Y;
  for (let i = 0; i < lat.n; i++) {
    const x = lat.x[i] ?? 0;
    const z = lat.z[i] ?? 0;
    v3.x = x * s.stretch;
    v3.z = z;
    const p = project(v3, s.cam, s.vp, tmp);
    let a = (lat.a[i] ?? 0) * (0.14 + 0.4 * nearOf(p.depth));
    if (boost > 0) {
      const d = Math.hypot(x * s.stretch - fx, z - fz);
      if (d < 0.6) {
        const k = 1 - d / 0.6;
        a += boost * k * k * 0.75;
      }
    }
    if (a < 0.015) continue;
    ctx.globalAlpha = a > 1 ? 1 : a;
    const d2 = dot * p.scale;
    ctx.fillRect(p.x - d2 / 2, p.y - d2 / 2, d2, d2);
  }
  ctx.globalAlpha = 1;

  // The bezel: a ring with ticks, so the turn of the world is visible even where nothing else is.
  const ringR = FLOOR_R - 0.02;
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(s.pal.accent, 0.3);
  ctx.beginPath();
  const SEG = 96;
  for (let k = 0; k <= SEG; k++) {
    const a = (k / SEG) * TAU;
    v3.x = Math.cos(a) * ringR * s.stretch;
    v3.z = Math.sin(a) * ringR;
    const p = project(v3, s.cam, s.vp, tmp);
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  const TICKS = 120;
  ctx.beginPath();
  for (let k = 0; k < TICKS; k++) {
    if (k % 10 === 0) continue;
    const a = (k / TICKS) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    v3.x = c * ringR * s.stretch;
    v3.z = sn * ringR;
    v3b.y = FLOOR_Y;
    v3b.x = c * (ringR + 0.045) * s.stretch;
    v3b.z = sn * (ringR + 0.045);
    const p0 = project(v3, s.cam, s.vp, tmp);
    const p1 = project(v3b, s.cam, s.vp, tmp2);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.strokeStyle = rgba(s.pal.accent, 0.24);
  ctx.stroke();

  ctx.beginPath();
  for (let k = 0; k < TICKS; k += 10) {
    const a = (k / TICKS) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    v3.x = c * (ringR - 0.02) * s.stretch;
    v3.z = sn * (ringR - 0.02);
    v3b.x = c * (ringR + 0.1) * s.stretch;
    v3b.z = sn * (ringR + 0.1);
    const p0 = project(v3, s.cam, s.vp, tmp);
    const p1 = project(v3b, s.cam, s.vp, tmp2);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.strokeStyle = rgba(s.pal.accentStrong, 0.4);
  ctx.stroke();

  // The orbit the hubs keep, dotted on the floor.
  ctx.save();
  ctx.setLineDash([1.5, 7]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(s.pal.accentStrong, 0.28);
  ctx.beginPath();
  for (let k = 0; k <= SEG; k++) {
    const a = (k / SEG) * TAU;
    v3.x = Math.cos(a) * HUB_RADIUS * s.stretch;
    v3.z = Math.sin(a) * HUB_RADIUS;
    const p = project(v3, s.cam, s.vp, tmp);
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

const ctl: Vec3 = { x: 0, y: 0, z: 0 };

/** A world-space arc between two points, lifted and bowed outward; returns the screen control point. */
function arcControl(a: Vec3, b: Vec3, lift: number, s: Scene, out: Projected): Projected {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mz = (a.z + b.z) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const horiz = Math.hypot(mx, mz) || 1;
  ctl.x = mx + (mx / horiz) * 0.1;
  ctl.y = my + lift + len * 0.2;
  ctl.z = mz + (mz / horiz) * 0.1;
  return project(ctl, s.cam, s.vp, out);
}

const pc = P();

/** The ring each cluster's apps travel on, drawn faint so the orbiting reads without a label. */
function drawOrbits(ctx: CanvasRenderingContext2D, s: Scene): void {
  const seen = new Set<string>();
  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1;
  for (let i = 0; i < s.graph.nodes.length; i++) {
    const o = s.graph.nodes[i]?.orbit;
    if (!o || o.radius <= 0) continue;
    const key = `${o.cx.toFixed(3)},${o.cy.toFixed(3)},${o.cz.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hub = s.graph.neighbours[i]?.find((j) => s.graph.nodes[j]?.kind === 'hub');
    const pres = hub === undefined ? 1 : at(s.presence, hub);
    if (pres < 0.2) continue;
    ctx.beginPath();
    const SEG = 40;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * TAU;
      const c = Math.cos(a) * o.radius;
      const sn = Math.sin(a) * o.radius;
      v3.x = (o.cx + c * o.ux + sn * o.vx) * s.stretch;
      v3.y = o.cy + c * o.uy + sn * o.vy;
      v3.z = o.cz + c * o.uz + sn * o.vz;
      const p = project(v3, s.cam, s.vp, tmp);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = rgba(s.pal.accentStrong, 0.2 * pres);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEdges(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { graph, proj, pos } = s;
  drawOrbits(ctx, s);
  ctx.lineCap = 'round';
  for (const e of graph.edges) {
    const a = proj[e.a];
    const b = proj[e.b];
    const pa = pos[e.a];
    const pb = pos[e.b];
    if (!a || !b || !pa || !pb) continue;
    const vis = Math.min(at(s.presence, e.a), at(s.presence, e.b));
    if (vis < 0.02) continue;
    const el = Math.min(1, Math.min(at(s.lit, e.a), at(s.lit, e.b)) / 0.6);
    const fade = 0.45 + 0.55 * nearOf((a.depth + b.depth) / 2);
    const k = vis * fade;

    switch (e.kind) {
      case 'spoke': {
        ctx.setLineDash([]);
        ctx.lineWidth = 1 + el * 0.8;
        ctx.strokeStyle = rgba(el > 0.05 ? s.pal.accentStrong : s.pal.accent, (0.24 + 0.55 * el) * k);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (s.motion) {
          ctx.setLineDash([1.2, 11]);
          ctx.lineDashOffset = -s.t * 16;
          ctx.lineWidth = 2;
          ctx.strokeStyle = rgba(s.pal.hot, (0.3 + 0.4 * el) * k);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      }
      case 'tether': {
        ctx.setLineDash([]);
        ctx.lineWidth = 1 + el * 0.7;
        ctx.strokeStyle = rgba(el > 0.05 ? s.pal.accentStrong : s.pal.accent, (0.34 + 0.55 * el) * k);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case 'builder': {
        const c = arcControl(pa, pb, 0.34, s, pc);
        ctx.setLineDash([]);
        ctx.lineWidth = 1.2 + el * 0.9;
        ctx.strokeStyle = rgba(s.pal.hot, (0.34 + 0.55 * el) * k);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        ctx.stroke();
        break;
      }
      case 'handover': {
        const c = arcControl(pa, pb, 0.46, s, pc);
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = s.motion ? -s.t * 14 : 0;
        ctx.lineWidth = 1.5 + el * 0.8;
        ctx.strokeStyle = rgba(s.pal.warn, (0.72 + 0.28 * el) * k);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // The arrowhead, along the end of the curve.
        const dx = b.x - c.x;
        const dy = b.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const tipX = b.x - ux * 14;
        const tipY = b.y - uy * 14;
        ctx.fillStyle = rgba(s.pal.warn, (0.85 + 0.15 * el) * k);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * 8 - uy * 4.5, tipY - uy * 8 + ux * 4.5);
        ctx.lineTo(tipX - ux * 8 + uy * 4.5, tipY - uy * 8 - ux * 4.5);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
  }
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// The light of a block
// ---------------------------------------------------------------------------

function drawLegs(ctx: CanvasRenderingContext2D, s: Scene): void {
  if (s.legs.length === 0) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const leg of s.legs) {
    const a = s.proj[leg.from];
    const b = s.proj[leg.to];
    if (!a || !b) continue;
    const u = (s.now - leg.t0) / leg.dur;
    if (u < 0 || u > 1) continue;
    const e = u * u * (3 - 2 * u);
    const x = a.x + (b.x - a.x) * e;
    const y = a.y + (b.y - a.y) * e;
    const back = Math.max(0, e - 0.28);
    const tx = a.x + (b.x - a.x) * back;
    const ty = a.y + (b.y - a.y) * back;
    const fade = Math.min(1, (1 - u) * 3) * leg.strength;
    const grad = ctx.createLinearGradient(tx, ty, x, y);
    grad.addColorStop(0, rgba(s.pal.hot, 0));
    grad.addColorStop(1, rgba(s.pal.hot, 0.9 * fade));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    glow(ctx, s, s.pal.hot, x, y, 15 + 6 * leg.strength, 0.95 * fade);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------
// The Flux mark
// ---------------------------------------------------------------------------

let markPaths: Array<{ path: Path2D; tx: number; ty: number }> | null = null;

function getMark(): Array<{ path: Path2D; tx: number; ty: number }> {
  if (!markPaths) markPaths = RAW_SHARDS.map((sh) => ({ path: new Path2D(sh.d), tx: sh.tx, ty: sh.ty }));
  return markPaths;
}

function paintMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  height: number,
  fill: string,
): void {
  const k = height / MARK_VIEWBOX.h;
  ctx.save();
  ctx.translate(cx - (MARK_VIEWBOX.w * k) / 2, cy - (MARK_VIEWBOX.h * k) / 2);
  ctx.scale(k, k);
  ctx.fillStyle = fill;
  for (const m of getMark()) {
    ctx.save();
    ctx.translate(m.tx, m.ty);
    ctx.fill(m.path);
    ctx.restore();
  }
  ctx.restore();
}

function drawCenter(ctx: CanvasRenderingContext2D, s: Scene, i: number): void {
  const p = s.proj[i];
  if (!p) return;
  const lit = at(s.lit, i);
  const flash = at(s.flash, i);
  const breathe = s.motion ? 0.88 + 0.12 * Math.sin(s.t * 1.3) : 1;
  const h = (30 + 0.1 * s.scale) * p.scale * (1 + 0.05 * lit + 0.08 * flash);

  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s, s.pal.deep, p.x, p.y, h * 2.6, (0.55 + 0.3 * lit + 0.5 * flash) * breathe);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Three hexagonal rings turning about the mark, drawn on the world's own plane.
  const rings = [0.21, 0.31, 0.43];
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k] ?? 0.2;
    const rot = s.motion ? s.t * (0.22 + k * 0.1) * (k % 2 ? -1 : 1) : k * 0.3;
    ctx.beginPath();
    for (let j = 0; j <= 6; j++) {
      const a = rot + (j * TAU) / 6;
      v3.x = Math.cos(a) * r;
      v3.y = 0;
      v3.z = Math.sin(a) * r;
      const q = project(v3, s.cam, s.vp, tmp);
      if (j === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.setLineDash(k === 1 ? [3, 5] : []);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(s.pal.accentStrong, (0.5 - k * 0.12) * (0.7 + 0.3 * lit));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // The symbol, extruded a little toward the side the light is not on, so it reads as an object.
  const sy = Math.sin(s.cam.yaw);
  const ox = sy * 2.4;
  const oy = 1.8;
  const layers = s.low ? 2 : 4;
  for (let l = layers; l >= 1; l--) {
    paintMark(
      ctx,
      p.x + (ox * l) / 1,
      p.y + (oy * l) / 1,
      h,
      rgba(s.pal.fluxBlue, 0.95 - (l / (layers + 1)) * 0.65),
    );
  }
  paintMark(ctx, p.x, p.y, h, 'rgba(255,255,255,1)');
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

type Part = { path: Path2D; fill: boolean };
const glyphCache = new Map<string, Part[]>();
const HEX_OUTLINE = hexPath(12, 12, 9.5);

function glyphParts(name: GlyphName): Part[] {
  const hit = glyphCache.get(name);
  if (hit) return hit;
  const parts: Part[] = [];
  for (const shape of GLYPHS[name] as ReadonlyArray<
    string | { dot: [number, number, number] } | { fill: string }
  >) {
    if (typeof shape === 'string') {
      if (shape === HEX_OUTLINE) continue;
      parts.push({ path: new Path2D(shape), fill: false });
    } else if ('dot' in shape) {
      const p = new Path2D();
      p.arc(shape.dot[0], shape.dot[1], shape.dot[2], 0, TAU);
      parts.push({ path: p, fill: true });
    } else {
      parts.push({ path: new Path2D(shape.fill), fill: true });
    }
  }
  glyphCache.set(name, parts);
  return parts;
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  name: GlyphName,
  x: number,
  y: number,
  size: number,
  colour: string,
): void {
  const k = size / 24;
  ctx.save();
  ctx.translate(x - 12 * k, y - 12 * k);
  ctx.scale(k, k);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  for (const part of glyphParts(name)) {
    if (part.fill) ctx.fill(part.path);
    else ctx.stroke(part.path);
  }
  ctx.restore();
}

/** The shape inside an app node. `u` is a tenth of the node's radius, so marks scale with it. */
function drawMark(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  look: NodeLook,
  x: number,
  y: number,
  r: number,
  c: RGB,
  a: number,
): void {
  const u = r / 9.5;
  ctx.lineWidth = Math.max(1.3, r * 0.15);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(c, a);
  ctx.fillStyle = rgba(c, a);
  switch (look.mark) {
    case 'live': {
      hex(ctx, x, y, r * 0.5);
      ctx.fill();
      break;
    }
    case 'clock': {
      ctx.beginPath();
      ctx.moveTo(x, y - 4.4 * u);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 3.2 * u, y + 2 * u);
      ctx.stroke();
      break;
    }
    case 'alert': {
      ctx.beginPath();
      ctx.moveTo(x, y - 4.6 * u);
      ctx.lineTo(x, y + 1 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + 4.2 * u, Math.max(1, 1.1 * u), 0, TAU);
      ctx.fill();
      break;
    }
    case 'cross': {
      ctx.beginPath();
      ctx.moveTo(x - 3 * u, y - 3 * u);
      ctx.lineTo(x + 3 * u, y + 3 * u);
      ctx.moveTo(x + 3 * u, y - 3 * u);
      ctx.lineTo(x - 3 * u, y + 3 * u);
      ctx.stroke();
      break;
    }
    case 'dots': {
      for (let k = 0; k < 3; k++) {
        const phase = s.motion ? 0.35 + 0.65 * Math.max(0, Math.sin(s.t * 3.2 - k * 0.9)) : 0.7;
        ctx.fillStyle = rgba(c, a * phase);
        ctx.beginPath();
        ctx.arc(x + (k - 1) * 3.4 * u, y, Math.max(1, 1.05 * u), 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'reticle': {
      ctx.beginPath();
      ctx.arc(x, y, 3.4 * u, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, 1.1 * u), 0, TAU);
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.moveTo(x - 3.2 * u, y);
      ctx.lineTo(x + 3.2 * u, y);
      ctx.stroke();
    }
  }
}

function spark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.28, y - r * 0.28);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.28, y + r * 0.28);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.28, y + r * 0.28);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.28, y - r * 0.28);
  ctx.closePath();
}

function drawApp(ctx: CanvasRenderingContext2D, s: Scene, i: number): void {
  const p = s.proj[i];
  const look = s.looks[i];
  if (!p || !look) return;
  const lit = at(s.lit, i);
  const flash = at(s.flash, i);
  const retired = look.lifecycle === 'retired';
  const a = at(s.presence, i) * (0.5 + 0.5 * nearOf(p.depth)) * (retired ? 0.55 : 1);
  if (a < 0.02) return;
  const r = nodeRadius(s.scale, look.size) * p.scale * (1 + 0.18 * lit + 0.14 * flash);
  const c = toneColour(s.pal, look.tone);
  const x = p.x;
  const y = p.y;

  if (!s.low || lit > 0.05 || flash > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, s, c, x, y, r * 3.5, a * (0.26 + 0.6 * lit + 0.65 * flash));
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.globalAlpha = a > 1 ? 1 : a;
  hex(ctx, x, y, r);
  ctx.fillStyle = rgba(s.pal.ink, 0.94);
  ctx.fill();
  const tint = Math.min(0.28, 0.1 + 0.2 * lit);
  ctx.fillStyle = rgba(c, tint);
  ctx.fill();
  ctx.lineWidth = 1.5 + lit * 0.6;
  ctx.lineJoin = 'miter';
  if (look.mark === 'dash') ctx.setLineDash([3.2, 2.6]);
  ctx.strokeStyle = rgba(c, 0.95);
  ctx.stroke();
  ctx.setLineDash([]);

  drawMark(ctx, s, look, x, y, r, c, 1);

  if (look.lifecycle === 'retiring') {
    ctx.save();
    ctx.setLineDash([3, 3.4]);
    ctx.lineDashOffset = s.motion ? -s.t * 8 : 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(s.pal.warn, 0.9);
    hex(ctx, x, y, r * 1.5);
    ctx.stroke();
    ctx.restore();
  } else if (look.lifecycle === 'new') {
    ctx.fillStyle = rgba(s.pal.text1, 0.95);
    spark(ctx, x + r * 0.95, y - r * 1.0, Math.max(3.4, r * 0.46));
    ctx.fill();
  }

  if (lit > 0.5 || i === s.selected) {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(i === s.selected ? s.pal.text1 : s.pal.accentStrong, 0.55 + 0.4 * lit);
    if (i === s.selected) {
      ctx.setLineDash([4, 3.4]);
      ctx.lineDashOffset = s.motion ? s.t * 10 : 0;
    }
    hex(ctx, x, y, r * 1.78);
    ctx.stroke();
    ctx.restore();
  }

  if (s.ping && s.ping.index === i && s.motion) {
    const age = s.ping.age;
    for (let k = 0; k < 2; k++) {
      const u = age * 0.8 - k * 0.22;
      if (u <= 0 || u >= 1) continue;
      ctx.globalAlpha = (1 - u) * 0.8;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = rgba(s.pal.hot, 1);
      hex(ctx, x, y, r * (1.8 + 4.2 * u));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawHub(ctx: CanvasRenderingContext2D, s: Scene, i: number): void {
  const p = s.proj[i];
  const node = s.graph.nodes[i];
  if (!p || !node) return;
  const lit = at(s.lit, i);
  const flash = at(s.flash, i);
  const selected = node.category !== null && node.category === s.category;
  const a = at(s.presence, i) * (0.6 + 0.4 * nearOf(p.depth));
  if (a < 0.02) return;
  const r = nodeRadius(s.scale, 1.55) * p.scale * (1 + 0.1 * lit + 0.14 * flash);
  const x = p.x;
  const y = p.y;

  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s, s.pal.deep, x, y, r * 3.4, a * (0.34 + 0.45 * lit + 0.7 * flash + (selected ? 0.3 : 0)));
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = a > 1 ? 1 : a;
  // The drop line to the floor, so the ring reads as hovering over it.
  v3.x = s.pos[i]?.x ?? 0;
  v3.y = FLOOR_Y;
  v3.z = s.pos[i]?.z ?? 0;
  const f = project(v3, s.cam, s.vp, tmp);
  ctx.save();
  ctx.setLineDash([1.5, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(s.pal.accentStrong, 0.28);
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.lineTo(f.x, f.y);
  ctx.stroke();
  ctx.restore();
  // A pad on the floor under the hub: two hexagons of the family shape, in perspective.
  const px = s.pos[i]?.x ?? 0;
  const pz = s.pos[i]?.z ?? 0;
  for (let ring = 0; ring < 2; ring++) {
    const pr = ring === 0 ? 0.17 : 0.09;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      v3.x = px + pr * s.stretch * (COS6[k] ?? 0);
      v3.y = FLOOR_Y;
      v3.z = pz + pr * (SIN6[k] ?? 0);
      const q = project(v3, s.cam, s.vp, tmp);
      if (k === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    if (ring === 0) {
      ctx.fillStyle = rgba(s.pal.accent, 0.14 + 0.2 * lit);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(s.pal.accentStrong, (ring === 0 ? 0.4 : 0.3) + 0.3 * lit);
    ctx.stroke();
  }

  hex(ctx, x, y, r);
  ctx.fillStyle = rgba(s.pal.ink1, 0.96);
  ctx.fill();
  ctx.fillStyle = rgba(s.pal.deep, selected ? 0.62 : 0.28 + 0.2 * lit);
  ctx.fill();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = selected ? 2.2 : 1.6 + lit * 0.6;
  ctx.strokeStyle = rgba(
    selected ? s.pal.text1 : s.pal.accentStrong,
    0.7 + 0.3 * Math.max(lit, selected ? 1 : 0),
  );
  ctx.stroke();

  if (node.category) {
    drawGlyph(
      ctx,
      CATEGORY_GLYPH[node.category],
      x,
      y,
      r * 1.28,
      rgba(selected ? s.pal.text1 : s.pal.accentStrong, 0.96),
    );
  }

  if (selected) {
    ctx.save();
    ctx.setLineDash([3.6, 3.4]);
    ctx.lineDashOffset = s.motion ? s.t * 9 : 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(s.pal.hot, 0.8);
    hex(ctx, x, y, r * 1.5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const widthCache = new Map<string, number>();

function textWidth(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  const key = `${font}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    widthCache.set(key, w);
    if (widthCache.size > 400) widthCache.clear();
  }
  return w;
}

/** Hub labels read in capitals with the count of what is shown. */
function hubCaption(s: Scene, i: number): { text: string; count: string } {
  const node = s.graph.nodes[i];
  let n = 0;
  for (const j of s.graph.neighbours[i] ?? []) {
    if (s.graph.nodes[j]?.kind === 'app' && s.visible[j]) n += 1;
  }
  return { text: (node?.label ?? '').toUpperCase(), count: String(n) };
}

function drawLabels(ctx: CanvasRenderingContext2D, s: Scene): LabelPlacement[] {
  const px = Math.round(Math.min(13, Math.max(11, 9.6 + s.scale * 0.012)) * 2) / 2;
  const fontApp = `500 ${px}px ${s.pal.mono}`;
  const fontAppBold = `600 ${px + 1}px ${s.pal.mono}`;
  const fontHub = `600 ${px - 0.5}px ${s.pal.mono}`;
  const requests: LabelRequest[] = [];
  const text = new Map<number, { text: string; count: string; font: string }>();

  for (const i of s.order) {
    const node = s.graph.nodes[i];
    const p = s.proj[i];
    if (!node || !p || node.kind === 'center') continue;
    const look = s.looks[i];
    const lit = at(s.lit, i);
    const pres = at(s.presence, i);
    const focus = i === s.hover || i === s.selected || (s.ping?.index === i && s.ping.age < 2.4);
    if (!focus && pres < 0.5) continue;
    const near = nearOf(p.depth);

    if (node.kind === 'hub') {
      const cap = hubCaption(s, i);
      const w = textWidth(ctx, fontHub, cap.text) + 8 + textWidth(ctx, fontHub, cap.count);
      const r = nodeRadius(s.scale, 1.55) * p.scale * 1.2;
      text.set(i, { ...cap, font: fontHub });
      requests.push({
        index: i,
        x: p.x,
        y: p.y,
        r,
        w: w + cap.text.length * 1.3,
        h: 13,
        priority: 90 + near * 6,
        force: focus,
      });
    } else {
      const font = focus ? fontAppBold : fontApp;
      const w = textWidth(ctx, font, node.label);
      const r = nodeRadius(s.scale, look?.size ?? 1) * p.scale * 1.2;
      text.set(i, { text: node.label, count: '', font });
      requests.push({
        index: i,
        x: p.x,
        y: p.y,
        r,
        w,
        h: 13,
        priority: 30 + near * 20 + (look?.size === 1 ? 6 : 0) + lit * 30 + (focus ? 100 : 0),
        force: focus,
      });
    }
  }

  // Labels keep off the bodies of nodes (their own is cleared by the label's offset).
  const blocked: LabelRect[] = [];
  for (const i of s.order) {
    const node = s.graph.nodes[i];
    const p = s.proj[i];
    if (!node || !p || at(s.presence, i) < 0.25) continue;
    let rx: number;
    let ry: number;
    if (node.kind === 'center') {
      const h = (30 + 0.1 * s.scale) * p.scale;
      rx = h * 0.5;
      ry = h * 0.56;
    } else {
      const size = node.kind === 'hub' ? 1.55 : (s.looks[i]?.size ?? 1);
      rx = ry = nodeRadius(s.scale, size) * p.scale * 1.15;
    }
    blocked.push({ x0: p.x - rx - 2, y0: p.y - ry - 2, x1: p.x + rx + 2, y1: p.y + ry + 2 });
  }
  const placed = layoutLabels(requests, s.width, s.height, blocked);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const pl of placed) {
    const t = text.get(pl.index);
    const node = s.graph.nodes[pl.index];
    const p = s.proj[pl.index];
    if (!t || !node || !p) continue;
    const lit = at(s.lit, pl.index);
    const focus = pl.index === s.hover || pl.index === s.selected;
    const hub = node.kind === 'hub';
    const a = Math.min(1, at(s.presence, pl.index) * (0.62 + 0.38 * nearOf(p.depth)) + lit * 0.4);

    ctx.font = t.font;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = hub ? '0.12em' : '0.01em';
    ctx.textAlign = pl.side === 'right' ? 'left' : pl.side === 'left' ? 'right' : 'center';

    const body = hub ? s.pal.accentStrong : focus ? s.pal.text1 : s.pal.text2;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = rgba(s.pal.ink, 0.88 * a);
    ctx.strokeText(t.text, pl.x, pl.y);
    ctx.fillStyle = rgba(body, a);
    ctx.fillText(t.text, pl.x, pl.y);

    if (hub && t.count) {
      const w = ctx.measureText(t.text).width;
      const gap = 7;
      const cx = pl.side === 'right' ? pl.x + w + gap : pl.side === 'left' ? pl.x + gap : pl.x + w / 2 + gap;
      ctx.textAlign = 'left';
      ctx.strokeText(t.count, cx, pl.y);
      ctx.fillStyle = rgba(s.pal.text3, a);
      ctx.fillText(t.count, cx, pl.y);
    }
  }
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  return placed;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

/** Draws one frame; returns where each label went, so a floating card can keep clear of the focused one. */
export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): LabelPlacement[] {
  ctx.clearRect(0, 0, s.width, s.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawFloor(ctx, s);
  drawEdges(ctx, s);
  drawLegs(ctx, s);
  for (const i of s.order) {
    const node = s.graph.nodes[i];
    if (!node) continue;
    if (node.kind === 'center') drawCenter(ctx, s, i);
    else if (node.kind === 'hub') drawHub(ctx, s, i);
    else drawApp(ctx, s, i);
  }
  return drawLabels(ctx, s);
}
