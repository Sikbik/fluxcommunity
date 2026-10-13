import { describe, expect, it } from 'vitest';
import { API_DOCS_URL, buildResourceGroups, displayWhere } from './resources';

describe('displayWhere', () => {
  it('shows the host and the first path segment', () => {
    expect(displayWhere('https://docs.runonflux.com')).toBe('docs.runonflux.com');
    expect(displayWhere('https://docs.runonflux.com/fluxnodes/what-are-fluxnodes')).toBe(
      'docs.runonflux.com/fluxnodes',
    );
    expect(displayWhere('https://runonflux.com/blog/')).toBe('runonflux.com/blog');
    expect(displayWhere('https://www.youtube.com/@runonflux_official')).toBe(
      'youtube.com/@runonflux_official',
    );
  });

  it('hands back what it was given when it is not a URL', () => {
    expect(displayWhere('not a url')).toBe('not a url');
  });
});

/** An em dash or an en dash, written as code points so this file holds neither. */
const DASH = new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`);

describe('resource index', () => {
  const groups = buildResourceGroups();
  const items = groups.flatMap((g) => g.items);

  it('has the three groups, in order', () => {
    expect(groups.map((g) => g.title)).toEqual(['Start', 'Build', 'Go deeper']);
  });

  it('lists the seven resources the brief names, each once', () => {
    expect(items.map((r) => r.id).sort()).toEqual(
      ['academy', 'api-docs', 'blog', 'docs', 'github', 'run-a-node', 'youtube'].sort(),
    );
    expect(new Set(items.map((r) => r.url)).size).toBe(items.length);
  });

  it('only links to https destinations, including the API reference', () => {
    for (const r of items) expect(r.url.startsWith('https://')).toBe(true);
    expect(items.find((r) => r.id === 'api-docs')?.url).toBe(API_DOCS_URL);
  });

  it('keeps the words plain: no em dashes, no prices or promises', () => {
    for (const g of groups) {
      for (const text of [g.title, g.lead]) expect(text).not.toMatch(DASH);
    }
    for (const r of items) {
      expect(r.name).not.toMatch(DASH);
      expect(r.blurb).not.toMatch(DASH);
      expect(r.blurb).not.toMatch(/\$|price|pricing|uptime|guarantee|SLA\b/i);
      expect(r.blurb.length).toBeGreaterThan(10);
      expect(r.where.length).toBeGreaterThan(3);
    }
  });
});
