import { describe, expect, it } from 'vitest';
import { lengthInside, placeTargetLabel } from './labelPlacement';

const BOX = { x0: 0, y0: 0, x1: 10, y1: 10 };

/** n points across the plot, y from a function of the fraction along (plot units, y down). */
function series(n: number, y: (t: number) => number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return [t * 100, y(t)] as [number, number];
  });
}

const base = { width: 300, height: 48, labelWidth: 28, labelHeight: 10 };

describe('lengthInside', () => {
  it('measures the part of a segment that is inside the box', () => {
    expect(lengthInside(BOX, -5, 5, 15, 5)).toBeCloseTo(10);
    expect(lengthInside(BOX, 2, 2, 6, 5)).toBeCloseTo(5);
    expect(lengthInside(BOX, 20, 20, 30, 30)).toBe(0);
    expect(lengthInside(BOX, 0, -5, 10, -5)).toBe(0);
  });

  it('handles axis-parallel segments on and off the edge', () => {
    expect(lengthInside(BOX, 5, -5, 5, 15)).toBeCloseTo(10);
    expect(lengthInside(BOX, 11, -5, 11, 15)).toBe(0);
  });
});

describe('placeTargetLabel', () => {
  it('keeps the caption at the start, above, when the series stays away from it', () => {
    // The caption is above the target line, so a series that lives below it stays clear.
    const p = placeTargetLabel({ ...base, points: series(30, () => 85), ty: 50 });
    expect(p).toMatchObject({ side: 'start', edge: 'above', overlap: 0 });
  });

  it('moves below when the series passes through the spot above the line', () => {
    const p = placeTargetLabel({ ...base, points: series(30, () => 36), ty: 50 });
    expect(p.edge).toBe('below');
    expect(p.overlap).toBe(0);
  });

  it('moves to the end when only the start is crowded', () => {
    // Data hugs the line on the left (both sides of it), then drops well away to the right.
    const p = placeTargetLabel({
      ...base,
      points: series(40, (t) => (t < 0.35 ? 50 + Math.sin(t * 90) * 8 : 95)),
      ty: 50,
    });
    expect(p.side).toBe('end');
    expect(p.overlap).toBe(0);
  });

  it('keeps the caption off the newest point, which wears the marker', () => {
    // A vertical stroke near the start crosses both start spots (14 px of line each). The final
    // segment brushes the end-above spot with 2 px of line, but the marker sits in it, so the
    // start is still the better place.
    const p = placeTargetLabel({
      ...base,
      points: [
        [3, 5],
        [3, 95],
        [97, 95],
        [100, 60],
      ],
      ty: 60,
    });
    expect(p.side).toBe('start');
    expect(p.overlap).toBeCloseTo(14, 0);
  });

  it('flips below when the target is too close to the top for the caption to fit above', () => {
    const p = placeTargetLabel({ ...base, points: series(30, () => 90), ty: 4 });
    expect(p.edge).toBe('below');
  });

  it('flips above when the target is too close to the bottom for the caption to fit below', () => {
    // The start-above spot is crossed by the series, the start-below spot would leave the plot.
    const p = placeTargetLabel({ ...base, points: series(30, () => 80), ty: 96 });
    expect(p.edge).toBe('above');
  });

  it('still answers when every spot is crowded: the one with the least data through it', () => {
    const wave = series(60, (t) => 50 + Math.sin(t * 30) * 30);
    const p = placeTargetLabel({ ...base, points: wave, ty: 50 });
    expect(Number.isFinite(p.overlap)).toBe(true);
    expect(['start', 'end']).toContain(p.side);
    expect(['above', 'below']).toContain(p.edge);
  });

  it('copes with a single point and with no points', () => {
    expect(placeTargetLabel({ ...base, points: [[50, 30]], ty: 50 })).toMatchObject({
      side: 'start',
      edge: 'above',
    });
    expect(placeTargetLabel({ ...base, points: [], ty: 50 })).toMatchObject({ side: 'start', edge: 'above' });
  });
});
