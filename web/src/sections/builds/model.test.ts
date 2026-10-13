import { CATEGORIES, COMMUNITY_APPS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import {
  type AppEntry,
  buildEntries,
  builderProfile,
  categoryCounts,
  DEFAULT_FILTERS,
  type FilterState,
  filterAndSort,
  isFiltered,
  lifecycleLinks,
  relatedEntries,
  sharedBuilders,
} from './model';
import { AFTER, BEFORE, entriesOf, LIVE, makeApp, probe, SYNTH } from './testkit';

const entries = (now = BEFORE, byId: Parameters<typeof entriesOf>[2] = {}, ctx = LIVE) =>
  entriesOf(SYNTH, now, byId, ctx);

const ids = (list: readonly AppEntry[]) => list.map((e) => e.app.id);
const state = (over: Partial<FilterState> = {}): FilterState => ({ ...DEFAULT_FILTERS, ...over });
const SPOTLIT = SYNTH.filter((a) => a.spotlight).length;

describe('buildEntries', () => {
  it('joins every app with lifecycle and health', () => {
    const list = entries(BEFORE, { 'grid-view': probe('grid-view', 'up', 120) });
    expect(list).toHaveLength(SYNTH.length);
    const grid = list.find((e) => e.app.id === 'grid-view');
    expect(grid?.health.kind).toBe('up');
    expect(grid?.health.fresh).toBe(true);
    expect(grid?.health.latencyMs).toBe(120);
    expect(list.find((e) => e.app.id === 'old-ledger')?.lifecycle.state).toBe('retiring');
    expect(list.find((e) => e.app.id === 'orbit-pay')?.lifecycle.state).toBe('new');
    expect(list.find((e) => e.app.id === 'north-star')?.health.kind).toBe('self');
  });

  it('never claims Live without data', () => {
    const none = entries(BEFORE, {}, { loaded: false, freshness: 'unknown' });
    expect(none.every((e) => e.health.kind === (e.app.self ? 'self' : 'loading'))).toBe(true);

    const offline = entries(
      BEFORE,
      { 'grid-view': probe('grid-view', 'up', 120) },
      { loaded: true, freshness: 'offline' },
    );
    expect(offline.find((e) => e.app.id === 'grid-view')?.health.kind).toBe('unknown');
  });

  it('keeps the same objects when nothing visible changed', () => {
    const a = entries(BEFORE, { 'grid-view': probe('grid-view', 'up', 120) });
    const b = buildEntries(
      SYNTH,
      { byId: { 'grid-view': probe('grid-view', 'up', 120) }, ctx: LIVE },
      BEFORE + 5000,
      a,
    );
    expect(b.every((e, i) => e === a[i])).toBe(true);
    const c = buildEntries(
      SYNTH,
      { byId: { 'grid-view': probe('grid-view', 'down', null) }, ctx: LIVE },
      BEFORE,
      a,
    );
    expect(c.filter((e, i) => e !== a[i]).map((e) => e.app.id)).toEqual(['grid-view']);
  });
});

describe('sorting', () => {
  it('puts spotlighted apps first, in the Flux team order', () => {
    const r = filterAndSort(entries(), state());
    expect(r.entries.slice(0, SPOTLIT).every((e) => e.app.spotlight)).toBe(true);
    expect(ids(r.entries)).toEqual([
      'orbit-pay',
      'old-ledger',
      'node-watch',
      'grid-view',
      'north-star',
      'learn-lab',
      'node-sizer',
    ]);
  });

  it('sorts A to Z', () => {
    const names = filterAndSort(entries(), state({ sort: 'az' })).entries.map((e) => e.app.name);
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }),
    );
    expect(names).toEqual(sorted);
    expect(names[0]).toBe('Grid View');
  });

  it('sorts by status: live by latency, then the site, degraded, unchecked, down', () => {
    const byId = {
      'node-watch': probe('node-watch', 'up', 300),
      'grid-view': probe('grid-view', 'up', 90),
      'learn-lab': probe('learn-lab', 'degraded', 2900),
      'node-sizer': probe('node-sizer', 'down', null),
    };
    const r = filterAndSort(entries(BEFORE, byId), state({ sort: 'status' }));
    expect(ids(r.entries)).toEqual([
      'grid-view',
      'node-watch',
      'north-star',
      'learn-lab',
      'orbit-pay',
      'old-ledger',
      'node-sizer',
    ]);
  });

  it('keeps retired apps last when sorting by status, whatever their health', () => {
    const byId = { 'old-ledger': probe('old-ledger', 'up', 10) };
    const r = filterAndSort(entries(AFTER, byId), state({ sort: 'status' }));
    expect(r.entries.at(-1)?.app.id).toBe('old-ledger');
    expect(r.entries.at(-1)?.lifecycle.state).toBe('retired');
  });

  it('retires an app after its date and promotes its replacement', () => {
    const before = ids(filterAndSort(entries(BEFORE), state()).entries);
    expect(before.indexOf('old-ledger')).toBeLessThan(before.indexOf('grid-view'));
    expect(before.at(-1)).not.toBe('old-ledger');

    const after = filterAndSort(entries(AFTER), state()).entries;
    expect(after.at(-1)?.app.id).toBe('old-ledger');
    expect(after.at(-1)?.lifecycle.state).toBe('retired');
    expect(after[0]?.app.id).toBe('orbit-pay');
    expect(after[0]?.lifecycle.promoted).toBe(true);
  });

  it('ranks by relevance on the default sort, and by the chosen sort otherwise', () => {
    const byRelevance = filterAndSort(entries(), state({ query: 'node' }));
    expect(byRelevance.relevance).toBe(true);
    // Two names say node; one tagline does.
    expect(ids(byRelevance.entries).slice(0, 2).sort()).toEqual(['node-sizer', 'node-watch']);
    expect(ids(byRelevance.entries)[2]).toBe('grid-view');
    expect(byRelevance.scores?.get('node-watch')).toBeGreaterThan(byRelevance.scores?.get('grid-view') ?? 0);

    const az = filterAndSort(entries(), state({ query: 'node', sort: 'az' }));
    expect(az.relevance).toBe(false);
    expect(ids(az.entries)).toEqual(['grid-view', 'node-sizer', 'node-watch']);
  });
});

