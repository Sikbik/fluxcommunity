/**
 * Canvas 2D drawing for the world map. Everything static (graticule, land dots, scale labels) is drawn
 * once per size into an offscreen canvas at device resolution; a frame is that bitmap plus the lit dots,
 * the cluster glows and the interaction rings, so a frame is a few hundred cheap operations.
 *
 * No React in here and nothing is allocated per frame: scenes are built when the size, the data or
 * the filter changes and then only read.
 */
import type { Tier } from '@shared/api';
import type { Placed } from './clusters';
import type { Lattice, LightField } from './lattice';
import { LIT_BANDS, lightGain } from './lattice';
import { graticule, graticuleLabel, latToY, lonToX, type MapView } from './projection';

export type RGB = readonly [number, number, number];

export interface MapColors {
  /** Structure: land dots and lines, the page accent. */
  accent: RGB;
  /** White-hot highlights, tinted by the accent. */
  hot: RGB;
  tiers: Record<Tier, RGB>;
  text: RGB;
}

const TIER_VARS: Record<Tier, string> = {
  cumulus: '--tier-cumulus-rgb',
  nimbus: '--tier-nimbus-rgb',
  stratus: '--tier-stratus-rgb',
};

function triple(value: string, fallback: RGB): RGB {
  const parts = value
    .trim()
    .split(/[\s,/]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return parts.length >= 3 ? [parts[0] as number, parts[1] as number, parts[2] as number] : fallback;
}

/** Reads the palette from the design tokens in force on `el` (so the accent switch recolours the map). */
export function readMapColors(el: Element): MapColors {
  const css = getComputedStyle(el);
  const get = (name: string, fallback: RGB) => triple(css.getPropertyValue(name), fallback);
  return {
    accent: get('--accent-rgb', [79, 122, 212]),
    hot: get('--accent-hot-rgb', [174, 198, 255]),
    text: [161, 165, 171],
    tiers: {
      cumulus: get(TIER_VARS.cumulus, [54, 211, 255]),
      nimbus: get(TIER_VARS.nimbus, [199, 125, 255]),
      stratus: get(TIER_VARS.stratus, [255, 200, 87]),
    },
  };
}

const TIER_ORDER: readonly Tier[] = ['cumulus', 'nimbus', 'stratus'];

export interface Scene {
  view: MapView;
  dpr: number;
  lattice: Lattice;
  light: LightField;
  placed: Placed[];
  /** Source point indexes present in `placed`, for telling who left under a new filter. */
  indexSet: ReadonlySet<number>;
  base: HTMLCanvasElement;
  sprites: Record<Tier, HTMLCanvasElement>;
  colors: MapColors;
  twinkle: { index: Uint32Array; phase: Float32Array; speed: Float32Array; level: Uint8Array };
  /** Opaque fill colours, built once per palette so a frame never formats a colour string. */
  styles: SceneStyles;
  /** The placed clusters split by dominant tier, for batched core fills. */
  byTier: Record<Tier, Placed[]>;
}

export interface SceneStyles {
  /** `lit[tier * LIT_BANDS + band]` */
  lit: string[];
  core: Record<Tier, string>;
  hot: string;
  ringHighlight: string;
  ringHover: string;
  ringReticle: string;
}

/** Effective alpha of the three twinkle brightness levels (dim, medium, bright). */
const TWINKLE_ALPHA = [0.08, 0.17, 0.31] as const;

export interface TweenFrom {
  x: number;
  y: number;
  halo: number;
  core: number;
  tier: Tier;
}

/** The previous filter's look, for the crossfade when the tier filter changes. */
export interface Tween {
  startedAt: number;
  durationMs: number;
  /** Source point index to where that cluster was and how it looked. */
  from: Map<number, TweenFrom>;
  /** The previous light field (same lattice). */
  light: LightField | null;
}

export interface FrameState {
  now: number;
  /** Source point index of the hovered cluster. */
  hover: number | null;
  /** Country code to emphasise. */
  highlight: string | null;
  /** 0..1 progress of the first reveal. */
  intro: number;
  tween: Tween | null;
  /** Last known (offline) data: drawn quieter. */
  muted: boolean;
  /** Idle twinkle and breathing. Off under reduced motion. */
  animate: boolean;
}

// ---------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const SIN60 = Math.sqrt(3) / 2;

/** A pointy-top hexagon path: the brand shape, used for every dot and core on the map. */
function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * SIN60, cy - r / 2);
  ctx.lineTo(cx + r * SIN60, cy + r / 2);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * SIN60, cy + r / 2);
  ctx.lineTo(cx - r * SIN60, cy - r / 2);
  ctx.closePath();
}

