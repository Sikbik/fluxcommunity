import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = (p: string) => resolve(import.meta.dirname, p);
const LAYER_STATEMENT = /@layer\s+([a-z-]+(?:\s*,\s*[a-z-]+)+)\s*;/;

function order(source: string): string[] {
  const m = LAYER_STATEMENT.exec(source);
  if (!m?.[1]) throw new Error('no cascade layer order statement found');
  return m[1].split(',').map((s) => s.trim());
}

describe('cascade layer order', () => {
  // The production build splits CSS into chunks and links the first one (only the `ui` layer) before
  // the entry stylesheet. A layer's rank is fixed by its FIRST appearance in document order, so the
  // order must be declared in the HTML itself, before any stylesheet, or `base` ends up above `ui`
  // in the built app (no gutters, 17px headings) while dev looks fine.
  it('is declared in the inline <style> of index.html, before any stylesheet', () => {
    const html = readFileSync(here('../../index.html'), 'utf8');
    const inline = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(LAYER_STATEMENT.test(inline)).toBe(true);
    const styleAt = html.indexOf('<style>');
    const linkAt = html.indexOf('rel="stylesheet"');
    if (linkAt !== -1) expect(styleAt).toBeLessThan(linkAt);
  });

  it('matches the statement in tokens.css exactly', () => {
    const html = readFileSync(here('../../index.html'), 'utf8');
    const tokens = readFileSync(here('./tokens.css'), 'utf8');
    expect(order(html)).toEqual(order(tokens));
    expect(order(html)).toEqual(['reset', 'tokens', 'base', 'ui', 'section', 'utility']);
  });
});
