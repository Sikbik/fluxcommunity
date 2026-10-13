import { describe, expect, it } from 'vitest';
import { latticeCellsSvg, mulberry32, svgToCssUrl } from './rng';

describe('mulberry32', () => {
  it('is deterministic per seed and spans 0..1', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 5 }, () => a());
    const ys = Array.from({ length: 5 }, () => b());
    expect(xs).toEqual(ys);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(8)()).not.toBe(mulberry32(7)());
  });
});

describe('latticeCellsSvg', () => {
  it('is deterministic and places the requested number of unique cells', () => {
    const a = latticeCellsSvg({ cols: 8, rows: 5, count: 14, seed: 3 });
    const b = latticeCellsSvg({ cols: 8, rows: 5, count: 14, seed: 3 });
    expect(a).toBe(b);
    expect((a.match(/<polygon/g) ?? []).length).toBe(14);
  });

  it('sizes the tile to whole pattern periods', () => {
    const svg = latticeCellsSvg({ cols: 4, rows: 2, count: 3, seed: 1 });
    expect(svg).toContain("width='221.72'");
    expect(svg).toContain("height='192'");
  });
});

describe('svgToCssUrl', () => {
  it('encodes angle brackets and hashes', () => {
    const url = svgToCssUrl("<svg fill='#fff'></svg>");
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(url).not.toContain('<');
    expect(url).not.toContain('#');
  });
});
