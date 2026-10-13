import type { AppCategory } from '@shared/catalog';
import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import { ART } from '@/content/art';
import { cn } from '@/lib/cn';
import { Glyph } from '@/ui';
import styles from './Preview.module.css';
import { CATEGORY_GLYPH, FALLBACK_ART, previewOf } from './presentation';

export interface PreviewProps {
  id: string;
  category: AppCategory;
  /** Describes the screenshot for assistive tech. Omit when the name sits right next to it. */
  alt?: string;
  /** Load now instead of lazily (the drawer's hero image). */
  eager?: boolean;
  className?: string;
}

/**
 * The picture of an app: its captured screenshot, soft from a tiny placeholder until it loads; or,
 * where no capture exists, generated art blended with `screen`; or, failing that, the lattice
 * pattern with the category glyph. All three fill a 16:10 frame, so a card never shifts.
 */
export function Preview({ id, category, alt = '', eager = false, className }: PreviewProps) {
  const image = previewOf(id);
  const choice = FALLBACK_ART[id];
  const art = choice ? ART[choice.art] : undefined;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // A cached image can be complete before React attaches onLoad.
  const ref = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);

  if (image && !failed) {
    const style = { '--lqip': image.lqip ? `url("${image.lqip}")` : 'none' } as CSSProperties;
    return (
      <div
        className={cn('chamfer', styles.frame, className)}
        data-kind="image"
        data-loaded={loaded || undefined}
        style={style}
      >
        <img
          ref={ref}
          className={styles.img}
          src={image.src}
          width={image.width}
          height={image.height}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          style={{ objectPosition: image.position }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (art) {
    return (
      <div className={cn('chamfer', styles.frame, className)} data-kind="art" data-fit={choice?.fit}>
        <span className={styles.lattice} aria-hidden="true" />
        <picture>
          {art.avif ? <source type="image/avif" srcSet={art.avif} /> : null}
          <img
            className={styles.art}
            src={art.src}
            width={art.width}
            height={art.height}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
          />
        </picture>
      </div>
    );
  }

  return (
    <div className={cn('chamfer', styles.frame, className)} data-kind="pattern">
      <span className={styles.lattice} aria-hidden="true" />
      <span className={styles.emblem} aria-hidden="true">
        <Glyph name={CATEGORY_GLYPH[category]} size={56} strokeWidth={1.1} />
      </span>
    </div>
  );
}
