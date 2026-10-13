/**
 * What the constellation draws, decided away from the canvas: colours, how a build's status reads as
 * a shape, which nodes light up, where labels go and the order a block's light travels. Pure.
 */
import { pillCopy } from '../health';
import type { AppEntry } from '../model';
import type { Graph } from './graph';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export type RGB = readonly [number, number, number];

const byte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/** Reads `#rgb`, `#rrggbb`, `r g b` (the token triples), `rgb(r g b)` and `rgb(r, g, b)`. */
export function parseColor(input: string | null | undefined): RGB | null {
  if (!input) return null;
  const s = input.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(s);
  if (short) {
    const h = short[1] ?? '';
    return [
      Number.parseInt((h[0] ?? '0').repeat(2), 16),
      Number.parseInt((h[1] ?? '0').repeat(2), 16),
      Number.parseInt((h[2] ?? '0').repeat(2), 16),
    ];
  }
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s);
  if (long) {
    const h = long[1] ?? '';
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  const triple = /^(?:rgba?\(\s*)?(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})/i.exec(s);
  if (triple) return [byte(Number(triple[1])), byte(Number(triple[2])), byte(Number(triple[3]))];
  return null;
}

export function rgba(c: RGB, alpha: number): string {
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : Math.round(alpha * 1000) / 1000;
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [byte(a[0] + (b[0] - a[0]) * t), byte(a[1] + (b[1] - a[1]) * t), byte(a[2] + (b[2] - a[2]) * t)];
}

// ---------------------------------------------------------------------------
// How a build reads
// ---------------------------------------------------------------------------

/** The colour family of a node. Colour is never the only signal: see `NodeMark`. */
export type NodeTone = 'ok' | 'warn' | 'crit' | 'off' | 'pending' | 'self';

/** The shape inside a node, one per status, so status survives without colour. */
export type NodeMark = 'live' | 'clock' | 'alert' | 'cross' | 'dash' | 'dots' | 'reticle';

export type NodeLifecycle = 'live' | 'new' | 'retiring' | 'retired';

export interface NodeLook {
  tone: NodeTone;
  mark: NodeMark;
  lifecycle: NodeLifecycle;
  /** "Live", "Degraded", "Offline right now", "Not checked yet", "You are here". */
  word: string;
  /** "142 ms" or "6 min ago". */
  detail: string | null;
}

/** The look of one build at `nowMs`. Words come from the same place the cells get them. */
export function lookOf(entry: AppEntry, nowMs: number): NodeLook {
  const view = entry.health;
  const copy = pillCopy(view, nowMs);
  let mark: NodeMark;
  switch (view.kind) {
    case 'self':
      mark = 'reticle';
      break;
    case 'loading':
      mark = 'dots';
      break;
    case 'up':
      mark = view.fresh ? 'live' : 'clock';
      break;
    case 'degraded':
      mark = 'alert';
      break;
    case 'down':
      mark = 'cross';
      break;
    default:
      mark = 'dash';
  }
  return {
    tone: view.kind === 'self' ? 'self' : copy.tone,
    mark,
    lifecycle: entry.lifecycle.state,
    word: copy.word,
    detail: copy.detail,
  };
}

// ---------------------------------------------------------------------------
// Which nodes are lit and which are present
// ---------------------------------------------------------------------------

/**
 * 1 for a node that passes the current filters, else 0. A hub passes when any of its apps does; the
 * centre always does.
 */
export function visibilityOf(graph: Graph, visible: ReadonlySet<string> | null): Uint8Array {
  const out = new Uint8Array(graph.nodes.length);
  const live = new Set<string>();
  graph.nodes.forEach((n, i) => {
    if (n.kind === 'app') {
      const on = !visible || visible.has(n.id);
      out[i] = on ? 1 : 0;
      if (on && n.category) live.add(n.category);
    } else if (n.kind === 'center') {
      out[i] = 1;
    }
  });
  graph.nodes.forEach((n, i) => {
    if (n.kind === 'hub') out[i] = n.category && live.has(n.category) ? 1 : 0;
  });
  return out;
}

export interface EmphasisTargets {
  /** 1 for a focused node, 0.6 for its neighbours, else 0. */
  lit: Float32Array;
  /** How present each node is: 1, dimmed when something else is lit, faint when filtered out. */
  presence: Float32Array;
  /** Something is focused. */
  any: boolean;
}

export function makeEmphasis(count: number): EmphasisTargets {
  return { lit: new Float32Array(count), presence: new Float32Array(count), any: false };
}