describe('filtering', () => {
  it('filters by category', () => {
    const r = filterAndSort(entries(), state({ category: 'nodes' }));
    expect(ids(r.entries)).toEqual(['node-watch', 'node-sizer']);
  });

  it('combines query and category', () => {
    expect(ids(filterAndSort(entries(), state({ query: 'sizer', category: 'nodes' })).entries)).toEqual([
      'node-sizer',
    ]);
    expect(filterAndSort(entries(), state({ query: 'sizer', category: 'rewards' })).entries).toEqual([]);
  });

  it('pivots on a builder', () => {
    const r = filterAndSort(entries(), state({ builder: 'Acme Labs' }));
    expect(ids(r.entries)).toEqual(['orbit-pay', 'old-ledger', 'grid-view']);
    expect(filterAndSort(entries(), state({ builder: 'Nobody' })).entries).toEqual([]);
  });

  it('supports operators', () => {
    const run = (query: string, now = BEFORE) => ids(filterAndSort(entries(now), state({ query })).entries);
    expect(run('is:new')).toEqual(['orbit-pay']);
    expect(run('is:retiring')).toEqual(['old-ledger']);
    expect(run('is:retiring', AFTER)).toEqual([]);
    expect(run('is:retired', AFTER)).toEqual(['old-ledger']);
    expect(run('by:beta')).toEqual(['node-watch']);
    expect(run('cat:learn')).toEqual(['learn-lab']);
    expect(run('cat:nodes')).toEqual(['node-watch', 'node-sizer']);
    expect(run('host:sizer')).toEqual(['node-sizer']);
    expect(run('is:self')).toEqual(['north-star']);
    expect(run('is:spotlight')).toHaveLength(SPOTLIT);
  });

  it('filters by live status from the data layer', () => {
    const byId = {
      'grid-view': probe('grid-view', 'down', null),
      'node-watch': probe('node-watch', 'up', 90),
      'learn-lab': probe('learn-lab', 'degraded', 2800),
    };
    const list = entries(BEFORE, byId);
    expect(ids(filterAndSort(list, state({ query: 'is:down' })).entries)).toEqual(['grid-view']);
    expect(ids(filterAndSort(list, state({ query: 'is:up' })).entries)).toEqual(['node-watch']);
    expect(ids(filterAndSort(list, state({ query: 'is:degraded' })).entries)).toEqual(['learn-lab']);
    // Not the three probed apps, and not the site itself (it is never probed and says so).
    expect(filterAndSort(list, state({ query: 'is:unchecked' })).entries).toHaveLength(SYNTH.length - 4);
  });

  it('combines an operator with words', () => {
    const r = filterAndSort(entries(), state({ query: 'node is:spotlight' }));
    expect(r.entries.every((e) => e.app.spotlight)).toBe(true);
    expect(ids(r.entries).sort()).toEqual(['grid-view', 'node-watch']);
  });

  it('returns nothing for a query with no match', () => {
    expect(filterAndSort(entries(), state({ query: 'zzzzzz' })).entries).toEqual([]);
    expect(filterAndSort(entries(), state({ query: 'is:nonsense' })).entries).toEqual([]);
  });

  it('does not change the input', () => {
    const list = entries();
    const copy = [...list];
    filterAndSort(list, state({ sort: 'az', query: 'node' }));
    expect(list).toEqual(copy);
  });
});

