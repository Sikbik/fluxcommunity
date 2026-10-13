/**
 * Presentation extras for the builds section, keyed by catalog id. The catalog keeps the facts; this
 * keeps how they look: the category glyphs, the placeholders under a preview while it loads, and which
 * generated art stands in for an app whose preview could not be captured.
 */
import type { AppCategory } from '@shared/catalog';
import { type ArtId, PREVIEWS } from '@/content/art';
import type { GlyphName } from '@/ui/Glyph/glyphs';

/** App categories are glyph names too (ui/Glyph/glyphs.ts, group "App categories"). */
export const CATEGORY_GLYPH: Readonly<Record<AppCategory, GlyphName>> = {
  network: 'network',
  nodes: 'nodes',
  rewards: 'rewards',
  onboarding: 'onboarding',
  education: 'education',
};

/**
 * 16x10 WebP thumbnails of each captured preview (about 80 bytes each), shown soft under the real
 * image while it loads. Regenerate with ImageMagick:
 *   magick <id>.webp -resize 16x10! -quality 35 -define webp:method=6 out.webp
 */
export const LQIP: Readonly<Record<string, string>> = {
  academy:
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAACQAQCdASoQAAoAA8BgJY1efRgAiwAA/vA+x4l6u35zFZJu6WXSpm1GXSM3Uie7yRK69JYA',
  atlas:
    'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAACwAQCdASoQAAoAA8BgJZwAAvqvoIAAAP73qLbUH1qs8qdPYU7Gei97urZ3wCBAAAA=',
  claimcalc:
    'data:image/webp;base64,UklGRjAAAABXRUJQVlA4ICQAAAAwAQCdASoQAAoAA8BgJYwAA3AA/vEOSvfAJ7+ZUZ3bJ2GAAAA=',
  'flux-tools-hub':
    'data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAABwAQCdASoQAAoAA8BgJYwCdAIHgAD+8VbJMozS9lZLse4B44AAAA==',
  'flux-view':
    'data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAADwAQCdASoQAAoAA8BgJZwAAxbLYGpO7wAA/vaknJx89mMgjfVM4/ulHM+RTbpTzO7s4Il4AAA=',
  fluxtracker:
    'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoQAAoAA8BgJQBOgB6Vg1MAAP7s4V/YE4+4NIFBbnSWDzJ4RNLhgAAA',
  noxide:
    'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAABQAQCdASoQAAoAA8BgJZwABAAAAP7xDlUI3+Koh0Lx7gwaJzkCYzSFcOVhAAAA',
};

/** Previews of sparse pages look best anchored to the top of the frame. */
export const POSITION: Readonly<Record<string, string>> = {
  'flux-tools-hub': 'center top',
  claimcalc: 'center top',
};

/**
 * Generated art for apps with no usable screenshot (the site answered 503, its home page is an empty
 * cover block, or it is this very page). The pieces are emissive light on black: composite with `screen`.
 */
export interface ArtChoice {
  art: ArtId;
  /** `contain` keeps a whole object in frame; `cover` suits a wide horizon piece. */
  fit: 'contain' | 'cover';
}

export const FALLBACK_ART: Readonly<Record<string, ArtChoice>> = {
  // This site has no screenshot of itself: the lattice horizon is its portrait.
  community: { art: 'gateway-site', fit: 'cover' },
};

export interface PreviewImage {
  src: string;
  width: number;
  height: number;
  /** A tiny data URL to show soft while the image loads. */
  lqip: string | null;
  /** CSS object-position for a cover crop. */
  position: string;
}

/** The captured preview of an app, or null (use generated art, then a procedural pattern). */
export function previewOf(id: string): PreviewImage | null {
  const p = PREVIEWS[id];
  if (!p) return null;
  return {
    src: p.src,
    width: p.width,
    height: p.height,
    lqip: LQIP[id] ?? null,
    position: POSITION[id] ?? 'center top',
  };
}
