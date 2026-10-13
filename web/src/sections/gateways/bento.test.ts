import { GATEWAYS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { GATEWAY_ART } from '@/content/art';
import {
  BENTO_DESKTOP_MIN,
  type BentoLayout,
  DOM_ORDER,
  LAYOUTS,
  type LayoutName,
  layoutNameFor,
  placementFor,
  readingOrder,
  validateLayout,
} from './bento';

const catalogIds = GATEWAYS.map((g) => g.id);
const names = Object.keys(LAYOUTS) as LayoutName[];

describe('bento layouts', () => {
  it('the catalog and the DOM order name the same gateways', () => {
    expect([...DOM_ORDER].sort()).toEqual([...catalogIds].sort());
  });

  it('every gateway has generated art', () => {
    for (const id of catalogIds) expect(GATEWAY_ART[id], id).toBeTruthy();
  });

  for (const name of names) {
    const layout = LAYOUTS[name];

    it(`${name}: is a perfect tiling (no overlap, no hole, nothing out of bounds)`, () => {
      expect(validateLayout(layout, catalogIds)).toEqual([]);
    });

    it(`${name}: DOM order is the visual reading order`, () => {
      expect(readingOrder(layout)).toEqual([...DOM_ORDER]);
    });
  }

  it('the hero is FluxCloud at 2x2 units on desktop (6 columns by 4 sub-rows)', () => {
    const cloud = placementFor(LAYOUTS.desktop, 'cloud');
    expect(cloud).toMatchObject({ colSpan: 6, rowSpan: 4, form: 'hero' });
    for (const other of LAYOUTS.desktop.placements) {
      if (other.id === 'cloud') continue;
      expect(other.colSpan * other.rowSpan).toBeLessThan(cloud!.colSpan * cloud!.rowSpan);
    }
  });

  it('desktop has an irregular rhythm: wide, tall and strip forms all appear', () => {
    const forms = new Set(LAYOUTS.desktop.placements.map((x) => x.form));
    for (const f of ['hero', 'wide', 'tall', 'compact', 'strip']) expect(forms.has(f as never)).toBe(true);
  });

  it('wallets are the quiet tiles: the smallest on every layout', () => {
    for (const name of names) {
      const layout = LAYOUTS[name];
      const area = (id: string) => {
        const pl = placementFor(layout, id)!;
        return pl.colSpan * pl.rowSpan;
      };
      const wallets = Math.max(area('zelcore'), area('ssp'));
      for (const pl of layout.placements) {
        if (pl.id === 'zelcore' || pl.id === 'ssp') continue;
        expect(pl.colSpan * pl.rowSpan, `${name}:${pl.id}`).toBeGreaterThan(wallets);
      }
    }
  });

  it('desktop has 12 columns, tablet 2 and phone 1', () => {
    expect(LAYOUTS.desktop.cols).toBe(12);
    expect(LAYOUTS.tablet.cols).toBe(2);
    expect(LAYOUTS.phone.cols).toBe(1);
  });
});

describe('validateLayout catches mistakes', () => {
  const base = (placements: BentoLayout['placements']): BentoLayout => ({
    name: 'desktop',
    cols: 2,
    rows: 2,
    placements,
  });
  const at = (id: string, col: number, row: number, colSpan: number, rowSpan: number) => ({
    id,
    col,
    row,
    colSpan,
    rowSpan,
    form: 'compact' as const,
  });

  it('flags an overlap', () => {
    const problems = validateLayout(base([at('a', 1, 1, 2, 1), at('b', 2, 1, 1, 2), at('c', 1, 2, 1, 1)]), [
      'a',
      'b',
      'c',
    ]);
    expect(problems.join(' ')).toContain('overlaps');
  });

  it('flags a hole', () => {
    const problems = validateLayout(base([at('a', 1, 1, 2, 1), at('b', 1, 2, 1, 1)]), ['a', 'b']);
    expect(problems.join(' ')).toContain('hole at column 2, row 2');
  });

  it('flags out of bounds, missing and unknown ids', () => {
    const problems = validateLayout(base([at('a', 1, 1, 3, 2), at('z', 1, 1, 1, 1)]), ['a', 'b']);
    const text = problems.join(' | ');
    expect(text).toContain('past the last column');
    expect(text).toContain('b is missing');
    expect(text).toContain('z is not a known gateway');
  });

  it('accepts a clean tiling', () => {
    const ok = base([at('a', 1, 1, 2, 1), at('b', 1, 2, 1, 1), at('c', 2, 2, 1, 1)]);
    expect(validateLayout(ok, ['a', 'b', 'c'])).toEqual([]);
  });
});

describe('layoutNameFor', () => {
  it('uses the phone token edge and the bento desktop edge', () => {
    expect(layoutNameFor(390)).toBe('phone');
    expect(layoutNameFor(719)).toBe('phone');
    expect(layoutNameFor(720)).toBe('tablet');
    expect(layoutNameFor(1100)).toBe('tablet');
    expect(layoutNameFor(1359)).toBe('tablet');
    expect(layoutNameFor(1360)).toBe('desktop');
    expect(layoutNameFor(1920)).toBe('desktop');
  });

  it('keeps a 3 column tile at least 296 px wide at the desktop edge', () => {
    // Container is the viewport minus two fluid gutters (4vw, clamped 16..48 px), capped at 1520.
    const vw = BENTO_DESKTOP_MIN;
    const gutter = Math.min(48, Math.max(16, vw * 0.04));
    const container = Math.min(1520, vw - 2 * gutter);
    const gap = Math.min(20, Math.max(12, 8 + vw * 0.01));
    const col = (container - 11 * gap) / 12;
    expect(3 * col + 2 * gap).toBeGreaterThanOrEqual(296);
  });
});
