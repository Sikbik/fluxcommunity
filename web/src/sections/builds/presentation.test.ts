import { CATEGORIES, COMMUNITY_APPS, NODE_HOSTS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { PREVIEW_LQIP, PREVIEWS } from '@/content/art';
import { CATEGORY_GLYPH, FALLBACK_ART, POSITION, previewOf } from './presentation';

const appIds = new Set(COMMUNITY_APPS.map((a) => a.id));
const previewIds = new Set([...COMMUNITY_APPS.map((a) => a.id), ...NODE_HOSTS.map((h) => h.id)]);

describe('presentation', () => {
  it('has a glyph for every category, and no glyph for a category that is gone', () => {
    expect(Object.keys(CATEGORY_GLYPH).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });

  it('keys nothing by an app the catalog does not have', () => {
    for (const table of [POSITION, FALLBACK_ART]) {
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

  // Previews and their placeholders are written together by web/scripts/art-manifest.mjs, which every
  // capture run ends with. These guard the manifest against a hand edit or a half-finished run.
  it('has a placeholder for exactly the previews it has', () => {
    expect(Object.keys(PREVIEW_LQIP).sort()).toEqual(Object.keys(PREVIEWS).sort());
  });

  it('keeps placeholders tiny', () => {
    for (const [id, url] of Object.entries(PREVIEW_LQIP)) {
      expect(url, id).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/);
      expect(url.length, `${id} placeholder is not tiny`).toBeLessThan(300);
    }
  });

  it('keeps no preview for an app or host the catalog dropped', () => {
    for (const id of Object.keys(PREVIEWS)) {
      expect(previewIds.has(id), `${id} has a preview file but is not in the catalog`).toBe(true);
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
