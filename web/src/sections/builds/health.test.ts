import type { AppHealth } from '@shared/api';
import { describe, expect, it } from 'vitest';
import {
  describeHealth,
  formatLatency,
  type HealthView,
  NO_HEALTH,
  pillCopy,
  statusRank,
  summarizeHealth,
} from './health';

const NOW = Date.parse('2026-10-12T19:00:00Z');

const up: AppHealth = {
  id: 'atlas',
  state: 'up',
  httpStatus: 200,
  latencyMs: 142,
  checkedAt: '2026-10-12T18:59:50.000Z',
  since: '2026-10-12T17:00:00.000Z',
};

describe('describeHealth', () => {
  it('shows a skeleton state until a payload exists', () => {
    expect(describeHealth(up, { loaded: false, freshness: 'unknown' }).kind).toBe('loading');
  });

  it('never claims anything when the API is offline, whatever the payload says', () => {
    expect(describeHealth(up, { loaded: true, freshness: 'offline' })).toEqual(NO_HEALTH);
    expect(describeHealth(null, { loaded: true, freshness: 'live' })).toEqual(NO_HEALTH);
    expect(describeHealth({ ...up, state: 'unknown' }, { loaded: true, freshness: 'live' })).toEqual(
      NO_HEALTH,
    );
  });

  it('marks a result fresh only while live', () => {
    expect(describeHealth(up, { loaded: true, freshness: 'live' })).toMatchObject({
      kind: 'up',
      fresh: true,
    });
    expect(describeHealth(up, { loaded: true, freshness: 'cached' })).toMatchObject({
      kind: 'up',
      fresh: false,
    });
  });

  it('shows the site itself as self, always', () => {
    expect(describeHealth(null, { loaded: false, freshness: 'unknown' }, true).kind).toBe('self');
    expect(describeHealth(up, { loaded: true, freshness: 'live' }, true).kind).toBe('self');
  });
});

describe('pillCopy', () => {
  const view = (over: Partial<HealthView>): HealthView => ({ ...NO_HEALTH, ...over });

  it('says Live with the latency for a fresh up', () => {
    const c = pillCopy(view({ kind: 'up', fresh: true, latencyMs: 142, checkedAt: up.checkedAt }), NOW);
    expect(c).toMatchObject({ word: 'Live', detail: '142 ms', tone: 'ok', glyph: 'status-live' });
    expect(c.sr).toBe('Live, 142 ms response');
  });

  it('labels a cached result with its age instead of Live', () => {
    const c = pillCopy(
      view({ kind: 'up', fresh: false, latencyMs: 142, checkedAt: '2026-10-12T18:54:00.000Z' }),
      NOW,
    );
    expect(c.word).toBe('Up');
    expect(c.detail).toBe('6 min ago');
    expect(c.tone).toBe('warn');
  });

  it('uses the words of the copy deck', () => {
    expect(pillCopy(view({ kind: 'down', fresh: true }), NOW).word).toBe('Offline right now');
    expect(pillCopy(view({ kind: 'unknown' }), NOW).word).toBe('Not checked yet');
    expect(pillCopy(view({ kind: 'degraded', fresh: true, latencyMs: 2600 }), NOW)).toMatchObject({
      word: 'Degraded',
      detail: '2.6 s',
      tone: 'warn',
    });
    expect(pillCopy(view({ kind: 'self' }), NOW).word).toBe('You are here');
  });

  it('gives every state a distinct glyph so colour is never the only signal', () => {
    const kinds: HealthView['kind'][] = ['up', 'degraded', 'down', 'unknown'];
    const glyphs = kinds.map((kind) => pillCopy(view({ kind, fresh: true }), NOW).glyph);
    expect(new Set(glyphs).size).toBe(kinds.length);
  });
});

describe('formatLatency', () => {
  it('formats milliseconds and seconds, and refuses nonsense', () => {
    expect(formatLatency(142)).toBe('142 ms');
    expect(formatLatency(999.6)).toBe('1000 ms');
    expect(formatLatency(1000)).toBe('1.0 s');
    expect(formatLatency(2600)).toBe('2.6 s');
    expect(formatLatency(null)).toBeNull();
    expect(formatLatency(-1)).toBeNull();
    expect(formatLatency(Number.NaN)).toBeNull();
  });
});

describe('statusRank and summarizeHealth', () => {
  it('ranks healthy before unhealthy', () => {
    const r = (kind: HealthView['kind'], fresh = true) => statusRank({ ...NO_HEALTH, kind, fresh });
    expect(r('up')).toBeLessThan(r('degraded'));
    expect(r('degraded')).toBeLessThan(r('unknown'));
    expect(r('unknown')).toBeLessThan(r('down'));
  });

  it('summarises counts and keeps the checked total honest', () => {
    const v = (kind: HealthView['kind']): HealthView => ({ ...NO_HEALTH, kind });
    const s = summarizeHealth([
      v('up'),
      v('up'),
      v('degraded'),
      v('down'),
      v('unknown'),
      v('self'),
      v('loading'),
    ]);
    expect(s).toEqual({ up: 2, degraded: 1, down: 1, unchecked: 3, checked: 4 });
  });
});
