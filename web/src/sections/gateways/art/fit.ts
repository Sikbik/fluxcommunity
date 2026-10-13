/**
 * Fitting emissive art into a region of a tile, and how far it may drift. Pure maths: no DOM,
 * no React, so it is unit tested in node. The hook `useArtFit` feeds it measured sizes and
 * writes the result to CSS custom properties; CSS does the rest.
 *
 * Vocabulary (all fractions are of the art frame unless a name says px):
 *   frame    the whole image, width x height px
 *   box      the visible content box [left, top, right, bottom] from the art manifest. Outside
 *            it the frame is black margin: safe to crop and safe to drift into
 *   region   the part of the tile the art should live in (px)
 *   anchor   where the content box's centre sits inside the region (0..1 on each axis)
 */

export type Box = readonly [left: number, top: number, right: number, bottom: number];

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type FitMode =
  /** The whole content box fits inside the region (never cropped). */
  | 'contain'
  /** The content box covers the region on both axes (may crop the content's far edge). */
  | 'cover';

export interface FitInput {
  box: Box;
  /** Frame width divided by frame height. */
  aspect: number;
  /** The region the art lives in, px. */
  regionW: number;
  regionH: number;
  /** Fraction of the limiting region dimension the content may fill. Default 0.88. */
  fill?: number;
  /** Where the content centre sits in the region. Default [0.5, 0.5]. */
  anchor?: readonly [number, number];
  mode?: FitMode;
  /** Scales the fitted size after the fact (1 = as fitted). */
  scale?: number;
}

export interface Fit {
  /** The frame, positioned relative to the REGION's top-left corner, px. */
  frame: Rect;
  /** The content box, relative to the region's top-left corner, px. */
  content: Rect;
  /** The content centre in frame px: the right transform origin for a hover zoom. */
  origin: { x: number; y: number };
}

export function boxWidth(box: Box): number {
  return Math.max(0.0001, box[2] - box[0]);
}

export function boxHeight(box: Box): number {
  return Math.max(0.0001, box[3] - box[1]);
}

export function boxCentre(box: Box): { x: number; y: number } {
  return { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 };
}

/** Places a frame so its content box fills a region the way `mode` says. */
export function fitArt(input: FitInput): Fit {
  const { box, aspect, regionW, regionH } = input;
  const fill = clamp(input.fill ?? 0.88, 0.05, 1.6);
  const anchor = input.anchor ?? [0.5, 0.5];
  const mode = input.mode ?? 'contain';
  const scale = input.scale ?? 1;

  const bw = boxWidth(box);
  const bh = boxHeight(box);
  const ar = aspect > 0 ? aspect : 1;

  // Frame width that makes the content exactly fill each axis of the region.
  const byWidth = (regionW * fill) / bw;
  const byHeight = (regionH * fill * ar) / bh;
  const frameW = (mode === 'cover' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight)) * scale;
  const frameH = frameW / ar;

  const c = boxCentre(box);
  const left = anchor[0] * regionW - c.x * frameW;
  const top = anchor[1] * regionH - c.y * frameH;

  return {
    frame: { left, top, width: frameW, height: frameH },
    content: {
      left: left + box[0] * frameW,
      top: top + box[1] * frameH,
      width: bw * frameW,
      height: bh * frameH,
    },
    origin: { x: c.x * frameW, y: c.y * frameH },
  };
}

export interface DriftInput {
  fit: Fit;
  /** The area the art must stay inside while it drifts, px (the tile, not the region). */
  boundsW: number;
  boundsH: number;
  /** Position of the region inside the bounds, px. Default 0,0. */
  regionLeft?: number;
  regionTop?: number;
  /** The most the frame may travel, as a fraction of the frame width. Default 0.04. */
  cap?: number;
  /** The art is allowed to bleed past the bounds (cover crops). Default false. */
  bleed?: boolean;
}

/**
 * How far the art may drift from its rest position, px per axis. Capped at `cap` of the
 * frame (the manifest's "about 4 percent is safe") and, unless it bleeds, at the room the
 * content has before it would touch the bounds. Never negative.
 */
export function safeDrift(input: DriftInput): { x: number; y: number } {
  const { fit, boundsW, boundsH } = input;
  const cap = input.cap ?? 0.04;
  const ox = input.regionLeft ?? 0;
  const oy = input.regionTop ?? 0;
  const limitX = cap * fit.frame.width;
  const limitY = cap * fit.frame.height;
  if (input.bleed) return { x: limitX, y: limitY };

  const left = ox + fit.content.left;
  const top = oy + fit.content.top;
  const roomX = Math.min(left, boundsW - (left + fit.content.width));
  const roomY = Math.min(top, boundsH - (top + fit.content.height));
  return {
    x: Math.max(0, Math.min(limitX, roomX)),
    y: Math.max(0, Math.min(limitY, roomY)),
  };
}

/** Percent strings for placing an overlay in FRAME coordinates (0..1 in, `n%` out). */
export function pct(n: number): string {
  return `${Number((n * 100).toFixed(2))}%`;
}

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}
