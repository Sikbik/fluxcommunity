import { describe, expect, it } from 'vitest';
import {
  canvasHeight,
  cardMetrics,
  cellToPx,
  computeLayout,
  lerpRect,
  type Rect,
  ROW_STRETCH,
  TALL_BELOW,
} from './layout';
import { GRID_H, GRID_W } from './worldmap';

function inside(r: Rect, w: number, h: number): boolean {
  return r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= w + 0.01 && r.y + r.h <= h + 0.01;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('canvasHeight', () => {
  it('is 16:9 when wide and portrait when narrow', () => {
    expect(canvasHeight(1280)).toBe(720);
    expect(canvasHeight(TALL_BELOW)).toBe(360);
    expect(canvasHeight(360)).toBe(461);
    // Narrow canvases are portrait: taller than 16:9 would be at the same width.
    expect(canvasHeight(600)).toBeGreaterThan((600 * 9) / 16);
  });
});

describe.each([320, 360, 390, 480, 639, 640, 720, 1000, 1200, 1280, 1520])('layout at %i px', (w) => {
  const l = computeLayout(w);

  it('picks the right mode', () => {
    expect(l.mode).toBe(w < TALL_BELOW ? 'tall' : 'wide');
    expect(l.h).toBe(canvasHeight(w));
  });

  it('keeps every region on the canvas', () => {
    for (const r of [l.cardCentre, l.cardDocked, l.map, l.address]) {
      expect(inside(r, l.w, l.h)).toBe(true);
    }
  });

  it('never lets the docked card cover the map', () => {
    expect(overlaps(l.cardDocked, l.map)).toBe(false);
  });

  it('sizes the map to whole dot pitches', () => {
    expect(l.map.w).toBeCloseTo(l.pitch * GRID_W, 6);
    expect(l.pitchY).toBeCloseTo(l.pitch * ROW_STRETCH, 6);
    expect(l.map.h).toBeCloseTo(l.pitchY * GRID_H, 6);
  });

  it('leaves text a readable size', () => {
    expect(l.fs).toBeGreaterThanOrEqual(11);
    expect(l.fs).toBeLessThanOrEqual(18);
  });

  it('gives the spec card its natural height, or all that fits', () => {
    const want = cardMetrics(l.fs).height;
    expect(l.cardCentre.h).toBeCloseTo(Math.min(want, l.h - l.pad * 2), 6);
    if (l.mode === 'wide') expect(l.cardDocked.h).toBeCloseTo(l.cardCentre.h, 6);
  });

  it('launches the deploy lines from the docked card', () => {
    const a = l.anchor;
    expect(a.x).toBeGreaterThanOrEqual(l.cardDocked.x - 0.01);
    expect(a.x).toBeLessThanOrEqual(l.cardDocked.x + l.cardDocked.w + 0.01);
    expect(a.y).toBeGreaterThanOrEqual(l.cardDocked.y - 0.01);
    expect(a.y).toBeLessThanOrEqual(l.cardDocked.y + l.cardDocked.h + 0.01);
  });
});

describe('a wide canvas that is shorter than 16:9', () => {
  it.each([
    [1236, 628],
    [1236, 480],
    [900, 480],
    [640, 480],
  ])('keeps every region on a %i x %i canvas', (w, h) => {
    const l = computeLayout(w, h);
    expect(l.mode).toBe('wide');
    expect(l.h).toBe(h);
    for (const r of [l.cardCentre, l.cardDocked, l.map, l.address]) {
      expect(inside(r, l.w, l.h)).toBe(true);
    }
    expect(overlaps(l.cardDocked, l.map)).toBe(false);
    expect(l.address.y + l.address.h).toBeLessThanOrEqual(l.map.y);
  });
});

describe('helpers', () => {
  it('blends rects', () => {
    const out: Rect = { x: 0, y: 0, w: 0, h: 0 };
    lerpRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 50, w: 200, h: 0 }, 0.5, out);
    expect(out).toEqual({ x: 50, y: 25, w: 150, h: 50 });
  });

  it('places a grid cell on the map', () => {
    const l = computeLayout(1200);
    const p = cellToPx(l, 0, 0);
    expect(p).toEqual({ x: l.map.x, y: l.map.y });
    const q = cellToPx(l, GRID_W, GRID_H);
    expect(q.x).toBeCloseTo(l.map.x + l.map.w, 6);
    expect(q.y).toBeCloseTo(l.map.y + l.map.h, 6);
  });
});
