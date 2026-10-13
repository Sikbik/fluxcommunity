import { describe, expect, it } from 'vitest';
import {
  bakeShardDistance,
  buildShards,
  cleanPolygon,
  MARK_ASPECT,
  parsePath,
  polygonSdf,
  RAW_SHARDS,
  SDF_EXTENT,
  SDF_RANGE,
  signedArea,
} from './mark';

describe('path parser', () => {
  it('reads relative, absolute and axis commands including packed numbers', () => {
    const pts = parsePath('M0,0l10,0v10H0L-5-5Z');
    expect(pts).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [-5, -5],
    ]);
  });

  it('splits numbers glued by a second decimal point and treats pairs after l as implicit l', () => {
    const pts = parsePath('M1,1l1.5.5,2-1');
    expect(pts).toEqual([
      [1, 1],
      [2.5, 1.5],
      [4.5, 0.5],
    ]);
  });
});

describe('the official shards', () => {
  const shards = buildShards();

  it('has the four shards in texture channel order', () => {
    expect(shards.map((s) => s.id)).toEqual(RAW_SHARDS.map((r) => r.id));
    expect(shards.map((s) => s.id)).toEqual(['bar', 'cap', 'hex', 'gem']);
  });

  it('is centred, 1 unit tall and the right aspect', () => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const s of shards) {
      for (const [x, y] of s.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    expect(maxY - minY).toBeCloseTo(1, 2);
    expect(maxX - minX).toBeCloseTo(MARK_ASPECT, 2);
    expect((minX + maxX) / 2).toBeCloseTo(0, 2);
    expect((minY + maxY) / 2).toBeCloseTo(0, 2);
  });

  it('keeps the symbol upright: the cap is on top, the bar at the bottom', () => {
    const by = Object.fromEntries(shards.map((s) => [s.id, s]));
    expect(by.cap!.centroid[1]).toBeGreaterThan(by.hex!.centroid[1]);
    expect(by.bar!.centroid[1]).toBeLessThan(by.gem!.centroid[1]);
    expect(by.gem!.centroid[0]).toBeLessThan(by.hex!.centroid[0]);
  });

  it('drops the vector export notches without changing the shapes', () => {
    const bar = shards.find((s) => s.id === 'bar')!;
    expect(bar.points).toHaveLength(4);
    const hex = shards.find((s) => s.id === 'hex')!;
    expect(hex.points).toHaveLength(6);
    const gem = shards.find((s) => s.id === 'gem')!;
    expect(gem.points).toHaveLength(6);
    const cap = shards.find((s) => s.id === 'cap')!;
    expect(cap.points.length).toBeGreaterThanOrEqual(8);
    for (const s of shards) expect(Math.abs(signedArea(s.points))).toBeGreaterThan(0.003);
  });

  it('never overlaps: shard interiors are disjoint', () => {
    for (let i = 0; i < shards.length; i++) {
      for (let j = i + 1; j < shards.length; j++) {
        for (const [x, y] of shards[i]!.points) {
          // A vertex of one shard must not sit well inside another.
          expect(polygonSdf(shards[j]!.points, x, y)).toBeLessThan(0.002);
        }
      }
    }
  });
});

describe('polygon helpers', () => {
  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  it('signs the distance inside and outside', () => {
    expect(polygonSdf(square, 0.5, 0.5)).toBeCloseTo(0.5, 9);
    expect(polygonSdf(square, 2, 0.5)).toBeCloseTo(-1, 9);
    expect(polygonSdf(square, 0.25, 0.5)).toBeCloseTo(0.25, 9);
  });

  it('removes collinear and duplicate points', () => {
    const noisy: [number, number][] = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 0.2],
      [1, 1],
      [0, 1],
    ];
    expect(cleanPolygon(noisy, 0.05, 3)).toHaveLength(4);
  });
});

describe('baked distance texture', () => {
  it('is zero outside every shard and rises inside', () => {
    const size = 64;
    const d = bakeShardDistance(size);
    expect(d).toHaveLength(size * size * 4);
    // Corner texel is far outside every shard.
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(0);
    // The centre of the big hexagon (x ~ +0.14, y ~ -0.08): sample the texel that maps there.
    const hex = buildShards().find((s) => s.id === 'hex')!;
    const [cx, cy] = hex.centroid;
    const ix = Math.floor(((cx / SDF_EXTENT.x + 1) / 2) * size);
    const iy = Math.floor(((cy / SDF_EXTENT.y + 1) / 2) * size);
    const o = (iy * size + ix) * 4 + 2;
    expect(d[o]).toBeGreaterThan(200);
    expect(SDF_RANGE).toBeGreaterThan(0);
  });
});
