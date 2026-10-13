/**
 * Presentation extras for the builds section, keyed by catalog id. The catalog keeps the facts; this
 * keeps how they look: the category glyphs, which generated art stands in for an app whose preview
 * could not be captured, and where a preview is cropped. The placeholder shown under a preview while it
 * loads is not kept here: it is generated with the preview itself (PREVIEW_LQIP in content/art.ts).
 */
import type { AppCategory } from '@shared/catalog';
import { type ArtId, PREVIEW_LQIP, PREVIEWS } from '@/content/art';
import type { GlyphName } from '@/ui/Glyph/glyphs';

/** App categories are glyph names too (ui/Glyph/glyphs.ts, group "App categories"). */
export const CATEGORY_GLYPH: Readonly<Record<AppCategory, GlyphName>> = {
  network: 'network',
  nodes: 'nodes',
  rewards: 'rewards',
  onboarding: 'onboarding',
  education: 'education',
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
    lqip: PREVIEW_LQIP[id] ?? null,
    position: POSITION[id] ?? 'center top',
  };
}