/** Brightness band to [alpha, size boost, white mix] for the lit lattice dots. */
const LIT_LOOK: ReadonlyArray<readonly [number, number, number]> = [
  [0.24, 0.95, 0],
  [0.46, 1.15, 0],
  [0.7, 1.35, 0],
  [0.9, 1.55, 0.06],
  [1, 1.75, 0.16],
];

/** Every fill colour a frame needs, formatted once for a palette. */
export function makeStyles(colors: MapColors): SceneStyles {
  const lit: string[] = [];
  const white: RGB = [255, 255, 255];
  for (const tier of TIER_ORDER) {
    const col = colors.tiers[tier];
    for (let b = 0; b < LIT_BANDS; b++) {
      const mixWhite = (LIT_LOOK[b] as readonly [number, number, number])[2];
      lit.push(rgba(mixWhite > 0 ? mix(col, white, mixWhite) : col, 1));
    }
  }
  return {
    lit,
    core: {
      cumulus: rgba(mix(colors.tiers.cumulus, white, 0.55), 1),
      nimbus: rgba(mix(colors.tiers.nimbus, white, 0.55), 1),
      stratus: rgba(mix(colors.tiers.stratus, white, 0.55), 1),
    },
    hot: rgba(colors.hot, 1),
    ringHighlight: rgba(colors.hot, 0.9),
    ringHover: rgba([255, 255, 255], 0.95),
    ringReticle: rgba(colors.hot, 0.85),
  };
}

/** Splits placed clusters by their dominant tier (order kept: biggest first). */
export function splitByTier(placed: readonly Placed[]): Record<Tier, Placed[]> {
  const out: Record<Tier, Placed[]> = { cumulus: [], nimbus: [], stratus: [] };
  for (const c of placed) out[c.dominant].push(c);
  return out;
}

/** A soft round glow in one colour, drawn once and then stamped for every cluster. */
export function makeGlowSprite(color: RGB, px = 96): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const r = px / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(mix(color, [255, 255, 255], 0.2), 0.9));
  g.addColorStop(0.2, rgba(color, 0.55));
  g.addColorStop(0.5, rgba(color, 0.16));
  g.addColorStop(0.78, rgba(color, 0.04));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  return c;
}

export function makeSprites(colors: MapColors): Record<Tier, HTMLCanvasElement> {
  return {
    cumulus: makeGlowSprite(colors.tiers.cumulus),
    nimbus: makeGlowSprite(colors.tiers.nimbus),
    stratus: makeGlowSprite(colors.tiers.stratus),
  };
}

// ---------------------------------------------------------------------------------------------------
// The static layer
// ---------------------------------------------------------------------------------------------------

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Draws the land dots, the faint ocean lattice and the graticule with its scale labels. Sized to
 * the view at device resolution so it is crisp at any pixel ratio.
 */
