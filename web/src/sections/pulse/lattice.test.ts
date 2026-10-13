import type { GeoPoint } from '@shared/api';
import { describe, expect, it } from 'vitest';
import { buildClusters, placeClusters } from './clusters';
import {
  buildLattice,
  LIT_BANDS,
  LIT_EDGES,
  lightGain,
  lightLattice,
  litBand,
  pickTwinklers,
  pitchFor,
} from './lattice';
import { getLandMask } from './mask';
import { latToY, lonToX, makeView } from './projection';

const view = makeView(800, 320);
const mask = getLandMask();

describe('buildLattice', () => {
  const lattice = buildLattice(view, mask);

  it('fills the box with a triangular lattice', () => {
    expect(lattice.count).toBe(lattice.cols * lattice.rows);
    expect(lattice.rowHeight).toBeCloseTo((lattice.pitch * Math.sqrt(3)) / 2, 6);
    for (let i = 0; i < lattice.count; i++) {
      expect(lattice.x[i]).toBeGreaterThanOrEqual(0);
      expect(lattice.x[i]).toBeLessThanOrEqual(view.width);
      expect(lattice.y[i]).toBeGreaterThanOrEqual(0);
      expect(lattice.y[i]).toBeLessThanOrEqual(view.height);
    }
  });

  it('offsets odd rows by half a pitch (hex geometry)', () => {
    const first = lattice.x[0] as number;
    const secondRowFirst = lattice.x[lattice.cols] as number;
    expect(secondRowFirst - first).toBeCloseTo(lattice.pitch / 2, 4);
    const thirdRowFirst = lattice.x[lattice.cols * 2] as number;
    expect(thirdRowFirst).toBeCloseTo(first, 4);
  });

  it('every nearest neighbour sits one pitch away', () => {
    const i = lattice.cols * 3 + 10;
    const here = [lattice.x[i] as number, lattice.y[i] as number];
    const neighbours = [
      i - 1,
      i + 1,
      i - lattice.cols,
      i + lattice.cols,
      i - lattice.cols + 1,
      i + lattice.cols + 1,
    ];
    const near = neighbours
      .map((j) => Math.hypot((lattice.x[j] as number) - here[0]!, (lattice.y[j] as number) - here[1]!))
      .filter((d) => Math.abs(d - lattice.pitch) < 0.01);
    // A lattice dot has six nearest neighbours, four of them in the neighbouring rows plus two in its own.
    expect(near.length).toBeGreaterThanOrEqual(4);
  });

  it('knows where the land is', () => {
    const at = (lon: number, lat: number) => {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      const x = lonToX(lon, view);
      const y = latToY(lat, view);
      for (let i = 0; i < lattice.count; i++) {
        const d = ((lattice.x[i] as number) - x) ** 2 + ((lattice.y[i] as number) - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return lattice.land[best] as number;
    };
    expect(at(25, 55)).toBeGreaterThan(0.9); // eastern Europe
    expect(at(-30, 0)).toBe(0); // the Atlantic
    expect(at(-100, 40)).toBeGreaterThan(0.9); // the US
  });

  it('about a third of the dots are land', () => {
    let land = 0;
    for (let i = 0; i < lattice.count; i++) if ((lattice.land[i] as number) >= 0.5) land++;
    const share = land / lattice.count;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.45);
  });

  it('keeps the dot pitch inside a legible range for any width', () => {
    expect(pitchFor(320)).toBeGreaterThanOrEqual(4.5);
    expect(pitchFor(5000)).toBeLessThanOrEqual(9);
  });
});

describe('lightLattice', () => {
  const lattice = buildLattice(view, mask);
  const points: GeoPoint[] = [
    { lat: 50.1, lon: 8.7, n: 500, t: [480, 20, 0], cc: 'DE' },
    { lat: 60.2, lon: 24.9, n: 300, t: [10, 20, 270], cc: 'FI' },
  ];
  const placed = placeClusters(buildClusters(points, 'all'), view);
  const light = lightLattice(lattice, placed);

  it('lights dots under a cluster and leaves the rest dark', () => {
    expect(light.lit).toBeGreaterThan(5);
    expect(light.lit).toBeLessThan(lattice.count / 4);
    const frankfurt = placed.find((c) => c.cc === 'DE');
    let nearest = 0;
    let nearestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < lattice.count; i++) {
      const d =
        ((lattice.x[i] as number) - (frankfurt?.x ?? 0)) ** 2 +
        ((lattice.y[i] as number) - (frankfurt?.y ?? 0)) ** 2;
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    }
    expect(light.level[nearest]).toBeGreaterThan(0.5);
    expect(light.level[0]).toBe(0);
  });

  it('tints a dot with the tier that lights it most', () => {
    const lightOf = (cc: string) => {
      const c = placed.find((p) => p.cc === cc);
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < lattice.count; i++) {
        const d =
          ((lattice.x[i] as number) - (c?.x ?? 0)) ** 2 + ((lattice.y[i] as number) - (c?.y ?? 0)) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return light.tier[best];
    };
    expect(lightOf('DE')).toBe(0); // cumulus
    expect(lightOf('FI')).toBe(2); // stratus
  });

  it('brightness stays within 0..1', () => {
    for (const v of light.level) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('no clusters, no light', () => {
    const dark = lightLattice(lattice, []);
    expect(dark.lit).toBe(0);
  });
});

describe('litBand and the lit bins', () => {
  it('maps brightness to bands, with no band below the first edge', () => {
    expect(litBand(0)).toBe(-1);
    expect(litBand(LIT_EDGES[0] - 0.001)).toBe(-1);
    expect(litBand(Number.NaN)).toBe(-1);
    expect(litBand(LIT_EDGES[0])).toBe(0);
    expect(litBand(0.3)).toBe(1);
    expect(litBand(0.5)).toBe(2);
    expect(litBand(0.8)).toBe(3);
    expect(litBand(0.95)).toBe(4);
    expect(litBand(1)).toBe(LIT_BANDS - 1);
  });

  it('every lit dot is listed exactly once, under its own tier and band', () => {
    const lattice = buildLattice(view, mask);
    const points: GeoPoint[] = [
      { lat: 50.1, lon: 8.7, n: 500, t: [480, 20, 0], cc: 'DE' },
      { lat: 60.2, lon: 24.9, n: 300, t: [10, 20, 270], cc: 'FI' },
      { lat: 40.7, lon: -74, n: 80, t: [10, 60, 10], cc: 'US' },
    ];
    const placed = placeClusters(buildClusters(points, 'all'), view);
    const light = lightLattice(lattice, placed);
    expect(light.bins).toHaveLength(3 * LIT_BANDS);
    const seen = new Set<number>();
    for (let slot = 0; slot < light.bins.length; slot++) {
      const tier = Math.floor(slot / LIT_BANDS);
      const band = slot % LIT_BANDS;
      for (const i of light.bins[slot] as Uint32Array) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
        expect(light.tier[i]).toBe(tier);
        expect(litBand(light.level[i] as number)).toBe(band);
      }
    }
    let expected = 0;
    for (let i = 0; i < lattice.count; i++) if (litBand(light.level[i] as number) >= 0) expected++;
    expect(seen.size).toBe(expected);
    expect(seen.size).toBeGreaterThan(0);
  });

  it('is empty with no clusters', () => {
    const lattice = buildLattice(view, mask);
    const dark = lightLattice(lattice, []);
    for (const list of dark.bins) expect(list.length).toBe(0);
  });
});

describe('lightGain', () => {
  it('is full on a wide map and a little less on a phone, never outside that range', () => {
    expect(lightGain(800)).toBe(1);
    expect(lightGain(2400)).toBe(1);
    expect(lightGain(320)).toBeCloseTo(0.72, 5);
    expect(lightGain(10)).toBeCloseTo(0.72, 5);
  });

  it('grows with the width', () => {
    let last = 0;
    for (const w of [320, 400, 500, 640, 800]) {
      const g = lightGain(w);
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
  });

  it('a smaller gain gives dimmer light for the same clusters', () => {
    const lattice = buildLattice(view, mask);
    const points: GeoPoint[] = [{ lat: 50, lon: 8.7, n: 30, t: [20, 5, 5], cc: 'DE' }];
    const placed = placeClusters(buildClusters(points, 'all'), view);
    const full = lightLattice(lattice, placed, 1);
    const quiet = lightLattice(lattice, placed, 0.5);
    let fullSum = 0;
    let quietSum = 0;
    for (let i = 0; i < full.level.length; i++) {
      fullSum += full.level[i] as number;
      quietSum += quiet.level[i] as number;
    }
    expect(quietSum).toBeLessThan(fullSum);
  });
});

describe('pickTwinklers', () => {
  it('picks a deterministic land-only subset', () => {
    const lattice = buildLattice(view, mask);
    let seed = 1;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const t = pickTwinklers(lattice, rand, 0.1);
    expect(t.index.length).toBeGreaterThan(10);
    expect(t.phase.length).toBe(t.index.length);
    for (const i of t.index) expect(lattice.land[i]).toBeGreaterThanOrEqual(0.5);
    expect(t.level.length).toBe(t.index.length);
  });
});
