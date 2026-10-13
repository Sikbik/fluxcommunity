import type { BlockSummary, NetworkSnapshot } from '@shared/api';
import { describe, expect, it } from 'vitest';
import {
  apportion,
  blockIntervalStats,
  chainProgress,
  collateralFor,
  computeReductionCountdown,
  formatAge,
  formatCompact,
  formatDuration,
  formatFull,
  formatSignedPercent,
  formatUsd,
  nodesFor,
  paidEveryHours,
  paidEveryLabel,
  perBlockFor,
  reductionParts,
  sparklinePoints,
  tierSharePercents,
  tierShares,
  timeAgo,
} from './derive';
import { getFallback } from './fixtures';

describe('formatCompact', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1K'],
    [7100, '7.1K'],
    [7102, '7.1K'],
    [12_500, '12.5K'],
    [125_000, '125K'],
    [999_999, '1M'],
    [3_031_112, '3.03M'],
    [10_500_000, '10.5M'],
    [1_500_000_000, '1.5B'],
    [-7100, '-7.1K'],
  ])('%d -> %s', (n, expected) => {
    expect(formatCompact(n)).toBe(expected);
  });

  it('survives non-finite input', () => {
    expect(formatCompact(Number.NaN)).toBe('--');
    expect(formatCompact(Number.POSITIVE_INFINITY)).toBe('--');
  });
});

describe('number formats', () => {
  it('groups full numbers', () => {
    expect(formatFull(3_031_112)).toBe('3,031,112');
    expect(formatFull(0)).toBe('0');
    expect(formatFull(1234.567, 1)).toBe('1,234.6');
  });
  it('formats price with sensible precision', () => {
    expect(formatUsd(0.086)).toBe('$0.086');
    expect(formatUsd(0.0042)).toBe('$0.0042');
    expect(formatUsd(1.5)).toBe('$1.50');
  });
  it('signs percentages and never prints negative zero', () => {
    expect(formatSignedPercent(2.44)).toBe('+2.4%');
    expect(formatSignedPercent(-1.26)).toBe('-1.3%');
    expect(formatSignedPercent(-0.01)).toBe('0.0%');
  });
});

