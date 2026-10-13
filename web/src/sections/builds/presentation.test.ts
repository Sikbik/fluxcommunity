import { CATEGORIES, COMMUNITY_APPS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { PREVIEWS } from '@/content/art';
import { CATEGORY_GLYPH, FALLBACK_ART, LQIP, POSITION, previewOf } from './presentation';

const appIds = new Set(COMMUNITY_APPS.map((a) => a.id));

describe('presentation', () => {
  it('has a glyph for every category, and no glyph for a category that is gone', () => {
    expect(Object.keys(CATEGORY_GLYPH).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });

  it('keys nothing by an app the catalog does not have', () => {
    for (const table of [LQIP, POSITION, FALLBACK_ART]) {
      for (const id of Object.keys(table)) expect(appIds.has(id)).toBe(true);
    }
  });

  it('gives every app something to show: a capture, generated art, or the pattern', () => {
    for (const app of COMMUNITY_APPS) {
      const hasCapture = previewOf(app.id) !== null;
      const hasArt = FALLBACK_ART[app.id] !== undefined;
      // The pattern needs only the category glyph, which the first test covers.
      expect(hasCapture || hasArt || CATEGORY_GLYPH[app.category] !== undefined).toBe(true);
    }
  });

  it('keeps a soft placeholder for every captured preview', () => {
    for (const app of COMMUNITY_APPS) {
      if (!PREVIEWS[app.id]) continue;
      expect(previewOf(app.id)?.lqip, `${app.id} has a capture but no LQIP`).toMatch(
        /^data:image\/webp;base64,/,
      );
    }
  });

  it('prefers a capture to generated art', () => {
    for (const id of Object.keys(FALLBACK_ART)) {
      expect(PREVIEWS[id], `${id} has both a capture and fallback art`).toBeUndefined();
    }
  });

  it('describes a capture with its real size', () => {
    for (const app of COMMUNITY_APPS) {
      const p = previewOf(app.id);
      if (!p) continue;
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.src.startsWith('/')).toBe(true);
    }
  });
});
