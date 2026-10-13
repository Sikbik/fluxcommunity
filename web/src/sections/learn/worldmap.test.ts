import { describe, expect, it } from 'vitest';
import {
  arcPoints,
  distanceKm,
  EXAMPLE_NODES,
  EXAMPLE_VISITOR,
  GRID_H,
  GRID_W,
  landDots,
  MAP_COLS,
  MAP_ROWS,
  nearestCell,
  nearestPlace,
  project,
} from './worldmap';

describe('landDots', () => {
  const land = landDots();

  it('decodes the baked mask', () => {
    expect(land.count).toBe(1806);
    expect(land.xy.length).toBe(1806 * 2);
  });

  it('keeps every dot inside the grid, on the half-offset lattice', () => {
    for (let i = 0; i < land.count; i++) {
      const x = land.xy[i * 2] as number;
      const y = land.xy[i * 2 + 1] as number;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThanOrEqual(GRID_W);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(GRID_H);
      const row = Math.floor(y);
      // Even rows sit on x = n + 0.5, odd rows on x = n + 1.
      expect(x - Math.floor(x)).toBeCloseTo(row % 2 ? 0 : 0.5, 5);
    }
  });

  it('is cached', () => {
    expect(landDots()).toBe(land);
  });

  it('has land where the continents are and sea where it should be', () => {
    const set = new Set<string>();
    for (let i = 0; i < land.count; i++) {
      set.add(`${land.xy[i * 2]},${land.xy[i * 2 + 1]}`);
    }
    const at = (lon: number, lat: number) => {
      const c = nearestCell(lon, lat);
      return set.has(`${c.x},${c.y}`);
    };
    expect(at(10, 50)).toBe(true); // Germany
    expect(at(-98, 39)).toBe(true); // the American midwest
    expect(at(25, 5)).toBe(true); // central Africa
    expect(at(135, -25)).toBe(true); // central Australia
    expect(at(-30, 30)).toBe(false); // the mid Atlantic
    expect(at(-150, 0)).toBe(false); // the Pacific
    expect(at(80, -40)).toBe(false); // the southern Indian Ocean
  });
});

describe('project', () => {
  it('maps the edges of the world to the edges of the grid', () => {
    expect(project(-180, 76)).toEqual({ x: 0, y: 0 });
    expect(project(180, -56)).toEqual({ x: MAP_COLS, y: MAP_ROWS });
  });

  it('puts the prime meridian and the equator where expected', () => {
    expect(project(0, 0).x).toBe(60);
    expect(project(0, 0).y).toBeCloseTo((76 / 132) * MAP_ROWS, 9);
  });
});

describe('nearestCell', () => {
  it('snaps to the centre of a dot', () => {
    const c = nearestCell(8.7, 50.1);
    const row = Math.floor(c.y);
    expect(c.y - row).toBe(0.5);
    expect(c.x - Math.floor(c.x)).toBeCloseTo(row % 2 ? 0 : 0.5, 9);
  });

  it('stays on the grid at the edges', () => {
    expect(nearestCell(-180, 90).y).toBe(0.5);
    expect(nearestCell(180, -90).y).toBe(MAP_ROWS - 0.5);
    expect(nearestCell(190, 0).x).toBeLessThanOrEqual(GRID_W);
  });
});

describe('distanceKm', () => {
  it('is zero for the same place and symmetric', () => {
    expect(distanceKm(10, 20, 10, 20)).toBe(0);
    expect(distanceKm(0, 0, 90, 0)).toBeCloseTo(distanceKm(90, 0, 0, 0), 6);
  });

  it('measures a quarter of the equator', () => {
    expect(distanceKm(0, 0, 90, 0)).toBeCloseTo((Math.PI / 2) * 6371, 0);
  });
});

describe('the example placement', () => {
  it('picks three different regions, then a replacement', () => {
    expect(EXAMPLE_NODES.map((n) => n.id)).toEqual(['fra', 'iad', 'sin', 'syd']);
    expect(new Set(EXAMPLE_NODES.map((n) => n.region)).size).toBe(4);
  });

  it('keeps every node on the map', () => {
    for (const n of EXAMPLE_NODES) {
      const p = project(n.lon, n.lat);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP_COLS);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(MAP_ROWS);
    }
  });

  it('serves the visitor from Virginia, then Frankfurt once Virginia is gone', () => {
    const first = nearestPlace(EXAMPLE_VISITOR, EXAMPLE_NODES.slice(0, 3));
    expect(EXAMPLE_NODES[first]?.id).toBe('iad');
    const iad = EXAMPLE_NODES.findIndex((n) => n.id === 'iad');
    const second = nearestPlace(EXAMPLE_VISITOR, EXAMPLE_NODES.slice(0, 3), new Set([iad]));
    expect(EXAMPLE_NODES[second]?.id).toBe('fra');
  });

  it('is -1 when nothing is left to choose', () => {
    expect(nearestPlace(EXAMPLE_VISITOR, [], new Set())).toBe(-1);
    expect(nearestPlace(EXAMPLE_VISITOR, [EXAMPLE_NODES[0]!], new Set([0]))).toBe(-1);
  });
});

describe('arcPoints', () => {
  it('starts and ends on its endpoints', () => {
    const out = new Float32Array(2 * 16);
    expect(arcPoints(10, 100, 210, 100, 0.25, out)).toBe(16);
    expect(out[0]).toBeCloseTo(10, 4);
    expect(out[1]).toBeCloseTo(100, 4);
    expect(out[30]).toBeCloseTo(210, 4);
    expect(out[31]).toBeCloseTo(100, 4);
  });

  it('bows toward the top of the screen whichever way it runs', () => {
    const a = new Float32Array(2 * 9);
    const b = new Float32Array(2 * 9);
    arcPoints(0, 100, 200, 100, 0.3, a);
    arcPoints(200, 100, 0, 100, 0.3, b);
    expect(a[9] as number).toBeLessThan(100);
    expect(b[9] as number).toBeLessThan(100);
    arcPoints(50, 0, 50, 200, 0.3, a); // straight down
    const mid = a[9 * 2 - 10] as number; // x of the middle point
    expect(Number.isFinite(mid)).toBe(true);
  });

  it('is a straight line with no bulge', () => {
    const out = new Float32Array(2 * 5);
    arcPoints(0, 0, 100, 0, 0, out);
    for (let i = 0; i < 5; i++) {
      expect(out[i * 2 + 1]).toBeCloseTo(0, 5);
      expect(out[i * 2]).toBeCloseTo(i * 25, 4);
    }
  });
});
