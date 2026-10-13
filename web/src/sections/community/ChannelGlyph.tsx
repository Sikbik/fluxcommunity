import type { CSSProperties } from 'react';
import { GLYPHS, type GlyphName, type GlyphShape } from '@/ui/Glyph/glyphs';
import styles from './channels.module.css';

/** The glyph for a catalog social id, or the generic link glyph for one the set does not know. */
export function channelGlyphName(id: string): GlyphName {
  return (id in GLYPHS ? id : 'link') as GlyphName;
}

export interface ChannelGlyphProps {
  /** Catalog social id: `discord`, `x`, `x-community`, `telegram`, `youtube`, `github`, `blog`. */
  id: string;
  size: number;
}

/**
 * The design system glyph of a channel, drawn from the same artwork (24 px grid, 1.5 px stroke, square
 * caps) but rendered here so each part can move on its own: strokes draw themselves in once, and every
 * channel has its own small gesture on hover (the CSS keys off `data-glyph` and the part order).
 * Decorative: the channel's name sits next to it.
 */
export function ChannelGlyph({ id, size }: ChannelGlyphProps) {
  const name = channelGlyphName(id);
  const shapes = GLYPHS[name] as readonly GlyphShape[];
  return (
    <svg
      className={styles.glyph}
      data-glyph={name}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit={4}
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, n) => {
        const style = { '--n': n } as CSSProperties;
        if (typeof shape === 'string') {
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of artwork parts
          return <path key={n} d={shape} pathLength={1} style={style} />;
        }
        if ('dot' in shape) {
          const [cx, cy, r] = shape.dot;
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of artwork parts
          return <circle key={n} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" style={style} />;
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of artwork parts
        return <path key={n} d={shape.fill} fill="currentColor" style={style} />;
      })}
    </svg>
  );
}
