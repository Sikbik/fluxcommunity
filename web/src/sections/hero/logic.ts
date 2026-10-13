/**
 * Pure logic for the hero. No React, no DOM, no clock reads: every time-dependent helper takes its
 * inputs, so each one is trivially testable (see logic.test.ts).
 */
import { formatPct } from '@/lib/format';
import { clamp, clamp01 } from '@/lib/math';
import type { IntroState } from '@/stage/bus';

// ---------------------------------------------------------------------------
// The next-block ring
// ---------------------------------------------------------------------------

/** Cells in the next-block ring: five along each edge of the hexagon, one per second of the target. */
export const RING_SEGMENTS = 30;

/**
 * How many ring cells are lit for a block interval that is `progress` (0..1) elapsed. The cell being
 * filled counts as lit, so the ring is never empty while a block is in flight, and it holds full while
 * a block is overdue. Zero (and unknown) is an empty ring.
 */
export function litSegments(progress: number, segments: number = RING_SEGMENTS): number {
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  return Math.min(segments, Math.ceil(clamp01(progress) * segments));
}

export interface PulseLike {
  id: number;
  kind: string;
}

/**
 * Looks through the stage bus's recent pulses for real block beats newer than `seen`. The data layer
 * only fires a `block` pulse for a live block that landed in front of us (never for a fallback
 * number, a reconnect or a block learned long after the fact), so this is the one honest source for
 * "the ring completes now". Returns the newest id seen and whether a block pulse was among the new
 * ones.
 */
export function scanBlockPulses(
  pulses: readonly PulseLike[],
  seen: number,
): { seen: number; block: boolean } {
  let newest = seen;
  let block = false;
  for (const p of pulses) {
    if (p.id <= seen) continue;
    if (p.id > newest) newest = p.id;
    if (p.kind === 'block') block = true;
  }
  return { seen: newest, block };
}

// ---------------------------------------------------------------------------
// Price and 24 h change
// ---------------------------------------------------------------------------

export type ChangeDirection = 'up' | 'down' | 'flat' | 'none';

export interface ChangeView {
  direction: ChangeDirection;
  /** "+1.95%", "−0.40%", "0.00%" or "--". */
  text: string;
  /** A sentence for assistive tech. */
  spoken: string;
}

/** The 24 h change as a direction, a signed label and a spoken form. Unknown is `none`, never zero. */
export function describeChange(pct: number | null | undefined, digits = 2): ChangeView {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return { direction: 'none', text: '--', spoken: 'Change over 24 hours unknown' };
  }
  const shown = Number(Math.abs(pct).toFixed(digits));
  if (shown === 0) {
    return { direction: 'flat', text: formatPct(0, { digits }), spoken: 'Unchanged over 24 hours' };
  }
  const direction: ChangeDirection = pct > 0 ? 'up' : 'down';
  return {
    direction,
    text: formatPct(pct, { digits, signed: true }),
    spoken: `${direction === 'up' ? 'Up' : 'Down'} ${shown.toFixed(digits)} percent over 24 hours`,
  };
}

/** Decimals for a USD price: four under a dollar, two above (matches `formatUsd`). */
export function priceDecimals(price: number): 2 | 4 {
  return Math.abs(price) < 1 ? 4 : 2;
}

/** Number of integer digits, for padding an odometer so its width never changes. */
export function digitCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(Math.abs(n)).toString().length);
}

// ---------------------------------------------------------------------------
// Strip honesty
// ---------------------------------------------------------------------------

export type Fresh = 'live' | 'cached' | 'offline' | 'unknown';
export type StripTone = 'syncing' | 'live' | 'cached' | 'offline';

/**
 * The one word for the whole strip. Any section that is offline makes the strip say so; otherwise
 * stale numbers make it cached; and until anything has arrived it is syncing.
 */
export function stripTone(sections: readonly Fresh[]): StripTone {
  if (sections.some((f) => f === 'offline')) return 'offline';
  if (sections.every((f) => f === 'unknown')) return 'syncing';
  if (sections.some((f) => f === 'cached')) return 'cached';
  return 'live';
}

// ---------------------------------------------------------------------------
// The intro handshake
// ---------------------------------------------------------------------------

/**
 * `hold`    soft, readable, waiting for the stage's intro to start
 * `play`    resolving in step with the stage sequence (flash at about 1.2 s)
 * `quick`   no intro this visit: a short, staggered resolve
 * `settle`  skip or done: everything lands now
 * `static`  reduced motion: no animation at all
 */
export type HeroPhase = 'hold' | 'play' | 'quick' | 'settle' | 'static';

export interface PhaseInput {
  /** The first frame has passed, so the shell has decided whether the intro plays. */
  decided: boolean;
  intro: IntroState;
  reduced: boolean;
}

/**
 * The hero's phase for an intro state. Idempotent for a given input (feeding the result back as
 * `prev` returns it again), so it is safe to evaluate during render.
 */
export function nextHeroPhase(prev: HeroPhase, { decided, intro, reduced }: PhaseInput): HeroPhase {
  if (reduced) return 'static';
  if (!decided) return 'hold';
  const resolved = prev === 'play' || prev === 'quick' || prev === 'settle';
  switch (intro) {
    case 'pending':
      return resolved ? prev : 'hold';
    case 'playing':
      return 'play';
    case 'skip':
      return 'settle';
    case 'done':
      return resolved ? prev : 'settle';
    default:
      return resolved ? prev : 'quick';
  }
}

