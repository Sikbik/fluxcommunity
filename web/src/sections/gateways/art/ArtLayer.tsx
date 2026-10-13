import { type CSSProperties, type ReactNode, useCallback, useRef, useState } from 'react';
import { ART, type ArtId } from '@/content/art';
import { cn } from '@/lib/cn';
import { Glyph, type GlyphName } from '@/ui';
import styles from './art.module.css';
import { boxCentre, boxHeight, boxWidth, pct } from './fit';
import { rgbaArt, rgbaMaskImage } from './rgba';
import { type ArtFitConfig, useArtFit } from './useArtFit';

export interface ArtLayerProps extends Omit<ArtFitConfig, 'box' | 'aspect'> {
  art: ArtId;
  /** Overlays that live in FRAME coordinates (micro animations): they move with the art. */
  children?: ReactNode;
  /** Like `children` but painted BEHIND the art (echoes, shadows). */
  under?: ReactNode;
  /** The whole object breathes (a slow scale about its centre). */
  breath?: boolean;
  /** Idle float, seconds per cycle. 0 for none. Default 9. */
  floatSeconds?: number;
  /** Phase offset for the float, seconds, so neighbouring tiles do not breathe in step. */
  floatDelay?: number;
  /** Shown faintly while the art is loading and in place of it if it fails. */
  fallbackGlyph?: GlyphName;
  /** Load now instead of lazily (for art that is above the fold). */
  eager?: boolean;
  /** Dim the whole layer (quiet tiles). 0..1, default 1. */
  strength?: number;
  className?: string;
}

/**
 * Emissive art inside a glass Panel.
 *
 * The shipped pieces are light on opaque black and want `mix-blend-mode: screen`, but screen
 * only erases black against an OPAQUE backdrop. Inside translucent glass (and inside the page
 * shell, whose `.page` is its own stacking context, so the WebGL stage is not in the group)
 * the result is an opaque, darker box. So this layer uses the RGBA twins in `./rgba` (alpha
 * from luminance, the sprites' recipe) and composites them normally: the glass stays
 * see-through, its blur and the lit lattice beneath are untouched, and fx can use the art's
 * alpha as a mask.
 *
 *   zone    full tile, chamfer-clipped, static (it carries the clip, never the motion)
 *   frame   the image box, sized and placed by the fit maths, drifts and zooms
 *   float   the idle breathing, and the stacking context the overlays live in
 *
 * Decorative: the tile's text carries the meaning, so the whole layer is aria-hidden.
 */
export function ArtLayer({
  art,
  children,
  under,
  breath = false,
  floatSeconds = 9,
  floatDelay = 0,
  fallbackGlyph,
  eager = false,
  strength = 1,
  className,
  ...fit
}: ArtLayerProps) {
  const asset = ART[art];
  const files = rgbaArt(art);
  const zone = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(files ? 'loading' : 'error');

  useArtFit(zone, frame, { ...fit, box: asset.box, aspect: asset.width / asset.height });

  // An image that was already cached may have finished before React attached its handlers.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setState((s) => (s === 'loading' ? 'ready' : s));
  }, []);

  const c = boxCentre(asset.box);
  const bw = boxWidth(asset.box);
  const bh = boxHeight(asset.box);
  const pool: CSSProperties = {
    left: pct(c.x - bw * 0.72),
    top: pct(c.y - bh * 0.72),
    width: pct(bw * 1.44),
    height: pct(bh * 1.44),
  };

  const vars = {
    '--float-dur': `${floatSeconds}s`,
    '--float-delay': `${floatDelay}s`,
    '--art-strength': strength,
    '--art-avg': asset.avg,
    ...(files ? { '--art-mask-url': `url("${files.src}")`, '--art-mask-set': rgbaMaskImage(files) } : {}),
  } as CSSProperties;

  return (
    <div
      ref={zone}
      className={cn(styles.zone, className)}
      data-art-state={state}
      data-float={floatSeconds > 0 ? 'true' : undefined}
      data-breath={breath ? 'true' : undefined}
      style={vars}
      aria-hidden="true"
    >
      <div ref={frame} className={styles.frame} data-art-frame="">
        <div className={styles.float}>
          <span className={styles.pool} style={pool} />
          {state === 'ready' ? under : null}
          {fallbackGlyph ? (
            <span className={styles.fallback} style={{ left: pct(c.x), top: pct(c.y) }}>
              <Glyph name={fallbackGlyph} size={64} strokeWidth={1} />
            </span>
          ) : null}
          {files ? (
            <picture>
              {files.avif ? <source srcSet={files.avif} type="image/avif" /> : null}
              <img
                ref={imgRef}
                className={styles.img}
                src={files.src}
                width={asset.width}
                height={asset.height}
                alt=""
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
                onLoad={() => setState('ready')}
                onError={() => setState('error')}
              />
            </picture>
          ) : null}
          {state === 'ready' ? children : null}
        </div>
      </div>
    </div>
  );
}
