import { describe, expect, it } from 'vitest';
import {
  countdownParts,
  daysUntil,
  formatAge,
  formatCompact,
  formatDateLong,
  formatDateShort,
  formatDecimal,
  formatDuration,
  formatFlux,
  formatInt,
  formatPct,
  formatShare,
  formatTimeUtc,
  formatUsd,
  NONE,
  pad2,
  plural,
  truncateMiddle,
} from './format';

describe('numbers', () => {
  it('groups integers', () => {
    expect(formatInt(3031112)).toBe('3,031,112');
    expect(formatInt(0)).toBe('0');
    expect(formatInt(12.6)).toBe('13');
  });

  it('prints unknown as the placeholder, never zero', () => {
    expect(formatInt(null)).toBe(NONE);
    expect(formatInt(undefined)).toBe(NONE);
    expect(formatInt(Number.NaN)).toBe(NONE);
    expect(formatDecimal(null)).toBe(NONE);
    expect(formatInt(null, 'n/a')).toBe('n/a');
  });

  it('formats decimals with grouping', () => {
    expect(formatDecimal(1234.5, 2)).toBe('1,234.50');
    expect(formatFlux(9)).toBe('9.00 FLUX');
  });

  it('compacts', () => {
    expect(formatCompact(12345)).toBe('12.3K');
    expect(formatCompact(4_100_000)).toBe('4.1M');
  });

  it('formats percentages with sign and a real minus', () => {
    expect(formatPct(1.954)).toBe('1.95%');
    expect(formatPct(1.954, { signed: true })).toBe('+1.95%');
    expect(formatPct(-0.4, { signed: true, digits: 1 })).toBe('−0.4%');
    expect(formatPct(null)).toBe(NONE);
  });

  it('formats shares from fractions', () => {
    expect(formatShare(0.1234)).toBe('12.3%');
  });

  it('keeps sub-dollar prices precise', () => {
    expect(formatUsd(0.0746)).toBe('$0.0746');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});

describe('age and duration', () => {
  it('formats ages for freshness chips', () => {
    expect(formatAge(0)).toBe('now');
    expect(formatAge(1500)).toBe('now');
    expect(formatAge(3200)).toBe('3 s');
    expect(formatAge(59_000)).toBe('59 s');
    expect(formatAge(2 * 60_000 + 5000)).toBe('2 min');
    expect(formatAge(3 * 3_600_000)).toBe('3 h');
    expect(formatAge(5 * 86_400_000)).toBe('5 d');
    expect(formatAge(null)).toBe('');
    expect(formatAge(-5)).toBe('');
  });

  it('formats durations with at most N units', () => {
    expect(formatDuration(442_800)).toBe('5d 3h');
    expect(formatDuration(200)).toBe('3m 20s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(3600 * 3 + 20 * 60, 3)).toBe('3h 20m');
    expect(formatDuration(null)).toBe(NONE);
  });

  it('splits countdown parts and never goes negative', () => {
    expect(countdownParts(25 * 86_400_000 + 18 * 3_600_000 + 5 * 60_000 + 9_000)).toEqual({
      days: 25,
      hours: 18,
      minutes: 5,
      seconds: 9,
    });
    expect(countdownParts(-1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('pads', () => {
    expect(pad2(7)).toBe('07');
    expect(pad2(42)).toBe('42');
  });
});

describe('dates', () => {
  it('reads dates in UTC so labels never drift', () => {
    expect(formatDateShort('2026-11-01')).toBe('Nov 1');
    expect(formatDateShort('2026-11-01T23:59:59Z')).toBe('Nov 1');
    expect(formatDateLong('2026-11-01')).toBe('Nov 1, 2026');
    expect(formatDateShort('nonsense')).toBe(NONE);
    expect(formatDateShort(null)).toBe(NONE);
  });

  it('formats UTC clock time', () => {
    expect(formatTimeUtc(Date.UTC(2026, 9, 12, 19, 46, 52))).toBe('19:46:52 UTC');
    expect(formatTimeUtc(Date.UTC(2026, 9, 12, 19, 46, 52), false)).toBe('19:46 UTC');
  });

  it('counts whole days until a date', () => {
    const from = Date.UTC(2026, 9, 12, 12, 0, 0);
    expect(daysUntil('2026-11-01', from)).toBe(20);
    expect(daysUntil('2026-10-01', from)).toBe(0);
  });
});

describe('text', () => {
  it('truncates in the middle', () => {
    expect(truncateMiddle('t1cz5P2xqKd9Dg9', 6, 3)).toBe('t1cz5P…Dg9');
    expect(truncateMiddle('short')).toBe('short');
  });

  it('pluralises', () => {
    expect(plural(1, 'node')).toBe('1 node');
    expect(plural(1234, 'node')).toBe('1,234 nodes');
    expect(plural(2, 'country', 'countries')).toBe('2 countries');
  });
});
