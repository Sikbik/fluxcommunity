import { describe, expect, it } from 'vitest';
import { paidEveryLabel } from '@/data';
import { getFallback } from '@/data/fixtures';
import {
  blockTime,
  buildTierModel,
  describeRow,
  formatBlockSeconds,
  formatFluxAmount,
  paidEvery,
  TIER_NAME,
  worstFreshness,
} from './payout';

describe('blockTime', () => {
  it('prefers the measured interval when it is plausible', () => {
    expect(blockTime({ targetBlockSec: 30, measuredBlockSec: 30.25 })).toEqual({
      seconds: 30.25,
      measured: true,
    });
  });

  it('falls back to the protocol target when nothing was measured yet', () => {
    expect(blockTime({ targetBlockSec: 30, measuredBlockSec: null })).toEqual({
      seconds: 30,
      measured: false,
    });
  });

  it.each([0, -3, 4, 61, Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores an implausible measurement (%s)',
    (measured) => {
      expect(blockTime({ targetBlockSec: 30, measuredBlockSec: measured })).toEqual({
        seconds: 30,
        measured: false,
      });
    },
  );

  it('survives a nonsense target', () => {
    expect(blockTime({ targetBlockSec: 0, measuredBlockSec: null }).seconds).toBe(30);
  });
});

describe('formatBlockSeconds', () => {
  it.each([
    [30, '30'],
    [30.04, '30'],
    [30.25, '30.3'],
    [31.96, '32'],
    [30.1, '30.1'],
  ])('%s -> %s', (input, expected) => {
    expect(formatBlockSeconds(input)).toBe(expected);
  });
});

describe('paidEvery', () => {
  it('multiplies tier nodes by the block time', () => {
    // 3,583 Cumulus nodes at 30.1 s: 29.96 hours.
    const p = paidEvery(3583, 30.1);
    expect(p?.hours).toBeCloseTo(29.96, 2);
    expect(p?.text).toBe('30 hours');
    expect(p?.phrase).toBe('about 30 hours');
    expect(p?.unit).toBe('hours');
    expect(p?.unitText).toBe('hours');
    expect(p?.value).toBe(30);
  });

  it('is monotonic in node count', () => {
    const a = paidEvery(1000, 30);
    const b = paidEvery(2000, 30);
    expect(a && b && b.hours > a.hours).toBe(true);
  });

  it('switches unit at the thresholds', () => {
    // 100 nodes x 30 s = 50 minutes
    expect(paidEvery(100, 30)).toMatchObject({ unit: 'minutes', value: 50, text: '50 minutes' });
    // 120 nodes x 30 s = 1 hour exactly
    expect(paidEvery(120, 30)).toMatchObject({ unit: 'hours', value: 1, text: '1 hour', unitText: 'hour' });
    // 5,760 nodes x 30 s = 48 hours exactly -> 2 days
    expect(paidEvery(5760, 30)).toMatchObject({ unit: 'days', value: 2, text: '2 days' });
    // 5,759 nodes x 30 s is still under 48 hours -> 48 hours
    expect(paidEvery(5759, 30)).toMatchObject({ unit: 'hours', value: 48 });
  });

  it('never rounds an interval under an hour down to zero minutes', () => {
    expect(paidEvery(1, 30)).toMatchObject({ unit: 'minutes', value: 1, text: '1 minute' });
  });

  it('is null for unusable input rather than zero', () => {
    expect(paidEvery(0, 30)).toBeNull();
    expect(paidEvery(1000, 0)).toBeNull();
    expect(paidEvery(Number.NaN, 30)).toBeNull();
    expect(paidEvery(-5, 30)).toBeNull();
  });

  it('agrees with the data layer phrase everywhere it is well defined', () => {
    for (const nodes of [180, 600, 1689, 1830, 3583, 4800, 7102, 9000, 12_000]) {
      for (const sec of [30, 30.1, 30.25, 31]) {
        const mine = paidEvery(nodes, sec);
        // The data layer says "1 minutes"; compare everywhere the unit is not singular minutes.
        if (mine && !(mine.unit === 'minutes' && mine.value === 1)) {
          expect(mine.phrase).toBe(paidEveryLabel(nodes, sec));
        }
      }
    }
  });
});

describe('formatFluxAmount', () => {
  it.each([
    [1, '1'],
    [3.5, '3.5'],
    [9, '9'],
    [3.15, '3.15'],
    [8.1, '8.1'],
    [0.9, '0.9'],
    [12.6, '12.6'],
    [3.499, '3.5'],
  ])('%s -> %s', (input, expected) => {
    expect(formatFluxAmount(input)).toBe(expected);
  });

  it('is a dash for a non-number, never zero', () => {
    expect(formatFluxAmount(Number.NaN)).toBe('--');
  });
});

describe('buildTierModel', () => {
  const net = getFallback().network;

  it('builds the three rows in tier order with live-shaped numbers', () => {
    const model = buildTierModel(net);
    expect(model.rows.map((r) => r.tier)).toEqual(['cumulus', 'nimbus', 'stratus']);
    expect(model.rows.map((r) => r.name)).toEqual(['Cumulus', 'Nimbus', 'Stratus']);
    expect(model.rows.map((r) => r.collateral)).toEqual([1000, 12_500, 40_000]);
    expect(model.rows.map((r) => r.perBlock)).toEqual([1, 3.5, 9]);
    expect(model.totalNodes).toBe(3583 + 1689 + 1830);
  });

  it('apportions shares to exactly one hundred percent', () => {
    const model = buildTierModel(net);
    expect(model.rows.map((r) => r.sharePct)).toEqual([50, 24, 26]);
    expect(model.rows.reduce((a, r) => a + r.sharePct, 0)).toBe(100);
  });

  it('derives "paid about every" from nodes and the measured block time', () => {
    const model = buildTierModel(net); // fallback measured interval: 30.1 s
    expect(model.blockTime).toEqual({ seconds: 30.1, measured: true });
    expect(model.rows.map((r) => r.every?.text)).toEqual(['30 hours', '14 hours', '15 hours']);
  });

  it('stays honest with no nodes: no payout interval, no shares', () => {
    const empty = {
      ...net,
      nodes: { ...net.nodes, total: 0, tiers: { cumulus: 0, nimbus: 0, stratus: 0 } },
    };
    const model = buildTierModel(empty);
    expect(model.rows.every((r) => r.every === null)).toBe(true);
    expect(model.rows.every((r) => r.sharePct === 0)).toBe(true);
    expect(model.totalNodes).toBe(0);
  });

  it('follows a reward reduction without code changes', () => {
    const cut = {
      ...net,
      rewards: { ...net.rewards, perTier: { cumulus: 0.9, nimbus: 3.15, stratus: 8.1 } },
    };
    const model = buildTierModel(cut);
    expect(model.rows.map((r) => formatFluxAmount(r.perBlock))).toEqual(['0.9', '3.15', '8.1']);
  });
});

describe('describeRow', () => {
  it('reads as one sentence for assistive tech', () => {
    const row = buildTierModel(getFallback().network).rows[1];
    expect(row).toBeDefined();
    if (!row) return;
    const text = describeRow(row, (n) => n.toLocaleString('en-US'));
    expect(text).toBe('Nimbus: 1,689 nodes, 12,500 FLUX collateral, 3.5 FLUX per block, paid about 14 hours');
  });
});

describe('worstFreshness', () => {
  it('returns the less trustworthy state', () => {
    expect(worstFreshness('live', 'cached')).toBe('cached');
    expect(worstFreshness('cached', 'live')).toBe('cached');
    expect(worstFreshness('cached', 'offline')).toBe('offline');
    expect(worstFreshness('live', 'live')).toBe('live');
    expect(worstFreshness('live', 'unknown')).toBe('unknown');
  });
});

describe('tier names', () => {
  it('uses sentence-case names', () => {
    expect(TIER_NAME).toEqual({ cumulus: 'Cumulus', nimbus: 'Nimbus', stratus: 'Stratus' });
  });
});
