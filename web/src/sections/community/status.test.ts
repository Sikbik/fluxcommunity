import type { AppHealth, HealthState } from '@shared/api';
import { COMMUNITY_APPS, type CommunityApp, probeUrl } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { healthTone, respondingText, summarizeHealth } from './status';

function app(id: string, probe?: string | false): CommunityApp {
  return {
    id,
    name: id,
    tagline: '',
    description: '',
    category: 'network',
    builder: null,
    url: `https://${id}.example`,
    host: `${id}.example`,
    probe,
    lifecycle: 'live',
  };
}

function h(id: string, state: HealthState): AppHealth {
  return {
    id,
    state,
    httpStatus: state === 'unknown' ? null : 200,
    latencyMs: null,
    checkedAt: null,
    since: null,
  };
}

describe('summarizeHealth', () => {
  const apps = [app('a'), app('b'), app('c'), app('d'), app('self', false)];

  it('counts up and degraded as responding, down as not, and leaves the site itself out', () => {
    const s = summarizeHealth(apps, [h('a', 'up'), h('b', 'degraded'), h('c', 'down'), h('d', 'up')]);
    expect(s).toEqual({ total: 4, up: 2, degraded: 1, down: 1, unchecked: 0, responding: 3 });
  });

  it('does not count unknown or missing apps as responding', () => {
    const s = summarizeHealth(apps, [h('a', 'up'), h('b', 'unknown')]);
    expect(s.responding).toBe(1);
    expect(s.unchecked).toBe(3);
    expect(s.total).toBe(4);
  });

  it('is entirely unchecked with no data at all', () => {
    for (const none of [null, undefined, []] as const) {
      const s = summarizeHealth(apps, none);
      expect(s.total).toBe(4);
      expect(s.unchecked).toBe(4);
      expect(s.responding).toBe(0);
    }
  });

  it('ignores health entries for apps the catalog does not have', () => {
    const s = summarizeHealth(apps, [h('zzz', 'up'), h('a', 'up')]);
    expect(s.responding).toBe(1);
    expect(s.unchecked).toBe(3);
  });

  it('uses the real catalog: every probed app, and never this site', () => {
    const probed = COMMUNITY_APPS.filter((a) => probeUrl(a) !== null);
    const s = summarizeHealth(
      COMMUNITY_APPS,
      COMMUNITY_APPS.map((a) => h(a.id, 'up')),
    );
    expect(s.total).toBe(probed.length);
    expect(s.responding).toBe(probed.length);
    // This site is never probed, so it is never in the denominator.
    for (const a of COMMUNITY_APPS) if (a.self) expect(probeUrl(a)).toBeNull();
  });
});

describe('respondingText', () => {
  it('says N of M when everything has been checked', () => {
    expect(respondingText({ total: 7, up: 6, degraded: 0, down: 1, unchecked: 0, responding: 6 })).toBe(
      '6 of 7 community apps responding',
    );
  });

  it('says what has not been checked instead of hiding it', () => {
    expect(respondingText({ total: 7, up: 4, degraded: 0, down: 0, unchecked: 3, responding: 4 })).toBe(
      '4 of 7 community apps responding, 3 not checked yet',
    );
  });

  it('claims no number when nothing has been checked', () => {
    expect(respondingText({ total: 7, up: 0, degraded: 0, down: 0, unchecked: 7, responding: 0 })).toBe(
      'Community apps not checked yet',
    );
  });

  it('keeps the singular right and survives an empty catalog', () => {
    expect(respondingText({ total: 1, up: 1, degraded: 0, down: 0, unchecked: 0, responding: 1 })).toBe(
      '1 of 1 community app responding',
    );
    expect(respondingText({ total: 0, up: 0, degraded: 0, down: 0, unchecked: 0, responding: 0 })).toBe(
      'No community apps to check',
    );
  });
});

describe('healthTone', () => {
  it('is ok only when everything answers', () => {
    expect(healthTone({ total: 3, up: 3, degraded: 0, down: 0, unchecked: 0, responding: 3 })).toBe('ok');
    expect(healthTone({ total: 3, up: 2, degraded: 0, down: 1, unchecked: 0, responding: 2 })).toBe('warn');
    expect(healthTone({ total: 3, up: 0, degraded: 0, down: 3, unchecked: 0, responding: 0 })).toBe('crit');
  });

  it('is neutral while nothing has been checked', () => {
    expect(healthTone({ total: 3, up: 0, degraded: 0, down: 0, unchecked: 3, responding: 0 })).toBe('off');
  });
});