// ---------------------------------------------------------------------------
// The HUD readout and the parallax
// ---------------------------------------------------------------------------

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Reticle {
  /** -1..1 across the frame, 0 at the centre. */
  x: number;
  /** -1..1 down the frame, +1 at the top (screen y inverted, like the stage). */
  y: number;
  inside: boolean;
}

/** The pointer in frame coordinates. `pad` widens the frame for the inside test. */
export function reticleAt(px: number, py: number, rect: RectLike, pad = 0): Reticle {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0, inside: false };
  const inside =
    px >= rect.left - pad &&
    px <= rect.left + rect.width + pad &&
    py >= rect.top - pad &&
    py <= rect.top + rect.height + pad;
  const x = clamp(((px - rect.left) / rect.width) * 2 - 1, -1, 1);
  const y = clamp(1 - ((py - rect.top) / rect.height) * 2, -1, 1);
  return { x, y, inside };
}

/** A coordinate as a signed, fixed two decimals: "+0.42", "−0.18", "+0.00" (never "-0.00"). */
export function formatCoord(n: number): string {
  if (!Number.isFinite(n)) return '+0.00';
  const body = Math.abs(n).toFixed(2);
  if (Number(body) === 0) return '+0.00';
  return `${n < 0 ? '−' : '+'}${body}`;
}

/** How far (in px) beyond the headline's box the pointer still lights it. */
export const GLINT_REACH = 180;

export interface GlintTarget {
  /** The pointer across the headline's box, -1.5..1.5 (0 at the centre, beyond +-1 outside the box). */
  x: number;
  y: number;
  /** How present the pointer is, 0..1: 1 over the box, easing to 0 at `reach` px away. */
  g: number;
}

/**
 * Where the pointer's light falls on the headline. The light only exists near the headline: far from
 * it `g` is 0, so a pointer busy elsewhere (dragging the symbol, say) costs the headline nothing.
 */
export function glintTarget(
  px: number,
  py: number,
  rect: RectLike,
  reach: number = GLINT_REACH,
): GlintTarget {
  if (!(rect.width > 0) || !(rect.height > 0) || !Number.isFinite(px) || !Number.isFinite(py)) {
    return { x: 0, y: 0, g: 0 };
  }
  const dx = Math.max(rect.left - px, 0, px - (rect.left + rect.width));
  const dy = Math.max(rect.top - py, 0, py - (rect.top + rect.height));
  const near = clamp01(1 - Math.hypot(dx, dy) / reach);
  return {
    x: clamp((px - (rect.left + rect.width / 2)) / (rect.width / 2), -1.5, 1.5),
    y: clamp((py - (rect.top + rect.height / 2)) / (rect.height / 2), -1.5, 1.5),
    g: near * near * (3 - 2 * near),
  };
}

// ---------------------------------------------------------------------------
// The text ring
// ---------------------------------------------------------------------------

/** A full circle as an SVG path, clockwise from the top (so text on it reads left to right on top). */
export function circlePath(cx: number, cy: number, r: number): string {
  const f = (n: number) => Number(n.toFixed(2));
  return `M${f(cx)} ${f(cy - r)}A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy + r)}A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy - r)}Z`;
}

/** The words that travel around the symbol. */
export const RING_PHRASES = ['DECENTRALIZED CLOUD', 'BUILT BY ITS COMMUNITY', 'PROOF OF NODE'] as const;

/** Characters of air after each phrase (the slash and its two spaces), so phrases read as phrases. */
const SEPARATOR = '  /  ';

/** One lap of the ring text, each phrase followed by a slash. */
export function ringText(laps = 1, phrases: readonly string[] = RING_PHRASES): string {
  return phrases
    .map((p) => `${p}${SEPARATOR}`)
    .join('')
    .repeat(Math.max(1, laps));
}

export interface RingArc {
  /** The SVG path the phrase runs along: an arc, clockwise from `from` to `to` (degrees from the top). */
  d: string;
  /** The phrase, with its trailing slash. */
  text: string;
  /** Arc length in the same units as the radius, for `textLength`. */
  length: number;
}

/** A point on a circle, `deg` degrees clockwise from the top. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** An open arc path, clockwise from `from` to `to` degrees (0 is the top). */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const f = (n: number) => Number(n.toFixed(2));
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${f(a.x)} ${f(a.y)}A${f(r)} ${f(r)} 0 ${large} 1 ${f(b.x)} ${f(b.y)}`;
}

/**
 * The ring text cut into one arc per phrase, spaced by character count so every glyph gets the same
 * share of the circle. Short arcs keep each SVG text box small (a single text running the whole
 * circle would report a circle-sized box and be mistaken for the page's largest content).
 */
export function ringArcs(
  cx: number,
  cy: number,
  r: number,
  laps = 3,
  phrases: readonly string[] = RING_PHRASES,
): RingArc[] {
  const items: string[] = [];
  for (let lap = 0; lap < Math.max(1, laps); lap++) {
    for (const phrase of phrases) items.push(`${phrase}${SEPARATOR}`);
  }
  const total = items.reduce((n, t) => n + t.length, 0);
  const degPerChar = 360 / total;
  const circumference = 2 * Math.PI * r;
  const arcs: RingArc[] = [];
  let at = 0;
  for (const text of items) {
    const from = at * degPerChar;
    const to = (at + text.length) * degPerChar;
    arcs.push({
      d: arcPath(cx, cy, r, from, to),
      text,
      length: Number(((circumference * (to - from)) / 360).toFixed(2)),
    });
    at += text.length;
  }
  return arcs;
}
