/**
 * Canvas drawing for the explainer. Everything is a function of (layout, scene): no state, no DOM,
 * no allocation in the per-frame path beyond a few gradient objects. Colours and fonts are read
 * from the design tokens once (and again when the accent changes), never hard-coded.
 */
import { clamp, clamp01 } from '@/lib/math';
import { cardMetrics, type Layout, lerpRect, type Rect } from './layout';
import { cellFresh, cellLight, consideredLight, linePosition, lineVisibility } from './scan';
import { EXAMPLE_ADDRESS, type InstanceStatus, type Scene, SPEC_FIELDS, typedChars } from './scene';
import {
  arcPoints,
  EXAMPLE_NODES,
  EXAMPLE_VISITOR,
  landDots,
  MAP_COLS,
  MAP_ROWS,
  nearestCell,
} from './worldmap';

const TAU = Math.PI * 2;

export type RGB = readonly [number, number, number];

export interface Palette {
  accent: RGB;
  hot: RGB;
  solid: RGB;
  text1: RGB;
  text2: RGB;
  text3: RGB;
  ink: RGB;
  ok: RGB;
  warn: RGB;
  crit: RGB;
  mono: string;
  display: string;
}

const rgba = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function parseTriple(raw: string, fb: RGB): RGB {
  const m = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return m.length >= 3 && m.every((n) => Number.isFinite(n)) ? [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0] : fb;
}

function parseHex(raw: string, fb: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(raw.trim());
  if (!m?.[1]) return fb;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Reads the palette and fonts from the tokens in force on `el`. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name);
  return {
    accent: parseTriple(v('--accent-rgb'), [79, 122, 212]),
    hot: parseTriple(v('--accent-hot-rgb'), [174, 198, 255]),
    solid: parseHex(v('--accent-solid'), [43, 97, 209]),
    text1: parseHex(v('--text-1'), [255, 255, 255]),
    text2: parseHex(v('--text-2'), [213, 215, 219]),
    text3: parseHex(v('--text-3'), [161, 165, 171]),
    ink: parseHex(v('--ink-0'), [8, 10, 15]),
    ok: parseHex(v('--status-ok'), [63, 220, 149]),
    warn: parseHex(v('--status-warn'), [255, 154, 61]),
    crit: parseHex(v('--status-crit'), [255, 84, 112]),
    mono: v('--font-mono').trim() || 'monospace',
    display: v('--font-display').trim() || 'sans-serif',
  };
}

// ---------------------------------------------------------------------------
// Cache: everything that depends on the layout, not on time
// ---------------------------------------------------------------------------

interface Fonts {
  mono: string;
  monoSm: string;
  monoXs: string;
  display: string;
  displayBig: string;
  charW: number;
  charWSm: number;
  charWXs: number;
}

/** A map cell the network "considers" during the scan. Fixed for a layout: nothing about it is random in time. */
interface Candidate {
  x: number;
  y: number;
  /** Where on the map the scan line meets it, in map widths from the left edge. */
  at: number;
  /** The example node this cell becomes when it is picked, or -1 for a cell that is only considered. */
  node: number;
}

export interface SceneCache {
  layout: Layout;
  pal: Palette;
  fonts: Fonts;
  /** Land and sea dots, pre-rendered at the device pixel ratio. */
  dots: HTMLCanvasElement | null;
  nodePx: { x: number; y: number }[];
  /** Radius of a lit node cell, px. */
  nodeR: number;
  /** Where each node's name plate sits, chosen so no two plates (or a plate and a card) touch. */
  labels: Rect[];
  visitorPx: { x: number; y: number };
  deploy: Float32Array[];
  pathA: Float32Array;
  pathB: Float32Array;
  candidates: Candidate[];
  /** The scan line and its soft trail, pre-rendered: `beamW` px wide, the map's height, line at its right edge. */
  beam: HTMLCanvasElement | null;
  beamW: number;
}

const ARC_POINTS = 48;

function makeFonts(ctx: CanvasRenderingContext2D, layout: Layout, pal: Palette): Fonts {
  const fs = layout.fs;
  const mono = `500 ${fs}px ${pal.mono}`;
  const monoSm = `500 ${(fs * 0.84).toFixed(2)}px ${pal.mono}`;
  const monoXs = `500 ${(fs * 0.7).toFixed(2)}px ${pal.mono}`;
  const display = `600 ${(fs * 1.04).toFixed(2)}px ${pal.display}`;
  const displayBig = `300 ${(fs * 2.4).toFixed(2)}px ${pal.display}`;
  ctx.save();
  ctx.font = mono;
  const charW = ctx.measureText('0').width;
  ctx.font = monoSm;
  const charWSm = ctx.measureText('0').width;
  ctx.font = monoXs;
  const charWXs = ctx.measureText('0').width;
  ctx.restore();
  return { mono, monoSm, monoXs, display, displayBig, charW, charWSm, charWXs };
}

function gridToPx(layout: Layout, gx: number, gy: number): { x: number; y: number } {
  return { x: layout.map.x + gx * layout.pitch, y: layout.map.y + gy * layout.pitchY };
}

function overlaps(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x < b.x + b.w + margin &&
    b.x < a.x + a.w + margin &&
    a.y < b.y + b.h + margin &&
    b.y < a.y + a.h + margin
  );
}

