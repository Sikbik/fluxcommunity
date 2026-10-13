import { describe, expect, it } from 'vitest';
import {
  axialToXZ,
  buildDisc,
  buildPrism,
  cellsWithin,
  discCentre,
  fogCutDistance,
  fogScaleFor,
  hexNumber,
  ringsForCount,
  SQRT3,
  visibleCount,
  xzToAxial,
} from './hexgrid';

describe('hex grid layout', () => {
  it('places neighbours one pitch apart', () => {
    const [x0, z0] = axialToXZ(0, 0);
    const pitch = SQRT3;
    const neighbours: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ];
    for (const [q, r] of neighbours) {
      const [x, z] = axialToXZ(q, r);
      expect(Math.hypot(x - x0, z - z0)).toBeCloseTo(pitch, 9);
    }
  });

  it('round trips axial and world coordinates', () => {
    for (let q = -12; q <= 12; q += 3) {
      for (let r = -12; r <= 12; r += 5) {
        const [x, z] = axialToXZ(q, r, 1.3);
        expect(xzToAxial(x, z, 1.3)).toEqual([q, r]);
        expect(xzToAxial(x + 0.1, z - 0.1, 1.3)).toEqual([q, r]);
      }
    }
  });

  it('counts a hexagonal disc', () => {
    expect(hexNumber(0)).toBe(1);
    expect(hexNumber(1)).toBe(7);
    expect(hexNumber(2)).toBe(19);
    expect(ringsForCount(7)).toBe(1);
    expect(ringsForCount(8)).toBe(2);
    expect(ringsForCount(6000)).toBe(45);
  });
});

describe('disc ordering and culling', () => {
  const disc = buildDisc(1500);

  it('builds exactly the requested count with no duplicates', () => {
    expect(disc.count).toBe(1500);
    const seen = new Set<string>();
    for (let i = 0; i < disc.count; i++) seen.add(`${disc.cells[i * 2]},${disc.cells[i * 2 + 1]}`);
    expect(seen.size).toBe(1500);
  });

  it('starts at the centre and is ordered by distance', () => {
    expect(disc.cells[0]).toBe(0);
    expect(disc.cells[1]).toBe(0);
    for (let i = 1; i < disc.count; i++)
      expect(disc.dist[i]!).toBeGreaterThanOrEqual(disc.dist[i - 1]! - 1e-6);
  });

  it('keeps the disc round: the outer radius matches the area of the count', () => {
    // Area of a cell is 3*sqrt(3)/2; a round disc of N cells has radius sqrt(N * cellArea / pi).
    const expected = Math.sqrt((1500 * 1.5 * SQRT3) / Math.PI);
    expect(disc.radius).toBeGreaterThan(expected * 0.97);
    expect(disc.radius).toBeLessThan(expected * 1.06);
  });

  it('counts the cells within a radius by binary search', () => {
    expect(cellsWithin(disc.dist, -1)).toBe(0);
    expect(cellsWithin(disc.dist, 0)).toBe(1);
    expect(cellsWithin(disc.dist, SQRT3 + 1e-3)).toBe(7);
    expect(cellsWithin(disc.dist, 1e6)).toBe(1500);
    const manual = Array.from(disc.dist).filter((d) => d <= 12).length;
    expect(cellsWithin(disc.dist, 12)).toBe(manual);
  });

  it('puts the disc centre ahead of the camera', () => {
    expect(discCentre(0, 0, 0, 30)).toEqual([0, -30].map((v) => v + 0) as [number, number]);
    const [x, z] = discCentre(5, 7, Math.PI / 2, 10);
    expect(x).toBeCloseTo(-5, 9);
    expect(z).toBeCloseTo(7, 9);
  });

  it('trims the draw count when the fog is denser and caps it at the tier budget', () => {
    const big = buildDisc(6000);
    const thin = visibleCount(big, 30, 10, 6000);
    const thick = visibleCount(big, 30, 20, 6000);
    expect(thin).toBeLessThan(thick);
    expect(visibleCount(big, 30, 200, 3500)).toBe(3500);
    expect(visibleCount(big, 30, 200, 99999)).toBe(6000);
    expect(fogCutDistance(10)).toBeGreaterThan(20);
  });

  it('chooses a fog scale that hides the disc edge', () => {
    const r = 60;
    const s = fogScaleFor(r, 25);
    const fogAtEdge = 1 - Math.exp(-(((r + 25 * 0.35) / s) ** 2));
    expect(fogAtEdge).toBeGreaterThan(0.98);
  });
});

describe('prism mesh', () => {
  const m = buildPrism({ radius: 0.94, bevel: 0.07, bevelDrop: 0.07, depth: 2 });

  it('has flat shaded faces: 54 vertices and 28 triangles', () => {
    expect(m.vertexCount).toBe(54);
    expect(m.index).toHaveLength(28 * 3);
    expect(m.position).toHaveLength(54 * 3);
    expect(m.normal).toHaveLength(54 * 3);
    expect(m.meta).toHaveLength(54 * 4);
  });

  it('keeps its top at y = 0 and its walls at the depth', () => {
    let maxY = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (let i = 0; i < m.vertexCount; i++) {
      maxY = Math.max(maxY, m.position[i * 3 + 1]!);
      minY = Math.min(minY, m.position[i * 3 + 1]!);
    }
    expect(maxY).toBe(0);
    expect(minY).toBe(-2);
  });

  it('has unit normals that agree with the triangle winding', () => {
    for (let i = 0; i < m.vertexCount; i++) {
      expect(Math.hypot(m.normal[i * 3]!, m.normal[i * 3 + 1]!, m.normal[i * 3 + 2]!)).toBeCloseTo(1, 5);
    }
    for (let t = 0; t < m.index.length; t += 3) {
      const [a, b, c] = [m.index[t]!, m.index[t + 1]!, m.index[t + 2]!];
      const p = (v: number, k: number) => m.position[v * 3 + k]!;
      const u = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)];
      const w = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
      const cross = [
        u[1]! * w[2]! - u[2]! * w[1]!,
        u[2]! * w[0]! - u[0]! * w[2]!,
        u[0]! * w[1]! - u[1]! * w[0]!,
      ];
      const n = [m.normal[a * 3]!, m.normal[a * 3 + 1]!, m.normal[a * 3 + 2]!];
      expect(cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!).toBeGreaterThan(0);
    }
  });

  it('fits inside its circumradius', () => {
    for (let i = 0; i < m.vertexCount; i++) {
      expect(Math.hypot(m.position[i * 3]!, m.position[i * 3 + 2]!)).toBeLessThanOrEqual(0.94 + 1e-6);
    }
  });
});
