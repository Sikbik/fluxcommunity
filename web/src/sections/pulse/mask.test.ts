import { describe, expect, it } from 'vitest';
import { LAND_MASK_HEIGHT, LAND_MASK_LAND_CELLS, LAND_MASK_WIDTH } from './land-mask.data';
import { decodeRuns, getLandMask, isLand, landCoverage } from './mask';

/** Encodes alternating run lengths (water first) as base64 LEB128, like the generator script does. */
function encode(runs: number[]): string {
  const bytes: number[] = [];
  for (const run of runs) {
    let v = run;
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v);
  }
  return btoa(String.fromCharCode(...bytes));
}

describe('decodeRuns', () => {
  it('decodes alternating runs starting with water', () => {
    const out = decodeRuns(encode([2, 3, 1, 2]), 4, 2);
    expect([...out]).toEqual([0, 0, 1, 1, 1, 0, 1, 1]);
  });

  it('starts with land when the first run is zero', () => {
    expect([...decodeRuns(encode([0, 4]), 2, 2)]).toEqual([1, 1, 1, 1]);
  });

  it('handles multi-byte varints', () => {
    const out = decodeRuns(encode([300, 200, 100]), 20, 30);
    expect(out.length).toBe(600);
    expect(out[299]).toBe(0);
    expect(out[300]).toBe(1);
    expect(out[499]).toBe(1);
    expect(out[500]).toBe(0);
  });

  it('throws when the data does not match the size', () => {
    expect(() => decodeRuns(encode([2, 3]), 4, 2)).toThrow();
    expect(() => decodeRuns(encode([20, 20]), 4, 2)).toThrow();
  });
});

describe('the generated world mask', () => {
  const mask = getLandMask();

  it('has the documented size and land count', () => {
    expect(mask.width).toBe(LAND_MASK_WIDTH);
    expect(mask.height).toBe(LAND_MASK_HEIGHT);
    expect(mask.cells.length).toBe(360 * 180);
    expect(mask.cells.reduce((a, b) => a + b, 0)).toBe(LAND_MASK_LAND_CELLS);
  });

  it('is shared between calls', () => {
    expect(getLandMask()).toBe(mask);
  });

  it('puts well known places on land', () => {
    const land: Array<[string, number, number]> = [
      ['Frankfurt', 8.7, 50.1],
      ['Chicago', -87.6, 41.9],
      ['Alice Springs', 133.9, -23.7],
      ['Nairobi', 36.8, -1.3],
      ['Sao Paulo', -46.6, -23.5],
      ['Beijing', 116.4, 39.9],
      ['Helsinki', 24.9, 60.2],
    ];
    for (const [name, lon, lat] of land) expect(isLand(mask, lon, lat), name).toBe(true);
  });

  it('puts oceans, seas and lakes on water', () => {
    const water: Array<[string, number, number]> = [
      ['mid Atlantic', -30, 0],
      ['mid Pacific', -150, 0],
      ['Indian Ocean', 80, -20],
      ['Bay of Bengal', 88, 14],
      ['Caspian Sea', 51, 41.5],
      ['Gulf of Guinea', 0, 0],
      ['Norwegian Sea', 2, 67],
    ];
    for (const [name, lon, lat] of water) expect(isLand(mask, lon, lat), name).toBe(false);
  });

  it('has no spurious land band along the Arctic coast (the antimeridian seam)', () => {
    // A bad unwrap fills the strip between 65 and 69 north across the whole width: open ocean must stay water.
    expect(isLand(mask, 5, 68)).toBe(false); // Norwegian Sea
    expect(isLand(mask, -30, 66.5)).toBe(false); // Denmark Strait
    expect(isLand(mask, -15, 68)).toBe(false); // Greenland Sea
  });

  it('keeps Chukotka on both sides of the antimeridian', () => {
    expect(isLand(mask, 178.5, 66.5)).toBe(true);
    expect(isLand(mask, -175.5, 66.5)).toBe(true);
  });

  it('wraps longitude and clamps latitude', () => {
    expect(isLand(mask, 188.7, 50.1)).toBe(isLand(mask, -171.3, 50.1));
    expect(isLand(mask, 8.7, 95)).toBe(isLand(mask, 8.7, 89.9));
  });

  it('land is between a quarter and 40 percent of the cells', () => {
    const share = LAND_MASK_LAND_CELLS / (360 * 180);
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.4);
  });
});

describe('landCoverage', () => {
  const mask = getLandMask();

  it('is 1 deep inside a continent and 0 in an open ocean', () => {
    expect(landCoverage(mask, 25, 55, 1.5, 1.5)).toBe(1);
    expect(landCoverage(mask, -140, 5, 2, 2)).toBe(0);
  });

  it('is fractional on a coast', () => {
    const c = landCoverage(mask, -9.5, 38.7, 3, 3); // Lisbon: the Atlantic coast of Iberia
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });
});
