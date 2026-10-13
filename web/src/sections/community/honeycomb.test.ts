import { describe, expect, it } from 'vitest';
import { flowerLayout, HEX_ASPECT, hexSeparation, type Layout, SLOT_COUNT, zigzagLayout } from './honeycomb';

/** A stable string for a coordinate: rounded, and never "-0". */
const fix = (n: number, digits = 4) => (Math.round(n * 10 ** digits) / 10 ** digits + 0).toFixed(digits);

const LAYOUTS: Array<[string, (o?: { big?: number; gap?: number }) => Layout]> = [
  ['flower', flowerLayout],
  ['zigzag', zigzagLayout],
];

describe.each(LAYOUTS)('%s layout', (_name, make) => {
  it('has seven slots with the primary first and largest', () => {
    const l = make();
    expect(l.slots).toHaveLength(SLOT_COUNT);
    const [primary, ...rest] = l.slots;
    for (const s of rest) expect(primary?.w ?? 0).toBeGreaterThan(s.w);
  });

  it('never lets two cells overlap, and neighbours are separated by about the gap', () => {
    for (const gap of [0, 0.05, 0.12]) {
      const l = make({ gap });
      const w = 1 / (1 + gap);
      let touching = 0;
      for (let i = 0; i < l.slots.length; i++) {
        for (let j = i + 1; j < l.slots.length; j++) {
          const a = l.slots[i]!;
          const b = l.slots[j]!;
          const sep = hexSeparation(a, b);
          expect(sep).toBeGreaterThanOrEqual(-1e-9);
          // Same-size neighbours that touch are exactly `gap * w` apart.
          if (Math.abs(sep - gap * w) < 1e-6) touching += 1;
        }
      }
      expect(touching).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps every cell inside the reported box, which is tight on all four sides', () => {
    const l = make();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const s of l.slots) {
      minX = Math.min(minX, s.x - s.w / 2);
      maxX = Math.max(maxX, s.x + s.w / 2);
      minY = Math.min(minY, s.y - (s.w * HEX_ASPECT) / 2);
      maxY = Math.max(maxY, s.y + (s.w * HEX_ASPECT) / 2);
    }
    expect(minX).toBeCloseTo(-l.width / 2, 6);
    expect(maxX).toBeCloseTo(l.width / 2, 6);
    expect(minY).toBeCloseTo(-l.height / 2, 6);
    expect(maxY).toBeCloseTo(l.height / 2, 6);
  });
});

describe('flower layout', () => {
  it('puts the primary at the centre and the ring at one distance from it', () => {
    const l = flowerLayout({ big: 1.3, gap: 0.05 });
    const [primary, ...ring] = l.slots;
    expect(primary?.x).toBeCloseTo(0, 9);
    expect(primary?.y).toBeCloseTo(0, 9);
    const radii = ring.map((s) => Math.hypot(s.x, s.y));
    for (const r of radii) expect(r).toBeCloseTo(radii[0] ?? 0, 9);
  });

  it('is mirror symmetric left to right and top to bottom', () => {
    const l = flowerLayout();
    const key = (n: number) => fix(n, 6);
    const set = new Set(l.slots.map((s) => `${key(s.x)},${key(s.y)}`));
    for (const s of l.slots) {
      expect(set.has(`${key(-s.x)},${key(s.y)}`)).toBe(true);
      expect(set.has(`${key(s.x)},${key(-s.y)}`)).toBe(true);
    }
  });

  it('is rows of two, three and two', () => {
    const l = flowerLayout();
    const rows = new Map<string, number>();
    for (const s of l.slots) rows.set(fix(s.y), (rows.get(fix(s.y)) ?? 0) + 1);
    expect([...rows.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, n]) => n)).toEqual([
      2, 3, 2,
    ]);
  });
});

describe('zigzag layout', () => {
  it('is a honeycomb two cells wide', () => {
    const l = zigzagLayout({ big: 1.3, gap: 0.05 });
    // Two cells side by side plus the half cell of the stagger: a little under two pitches.
    expect(l.width).toBeGreaterThan(1.8);
    expect(l.width).toBeLessThan(2.1);
    const rows = new Map<string, number>();
    for (const s of l.slots) rows.set(fix(s.y), (rows.get(fix(s.y)) ?? 0) + 1);
    expect([...rows.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, n]) => n)).toEqual([
      1, 2, 1, 2, 1,
    ]);
  });
});