describe('time helpers', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  it('timeAgo', () => {
    expect(timeAgo(now - 1000, now)).toBe('just now');
    expect(timeAgo(now - 12_000, now)).toBe('12 s ago');
    expect(timeAgo(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(timeAgo('2026-10-12T10:00:00Z', now)).toBe('2 h ago');
    expect(timeAgo(now - 5 * 86_400_000, now)).toBe('5 d ago');
    expect(timeAgo(now + 60_000, now)).toBe('just now');
    expect(timeAgo(null, now)).toBe('unknown');
    expect(timeAgo('not a date', now)).toBe('unknown');
  });
  it('formatDuration and formatAge', () => {
    expect(formatDuration(59)).toBe('59 s');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatAge(3200)).toBe('3 s');
    expect(formatAge(null)).toBe('');
  });
  it('reductionParts splits and clamps', () => {
    expect(reductionParts(((13 * 24 + 23) * 3600 + 20 * 60 + 5) * 1000)).toEqual({
      days: 13,
      hours: 23,
      minutes: 20,
      seconds: 5,
    });
    expect(reductionParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('tiers', () => {
  const tiers = { cumulus: 3583, nimbus: 1689, stratus: 1830 };
  it('shares are fractions of the total', () => {
    const s = tierShares(tiers);
    expect(s.cumulus + s.nimbus + s.stratus).toBeCloseTo(1, 10);
    expect(s.cumulus).toBeCloseTo(3583 / 7102, 10);
    expect(tierShares({ cumulus: 0, nimbus: 0, stratus: 0 })).toEqual({ cumulus: 0, nimbus: 0, stratus: 0 });
  });
  it('percents add to exactly 100', () => {
    const p = tierSharePercents(tiers);
    expect(p.cumulus + p.nimbus + p.stratus).toBe(100);
    expect(p).toEqual({ cumulus: 50, nimbus: 24, stratus: 26 });
    const p1 = tierSharePercents(tiers, 1);
    expect(Math.round((p1.cumulus + p1.nimbus + p1.stratus) * 10)).toBe(1000);
    // Equal thirds: largest remainder must still land on 100.
    const t = tierSharePercents({ cumulus: 1, nimbus: 1, stratus: 1 });
    expect(t.cumulus + t.nimbus + t.stratus).toBe(100);
  });
  it('apportion keeps the total', () => {
    expect(apportion([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10);
    expect(apportion([0, 0], 5)).toEqual([0, 0]);
  });
  it('collateral, per-block and node lookups', () => {
    const net = getFallback().network;
    expect(collateralFor(net, 'stratus')).toBe(40_000);
    expect(perBlockFor(net, 'nimbus')).toBe(3.5);
    expect(nodesFor(net, 'cumulus')).toBe(3583);
    expect(collateralFor(null, 'cumulus')).toBeNull();
  });
  it('paid about every N hours', () => {
    expect(paidEveryHours(3583, 30)).toBeCloseTo(29.86, 2);
    expect(paidEveryHours(0, 30)).toBeNull();
    expect(paidEveryLabel(3583, 30)).toBe('about 30 hours');
    expect(paidEveryLabel(1830, 30)).toBe('about 15 hours');
    expect(paidEveryLabel(100, 30)).toBe('about 50 minutes');
    expect(paidEveryLabel(7000, 30)).toBe('about 2 days');
    expect(paidEveryLabel(120, 30)).toBe('about 1 hour');
  });
});

describe('chain clock helpers', () => {
  it('computes progress and holds at 1 while overdue', () => {
    expect(chainProgress(10_000, 0, 30_000)).toEqual({
      sinceMs: 10_000,
      toNextMs: 20_000,
      progress: 10_000 / 30_000,
    });
    expect(chainProgress(45_000, 0, 30_000)).toEqual({ sinceMs: 45_000, toNextMs: 0, progress: 1 });
    expect(chainProgress(0, 5000, 30_000).sinceMs).toBe(0);
  });
});

describe('computeReductionCountdown', () => {
  const next: NetworkSnapshot['rewards']['nextReduction'] = {
    height: 3_071_200,
    blocksAway: 40_200,
    etaIso: '2026-10-26T23:20:00.000Z',
    fraction: 0.1,
    perBlockAfter: 12.6,
  };
  if (!next) throw new Error('fixture');

  it('anchors to the live tip', () => {
    const now = 1_000_000;
    const c = computeReductionCountdown({
      next,
      height: 3_071_100,
      lastBlockAt: now - 10_000,
      targetBlockSec: 30,
      nowMs: now,
    });
    expect(c?.live).toBe(true);
    expect(c?.blocksAway).toBe(100);
    // 100 blocks * 30 s, counted from the tip block, minus the 10 s already elapsed.
    expect(c?.etaMs).toBe(now - 10_000 + 100 * 30_000);
    expect(c?.parts).toEqual({ days: 0, hours: 0, minutes: 49, seconds: 50 });
  });

  it('projects from the snapshot when there is no live tip, and says so', () => {
    const now = Date.parse('2026-10-12T00:00:00Z');
    const c = computeReductionCountdown({
      next,
      height: null,
      lastBlockAt: null,
      targetBlockSec: 30,
      nowMs: now,
    });
    expect(c?.live).toBe(false);
    expect(c?.blocksAway).toBe(40_200);
    expect(c?.parts.days).toBe(14);
  });

  it('returns null rather than zero when the projected time is already past', () => {
    const now = Date.parse('2027-01-01T00:00:00Z');
    expect(
      computeReductionCountdown({ next, height: null, lastBlockAt: null, targetBlockSec: 30, nowMs: now }),
    ).toBeNull();
  });

  it('prefers the measured block interval over the 30 s target', () => {
    const now = 1_000_000;
    const base = { next, height: 3_071_100, lastBlockAt: now, targetBlockSec: 30, nowMs: now };
    expect(computeReductionCountdown({ ...base, measuredBlockSec: 31 })?.etaMs).toBe(now + 100 * 31_000);
    expect(computeReductionCountdown({ ...base, measuredBlockSec: null })?.etaMs).toBe(now + 100 * 30_000);
    // An absurd measurement (backfill glitch) is ignored.
    expect(computeReductionCountdown({ ...base, measuredBlockSec: 4 })?.etaMs).toBe(now + 100 * 30_000);
  });

  it('clamps at zero once the live tip passes the reduction height', () => {
    const c = computeReductionCountdown({
      next,
      height: 3_071_205,
      lastBlockAt: 5000,
      targetBlockSec: 30,
      nowMs: 9000,
    });
    expect(c?.blocksAway).toBe(0);
    expect(c?.parts).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('blockIntervalStats', () => {
  const mk = (height: number, sec: number | null, time: string): BlockSummary => ({
    height,
    time,
    intervalSec: sec,
    txCount: null,
  });

  it('summarises intervals', () => {
    const blocks = [
      mk(1, null, '2026-10-12T00:00:00Z'),
      mk(2, 30, '2026-10-12T00:00:30Z'),
      mk(3, 28, '2026-10-12T00:00:58Z'),
      mk(4, 40, '2026-10-12T00:01:38Z'),
      mk(5, 31, '2026-10-12T00:02:09Z'),
    ];
    const s = blockIntervalStats({ blocks });
    expect(s.intervals).toEqual([30, 28, 40, 31]);
    expect(s.meanSec).toBeCloseTo(32.25, 5);
    expect(s.medianSec).toBe(30.5);
    expect(s.minSec).toBe(28);
    expect(s.maxSec).toBe(40);
    expect(s.onTargetShare).toBe(0.75);
    expect(s.domainMaxSec).toBe(60);
  });

  it('derives an interval from timestamps when the server omitted it', () => {
    const s = blockIntervalStats([
      mk(1, 30, '2026-10-12T00:00:00Z'),
      mk(2, null, '2026-10-12T00:00:27Z'),
      mk(4, null, '2026-10-12T00:01:30Z'), // gap in heights: not a single interval
    ]);
    expect(s.intervals).toEqual([30, 27]);
  });

  it('never assumes 30.0: a real 31 to 32 s chain reports its true mean and keeps the target line honest', () => {
    const blocks = Array.from({ length: 40 }, (_, i) =>
      mk(100 + i, i % 2 ? 31 : 32.4, '2026-10-12T00:00:00Z'),
    );
    const s = blockIntervalStats(blocks, 60, 30);
    expect(s.meanSec).toBeCloseTo(31.7, 5);
    expect(s.maxSec).toBe(32.4);
    expect(s.domainMaxSec).toBe(60);
    expect(s.onTargetShare).toBe(1); // within 20 percent of 30 s
    // Against its own measured mean everything is on target; against 25 s nothing is.
    expect(blockIntervalStats(blocks, 60, 25).onTargetShare).toBe(0);
  });

  it('limits to the newest N and handles empty input', () => {
    const many = Array.from({ length: 100 }, (_, i) => mk(i + 1, 30, '2026-10-12T00:00:00Z'));
    expect(blockIntervalStats(many, 60).count).toBe(60);
    const empty = blockIntervalStats(null);
    expect(empty.count).toBe(0);
    expect(empty.meanSec).toBeNull();
    expect(empty.domainMaxSec).toBe(60);
  });
});

describe('sparklinePoints', () => {
  it('maps into the box, y down', () => {
    expect(sparklinePoints([0, 30, 60], 100, 40, 60)).toEqual([
      [0, 40],
      [50, 20],
      [100, 0],
    ]);
    expect(sparklinePoints([], 100, 40, 60)).toEqual([]);
  });
});
