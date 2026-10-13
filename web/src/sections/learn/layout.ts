/**
 * Where everything sits on the explainer canvas, in CSS pixels, for a given canvas width. Wide
 * canvases (desktop, 16:9) put the spec card beside the map; narrow ones stack them, because text
 * has to stay legible on a phone and a 120 column map is simply smaller there.
 */
import { clamp } from '@/lib/math';
import { GRID_H, GRID_W } from './worldmap';

export type LayoutMode = 'wide' | 'tall';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The map is drawn a little taller than a plain equirectangular projection (a standard parallel
 * near 32 degrees, as Behrmann's does), which fills the screen better and distorts nothing that
 * matters at this size.
 */
export const ROW_STRETCH = 1.2;

export interface Layout {
  mode: LayoutMode;
  w: number;
  h: number;
  /** Body text size on the canvas, px. */
  fs: number;
  pad: number;
  /** The spec card while it is the only thing on stage. */
  cardCentre: Rect;
  /** The spec card (and then the status card) docked beside or under the map. */
  cardDocked: Rect;
  /** The dot map: exactly GRID_W dot pitches wide and GRID_H row pitches tall. */
  map: Rect;
  /** Dot pitch along a row, px. */
  pitch: number;
  /** Distance between rows, px. */
  pitchY: number;
  /** The address pill, above the map. */
  address: Rect;
  /** Where the deploy lines leave the docked card from. */
  anchor: { x: number; y: number };
}

/** Narrower than this and the canvas is the stacked, taller layout. */
export const TALL_BELOW = 640;

export interface CardMetrics {
  /** Inner padding. */
  pad: number;
  /** Centre of the header line, from the card's top edge. */
  headY: number;
  /** The rule under the header, from the card's top edge. */
  ruleY: number;
  /** A comfortable field row. */
  row: number;
  /** The deploy button's height. */
  btnH: number;
  /** Space between the last field and the button. */
  gap: number;
  /** Height of the spec card when it has all the room it wants. */
  height: number;
}

/** The card's own proportions, for a text size. The drawing and the layout share these. */
export function cardMetrics(fs: number): CardMetrics {
  const pad = Math.max(12, fs * 1.15);
  const headY = fs * 1.9;
  const ruleY = headY + fs * 1.05;
  const row = fs * 2.6;
  const btnH = fs * 2.7;
  const gap = fs * 0.9;
  return { pad, headY, ruleY, row, btnH, gap, height: ruleY + 6 * row + gap + btnH + pad };
}

/** Canvas height for a width: 16:9 on wide, a 4:5 portrait on narrow. */
export function canvasHeight(w: number): number {
  return Math.round(w < TALL_BELOW ? w * 1.28 : (w * 9) / 16);
}

/**
 * `h` is the canvas height when the page has chosen one (a wide canvas is allowed to be shorter
 * than 16:9 so the whole explainer fits a laptop screen); otherwise it follows the width.
 */
export function computeLayout(w: number, h: number = canvasHeight(w)): Layout {
  const mode: LayoutMode = w < TALL_BELOW ? 'tall' : 'wide';
  const pad = mode === 'wide' ? clamp(w * 0.03, 16, 40) : 14;
  const fs = mode === 'wide' ? clamp(w / 72, 11.5, 18) : clamp(w / 31, 11, 13.5);
  const card = cardMetrics(fs);

  if (mode === 'wide') {
    const dockedW = clamp(w * 0.27, 236, 350);
    const cardH = Math.min(card.height, h - pad * 2);
    const cardDocked: Rect = { x: pad, y: (h - cardH) / 2, w: dockedW, h: cardH };
    const mapX = cardDocked.x + dockedW + pad;
    const mapW = w - mapX - pad;
    const pitch = mapW / GRID_W;
    const pitchY = pitch * ROW_STRETCH;
    const mapH = pitchY * GRID_H;
    const addrH = clamp(fs * 2.3, 28, 42);
    const map: Rect = { x: mapX, y: (h - mapH) / 2 + addrH / 2, w: mapW, h: mapH };
    const centreW = clamp(w * 0.36, 300, 470);
    return {
      mode,
      w,
      h,
      fs,
      pad,
      cardCentre: { x: (w - centreW) / 2, y: (h - cardH) / 2, w: centreW, h: cardH },
      cardDocked,
      map,
      pitch,
      pitchY,
      address: { x: mapX, y: map.y - addrH - pad * 0.7, w: Math.min(mapW, fs * 26), h: addrH },
      anchor: { x: cardDocked.x + cardDocked.w, y: cardDocked.y + cardDocked.h * 0.5 },
    };
  }

  const mapW = w - pad * 2;
  const pitch = mapW / GRID_W;
  const pitchY = pitch * ROW_STRETCH;
  const mapH = pitchY * GRID_H;
  const addrH = 28;
  const map: Rect = { x: pad, y: pad + addrH + 10, w: mapW, h: mapH };
  const dockedY = map.y + mapH + pad + 4;
  const cardDocked: Rect = { x: pad, y: dockedY, w: mapW, h: h - dockedY - pad };
  const centreW = w - pad * 2;
  const centreH = Math.min(card.height, h - pad * 2);
  return {
    mode,
    w,
    h,
    fs,
    pad,
    cardCentre: { x: pad, y: (h - centreH) / 2, w: centreW, h: centreH },
    cardDocked,
    map,
    pitch,
    pitchY,
    address: { x: pad, y: pad, w: mapW, h: addrH },
    anchor: { x: w / 2, y: cardDocked.y },
  };
}

/** Linear blend of two rects. */
export function lerpRect(a: Rect, b: Rect, t: number, out: Rect): Rect {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.w = a.w + (b.w - a.w) * t;
  out.h = a.h + (b.h - a.h) * t;
  return out;
}

/** The centre of a map cell, in canvas pixels, given its position on the dot grid. */
export function cellToPx(layout: Layout, gx: number, gy: number): { x: number; y: number } {
  return { x: layout.map.x + gx * layout.pitch, y: layout.map.y + gy * layout.pitchY };
}
