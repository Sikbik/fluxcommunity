import type { CommunityApp, NodeHost } from '@shared/catalog';
import { COMMUNITY_APPS, NODE_HOSTS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { cleanHandle, collectCredits, creditKey } from './credits';

function app(id: string, builder: string | null, name = id): CommunityApp {
  return {
    id,
    name,
    tagline: '',
    description: '',
    category: 'network',
    builder,
    url: `https://${id}.example`,
    host: `${id}.example`,
    lifecycle: 'live',
  };
}

function host(id: string, operator: string, name = id): NodeHost {
  return { id, name, operator, url: null, host: null, blurb: '', contact: 'web' };
}

describe('cleanHandle and creditKey', () => {
  it('trims and collapses whitespace but keeps the credited spelling', () => {
    expect(cleanHandle('  2ndTL   Mining ')).toBe('2ndTL Mining');
    expect(cleanHandle('CarRamRodB16_228')).toBe('CarRamRodB16_228');
  });

  it('matches handles ignoring case, spacing and width', () => {
    expect(creditKey('Little Stache')).toBe(creditKey(' little   STACHE '));
    expect(creditKey('ＤataVex')).toBe(creditKey('datavex'));
    expect(creditKey('w2vy')).not.toBe(creditKey('w2vy2'));
  });
});

describe('collectCredits', () => {
  it('lists each builder once, in first appearance order, with everything they built', () => {
    const credits = collectCredits(
      [app('a', 'Ada'), app('b', 'Grace'), app('c', 'Ada'), app('d', 'Linus')],
      [host('h1', 'Grace'), host('h2', 'Margaret')],
    );
    expect(credits.map((c) => c.handle)).toEqual(['Ada', 'Grace', 'Linus', 'Margaret']);
    expect(credits[0]?.works.map((w) => `${w.kind}:${w.id}`)).toEqual(['app:a', 'app:c']);
    expect(credits[1]?.works.map((w) => `${w.kind}:${w.id}`)).toEqual(['app:b', 'host:h1']);
  });

  it('merges spellings that differ only by case or spacing and keeps the first one', () => {
    const credits = collectCredits(
      [app('a', 'Little Stache'), app('b', 'little  stache'), app('c', 'LITTLE STACHE ')],
      [],
    );
    expect(credits).toHaveLength(1);
    expect(credits[0]?.handle).toBe('Little Stache');
    expect(credits[0]?.works).toHaveLength(3);
  });

  it('skips unattributed entries and blank handles', () => {
    const credits = collectCredits(
      [app('a', null), app('b', ''), app('c', '   '), app('d', 'Ada')],
      [host('h', '  ')],
    );
    expect(credits.map((c) => c.handle)).toEqual(['Ada']);
  });

  it('does not list the same work twice', () => {
    const dup = app('a', 'Ada');
    const credits = collectCredits([dup, dup], []);
    expect(credits[0]?.works).toHaveLength(1);
  });

  it('credits every attributed entry of the real catalog exactly once', () => {
    const credits = collectCredits(COMMUNITY_APPS, NODE_HOSTS);
    const handles = credits.map((c) => c.handle);
    expect(new Set(handles.map(creditKey)).size).toBe(handles.length);

    const attributed = [
      ...COMMUNITY_APPS.filter((a) => a.builder).map((a) => `app:${a.id}`),
      ...NODE_HOSTS.filter((h) => h.operator).map((h) => `host:${h.id}`),
    ];
    const credited = credits.flatMap((c) => c.works.map((w) => `${w.kind}:${w.id}`));
    expect([...credited].sort()).toEqual([...attributed].sort());
    // Every credit is a name with at least one thing they made (the catalog is edited by hand).
    expect(credits.length).toBeGreaterThan(0);
    for (const c of credits) {
      expect(c.handle.length).toBeGreaterThan(0);
      expect(c.works.length).toBeGreaterThan(0);
    }
  });
});
