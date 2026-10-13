import type { SVGAttributes } from 'react';
import { type GlyphName, type GlyphShape, glyphShapes } from './glyphs';

export interface GlyphProps extends Omit<SVGAttributes<SVGSVGElement>, 'name' | 'children'> {
  name: GlyphName;
  /** Rendered size in px (the glyph is drawn on a 24 px grid). Default 20. */
  size?: number;
  /** Accessible name. Omit for decorative glyphs (they are hidden from assistive tech). */
  title?: string;
}

function renderShape(shape: GlyphShape, i: number) {
  if (typeof shape === 'string') return <path key={i} d={shape} />;
  if ('dot' in shape) {
    const [cx, cy, r] = shape.dot;
    return <circle key={i} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
  }
  return <path key={i} d={shape.fill} fill="currentColor" />;
}

/**
 * The custom glyph set. Colour follows `currentColor`; size is in px; `strokeWidth` is in
 * grid units (default 1.5).
 *
 *   <Glyph name="arrow-up-right" size={16} />
 *   <Glyph name="status-ok" title="Live" />
 */
export function Glyph({ name, size = 20, strokeWidth = 1.5, title, className, ...rest }: GlyphProps) {
  const shapes = glyphShapes(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit={4}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {shapes.map(renderShape)}
    </svg>
  );
}
