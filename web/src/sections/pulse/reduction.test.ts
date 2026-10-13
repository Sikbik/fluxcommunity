import type { NextReduction } from '@shared/api';
import { describe, expect, it } from 'vitest';
import { epochProgress, formatCut, formatEta, reductionOrdinal } from './reduction';

const NEXT: NextReduction = {
  height: 3_071_200,
  blocksAway: 39_904,
  etaIso: '2026-10-26T15:28:34.000Z',
  fraction: 0.1,
  perBlockAfter: 12.6,
  epochStartHeight: 2_020_000,
  epochBlocks: 1_051_200,
  index: 1,
  of: 20,
};

describe('epochProgress', () => {
  it('is the share of the epoch that has elapsed', () => {
    const p = epochProgress(NEXT, 39_904);
    expect(p).not.toBeNull();
    expect(p?.elapsedBlocks).toBe(1_051_200 - 39_904);
    expect(p?.fraction).toBeCloseTo(1_011_296 / 1_051_200, 9);
    expect(p?.startHeight).toBe(2_020_000);
    expect(p?.endHeight).toBe(3_071_200);
  });

  it('is zero at the start of an epoch and one at the reduction', () => {
    expect(epochProgress(NEXT, 1_051_200)?.fraction).toBe(0);
    expect(epochProgress(NEXT, 0)?.fraction).toBe(1);
  });

  it('clamps nonsense block counts', () => {
    expect(epochProgress(NEXT, -50)?.fraction).toBe(1);
    expect(epochProgress(NEXT, 5_000_000)?.fraction).toBe(0);
  });

  it('is hidden, never guessed, when the server does not provide the epoch', () => {
    const { epochStartHeight: _s, epochBlocks: _b, ...bare } = NEXT;
    expect(epochProgress(bare, 39_904)).toBeNull();
    expect(epochProgress({ ...NEXT, epochBlocks: undefined }, 39_904)).toBeNull();
    expect(epochProgress({ ...NEXT, epochStartHeight: undefined }, 39_904)).toBeNull();
    expect(epochProgress(null, 10)).toBeNull();
    expect(epochProgress(NEXT, null)).toBeNull();
  });

  it('is hidden when the epoch disagrees with the reduction height', () => {
    expect(epochProgress({ ...NEXT, epochBlocks: 1_000_000 }, 39_904)).toBeNull();
    expect(epochProgress({ ...NEXT, epochBlocks: 0 }, 39_904)).toBeNull();
  });
});

describe('formatCut', () => {
  it('prints a fractional cut as a percentage', () => {
    expect(formatCut(0.1)).toBe('10%');
    expect(formatCut(0.125)).toBe('12.5%');
    expect(formatCut(0.05)).toBe('5%');
  });

  it('is null for anything that is not a cut', () => {
    expect(formatCut(0)).toBeNull();
    expect(formatCut(-0.1)).toBeNull();
    expect(formatCut(undefined)).toBeNull();
    expect(formatCut(Number.NaN)).toBeNull();
  });
});

describe('reductionOrdinal', () => {
  it('reads "Reduction N of M"', () => {
    expect(reductionOrdinal(1, 20)).toBe('Reduction 1 of 20');
    expect(reductionOrdinal(7, undefined)).toBe('Reduction 7');
    expect(reductionOrdinal(undefined, 20)).toBeNull();
  });
});

describe('formatEta', () => {
  it('prints a date in the requested locale with the year and a zone', () => {
    const s = formatEta(Date.parse('2026-10-26T15:28:34.000Z'), 'en-US');
    expect(s).toContain('2026');
    expect(s).toMatch(/Oct/);
    expect(s).toMatch(/[A-Z]{2,5}|GMT|UTC/);
  });

  it('is a placeholder for a bad time', () => {
    expect(formatEta(Number.NaN)).toBe('--');
  });
});