/**
 * Name plates for the four example nodes. Each tries the side it was given, then the other side,
 * then below and above; the first that stays on the canvas and clear of the cards, the address
 * pill, the other nodes and the plates already placed wins.
 */
function placeLabels(
  layout: Layout,
  fonts: Fonts,
  nodes: readonly { x: number; y: number }[],
  R: number,
  visitor: { x: number; y: number },
): Rect[] {
  const h = layout.fs * 2.35;
  const gap = 6;
  const edge = 4;
  const inside = (r: Rect) =>
    r.x >= edge && r.y >= edge && r.x + r.w <= layout.w - edge && r.y + r.h <= layout.h - edge;
  const obstacles: Rect[] = [layout.cardDocked, layout.address];
  for (const n of nodes) obstacles.push({ x: n.x - R, y: n.y - R, w: R * 2, h: R * 2 });
  // The visitor's dot and its word.
  obstacles.push({
    x: visitor.x - 8,
    y: visitor.y - 9,
    w: 8 + 14 + 7 * (fonts.charWXs + 1.1) + 6,
    h: 18,
  });
  const out: Rect[] = [];
  EXAMPLE_NODES.forEach((meta, i) => {
    const at = nodes[i];
    if (!at) return;
    const w = Math.max(meta.city.length * fonts.charWSm, meta.region.length * (fonts.charWXs + 1.1)) + 10;
    const dir = meta.label === 'right' ? 1 : -1;
    const beside = (d: number): Rect => ({
      x: d > 0 ? at.x + R + gap : at.x - R - gap - w,
      y: at.y - h / 2,
      w,
      h,
    });
    const candidates: Rect[] = [
      beside(dir),
      beside(-dir),
      { x: at.x - w / 2, y: at.y + R + gap, w, h },
      { x: at.x - w / 2, y: at.y - R - gap - h, w, h },
    ];
    const free = candidates.find((c) => inside(c) && !obstacles.some((o) => overlaps(c, o, 2)));
    const first = candidates[0] as Rect;
    const chosen = free ?? {
      ...first,
      x: Math.min(Math.max(first.x, edge), layout.w - edge - w),
      y: Math.min(Math.max(first.y, edge), layout.h - edge - h),
    };
    out.push(chosen);
    obstacles.push(chosen);
  });
  return out;
}

/** Builds the per-layout geometry and the static dot layer. Call on resize and palette changes. */
export function buildCache(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pal: Palette,
  dpr: number,
  quality: number,
): SceneCache {
  const fonts = makeFonts(ctx, layout, pal);

  const nodePx = EXAMPLE_NODES.map((n) => {
    const c = nearestCell(n.lon, n.lat);
    return gridToPx(layout, c.x, c.y);
  });
  const nodeR = Math.max(5.5, Math.min(11, layout.pitch * 1.15));
  const vc = nearestCell(EXAMPLE_VISITOR.lon, EXAMPLE_VISITOR.lat);
  const visitorPx = gridToPx(layout, vc.x, vc.y);
  const labels = placeLabels(layout, fonts, nodePx, nodeR, visitorPx);

  const deploy = nodePx.map((p) => {
    const out = new Float32Array(ARC_POINTS * 2);
    arcPoints(layout.anchor.x, layout.anchor.y, p.x, p.y, layout.mode === 'wide' ? 0.22 : 0.18, out);
    return out;
  });
  const pathA = new Float32Array(ARC_POINTS * 2);
  const pathB = new Float32Array(ARC_POINTS * 2);
  const iad = nodePx[1] as { x: number; y: number };
  const fra = nodePx[0] as { x: number; y: number };
  arcPoints(visitorPx.x, visitorPx.y, iad.x, iad.y, 0.2, pathA);
  arcPoints(visitorPx.x, visitorPx.y, fra.x, fra.y, 0.2, pathB);

  const candidates = scatterCandidates(layout, nodePx.slice(0, 3));
  const beam = renderBeam(layout, pal, dpr);

  const cache: SceneCache = {
    layout,
    pal,
    fonts,
    dots: null,
    nodePx,
    nodeR,
    labels,
    visitorPx,
    deploy,
    pathA,
    pathB,
    candidates,
    beam: beam?.canvas ?? null,
    beamW: beam?.w ?? 0,
  };
  cache.dots = renderDots(layout, pal, dpr, quality);
  return cache;
}

/** How many cells other than the three winners the scan lights. */
const CONSIDERED = 26;

/**
 * The cells the scan lights: first the three that will be picked (so a cell that wins is the same
 * cell that lit, not one that appears from nowhere), then a deterministic spread of other land
 * cells. The spread uses best-candidate sampling, which keeps them evenly apart across the
 * continents without a grid showing. Same layout in, same cells out, every time.
 */
