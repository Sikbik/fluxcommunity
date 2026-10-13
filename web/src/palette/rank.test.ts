import { COMMUNITY_APPS, GATEWAYS, NODE_HOSTS, SOCIALS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { type ActionState, buildItems, hostOf } from './items';
import { rank } from './rank';

const STATE: ActionState = {
  accent: 'flux',
  sound: false,
  autoAmbient: true,
  reducedMotion: false,
  motionOverride: null,
};
const items = buildItems(STATE);
const top = (query: string, n = 1) =>
  rank(items, query)
    .rows.slice(0, n)
    .map((r) => r.item.id);

// Whatever the catalog lists today: the tests derive their examples from it rather than naming builds.
const apps = COMMUNITY_APPS.filter((a) => !a.self);
const wordsOf = (name: string) => name.split(/\s+|(?<=[a-z])(?=[A-Z])/).filter(Boolean);

describe('the deck catalog', () => {
  it('has unique ids', () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every catalog app, host, gateway and community link', () => {
    const kinds = new Map<string, number>();
    for (const i of items) kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + 1);
    expect(kinds.get('section')).toBe(8);
    expect(kinds.get('app')).toBe(COMMUNITY_APPS.length);
    expect(kinds.get('host')).toBe(NODE_HOSTS.length);
    expect(kinds.get('gateway')).toBe(GATEWAYS.length);
    expect(kinds.get('social')).toBe(SOCIALS.length);
    // Ambient, four accents, sound, motion, auto ambient, copy link, submit, shortcuts, top, terminal.
    expect(kinds.get('action')).toBe(13);
  });

  it('offers the way back to the system motion setting only after an override', () => {
    const none = buildItems(STATE).some((i) => i.ref === 'motion-system');
    const some = buildItems({ ...STATE, motionOverride: true }).some((i) => i.ref === 'motion-system');
    expect(none).toBe(false);
    expect(some).toBe(true);
  });

  it('never builds a half-empty line for a channel with no handle', () => {
    for (const s of SOCIALS) {
      const i = items.find((x) => x.id === `social:${s.id}`);
      expect(i).toBeDefined();
      if (s.handle.trim() === '') {
        // No handle: the subtitle is the site, and nothing like "Name: " is built.
        expect(i?.subtitle).toBe(hostOf(s.url));
        expect(i?.description).toBe(`${s.name}, at ${hostOf(s.url)}`);
      } else {
        expect(i?.subtitle).toBe(s.handle);
        expect(i?.description).toBe(`${s.name}, ${s.handle}`);
      }
      expect(`${i?.title} ${i?.subtitle} ${i?.description}`).not.toMatch(/: $|: undefined|undefined/);
    }
  });

  it('marks the current accent and labels toggles with their state', () => {
    const on = buildItems({ ...STATE, accent: 'nimbus', sound: true });
    expect(on.find((i) => i.ref === 'accent:nimbus')?.state).toBe('current');
    expect(on.find((i) => i.ref === 'accent:flux')?.state).toBeUndefined();
    expect(on.find((i) => i.ref === 'sound')?.state).toBe('on');
  });
});