/**
 * Where hover, selection and the filters want each node to be. The engine eases toward these.
 * `focus` holds node indices (hovered, selected); negatives are ignored.
 */
export function emphasisTargets(
  graph: Graph,
  visibility: Uint8Array,
  focus: readonly number[],
  out: EmphasisTargets,
): EmphasisTargets {
  out.lit.fill(0);
  let any = false;
  for (const f of focus) {
    if (f < 0 || f >= graph.nodes.length) continue;
    any = true;
    out.lit[f] = 1;
    for (const n of graph.neighbours[f] ?? []) out.lit[n] = Math.max(out.lit[n] ?? 0, 0.6);
  }
  for (let i = 0; i < graph.nodes.length; i++) {
    const lit = out.lit[i] ?? 0;
    let p = visibility[i] ? 1 : 0.15;
    if (lit > 0) p = Math.max(p, 0.7);
    // Something else is lit: the rest recedes. The centre is the brand and only recedes a little.
    else if (any) p *= graph.nodes[i]?.kind === 'center' ? 0.75 : 0.4;
    out.presence[i] = p;
  }
  out.any = any;
  return out;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export interface LabelRequest {
  /** Node index. */
  index: number;
  x: number;
  y: number;
  /** The node's radius in px. */
  r: number;
  /** The text's size in px. */
  w: number;
  h: number;
  /** Higher wins a contested spot. */
  priority: number;
  /** Always shown, overlapping if it must (hovered or selected). */
  force?: boolean;
}

export type LabelSide = 'right' | 'left' | 'below' | 'above';

export interface LabelPlacement {
  index: number;
  side: LabelSide;
  /** Anchor of the text: left edge for `right`, right edge for `left`, centre otherwise. */
  x: number;
  /** Vertical centre of the text. */
  y: number;
}

export interface LabelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const GAP = 6;
const PAD = 3;

function candidate(req: LabelRequest, side: LabelSide): { rect: LabelRect; x: number; y: number } {
  const { x, y, r, w, h } = req;
  switch (side) {
    case 'right': {
      const ax = x + r + GAP;
      return { rect: { x0: ax, y0: y - h / 2, x1: ax + w, y1: y + h / 2 }, x: ax, y };
    }
    case 'left': {
      const ax = x - r - GAP;
      return { rect: { x0: ax - w, y0: y - h / 2, x1: ax, y1: y + h / 2 }, x: ax, y };
    }
    case 'below': {
      const ay = y + r + GAP + h / 2;
      return { rect: { x0: x - w / 2, y0: ay - h / 2, x1: x + w / 2, y1: ay + h / 2 }, x, y: ay };
    }
    default: {
      const ay = y - r - GAP - h / 2;
      return { rect: { x0: x - w / 2, y0: ay - h / 2, x1: x + w / 2, y1: ay + h / 2 }, x, y: ay };
    }
  }
}

const overlaps = (a: LabelRect, b: LabelRect): boolean =>
  a.x0 < b.x1 + PAD && a.x1 + PAD > b.x0 && a.y0 < b.y1 + PAD && a.y1 + PAD > b.y0;

const inside = (r: LabelRect, width: number, height: number): boolean =>
  r.x0 >= 4 && r.y0 >= 4 && r.x1 <= width - 4 && r.y1 <= height - 4;

/**
 * Places labels so none overlap and none leave the frame. Higher priority first; a node near the
 * right edge prefers the left. Labels that do not fit are dropped, except forced ones.
 */
export function layoutLabels(
  requests: readonly LabelRequest[],
  width: number,
  height: number,
  blocked: readonly LabelRect[] = [],
): LabelPlacement[] {
  const order = [...requests].sort((a, b) => {
    const fa = a.force ? 1 : 0;
    const fb = b.force ? 1 : 0;
    return fb - fa || b.priority - a.priority || a.index - b.index;
  });
  const taken: LabelRect[] = [...blocked];
  const out: LabelPlacement[] = [];
  for (const req of order) {
    const preferLeft = req.x > width * 0.62;
    const sides: LabelSide[] = preferLeft
      ? ['left', 'right', 'below', 'above']
      : ['right', 'left', 'below', 'above'];
    let placed: LabelPlacement | null = null;
    let fallback: { side: LabelSide; rect: LabelRect; x: number; y: number } | null = null;
    for (const side of sides) {
      const c = candidate(req, side);
      if (!inside(c.rect, width, height)) continue;
      if (!fallback) fallback = { side, ...c };
      if (taken.some((t) => overlaps(c.rect, t))) continue;
      placed = { index: req.index, side, x: c.x, y: c.y };
      taken.push(c.rect);
      break;
    }
    if (!placed && req.force) {
      const use = fallback ?? { side: sides[0] ?? 'right', ...candidate(req, sides[0] ?? 'right') };
      placed = { index: req.index, side: use.side, x: use.x, y: use.y };
      taken.push(use.rect);
    }
    if (placed) out.push(placed);
  }
  return out;
}

// ---------------------------------------------------------------------------
// A block's light
// ---------------------------------------------------------------------------

export interface PulseLeg {
  from: number;
  to: number;
  /** Seconds after the block lands. */
  delay: number;
  /** Seconds to cross the edge. */
  dur: number;
  strength: number;
}

const SPOKE_STAGGER = 0.09;
const SPOKE_DUR = 0.7;
const TETHER_DUR = 0.6;
const TETHER_STAGGER = 0.06;

/**
 * The order a real block's light travels: out from the centre along each spoke, then from each hub to
 * its apps. Ends within about two seconds.
 */
export function pulsePlan(graph: Graph): PulseLeg[] {
  const legs: PulseLeg[] = [];
  let k = 0;
  for (const spoke of graph.edges) {
    if (spoke.kind !== 'spoke') continue;
    const delay = k * SPOKE_STAGGER;
    k += 1;
    legs.push({ from: spoke.a, to: spoke.b, delay, dur: SPOKE_DUR, strength: 1 });
    let j = 0;
    for (const tether of graph.edges) {
      if (tether.kind !== 'tether' || tether.a !== spoke.b) continue;
      legs.push({
        from: tether.a,
        to: tether.b,
        delay: delay + SPOKE_DUR + j * TETHER_STAGGER,
        dur: TETHER_DUR,
        strength: 0.65,
      });
      j += 1;
    }
  }
  return legs;
}

// ---------------------------------------------------------------------------
// Where the hover card goes
// ---------------------------------------------------------------------------

interface Circle {
  x: number;
  y: number;
  r: number;
}

/**
 * The corner of the card for a node at (x, y): of the four sides, the one that hides the fewest other
 * nodes and stays inside the view, preferring the side away from the middle of the picture. `avoid`
 * is the side the node's own label is on, which the card should not cover.
 */
export function placeCard(
  x: number,
  y: number,
  r: number,
  size: { w: number; h: number },
  vw: number,
  vh: number,
  others: ReadonlyArray<Circle>,
  avoid: LabelSide | null = null,
): { left: number; top: number } {
  const gap = r + 16;
  const { w, h } = size;
  const clampX = (v: number) => Math.max(8, Math.min(v, vw - w - 8));
  const clampY = (v: number) => Math.max(8, Math.min(v, vh - h - 8));
  const awayX = x > vw / 2;
  const options = [
    { left: x + gap, top: clampY(y - h / 2), bias: awayX ? 0 : 1, side: 'right' as LabelSide },
    { left: x - gap - w, top: clampY(y - h / 2), bias: awayX ? 1 : 0, side: 'left' as LabelSide },
    { left: clampX(x - w / 2), top: y + gap, bias: 2, side: 'below' as LabelSide },
    { left: clampX(x - w / 2), top: y - gap - h, bias: 2, side: 'above' as LabelSide },
  ];
  let best = options[0] as (typeof options)[number];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const o of options) {
    let cost = o.bias * 0.5;
    // The node's own name sits on that side; a card there would hide it.
    if (o.side === avoid) cost += 6;
    // Off the edge is the worst; it is only used when every side is.
    const over =
      Math.max(0, 8 - o.left) +
      Math.max(0, o.left + w - (vw - 8)) +
      Math.max(0, 8 - o.top) +
      Math.max(0, o.top + h - (vh - 8));
    cost += over * 0.5;
    for (const c of others) {
      const nx = Math.max(o.left, Math.min(c.x, o.left + w));
      const ny = Math.max(o.top, Math.min(c.y, o.top + h));
      if (Math.hypot(c.x - nx, c.y - ny) < c.r) cost += 4;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = o;
    }
  }
  return {
    left: Math.max(8, Math.min(best.left, Math.max(8, vw - w - 8))),
    top: Math.max(8, Math.min(best.top, Math.max(8, vh - h - 8))),
  };
}
