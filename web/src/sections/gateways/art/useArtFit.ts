import { type RefObject, useEffect } from 'react';
import { observeResize } from '@/ui';
import { type Box, type FitMode, fitArt, safeDrift } from './fit';

/** Fractions of the tile the art lives in: how far each side is inset. All default to 0. */
export interface Inset {
  l?: number;
  t?: number;
  r?: number;
  b?: number;
}

export interface ArtFitConfig {
  box: Box;
  /** Frame width divided by frame height. */
  aspect: number;
  region?: Inset;
  fill?: number;
  anchor?: readonly [number, number];
  mode?: FitMode;
  scale?: number;
  /** The art may bleed past the tile (cover crops). */
  bleed?: boolean;
  /** Drift amplitude multiplier (1 = the safe amount). */
  depth?: number;
}

/**
 * The composition can be steered from CSS, so media and container queries can retune where
 * the art sits for each tile shape. These custom properties (set on the zone or inherited)
 * override the matching `ArtFitConfig` fields when present:
 *
 *   --art-l --art-t --art-r --art-b   region inset fractions of the tile
 *   --art-fill   --art-ax --art-ay    fill ratio and anchor
 *   --art-mode (contain|cover)   --art-scale   --art-bleed (0|1)   --art-depth
 */
export interface ArtOverrides extends ArtFitConfig {
  region: Required<Inset>;
  fill: number;
  anchor: readonly [number, number];
  mode: FitMode;
  scale: number;
  bleed: boolean;
  depth: number;
}

function num(style: CSSStyleDeclaration, name: string): number | null {
  const raw = style.getPropertyValue(name).trim();
  if (raw === '') return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Resolves the config against the CSS overrides on an element. Exported for tests of intent only. */
export function resolveConfig(config: ArtFitConfig, style: CSSStyleDeclaration): ArtOverrides {
  const mode = style.getPropertyValue('--art-mode').trim();
  const bleed = num(style, '--art-bleed');
  return {
    box: config.box,
    aspect: config.aspect,
    region: {
      l: num(style, '--art-l') ?? config.region?.l ?? 0,
      t: num(style, '--art-t') ?? config.region?.t ?? 0,
      r: num(style, '--art-r') ?? config.region?.r ?? 0,
      b: num(style, '--art-b') ?? config.region?.b ?? 0,
    },
    fill: num(style, '--art-fill') ?? config.fill ?? 0.88,
    anchor: [
      num(style, '--art-ax') ?? config.anchor?.[0] ?? 0.5,
      num(style, '--art-ay') ?? config.anchor?.[1] ?? 0.5,
    ],
    mode: mode === 'cover' || mode === 'contain' ? mode : (config.mode ?? 'contain'),
    scale: num(style, '--art-scale') ?? config.scale ?? 1,
    bleed: bleed === null ? (config.bleed ?? false) : bleed > 0,
    depth: num(style, '--art-depth') ?? config.depth ?? 1,
  };
}

/**
 * Measures the art zone and writes the fit to CSS custom properties on the frame:
 *
 *   --fw --fh --fl --ft   frame size and position in the zone, px
 *   --ox --oy             the content centre in frame px (hover zoom origin)
 *   --dx --dy             the safe parallax amplitude, px
 *
 * It runs only when the zone resizes (a ResizeObserver, once per layout change), never per
 * frame. The observer is `observeResize`: it hands the size over from an animation frame, because
 * writing layout (these custom properties move the art, which resizes things the shell observes)
 * from inside the observer's own callback raised the "ResizeObserver loop completed with
 * undelivered notifications" error on every resize of the home page. The maths lives in
 * `fit.ts`, which is unit tested.
 */
export function useArtFit(
  zone: RefObject<HTMLElement | null>,
  frame: RefObject<HTMLElement | null>,
  config: ArtFitConfig,
): void {
  const { box, aspect, region, fill, anchor, mode, scale, bleed, depth } = config;
  const [bl, bt, br, bb] = box;
  const l = region?.l;
  const t = region?.t;
  const r = region?.r;
  const b = region?.b;
  const ax = anchor?.[0];
  const ay = anchor?.[1];

  useEffect(() => {
    const z = zone.current;
    const f = frame.current;
    if (!z || !f) return;

    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const c = resolveConfig(
        {
          box: [bl, bt, br, bb],
          aspect,
          region: { l, t, r, b },
          fill,
          anchor: ax === undefined || ay === undefined ? undefined : [ax, ay],
          mode,
          scale,
          bleed,
          depth,
        },
        getComputedStyle(z),
      );
      const rl = c.region.l * width;
      const rt = c.region.t * height;
      const rw = Math.max(1, width * (1 - c.region.l - c.region.r));
      const rh = Math.max(1, height * (1 - c.region.t - c.region.b));
      const fit = fitArt({
        box: c.box,
        aspect: c.aspect,
        regionW: rw,
        regionH: rh,
        fill: c.fill,
        anchor: c.anchor,
        mode: c.mode,
        scale: c.scale,
      });
      const drift = safeDrift({
        fit,
        boundsW: width,
        boundsH: height,
        regionLeft: rl,
        regionTop: rt,
        bleed: c.bleed,
      });
      const s = f.style;
      s.setProperty('--fw', `${fit.frame.width.toFixed(1)}px`);
      s.setProperty('--fh', `${fit.frame.height.toFixed(1)}px`);
      s.setProperty('--fl', `${(rl + fit.frame.left).toFixed(1)}px`);
      s.setProperty('--ft', `${(rt + fit.frame.top).toFixed(1)}px`);
      s.setProperty('--ox', `${fit.origin.x.toFixed(1)}px`);
      s.setProperty('--oy', `${fit.origin.y.toFixed(1)}px`);
      s.setProperty('--dx', `${(drift.x * c.depth).toFixed(2)}px`);
      s.setProperty('--dy', `${(drift.y * c.depth).toFixed(2)}px`);
      // The content box's left edge (px, in tile coordinates), on the parent so the copy can read
      // it too: side by side compositions cap the text column at the art's edge.
      const host = z.parentElement;
      if (host) {
        host.style.setProperty('--art-cl', `${(rl + fit.content.left).toFixed(1)}px`);
        host.style.setProperty('--art-cr', `${(rl + fit.content.left + fit.content.width).toFixed(1)}px`);
      }
      f.dataset.fit = '';
    };

    apply(z.offsetWidth, z.offsetHeight);
    // Layout size, not the bounding rect: the tile tilts in 3D and that must not move the art.
    return observeResize([z], () => apply(z.offsetWidth, z.offsetHeight));
  }, [zone, frame, bl, bt, br, bb, aspect, l, t, r, b, fill, ax, ay, mode, scale, bleed, depth]);
}
