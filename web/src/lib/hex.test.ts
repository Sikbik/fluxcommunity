import { describe, expect, it } from 'vitest';
import { hexPath, hexSegments, hexVertices, polylineBetween } from './hex';

describe('hexVertices', () => {
  it('is pointy-top and clockwise from the top vertex', () => {
    const v = hexVertices(0, 0, 10);
    expect(v).toHaveLength(6);
    expect(v[0]?.x).toBeCloseTo(0);
    expect(v[0]?.y).toBeCloseTo(-10);
    expect(v[1]?.x).toBeCloseTo(8.66, 1);
    expect(v[1]?.y).toBeCloseTo(-5);
    expect(v[3]?.y).toBeCloseTo(10);
  });
});

describe('hexPath', () => {
  it('closes the outline', () => {
    const d = hexPath(12, 12, 10);
    expect(d.startsWith('M12 2')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('polylineBetween', () => {
  const verts = hexVertices(0, 0, 10);

  it('returns the whole outline from 0 to 1', () => {
    const pts = polylineBetween(verts, 0, 1);
    expect(pts[0]).toEqual(expect.objectContaining({ x: expect.closeTo(0), y: expect.closeTo(-10) }));
    expect(pts.length).toBeGreaterThanOrEqual(7);
  });

  it('returns a single straight edge for one sixth', () => {
    const pts = polylineBetween(verts, 0, 1 / 6);
    expect(pts).toHaveLength(2);
  });

  it('returns nothing for an empty range', () => {
    expect(polylineBetween(verts, 0.5, 0.5)).toEqual([]);
  });
});

describe('hexSegments', () => {
  it('makes one path per segment', () => {
    const segs = hexSegments(12, 12, 10, 6);
    expect(segs).toHaveLength(6);
    for (const s of segs) expect(s.startsWith('M')).toBe(true);
  });
});
