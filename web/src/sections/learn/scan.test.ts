import { describe, expect, it } from 'vitest';
import {
  cellFresh,
  cellLight,
  consideredLight,
  linePosition,
  lineVisibility,
  SCAN_FRESH,
  SCAN_OVERSHOOT,
  SCAN_RISE,
} from './scan';

const CELLS = [0, 0.04, 0.2, 0.37, 0.5, 0.71, 0.9, 0.999];

describe('the scan line', () => {
  it('starts outside the left edge and ends outside the right edge', () => {
    expect(linePosition(0)).toBeCloseTo(-SCAN_OVERSHOOT, 9);
    expect(linePosition(1)).toBeCloseTo(1 + SCAN_OVERSHOOT, 9);
    expect(linePosition(0.5)).toBeCloseTo(0.5, 9);
  });

  it('moves at a constant speed and is clamped', () => {
    expect(linePosition(-3)).toBe(linePosition(0));
    expect(linePosition(9)).toBe(linePosition(1));
    const a = linePosition(0.2);
    const b = linePosition(0.3);
    const c = linePosition(0.4);
    expect(b - a).toBeCloseTo(c - b, 9);
  });

  it('is invisible at the edges and fully there across the middle', () => {
    expect(lineVisibility(0)).toBeCloseTo(0, 9);
    expect(lineVisibility(1)).toBeCloseTo(0, 9);
    expect(lineVisibility(0.5)).toBe(1);
    for (let i = 0; i <= 100; i++) {
      const v = lineVisibility(i / 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('a cell lighting as the line crosses it', () => {
  it('is dark until the line reaches it', () => {
    expect(cellLight(0, 0.3)).toBe(0);
    expect(cellLight(0.2, 0.9)).toBe(0);
  });

  it('is fully lit once the line has gone past, and stays lit', () => {
    for (const at of CELLS) {
      expect(cellLight(1, at)).toBe(1);
    }
    // 0.5 of the way along puts the line at 0.5 of the map: a cell at 0.2 is long since lit.
    expect(cellLight(0.5, 0.2)).toBe(1);
  });

  it('only ever rises as the scan advances: no flicker, no blink', () => {
    for (const at of CELLS) {
      let prev = 0;
      for (let i = 0; i <= 400; i++) {
        const v = cellLight(i / 400, at);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        prev = v;
      }
    }
  });

  it('lights the cells in the order the line meets them', () => {
    // At any moment, a cell further along is never brighter than one the line met earlier.
    for (let i = 0; i <= 100; i++) {
      const scan = i / 100;
      let prev = 1;
      for (const at of CELLS) {
        const v = cellLight(scan, at);
        expect(v).toBeLessThanOrEqual(prev + 1e-12);
        prev = v;
      }
    }
  });

  it('rises over a short stretch after the crossing, not instantly', () => {
    const at = 0.4;
    // Find the scan at which the line is exactly on the cell, then half a rise later.
    const scanAt = (pos: number) => (pos + SCAN_OVERSHOOT) / (1 + 2 * SCAN_OVERSHOOT);
    expect(cellLight(scanAt(at), at)).toBeCloseTo(0, 9);
    const half = cellLight(scanAt(at + SCAN_RISE / 2), at);
    expect(half).toBeGreaterThan(0.5);
    expect(half).toBeLessThan(1);
    expect(cellLight(scanAt(at + SCAN_RISE), at)).toBeCloseTo(1, 9);
  });
});

describe('the highlight as the line touches a cell', () => {
  it('is nothing before the line, a single smooth hump after it, then nothing', () => {
    const at = 0.4;
    const scanAt = (pos: number) => (pos + SCAN_OVERSHOOT) / (1 + 2 * SCAN_OVERSHOOT);
    expect(cellFresh(scanAt(at - 0.05), at)).toBe(0);
    expect(cellFresh(scanAt(at), at)).toBeCloseTo(0, 9);
    expect(cellFresh(scanAt(at + SCAN_FRESH), at)).toBeCloseTo(0, 9);
    expect(cellFresh(1, 0)).toBe(0);

    // One hump: it rises, peaks, falls, and never rises again.
    let rising = true;
    let prev = 0;
    let peaks = 0;
    for (let i = 0; i <= 600; i++) {
      const v = cellFresh(i / 600, at);
      if (rising && v < prev - 1e-9) {
        rising = false;
        peaks++;
      } else if (!rising && v > prev + 1e-9) {
        peaks++;
        rising = true;
      }
      prev = v;
    }
    expect(peaks).toBe(1);
  });

  it('stays within 0..1 and never exceeds the cell light it rides on', () => {
    for (const at of CELLS) {
      for (let i = 0; i <= 200; i++) {
        const scan = i / 200;
        const f = cellFresh(scan, at);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(cellLight(scan, at) + 1e-12);
      }
    }
  });
});

describe('the cells that were only considered', () => {
  it('keep their light until the settle starts, then fall steadily to nothing', () => {
    expect(consideredLight(1, 0)).toBe(1);
    expect(consideredLight(1, 1)).toBe(0);
    let prev = 1;
    for (let i = 0; i <= 50; i++) {
      const v = consideredLight(1, i / 50);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it('are not brighter than they were lit', () => {
    expect(consideredLight(0.4, 0.3)).toBeLessThanOrEqual(0.4);
    expect(consideredLight(0, 0.3)).toBe(0);
  });
});