function scatterCandidates(layout: Layout, winners: readonly { x: number; y: number }[]): Candidate[] {
  const m = layout.map;
  const at = (x: number) => (x - m.x) / m.w;
  const out: Candidate[] = winners.map((p, i) => ({ x: p.x, y: p.y, at: at(p.x), node: i }));
  const land = landDots();
  const apart = layout.pitch * 5;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let n = 0; n < CONSIDERED; n++) {
    let best: { x: number; y: number } | null = null;
    let bestGap = 0;
    for (let k = 0; k < 14; k++) {
      const i = Math.floor(rnd() * land.count);
      const p = gridToPx(layout, land.xy[i * 2] as number, land.xy[i * 2 + 1] as number);
      let gap = Number.POSITIVE_INFINITY;
      for (const c of out) gap = Math.min(gap, Math.hypot(c.x - p.x, c.y - p.y));
      if (gap > bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    if (best && bestGap >= apart) out.push({ x: best.x, y: best.y, at: at(best.x), node: -1 });
  }
  return out;
}

/** The scan line and the soft trail behind it, as one sprite. The line is the right-hand edge. */
function renderBeam(
  layout: Layout,
  pal: Palette,
  dpr: number,
): { canvas: HTMLCanvasElement; w: number } | null {
  if (typeof document === 'undefined') return null;
  const w = Math.max(48, Math.round(layout.map.w * 0.16));
  const h = Math.max(1, Math.round(layout.map.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(dpr, dpr);
  // The trail: nothing at the back, a soft light toward the line.
  const trail = g.createLinearGradient(0, 0, w, 0);
  trail.addColorStop(0, rgba(pal.hot, 0));
  trail.addColorStop(0.55, rgba(pal.hot, 0.06));
  trail.addColorStop(1, rgba(pal.hot, 0.24));
  g.fillStyle = trail;
  g.fillRect(0, 0, w, h);
  // The line.
  g.fillStyle = rgba(pal.text1, 0.92);
  g.fillRect(w - 1.5, 0, 1.5, h);
  // Fade the ends so it is a beam across the map, not a bar the height of its box.
  g.globalCompositeOperation = 'destination-in';
  const ends = g.createLinearGradient(0, 0, 0, h);
  ends.addColorStop(0, 'rgba(0,0,0,0)');
  ends.addColorStop(0.14, 'rgba(0,0,0,1)');
  ends.addColorStop(0.86, 'rgba(0,0,0,1)');
  ends.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ends;
  g.fillRect(0, 0, w, h);
  return { canvas: c, w };
}

/** The static dot map: faint sea lattice, brighter land. Drawn once per layout. */
function renderDots(layout: Layout, pal: Palette, dpr: number, quality: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(layout.map.w * dpr));
  c.height = Math.max(1, Math.ceil(layout.map.h * dpr));
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(dpr, dpr);
  const p = layout.pitch;
  const py = layout.pitchY;
  const rSea = Math.max(0.5, p * 0.11);
  const rLand = Math.max(0.9, p * 0.2);

  if (quality !== 1) {
    g.fillStyle = rgba(pal.accent, 0.1);
    g.beginPath();
    for (let row = 0; row < MAP_ROWS; row++) {
      const shift = row % 2 ? 0.5 : 0;
      for (let col = 0; col < MAP_COLS; col++) {
        const x = (col + 0.5 + shift) * p;
        const y = (row + 0.5) * py;
        g.moveTo(x + rSea, y);
        g.arc(x, y, rSea, 0, TAU);
      }
    }
    g.fill();
  }

  const land = landDots();
  g.fillStyle = rgba(pal.accent, 0.62);
  g.beginPath();
  for (let i = 0; i < land.count; i++) {
    const x = (land.xy[i * 2] as number) * p;
    const y = (land.xy[i * 2 + 1] as number) * py;
    g.moveTo(x + rLand, y);
    g.arc(x, y, rLand, 0, TAU);
  }
  g.fill();
  return c;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function chamfer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
  cm: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y + cm);
  ctx.lineTo(x + cm, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - cm);
  ctx.lineTo(x + w - cm, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.closePath();
}

function hex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
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

/** The material of the explainer's cards: dark glass, a hairline edge, a hot corner, crosshairs. */
function cardSurface(dc: DrawContext, r: Rect, alpha: number): void {
  const { ctx, pal, cache } = dc;
  if (alpha <= 0.002) return;
  const c = Math.min(22, r.h * 0.12);
  const cm = 4;
  ctx.save();
  ctx.globalAlpha = alpha;
  chamfer(ctx, r.x, r.y, r.w, r.h, c, cm);
  ctx.fillStyle = rgba(pal.ink, 0.84);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(pal.accent, 0.5);
  ctx.stroke();
  // The hot corner (top right) and its answer (bottom left).
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(pal.text1, 0.85);
  ctx.beginPath();
  ctx.moveTo(r.x + r.w - c - 46, r.y);
  ctx.lineTo(r.x + r.w - c, r.y);
  ctx.lineTo(r.x + r.w, r.y + c);
  ctx.lineTo(r.x + r.w, r.y + c + 22);
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.hot, 0.55);
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + r.h - c - 20);
  ctx.lineTo(r.x, r.y + r.h - c);
  ctx.lineTo(r.x + c, r.y + r.h);
  ctx.lineTo(r.x + c + 40, r.y + r.h);
  ctx.stroke();
  // Corner crosshairs.
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(pal.text1, 0.22);
  const m = 9;
  const t = 3.5;
  ctx.beginPath();
  for (const [x, y] of [
    [r.x + m, r.y + m],
    [r.x + r.w - m, r.y + r.h - m],
  ] as const) {
    ctx.moveTo(x - t, y);
    ctx.lineTo(x + t, y);
    ctx.moveTo(x, y - t);
    ctx.lineTo(x, y + t);
  }
  ctx.stroke();
  ctx.restore();
  void cache;
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function setSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (c.letterSpacing !== undefined) c.letterSpacing = value;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  cache: SceneCache;
  pal: Palette;
  layout: Layout;
  quality: number;
}

const tmpRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** What to draw. A triptych tile draws one slice of the scene at a time. */
export interface Parts {
  specCard: boolean;
  statusCard: boolean;
  map: boolean;
  traffic: boolean;
  address: boolean;
}

export const ALL_PARTS: Parts = { specCard: true, statusCard: true, map: true, traffic: true, address: true };

export function drawFrame(dc: DrawContext, scene: Scene, parts: Parts = ALL_PARTS): void {
  const { ctx, layout } = dc;
  ctx.clearRect(0, 0, layout.w, layout.h);
  if (scene.fade <= 0.003) return;
  ctx.save();
  ctx.globalAlpha = scene.fade;

  if (parts.map && scene.mapReveal > 0.001) drawMap(dc, scene);
  if (parts.map) drawDeployLines(dc, scene);
  if (parts.map) drawNodes(dc, scene);
  if (parts.traffic) drawTraffic(dc, scene);

  // The card: centred on its own at first, then docked. The spec gives way to the status.
  const rect = lerpRect(layout.cardCentre, layout.cardDocked, scene.cardPos, tmpRect);
  if (parts.specCard) drawSpecCard(dc, scene, rect, scene.cardIn * (1 - scene.specOut));
  if (parts.statusCard) drawStatusCard(dc, scene, layout.cardDocked, scene.specOut);
  if (parts.address) drawAddress(dc, scene);
  ctx.restore();
}

// ---- map ------------------------------------------------------------------------------------

function drawMap(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, layout, pal } = dc;
  const m = layout.map;
  const reveal = scene.mapReveal;

  // Everything on the map sits inside the wipe that opens it from the side the card is on, so
  // nothing of the scan shows where the map has not arrived yet.
  ctx.save();
  const cx = layout.mode === 'wide' ? m.x : m.x + m.w / 2;
  const cy = layout.mode === 'wide' ? m.y + m.h / 2 : m.y + m.h;
  const R = (Math.hypot(m.w, m.h) + 20) * reveal;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();
  if (cache.dots) ctx.drawImage(cache.dots, m.x, m.y, m.w, m.h);
  drawScan(dc, scene);
  ctx.restore();

  // Corner crosshairs and the honest label.
  ctx.save();
  ctx.globalAlpha *= reveal;
  ctx.strokeStyle = rgba(pal.text1, 0.22);
  ctx.lineWidth = 1;
  const t = 4;
  ctx.beginPath();
  for (const [x, y] of [
    [m.x - 2, m.y - 2],
    [m.x + m.w + 2, m.y - 2],
    [m.x - 2, m.y + m.h + 2],
    [m.x + m.w + 2, m.y + m.h + 2],
  ] as const) {
    ctx.moveTo(x - t, y);
    ctx.lineTo(x + t, y);
    ctx.moveTo(x, y - t);
    ctx.lineTo(x, y + t);
  }
  ctx.stroke();
  setSpacing(ctx, '1.2px');
  text(ctx, 'EXAMPLE PLACEMENT', m.x, m.y + m.h + layout.fs * 1.1, cache.fonts.monoXs, rgba(pal.text3, 0.85));
  setSpacing(ctx, '0px');
  ctx.restore();
}

// ---- the scan --------------------------------------------------------------------------------

/**
 * The network looking across many nodes: a line sweeps over the map from the card's side and every
 * candidate cell lights, steadily, as the line crosses it. The cells that were only considered then
 * dim away and the ones that win hold their light until their copy lands. Drawn inside the map's
 * wipe, under the deploy lines and the nodes.
 */
function drawScan(dc: DrawContext, scene: Scene): void {
  if (scene.scan <= 0) return;
  drawScanLine(dc, scene);
  drawCandidates(dc, scene);
}

function drawScanLine(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, layout } = dc;
  if (!cache.beam || scene.scan >= 1) return;
  const vis = lineVisibility(scene.scan);
  if (vis <= 0.004) return;
  const m = layout.map;
  const x = m.x + linePosition(scene.scan) * m.w;
  ctx.save();
  // The line enters and leaves at the map's own edges, never over the card.
  ctx.beginPath();
  ctx.rect(m.x, m.y, m.w, m.h);
  ctx.clip();
  ctx.globalAlpha *= vis;
  ctx.drawImage(cache.beam, x - cache.beamW, m.y, cache.beamW, m.h);
  ctx.restore();
}