describe('rank with an empty query', () => {
  const r = rank(items, '');
  it('lists every item once, grouped in the fixed order', () => {
    expect(r.rows).toHaveLength(items.length);
    expect(r.groups.map((g) => g.id)).toEqual(['section', 'app', 'host', 'gateway', 'social', 'action']);
  });

  it('numbers rows consecutively', () => {
    expect(r.rows.map((x) => x.index)).toEqual(r.rows.map((_, i) => i));
  });

  it('puts recents first and does not repeat them', () => {
    const first = `app:${apps[0]?.id}`;
    const withRecents = rank(items, '', { recents: [first, 'section:builds', 'action:sound'] });
    expect(withRecents.groups[0]?.id).toBe('recent');
    // action:sound is transient, so it is not offered as a recent.
    expect(withRecents.groups[0]?.rows.map((x) => x.item.id)).toEqual([first, 'section:builds']);
    const ids = withRecents.rows.map((x) => x.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('rank with a query', () => {
  it('puts every app first for its own name', () => {
    expect(apps.length).toBeGreaterThan(0);
    for (const a of apps) expect(top(a.name)[0]).toBe(`app:${a.id}`);
  });

  it('finds an app by the start of a word in its name', () => {
    for (const a of apps) {
      const last = wordsOf(a.name).at(-1) ?? a.name;
      if (last.length < 3) continue;
      expect(top(last.slice(0, 3).toLowerCase(), 6)).toContain(`app:${a.id}`);
    }
  });

  it('finds an app by the initials of its name', () => {
    const multi = apps.filter((a) => wordsOf(a.name).length >= 3);
    expect(multi.length).toBeGreaterThan(0);
    for (const a of multi) {
      const initials = wordsOf(a.name)
        .map((w) => w[0])
        .join('')
        .toLowerCase();
      expect(top(initials, 6)).toContain(`app:${a.id}`);
    }
  });

  it('finds an app by its builder', () => {
    const builders = [...new Set(apps.map((a) => a.builder).filter((b): b is string => b !== null))];
    expect(builders.length).toBeGreaterThan(0);
    for (const builder of builders) {
      const found = top(builder.toLowerCase(), 12);
      for (const a of apps.filter((x) => x.builder === builder)) expect(found).toContain(`app:${a.id}`);
    }
  });

  it('finds hosts, gateways and community links by name', () => {
    for (const h of NODE_HOSTS) expect(top(h.name)[0]).toBe(`host:${h.id}`);
    for (const g of GATEWAYS) expect(top(g.name)[0]).toBe(`gateway:${g.id}`);
    for (const s of SOCIALS) expect(top(s.name)[0]).toBe(`social:${s.id}`);
  });

  it('finds sections by label and by alias', () => {
    expect(top('builds')[0]).toBe('section:builds');
    expect(top('games')[0]).toBe('section:play');
    expect(top('run a node')[0]).toBe('section:hosting');
  });

  it('finds actions by what they do', () => {
    expect(top('sound')[0]).toBe('action:sound');
    expect(top('ambient')[0]).toBe('action:ambient');
    expect(top('submit')[0]).toBe('action:submit');
    expect(top('shortcuts')[0]).toBe('action:shortcuts');
    expect(top('copy link')[0]).toBe('action:copy-link');
    const accents = top('accent', 4);
    expect(accents.every((id) => id.startsWith('action:accent:'))).toBe(true);
  });

  it('leads with the group that holds the best hit', () => {
    const social = SOCIALS[0];
    expect(rank(items, 'sound').groups[0]?.id).toBe('action');
    expect(rank(items, apps[0]?.name ?? '').groups[0]?.id).toBe('app');
    expect(rank(items, social?.name ?? '').groups[0]?.id).toBe('social');
  });

  it('puts a literal word in a description above a scattered match in a name', () => {
    // "status" is a subsequence of "Stratus", but only the Builds blurb really says "status".
    const ids = top('status', 8);
    expect(ids).toContain('section:builds');
    if (ids.includes('action:accent:stratus')) {
      expect(ids.indexOf('section:builds')).toBeLessThan(ids.indexOf('action:accent:stratus'));
    }
    // Abbreviations still work when nothing literal competes.
    expect(top('snd')[0]).toBe('action:sound');
  });

  it('returns nothing for gibberish', () => {
    const r = rank(items, 'qzqzqz');
    expect(r.rows).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it('requires every word of the query', () => {
    expect(rank(items, `${apps[0]?.name} qzqzqz`).rows).toHaveLength(0);
    expect(rank(items, `${apps[0]?.name}`).rows.length).toBeGreaterThan(0);
  });

  it('boosts what you used recently without hiding better matches', () => {
    const plain = rank(items, 'flux', { perGroup: 20 });
    const boosted = rank(items, 'flux', { recents: ['gateway:flux'], perGroup: 20 });
    const rankOf = (ids: string[], id: string) => ids.indexOf(id);
    const a = rankOf(
      plain.rows.map((r) => r.item.id),
      'gateway:flux',
    );
    const b = rankOf(
      boosted.rows.map((r) => r.item.id),
      'gateway:flux',
    );
    expect(b).toBeLessThanOrEqual(a);
  });

  it('highlights the matched title characters', () => {
    const app =
      apps.find((a) => (wordsOf(a.name).at(-1) ?? '').length >= 3) ?? (apps[0] as (typeof apps)[number]);
    const word = (wordsOf(app.name).at(-1) ?? app.name).slice(0, 3).toLowerCase();
    const row = rank(items, word).rows.find((x) => x.item.id === `app:${app.id}`);
    const start = app.name.toLowerCase().lastIndexOf(word);
    expect(row?.titleRanges).toEqual([[start, start + 3]]);
  });

  it('shows fewer rows for a single letter', () => {
    expect(rank(items, 'a').rows.length).toBeLessThanOrEqual(24);
    expect(rank(items, 'fl').rows.length).toBeGreaterThan(rank(items, 'a').rows.length);
  });

  it('caps rows per group and in total', () => {
    const r = rank(items, 'a', { perGroup: 3, maxRows: 7 });
    for (const g of r.groups) expect(g.rows.length).toBeLessThanOrEqual(3);
    expect(r.rows.length).toBeLessThanOrEqual(7);
  });
});

describe('speed', () => {
  it('ranks the whole catalog well inside a frame', () => {
    const queries = ['a', 'fl', 'flux', 'nox', 'fth', 'node orb', 'sound', 'accent', 'builds', 'github'];
    // Warm up, then time 10 passes of every query.
    for (const q of queries) rank(items, q);
    const start = performance.now();
    for (let pass = 0; pass < 10; pass++) for (const q of queries) rank(items, q);
    const per = (performance.now() - start) / (10 * queries.length);
    // The budget is 16 ms per keystroke; this is deliberately loose so it never flakes.
    expect(per).toBeLessThan(5);
  });
});