export function renderBase(scene: Scene): void {
  const { base, view, dpr, lattice, colors } = scene;
  base.width = Math.max(1, Math.round(view.width * dpr));
  base.height = Math.max(1, Math.round(view.height * dpr));
  const ctx = base.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);

  // Graticule: hairlines on the device pixel grid, the equator and prime meridian a little stronger.
  const g = graticule(view, 30);
  ctx.lineWidth = 1 / dpr;
  const snap = (v: number) => Math.round(v * dpr) / dpr + 0.5 / dpr;
  for (const line of g.lons) {
    const x = snap(lonToX(line.at, view));
    ctx.strokeStyle = `rgba(255,255,255,${line.major ? 0.1 : 0.05})`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
    ctx.stroke();
  }
  for (const line of g.lats) {
    const y = snap(latToY(line.at, view));
    ctx.strokeStyle = `rgba(255,255,255,${line.major ? 0.1 : 0.05})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
  }

  // The lattice: ocean dots barely there, land dots clear, coasts in between.
  const r = lattice.pitch * 0.31;
  ctx.fillStyle = rgba(colors.accent, 0.075);
  ctx.beginPath();
  const rOcean = r * 0.55;
  for (let i = 0; i < lattice.count; i++) {
    if ((lattice.land[i] as number) >= 0.22) continue;
    hexPath(ctx, lattice.x[i] as number, lattice.y[i] as number, rOcean);
  }
  ctx.fill();

  // Land, in three alpha bands so a coast reads as a soft edge rather than a stair.
  const bands: Array<[number, number, number]> = [
    [0.22, 0.5, 0.26],
    [0.5, 0.8, 0.46],
    [0.8, 1.01, 0.64],
  ];
  for (const [lo, hi, alpha] of bands) {
    ctx.fillStyle = rgba(colors.accent, alpha);
    ctx.beginPath();
    for (let i = 0; i < lattice.count; i++) {
      const c = lattice.land[i] as number;
      if (c < lo || c >= hi) continue;
      hexPath(ctx, lattice.x[i] as number, lattice.y[i] as number, r);
    }
    ctx.fill();
  }

  // Scale labels along the bottom and left edges, quiet.
  ctx.font = `500 9px ${MONO}`;
  ctx.fillStyle = rgba(colors.text, 0.55);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  // Thirty degrees of longitude is width/12 px; when that is too tight for a label, label every sixty.
  const everyOther = view.width / 12 < 34;
  for (const line of g.lons) {
    if (line.at <= -180 || line.at >= 180) continue;
    if (everyOther && line.at % 60 !== 0) continue;
    ctx.fillText(graticuleLabel(line.at, 'lon'), lonToX(line.at, view), view.height - 5);
  }
  ctx.textAlign = 'left';
  for (const line of g.lats) {
    const y = latToY(line.at, view);
    if (y < 12 || y > view.height - 14) continue;
    ctx.fillText(graticuleLabel(line.at, 'lat'), 5, y - 3);
  }
}

// ---------------------------------------------------------------------------------------------------
// A frame
// ---------------------------------------------------------------------------------------------------

function drawLit(
  ctx: CanvasRenderingContext2D,
  lattice: Lattice,
  styles: SceneStyles,
  light: LightField,
  weight: number,
  breath: number,
): void {
  if (weight <= 0.002) return;
  const r = lattice.pitch * 0.3;
  const k = weight * breath;
  for (let ti = 0; ti < 3; ti++) {
    for (let b = 0; b < LIT_BANDS; b++) {
      const list = light.bins[ti * LIT_BANDS + b];
      if (!list || list.length === 0) continue;
      const look = LIT_LOOK[b] as readonly [number, number, number];
      const rr = r * look[1];
      ctx.beginPath();
      for (let n = 0; n < list.length; n++) {
        const i = list[n] as number;
        hexPath(ctx, lattice.x[i] as number, lattice.y[i] as number, rr);
      }
      ctx.fillStyle = styles.lit[ti * LIT_BANDS + b] as string;
      ctx.globalAlpha = Math.min(1, look[0] * k);
      ctx.fill();
    }
  }
}

/**
 * One frame: the base bitmap, then (additively) the lit lattice dots and cluster glows, then the
 * rings for hover and highlight. `ctx` must already carry the device pixel ratio transform.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, state: FrameState): void {
  const { view, placed, sprites, styles } = scene;
  const { now, hover, highlight, intro, tween, muted, animate } = state;
  const w = view.width;
  const h = view.height;

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(scene.base, 0, 0, w, h);

  // Idle twinkle: a few land dots brighten and fade, drawn as three batched fills (dim, medium, bright).
  if (animate) {
    const { index, phase, speed, level } = scene.twinkle;
    const t = now / 1000;
    for (let k = 0; k < index.length; k++) {
      const wave = 0.5 + 0.5 * Math.sin(t * (speed[k] as number) + (phase[k] as number));
      const a = wave * wave * wave;
      level[k] = a < 0.12 ? 0 : a < 0.3 ? 1 : a < 0.6 ? 2 : 3;
    }
    const r = scene.lattice.pitch * 0.34;
    ctx.fillStyle = styles.hot;
    for (let lvl = 1; lvl <= 3; lvl++) {
      ctx.beginPath();
      let any = false;
      for (let k = 0; k < index.length; k++) {
        if (level[k] !== lvl) continue;
        const i = index[k] as number;
        hexPath(ctx, scene.lattice.x[i] as number, scene.lattice.y[i] as number, r);
        any = true;
      }
      if (!any) continue;
      ctx.globalAlpha = TWINKLE_ALPHA[lvl - 1] as number;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const quiet = muted ? 0.5 : 1;
  const reveal = smooth(intro);
  const haloAlpha = 0.34 * lightGain(w);
  ctx.globalCompositeOperation = 'lighter';

  // The lit lattice, crossfading from the previous filter's when there is a tween.
  let p = 1;
  if (tween) p = smooth((now - tween.startedAt) / tween.durationMs);
  const breath = animate ? 0.9 + 0.1 * Math.sin(now / 1900) : 1;
  if (tween?.light && p < 1)
    drawLit(ctx, scene.lattice, styles, tween.light, (1 - p) * quiet * reveal, breath);
  drawLit(ctx, scene.lattice, styles, scene.light, p * quiet * reveal, breath);

  // Cluster glows.
  const hasHighlight = highlight !== null;
  for (let n = 0; n < placed.length; n++) {
    const c = placed[n] as Placed;
    const dim = hasHighlight && c.cc !== highlight ? 0.3 : 1;
    // The reveal sweeps in from the west so it reads as the map coming online.
    const local = smooth(reveal * 1.5 - (c.x / view.width) * 0.5);
    if (local <= 0.002) continue;
    const from = tween?.from.get(c.index);
    const halo = from && p < 1 ? from.halo + (c.halo - from.halo) * p : c.halo;
    const alpha = (from === undefined && tween && p < 1 ? p : 1) * dim * quiet * local;
    const swing = animate ? 0.9 + 0.1 * Math.sin(now / 1500 + c.x * 0.07 + c.y * 0.05) : 1;
    ctx.globalAlpha = Math.min(1, haloAlpha * alpha * swing);
    const s = halo * 2 * local;
    ctx.drawImage(sprites[c.dominant], c.x - s / 2, c.y - s / 2, s, s);
    if (from && p < 1 && from.tier !== c.dominant) {
      // The colour hands over from the old tier to the new one.
      ctx.globalAlpha = Math.min(1, haloAlpha * dim * quiet * local * (1 - p));
      const so = from.halo * 2 * local;
      ctx.drawImage(sprites[from.tier], c.x - so / 2, c.y - so / 2, so, so);
    }
  }
  // Clusters that left under the new filter fade out where they were.
  if (tween && p < 1) {
    for (const [index, f] of tween.from) {
      if (scene.indexSet.has(index)) continue;
      ctx.globalAlpha = Math.min(1, haloAlpha * quiet * (1 - p) * reveal);
      const s = f.halo * 2;
      ctx.drawImage(sprites[f.tier], f.x - s / 2, f.y - s / 2, s, s);
    }
  }

  // Cores: a small hot hexagon at every cluster, tinted by its tier. At rest (no highlight, no tween,
  // intro done) every core of a tier shares one alpha, so a tier is a single fill.
  if (!hasHighlight && reveal >= 0.999 && !(tween && p < 1)) {
    ctx.globalAlpha = Math.min(1, quiet * 0.95);
    for (const tier of TIER_ORDER) {
      const list = scene.byTier[tier];
      if (list.length === 0) continue;
      ctx.fillStyle = styles.core[tier];
      ctx.beginPath();
      for (let n = 0; n < list.length; n++) {
        const c = list[n] as Placed;
        hexPath(ctx, c.x, c.y, Math.max(1.1, c.core));
      }
      ctx.fill();
    }
  } else {
    for (let n = 0; n < placed.length; n++) {
      const c = placed[n] as Placed;
      const dim = hasHighlight && c.cc !== highlight ? 0.3 : 1;
      const local = smooth(reveal * 1.5 - (c.x / view.width) * 0.5);
      if (local <= 0.002) continue;
      const from = tween?.from.get(c.index);
      const core = from && p < 1 ? from.core + (c.core - from.core) * p : c.core;
      ctx.globalAlpha = Math.min(1, dim * quiet * local * 0.95);
      ctx.fillStyle = styles.core[c.dominant];
      ctx.beginPath();
      hexPath(ctx, c.x, c.y, Math.max(1.1, core * local));
      ctx.fill();
    }
  }

  // Rings: the hovered cluster, and every cluster of the highlighted country.
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.25;
  if (hasHighlight) {
    ctx.strokeStyle = styles.ringHighlight;
    ctx.globalAlpha = 1;
    for (let n = 0; n < placed.length; n++) {
      const c = placed[n] as Placed;
      if (c.cc !== highlight) continue;
      ctx.beginPath();
      hexPath(ctx, c.x, c.y, c.core + 4.5);
      ctx.stroke();
    }
  }
  if (hover !== null) {
    const c = placed.find((x) => x.index === hover);
    if (c) {
      const r = c.core + 6;
      ctx.strokeStyle = styles.ringHover;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      hexPath(ctx, c.x, c.y, r);
      ctx.stroke();
      // Reticle ticks: four short strokes just outside the ring.
      ctx.lineWidth = 1;
      ctx.strokeStyle = styles.ringReticle;
      ctx.beginPath();
      const a = r + 3;
      const b = r + 8;
      ctx.moveTo(c.x - b, c.y);
      ctx.lineTo(c.x - a, c.y);
      ctx.moveTo(c.x + a, c.y);
      ctx.lineTo(c.x + b, c.y);
      ctx.moveTo(c.x, c.y - b);
      ctx.lineTo(c.x, c.y - a);
      ctx.moveTo(c.x, c.y + a);
      ctx.lineTo(c.x, c.y + b);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