function drawCandidates(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, layout, pal } = dc;
  const p = layout.pitch;
  ctx.save();
  ctx.lineWidth = 1;
  for (const c of cache.candidates) {
    const light = cellLight(scene.scan, c.at);
    if (light <= 0.004) continue;
    // A cell that wins keeps its light and steps up a little as the rest dim; once its copy is
    // picked the node's own drawing takes over from it. The others go out together, slowly.
    const winner = c.node >= 0 ? scene.nodes[c.node] : undefined;
    const a = winner ? light * (1 - winner.pick) : consideredLight(light, scene.settle);
    if (a <= 0.004) continue;
    const r = p * 0.78 * (winner ? 1 + 0.28 * scene.settle : 1);
    // The line touching the cell: a soft glow that is brightest at the crossing and eases away.
    const fresh = cellFresh(scene.scan, c.at);
    if (fresh > 0.02) {
      const gr = p * 3.4;
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, gr);
      grad.addColorStop(0, rgba(pal.hot, 0.4 * fresh * a));
      grad.addColorStop(1, rgba(pal.hot, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(c.x - gr, c.y - gr, gr * 2, gr * 2);
    }
    hex(ctx, c.x, c.y, r);
    ctx.fillStyle = rgba(pal.accent, (0.34 + 0.2 * fresh) * a);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.hot, 0.9 * a);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- deploy lines ----------------------------------------------------------------------------

function strokePartial(
  ctx: CanvasRenderingContext2D,
  pts: Float32Array,
  progress: number,
): { x: number; y: number } | null {
  const n = pts.length / 2;
  const upto = Math.max(1, Math.round(progress * (n - 1)));
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 1; i <= upto; i++) ctx.lineTo(pts[i * 2] as number, pts[i * 2 + 1] as number);
  ctx.stroke();
  return { x: pts[upto * 2] as number, y: pts[upto * 2 + 1] as number };
}

function drawDeployLines(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, pal } = dc;
  ctx.save();
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const n = scene.nodes[i];
    const pts = cache.deploy[i];
    if (!n || !pts || n.arc <= 0.001) continue;
    // After the copy has landed the line settles to a quiet link.
    const settled = clamp01((n.arc - 0.85) / 0.15);
    const a = (0.62 - 0.38 * settled) * (1 - 0.7 * n.down);
    ctx.strokeStyle = rgba(pal.hot, a);
    const head = strokePartial(ctx, pts, n.arc);
    if (head && n.arc < 0.999) {
      ctx.fillStyle = rgba(pal.text1, 0.95);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- nodes -----------------------------------------------------------------------------------

function drawNodes(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, layout, pal } = dc;
  const p = layout.pitch;
  const R = cache.nodeR;
  const f = cache.fonts;
  for (let i = 0; i < 4; i++) {
    const n = scene.nodes[i];
    const meta = EXAMPLE_NODES[i];
    const at = cache.nodePx[i];
    const plate = cache.labels[i];
    if (!n || !meta || !at || !plate || n.pick <= 0.001) continue;
    // Row three's label belongs to Virginia until Sydney takes its place.
    const down = n.down;
    const live = 1 - down;
    ctx.save();

    // Glow under the cell.
    const gr = R * 4.2;
    const grad = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, gr);
    grad.addColorStop(0, rgba(pal.hot, 0.34 * n.pick * live));
    grad.addColorStop(1, rgba(pal.hot, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(at.x - gr, at.y - gr, gr * 2, gr * 2);

    // The neighbouring cells of the lattice light with it.
    ctx.fillStyle = rgba(pal.accent, 0.5 * n.pick * live);
    for (let k = 0; k < 6; k++) {
      const a = ((k * 60 - 30) * Math.PI) / 180;
      const d = p * 1.12;
      hex(ctx, at.x + d * Math.cos(a), at.y + d * Math.sin(a), Math.max(2, R * 0.46));
      ctx.fill();
    }

    // The ignition ring.
    if (n.pick < 0.999) {
      ctx.strokeStyle = rgba(pal.hot, 0.8 * (1 - n.pick));
      ctx.lineWidth = 1.4;
      hex(ctx, at.x, at.y, R + p * 7 * n.pick);
      ctx.stroke();
    }

    // The cell itself.
    const tint: RGB = down > 0.5 ? pal.text3 : pal.hot;
    hex(ctx, at.x, at.y, R * (0.7 + 0.3 * n.pick));
    ctx.fillStyle = rgba(tint, 0.95 * n.pick * (0.35 + 0.65 * live));
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(down > 0.5 ? pal.crit : pal.accent, 0.95 * n.pick);
    ctx.stroke();

    // Once the copy is running it keeps a steady ring; the moment it comes up, one ring leaves the
    // cell and fades. Nothing repeats: a running node is simply lit.
    const up = n.online * clamp01(1 - down * 2);
    if (up > 0.01) {
      ctx.strokeStyle = rgba(pal.hot, 0.34 * up);
      ctx.lineWidth = 1.2;
      hex(ctx, at.x, at.y, R * 1.55);
      ctx.stroke();
      if (n.online < 0.999) {
        ctx.strokeStyle = rgba(pal.hot, 0.55 * (1 - n.online));
        hex(ctx, at.x, at.y, R * 1.55 + n.online * R * 2.2);
        ctx.stroke();
      }
    }

    // A cross for a node that has gone dark.
    if (down > 0.4) {
      ctx.strokeStyle = rgba(pal.crit, down);
      ctx.lineWidth = 1.8;
      const x = R * 0.42;
      ctx.beginPath();
      ctx.moveTo(at.x - x, at.y - x);
      ctx.lineTo(at.x + x, at.y + x);
      ctx.moveTo(at.x + x, at.y - x);
      ctx.lineTo(at.x - x, at.y + x);
      ctx.stroke();
    }

    // The label: city and region, on a dark plate so it reads over the dots.
    const city = meta.city;
    const region = meta.region.toUpperCase();
    const { x: lx, y: ly, w, h: hgt } = plate;
    ctx.globalAlpha = scene.fade * clamp01((n.pick - 0.2) / 0.5);
    chamfer(ctx, lx, ly, w, hgt, 6, 2);
    ctx.fillStyle = rgba(pal.ink, 0.86);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.accent, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    const tx = lx + 5;
    text(ctx, city, tx, ly + hgt * 0.34, f.monoSm, rgba(pal.text1, 1));
    setSpacing(ctx, '1.1px');
    text(ctx, region, tx, ly + hgt * 0.72, f.monoXs, rgba(pal.text3, 1));
    setSpacing(ctx, '0px');
    ctx.restore();
  }
}

// ---- traffic ---------------------------------------------------------------------------------

const PACKETS = 5;

function packets(
  ctx: CanvasRenderingContext2D,
  pts: Float32Array,
  clock: number,
  strength: number,
  pal: Palette,
): void {
  if (strength <= 0.01) return;
  const n = pts.length / 2;
  for (let k = 0; k < PACKETS; k++) {
    const u = (clock / 1700 + k / PACKETS) % 1;
    for (let tail = 0; tail < 3; tail++) {
      const uu = u - tail * 0.018;
      if (uu < 0) continue;
      const f = uu * (n - 1);
      const i = Math.floor(f);
      const j = Math.min(n - 1, i + 1);
      const t = f - i;
      const x = (pts[i * 2] as number) + ((pts[j * 2] as number) - (pts[i * 2] as number)) * t;
      const y = (pts[i * 2 + 1] as number) + ((pts[j * 2 + 1] as number) - (pts[i * 2 + 1] as number)) * t;
      ctx.fillStyle = rgba(
        tail === 0 ? pal.text1 : pal.hot,
        strength * (tail === 0 ? 0.95 : 0.5 - tail * 0.18),
      );
      ctx.beginPath();
      ctx.arc(x, y, tail === 0 ? 2.3 : 1.7, 0, TAU);
      ctx.fill();
    }
  }
}

function drawTraffic(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, layout, pal } = dc;
  if (scene.visitor <= 0.001) return;
  const v = cache.visitorPx;
  const f = cache.fonts;
  ctx.save();

  // Path A: visitor to Virginia, until Virginia drops.
  const dropGone = scene.nodes[1]?.down ?? 0;
  const pathAAlpha = scene.visitor * (1 - dropGone);
  if (pathAAlpha > 0.01) {
    ctx.strokeStyle = rgba(pal.accent, 0.5 * pathAAlpha);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 5]);
    strokePartial(ctx, cache.pathA, 1);
    ctx.setLineDash([]);
    packets(ctx, cache.pathA, scene.clock, scene.flowA, pal);
  }

  // Path B: the new route to Frankfurt.
  if (scene.drawB > 0.001) {
    ctx.strokeStyle = rgba(pal.hot, 0.75);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    const head = strokePartial(ctx, cache.pathB, scene.drawB);
    if (head && scene.drawB < 0.999) {
      ctx.fillStyle = rgba(pal.text1, 1);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.6, 0, TAU);
      ctx.fill();
    }
    packets(ctx, cache.pathB, scene.clock + 400, scene.flowB, pal);
  }

  // The visitor: a steady mark. A single ring leaves it as it arrives.
  const a = scene.visitor;
  const r = 4.6;
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(pal.text1, 0.5);
  if (a < 0.999) {
    ctx.globalAlpha = scene.fade * 0.8 * Math.sin(Math.PI * a);
    hex(ctx, v.x, v.y, r + 4.5 + 14 * a);
    ctx.stroke();
  }
  ctx.globalAlpha = scene.fade * a * 0.55;
  hex(ctx, v.x, v.y, r + 4.5);
  ctx.stroke();
  ctx.globalAlpha = scene.fade * a;
  hex(ctx, v.x, v.y, r);
  ctx.fillStyle = rgba(pal.text1, 1);
  ctx.fill();
  setSpacing(ctx, '1.1px');
  text(ctx, 'VISITOR', v.x + r + 7, v.y, f.monoXs, rgba(pal.text2, 1));
  setSpacing(ctx, '0px');
  void layout;
  ctx.restore();
}

