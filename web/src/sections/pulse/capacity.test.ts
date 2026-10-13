import { describe, expect, it } from 'vitest';
import { formatStorage, perNode } from './capacity';

describe('formatStorage', () => {
  it('keeps terabytes below a thousand and switches to petabytes above', () => {
    expect(formatStorage(194.2)).toEqual({ value: 194.2, unit: 'TB', decimals: 0 });
    expect(formatStorage(86)).toEqual({ value: 86, unit: 'TB', decimals: 1 });
    const pb = formatStorage(3365.3);
    expect(pb.value).toBeCloseTo(3.3653, 6);
    expect(pb).toMatchObject({ unit: 'PB', decimals: 2 });
    expect(formatStorage(12_000).unit).toBe('PB');
  });

  it('is zero for nonsense', () => {
    expect(formatStorage(Number.NaN)).toEqual({ value: 0, unit: 'TB', decimals: 0 });
    expect(formatStorage(-5).value).toBe(0);
  });
});

describe('perNode', () => {
  it('divides the totals by the nodes they were summed from', () => {
    const p = perNode({ cores: 57_023, ramTb: 191.2, ssdTb: 3365.3, reporting: 6914 });
    expect(p?.cores).toBeCloseTo(8.247, 2);
    expect(p?.ramGb).toBeCloseTo(27.65, 1);
    expect(p?.ssdGb).toBeCloseTo(486.7, 0);
  });

  it('is null without a reporting count', () => {
    expect(perNode({ cores: 1, ramTb: 1, ssdTb: 1 })).toBeNull();
    expect(perNode({ cores: 1, ramTb: 1, ssdTb: 1, reporting: 0 })).toBeNull();
    expect(perNode(null)).toBeNull();
  });
});