describe('category counts', () => {
  it('count the catalog by category', () => {
    const c = categoryCounts(entries(), { query: '', builder: null });
    expect(c.all).toBe(SYNTH.length);
    for (const cat of CATEGORIES) {
      expect(c[cat.id]).toBe(SYNTH.filter((a) => a.category === cat.id).length);
    }
    expect(CATEGORIES.reduce((n, cat) => n + c[cat.id], 0)).toBe(c.all);
  });

  it('follow the query and the builder pivot', () => {
    const list = entries();
    for (const base of [
      { query: 'node', builder: null },
      { query: '', builder: 'Acme Labs' },
      { query: 'is:spotlight', builder: null },
    ]) {
      const c = categoryCounts(list, base);
      expect(c.all).toBe(filterAndSort(list, state(base)).entries.length);
      for (const cat of CATEGORIES) {
        expect(c[cat.id]).toBe(filterAndSort(list, state({ ...base, category: cat.id })).entries.length);
      }
    }
    expect(categoryCounts(list, { query: 'node', builder: null }).nodes).toBe(2);
    expect(categoryCounts(list, { query: 'node', builder: null }).education).toBe(0);
  });
});

describe('builders, related apps and lifecycle links', () => {
  it('profiles a builder', () => {
    const p = builderProfile(entries(), 'Acme Labs');
    expect(p?.apps).toHaveLength(3);
    expect(p?.spotlighted).toBe(3);
    expect(p?.categories).toEqual(['rewards', 'network']);
    expect(builderProfile(entries(), 'Nobody')).toBeNull();
  });

  it('finds related apps by builder and category', () => {
    const rel = relatedEntries(entries(), 'old-ledger', 3).map((e) => e.app.id);
    // Same builder and category, then same builder; nothing else is related.
    expect(rel).toEqual(['orbit-pay', 'grid-view']);
    expect(rel).not.toContain('old-ledger');
    expect(relatedEntries(entries(), 'does-not-exist')).toEqual([]);
    expect(relatedEntries(entries(), 'node-watch', 5).map((e) => e.app.id)).toEqual(['node-sizer']);
  });

  it('ranks the same builder above the same category', () => {
    const peer = makeApp({ id: 'net-peer', category: 'network', builder: 'Zed' });
    const list = entriesOf([...SYNTH, peer]);
    const rel = relatedEntries(list, 'grid-view', 4).map((e) => e.app.id);
    expect(rel.indexOf('orbit-pay')).toBeLessThan(rel.indexOf('net-peer'));
    expect(rel.indexOf('old-ledger')).toBeLessThan(rel.indexOf('net-peer'));
    expect(rel).toContain('net-peer');
  });

  it('puts retired apps last among related apps', () => {
    const rel = relatedEntries(entries(AFTER), 'grid-view', 5).map((e) => e.app.id);
    expect(rel.at(-1)).toBe('old-ledger');
  });

  it('resolves what replaces what', () => {
    const links = lifecycleLinks(entries(), 'old-ledger');
    expect(links.successor?.app.id).toBe('orbit-pay');
    expect(links.predecessor).toBeNull();
    expect(lifecycleLinks(entries(), 'orbit-pay').predecessor?.app.id).toBe('old-ledger');
    expect(lifecycleLinks(entries(), 'orbit-pay').successor).toBeNull();
    expect(lifecycleLinks(entries(), 'does-not-exist')).toEqual({ successor: null, predecessor: null });
  });
});