// ---- cards -----------------------------------------------------------------------------------

function drawSpecCard(dc: DrawContext, scene: Scene, r: Rect, alpha: number): void {
  const { ctx, cache, layout, pal } = dc;
  if (alpha <= 0.003) return;
  const f = cache.fonts;
  const fs = layout.fs;
  cardSurface(dc, r, alpha);
  ctx.save();
  ctx.globalAlpha = scene.fade * alpha;
  const m = cardMetrics(fs);
  const pad = m.pad;
  const x = r.x + pad;
  const innerW = r.w - pad * 2;

  // Header: file name and the EXAMPLE flag.
  const headY = r.y + m.headY;
  text(ctx, 'example-app.spec', x, headY, f.monoSm, rgba(pal.text3, 1));
  setSpacing(ctx, '1.2px');
  const label = 'EXAMPLE';
  const lw = label.length * (f.charWXs + 1.2) + 12;
  const lh = fs * 1.35;
  const lx = r.x + r.w - pad - lw - Math.min(18, r.h * 0.1);
  chamfer(ctx, lx, headY - lh / 2, lw, lh, 5, 2);
  ctx.fillStyle = rgba(pal.accent, 0.16);
  ctx.fill();
  ctx.strokeStyle = rgba(pal.hot, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
  text(ctx, label, lx + 6, headY + 0.5, f.monoXs, rgba(pal.hot, 1));
  setSpacing(ctx, '0px');

  ctx.strokeStyle = rgba(pal.text1, 0.09);
  ctx.beginPath();
  ctx.moveTo(x, r.y + m.ruleY);
  ctx.lineTo(x + innerW, r.y + m.ruleY);
  ctx.stroke();

  // Fields.
  const btnH = m.btnH;
  const top = r.y + m.ruleY;
  const bottom = r.y + r.h - pad - btnH - m.gap;
  const rows = SPEC_FIELDS.length;
  const rh = Math.max(fs * 1.7, Math.min(m.row, (bottom - top) / rows));
  const keyW = f.charW * 9 + pad;
  for (let i = 0; i < rows; i++) {
    const field = SPEC_FIELDS[i];
    if (!field) continue;
    const y = top + rh * (i + 0.5) + fs * 0.1;
    text(ctx, field.key, x, y, f.mono, rgba(pal.text3, 0.95));
    const progress = scene.fields[i] ?? 0;
    const n = typedChars(field.value, progress);
    const vx = x + keyW;
    if (n > 0) text(ctx, field.value.slice(0, n), vx, y, f.mono, rgba(pal.text1, 1));
    if (scene.caretField === i) {
      // A steady bar. It moves with the typing; it does not blink.
      ctx.fillStyle = rgba(pal.hot, 0.95);
      ctx.fillRect(vx + n * f.charW + 1, y - fs * 0.55, Math.max(2, fs * 0.16), fs * 1.1);
    }
    if (i < rows - 1) {
      ctx.strokeStyle = rgba(pal.text1, 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y + rh / 2);
      ctx.lineTo(x + innerW, y + rh / 2);
      ctx.stroke();
    }
  }

  // The deploy button.
  if (scene.deployIn > 0.01) {
    const bx = x;
    const by = r.y + r.h - pad - btnH;
    const press = scene.deployPress;
    const s = 1 - 0.045 * press;
    ctx.save();
    ctx.globalAlpha = scene.fade * alpha * scene.deployIn;
    ctx.translate(bx + innerW / 2, by + btnH / 2);
    ctx.scale(s, s);
    ctx.translate(-(bx + innerW / 2), -(by + btnH / 2));
    chamfer(ctx, bx, by, innerW, btnH, 10, 3);
    ctx.fillStyle = rgba(pal.solid, 1);
    ctx.fill();
    ctx.fillStyle = rgba(pal.text1, 0.32 * press);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(pal.text1, 0.55);
    ctx.stroke();
    text(ctx, 'Deploy', bx + innerW / 2, by + btnH / 2 + 0.5, f.display, rgba(pal.text1, 1), 'center');
    ctx.restore();
    // A ripple leaves the button as it is pressed.
    if (press > 0.02 && scene.t > 5_600) {
      ctx.save();
      ctx.globalAlpha = scene.fade * alpha * (1 - press) * 0.9;
      ctx.strokeStyle = rgba(pal.hot, 1);
      ctx.lineWidth = 1.4;
      const rr = (btnH / 2) * (1 + 1.6 * (1 - press));
      chamfer(ctx, bx - rr * 0.3, by - rr * 0.3, innerW + rr * 0.6, btnH + rr * 0.6, 12, 3);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

const STATUS_WORD: Record<InstanceStatus, string> = {
  queued: 'queued',
  installing: 'installing',
  running: 'running',
  offline: 'offline',
  placing: 'placing',
};

function statusColour(status: InstanceStatus, pal: Palette): RGB {
  switch (status) {
    case 'running':
      return pal.ok;
    case 'offline':
      return pal.crit;
    case 'placing':
    case 'installing':
      return pal.hot;
    default:
      return pal.text3;
  }
}

/** A hexagon status mark: a ring that spins while pending, a tick when running, a cross when not. */
function statusMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  status: InstanceStatus,
  clock: number,
  pal: Palette,
): void {
  const col = statusColour(status, pal);
  hex(ctx, cx, cy, r);
  if (status === 'installing' || status === 'placing') {
    ctx.strokeStyle = rgba(col, 0.28);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // A bright arc travels the outline.
    const a0 = ((clock / 900) % 1) * TAU;
    ctx.strokeStyle = rgba(col, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, a0, a0 + 1.5);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = rgba(col, status === 'queued' ? 0.12 : 0.22);
  ctx.fill();
  ctx.strokeStyle = rgba(col, 1);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (status === 'running') {
    ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.36);
    ctx.lineTo(cx + r * 0.46, cy - r * 0.34);
  } else if (status === 'offline') {
    ctx.moveTo(cx - r * 0.34, cy - r * 0.34);
    ctx.lineTo(cx + r * 0.34, cy + r * 0.34);
    ctx.moveTo(cx + r * 0.34, cy - r * 0.34);
    ctx.lineTo(cx - r * 0.34, cy + r * 0.34);
  }
  ctx.stroke();
}

function drawStatusCard(dc: DrawContext, scene: Scene, r: Rect, alpha: number): void {
  const { ctx, cache, layout, pal } = dc;
  if (alpha <= 0.003) return;
  const f = cache.fonts;
  const fs = layout.fs;
  cardSurface(dc, r, alpha);
  ctx.save();
  ctx.globalAlpha = scene.fade * alpha;
  const m = cardMetrics(fs);
  const pad = m.pad;
  const x = r.x + pad;
  const innerW = r.w - pad * 2;
  const headY = r.y + m.headY;
  const ruleY = r.y + m.ruleY;

  text(ctx, 'example-app', x, headY, f.display, rgba(pal.text1, 1));
  const count = `${scene.running} of 3 running`;
  text(
    ctx,
    count,
    r.x + r.w - pad - Math.min(18, r.h * 0.1),
    headY + 1,
    f.monoSm,
    rgba(pal.text2, 1),
    'right',
  );
  ctx.strokeStyle = rgba(pal.text1, 0.09);
  ctx.beginPath();
  ctx.moveTo(x, ruleY);
  ctx.lineTo(x + innerW, ruleY);
  ctx.stroke();

  // Three instance rows. The third is Virginia's, until Sydney takes its place. The footer gets
  // whatever the rows leave.
  const top = ruleY;
  const footMin = layout.mode === 'wide' ? fs * 3.6 : fs * 2.6;
  const rh = clamp((r.y + r.h - pad - footMin - top) / 3, fs * 2, fs * 3.4);
  const footH = r.y + r.h - pad - (top + rh * 3);
  for (let row = 0; row < 3; row++) {
    const i = row;
    const y = top + rh * (i + 0.5);
    // Row 1 is Virginia, then Sydney. Rows 0 and 2 are fixed.
    const draw = (nodeIdx: number, a: number) => {
      const meta = EXAMPLE_NODES[nodeIdx];
      const n = scene.nodes[nodeIdx];
      if (!meta || !n || a <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = scene.fade * alpha * a;
      const mark = Math.max(6, fs * 0.7);
      statusMark(ctx, x + mark, y, mark, n.status, scene.clock, pal);
      text(ctx, meta.city, x + mark * 2 + 10, y - fs * 0.02, f.mono, rgba(pal.text1, 1));
      const word = STATUS_WORD[n.status];
      text(
        ctx,
        word,
        r.x + r.w - pad - Math.min(18, r.h * 0.1),
        y,
        f.monoSm,
        rgba(statusColour(n.status, pal), 1),
        'right',
      );
      ctx.restore();
    };
    // The third row (index 2 in the card) holds Singapore; the second holds Virginia then Sydney.
    if (row === 0) draw(0, 1);
    else if (row === 1) {
      draw(1, 1 - scene.swapRow);
      draw(3, scene.swapRow);
    } else draw(2, 1);
    if (i < 2) {
      ctx.strokeStyle = rgba(pal.text1, 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y + rh / 2);
      ctx.lineTo(x + innerW, y + rh / 2);
      ctx.stroke();
    }
  }

  // The state of the whole app, in a few words.
  const fy = r.y + r.h - pad - footH / 2;
  ctx.strokeStyle = rgba(pal.text1, 0.09);
  ctx.beginPath();
  ctx.moveTo(x, fy - footH / 2);
  ctx.lineTo(x + innerW, fy - footH / 2);
  ctx.stroke();
  let line = 'Serving traffic';
  let colour: RGB = pal.text2;
  if (scene.badge === 'offline') {
    line = 'One node offline';
    colour = pal.warn;
  } else if (scene.badge === 'still-up') {
    line = 'Still up';
    colour = pal.ok;
  }
  const big = scene.badge === 'still-up';
  const lineFont = big ? f.displayBig : f.display;
  if (big) {
    // A check, then the words.
    const cr = fs * 0.95;
    ctx.save();
    hex(ctx, x + cr, fy, cr);
    ctx.fillStyle = rgba(pal.ok, 0.2);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.ok, 1);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + cr - cr * 0.42, fy + cr * 0.02);
    ctx.lineTo(x + cr - cr * 0.1, fy + cr * 0.38);
    ctx.lineTo(x + cr + cr * 0.46, fy - cr * 0.34);
    ctx.stroke();
    ctx.restore();
    text(ctx, line, x + cr * 2 + 12, fy, lineFont, rgba(colour, 1));
  } else {
    text(ctx, line, x, fy, lineFont, rgba(colour, 1));
  }
  ctx.restore();
}

// ---- address ----------------------------------------------------------------------------------

function drawAddress(dc: DrawContext, scene: Scene): void {
  const { ctx, cache, layout, pal } = dc;
  if (scene.address <= 0.003) return;
  const f = cache.fonts;
  const a = scene.address;
  // The pill is as wide as the address needs, no wider.
  const need = EXAMPLE_ADDRESS.length * f.charWSm + 28 + layout.fs * 1.6;
  const r = layout.address;
  ctx.save();
  ctx.globalAlpha = scene.fade * a;
  chamfer(ctx, r.x, r.y, Math.min(r.w, need), r.h, 8, 3);
  ctx.fillStyle = rgba(pal.ink, 0.84);
  ctx.fill();
  ctx.strokeStyle = rgba(pal.accent, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  const colour: RGB = scene.badge === 'offline' ? pal.warn : pal.ok;
  const cy = r.y + r.h / 2;
  hex(ctx, r.x + 14, cy, 4.2);
  ctx.fillStyle = rgba(colour, 1);
  ctx.fill();
  text(ctx, EXAMPLE_ADDRESS, r.x + 28, cy + 0.5, f.monoSm, rgba(pal.text1, 1));
  ctx.restore();
}
