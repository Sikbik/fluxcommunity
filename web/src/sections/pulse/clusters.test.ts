import type { GeoPoint } from '@shared/api';
import { describe, expect, it } from 'vitest';
import {
  anchorCluster,
  buildClusters,
  clusterRadii,
  countFor,
  countryName,
  dominantTier,
  pickCluster,
  placeClusters,
  radiusScale,
  tierTotals,
} from './clusters';
import { makeView } from './projection';

const POINTS: GeoPoint[] = [
  { lat: 60.17, lon: 24.93, n: 984, t: [306, 165, 513], cc: 'FI' },
  { lat: 50.16, lon: 8.49, n: 535, t: [497, 38, 0], cc: 'DE' },
  { lat: 49.4, lon: 11.1, n: 347, t: [28, 146, 173], cc: 'DE' },
  { lat: 49.25, lon: -123.12, n: 128, t: [0, 105, 23], cc: 'CA' },
  { lat: 1.35, lon: 103.8, n: 1, t: [0, 0, 1] },
];

describe('dominantTier', () => {
  it('is the tier with the most nodes', () => {
    expect(dominantTier([497, 38, 0])).toBe('cumulus');
    expect(dominantTier([0, 105, 23])).toBe('nimbus');
    expect(dominantTier([306, 165, 513])).toBe('stratus');
  });

  it('breaks ties toward the rarer tier', () => {
    expect(dominantTier([5, 5, 0])).toBe('nimbus');
    expect(dominantTier([5, 5, 5])).toBe('stratus');
    expect(dominantTier([0, 3, 3])).toBe('stratus');
  });

  it('is the filter when one is active', () => {
    expect(dominantTier([497, 38, 0], 'nimbus')).toBe('nimbus');
  });
});

describe('countFor and buildClusters', () => {
  it('counts the filtered tier or all of them', () => {
    expect(countFor([306, 165, 513], 'all')).toBe(984);
    expect(countFor([306, 165, 513], 'cumulus')).toBe(306);
    expect(countFor([306, 165, 513], 'stratus')).toBe(513);
  });

  it('keeps every point for All, biggest first', () => {
    const c = buildClusters(POINTS, 'all');
    expect(c).toHaveLength(5);
    expect(c.map((x) => x.n)).toEqual([984, 535, 347, 128, 1]);
    expect(c[0]?.dominant).toBe('stratus');
    expect(c[0]?.cc).toBe('FI');
    expect(c[4]?.cc).toBeNull();
  });

  it('drops points with no nodes of the filtered tier and re-sizes the rest', () => {
    const c = buildClusters(POINTS, 'cumulus');
    expect(c.map((x) => x.index)).toEqual([1, 0, 2]);
    expect(c.map((x) => x.n)).toEqual([497, 306, 28]);
    expect(c.every((x) => x.dominant === 'cumulus')).toBe(true);
    // The unfiltered total stays available for the tooltip.
    expect(c[0]?.total).toBe(535);
  });

  it('ignores points with unusable coordinates', () => {
    const bad: GeoPoint[] = [{ lat: Number.NaN, lon: 5, n: 3, t: [3, 0, 0] }, ...POINTS];
    expect(buildClusters(bad, 'all')).toHaveLength(5);
  });

  it('sums located nodes per tier', () => {
    expect(tierTotals(POINTS)).toEqual({ cumulus: 831, nimbus: 454, stratus: 710 });
  });
});

describe('clusterRadii', () => {
  it('grows with the node count and is capped', () => {
    const one = clusterRadii(1);
    const hundred = clusterRadii(100);
    const huge = clusterRadii(100_000);
    expect(hundred.halo).toBeGreaterThan(one.halo);
    expect(hundred.core).toBeGreaterThan(one.core);
    expect(huge.halo).toBe(20);
    expect(huge.core).toBe(3.6);
  });

  it('scales with the map width', () => {
    expect(clusterRadii(100, 2).halo).toBeCloseTo(clusterRadii(100, 1).halo * 2, 6);
    expect(radiusScale(800)).toBe(1);
    expect(radiusScale(100)).toBe(0.42);
    expect(radiusScale(5000)).toBe(1.5);
  });
});

describe('placeClusters, pickCluster and anchorCluster', () => {
  const view = makeView(800, 320);
  const placed = placeClusters(buildClusters(POINTS, 'all'), view);

  it('projects every cluster inside the box', () => {
    for (const c of placed) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(800);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(320);
    }
  });

  it('picks the cluster under the pointer', () => {
    const fi = placed.find((c) => c.cc === 'FI');
    expect(fi).toBeDefined();
    const hit = pickCluster(placed, (fi?.x ?? 0) + 1, (fi?.y ?? 0) - 1);
    expect(hit?.cc).toBe('FI');
  });

  it('picks nothing in open water', () => {
    expect(pickCluster(placed, 20, 300)).toBeNull();
  });

  it('prefers the nearer of two overlapping clusters', () => {
    const de = placed.filter((c) => c.cc === 'DE');
    expect(de).toHaveLength(2);
    const [a, b] = de;
    const hit = pickCluster(placed, (a?.x ?? 0) + 0.2, a?.y ?? 0, 14);
    expect(hit?.index).toBe(a?.index);
    expect(b?.index).not.toBe(a?.index);
  });

  it('gives a one node cluster a usable hit area', () => {
    const lone = placed.find((c) => c.n === 1);
    expect(lone).toBeDefined();
    expect(pickCluster(placed, (lone?.x ?? 0) + 6, (lone?.y ?? 0) + 2)?.n).toBe(1);
  });

  it('anchors a country at its biggest cluster', () => {
    expect(anchorCluster(placed, 'DE')?.n).toBe(535);
    expect(anchorCluster(placed, 'XX')).toBeNull();
  });
});

describe('countryName', () => {
  it('looks a code up in the API country list', () => {
    const list = [
      { code: 'FI', name: 'Finland', nodes: 998, tiers: { cumulus: 315, nimbus: 170, stratus: 513 } },
    ];
    expect(countryName(list, 'FI')).toBe('Finland');
    expect(countryName(list, 'ZZ')).toBeNull();
    expect(countryName(list, null)).toBeNull();
  });
});