describe('sharedBuilders', () => {
  it('lists only builders with more than one build', () => {
    expect([...sharedBuilders(entries())]).toEqual(['Acme Labs']);
    expect(sharedBuilders(entriesOf([]))).toEqual(new Set());
  });

  it('follows the catalog, not a hard-coded list', () => {
    const real = entriesOf(COMMUNITY_APPS);
    for (const handle of sharedBuilders(real)) {
      expect(COMMUNITY_APPS.filter((a) => a.builder === handle).length).toBeGreaterThan(1);
    }
    const single = COMMUNITY_APPS.filter(
      (a) => a.builder && COMMUNITY_APPS.filter((b) => b.builder === a.builder).length === 1,
    );
    for (const a of single) expect(sharedBuilders(real).has(a.builder as string)).toBe(false);
  });
});

describe('isFiltered', () => {
  it('is true only when something narrows the list', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered(state({ sort: 'az' }))).toBe(false);
    expect(isFiltered(state({ query: ' ' }))).toBe(false);
    expect(isFiltered(state({ query: 'a' }))).toBe(true);
    expect(isFiltered(state({ category: 'nodes' }))).toBe(true);
    expect(isFiltered(state({ builder: 'Method' }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The real catalog: invariants, never a hard-coded list of what is in it.
// ---------------------------------------------------------------------------

describe('the real catalog', () => {
  const real = entriesOf(COMMUNITY_APPS);

  it('has unique ids and known categories', () => {
    expect(new Set(COMMUNITY_APPS.map((a) => a.id)).size).toBe(COMMUNITY_APPS.length);
    const known = new Set<string>(CATEGORIES.map((c) => c.id));
    for (const a of COMMUNITY_APPS) expect(known.has(a.category)).toBe(true);
  });

  it('only links apps that exist', () => {
    const idsInCatalog = new Set(COMMUNITY_APPS.map((a) => a.id));
    for (const a of COMMUNITY_APPS) {
      if (a.replacedBy) expect(idsInCatalog.has(a.replacedBy)).toBe(true);
      if (a.replaces) expect(idsInCatalog.has(a.replaces)).toBe(true);
    }
  });

  it('gives every retiring app a date, so a countdown is always honest', () => {
    for (const a of COMMUNITY_APPS) {
      if (a.lifecycle === 'retiring') expect(Number.isFinite(Date.parse(a.retiresOn ?? ''))).toBe(true);
    }
  });

  it('counts by category exactly as a recount does', () => {
    const c = categoryCounts(real, { query: '', builder: null });
    expect(c.all).toBe(COMMUNITY_APPS.length);
    for (const cat of CATEGORIES) {
      expect(c[cat.id]).toBe(COMMUNITY_APPS.filter((a) => a.category === cat.id).length);
    }
    expect(CATEGORIES.reduce((n, cat) => n + c[cat.id], 0)).toBe(c.all);
  });

  it('lists the spotlighted builds first, in catalog order', () => {
    const r = filterAndSort(real, state());
    expect(r.entries).toHaveLength(COMMUNITY_APPS.length);
    const live = r.entries.filter((e) => e.lifecycle.state !== 'retired');
    const lit = live.filter((e) => e.app.spotlight);
    expect(live.slice(0, lit.length).every((e) => e.app.spotlight)).toBe(true);
    const order = (list: readonly AppEntry[]) => list.map((e) => e.order);
    const plain = lit.filter((e) => !e.lifecycle.promoted);
    expect(order(plain)).toEqual([...order(plain)].sort((a, b) => a - b));
  });

  it('finds every app by its own name, first', () => {
    for (const a of COMMUNITY_APPS) {
      const r = filterAndSort(real, state({ query: a.name }));
      expect(r.entries[0]?.app.id).toBe(a.id);
    }
  });

  it('finds every attributed app by its builder', () => {
    for (const a of COMMUNITY_APPS) {
      if (!a.builder) continue;
      const hits = ids(filterAndSort(real, state({ query: `by:"${a.builder}"` })).entries);
      expect(hits).toContain(a.id);
      const theirs = COMMUNITY_APPS.filter((x) => x.builder === a.builder).map((x) => x.id);
      expect([...hits].sort()).toEqual([...theirs].sort());
    }
  });
});
