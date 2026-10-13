import type { Meta } from '@shared/api';
import { describe, expect, it } from 'vitest';
import { FALLBACK_AS_OF, getFallback } from './fixtures';
import { FRESH_WINDOW_MS, SECTION_WINDOW_MS, sectionStatus } from './freshness';
import { createDataStore, shareStructure } from './store';
import { liveMeta, networkAt } from './testkit';

const T0 = Date.parse('2026-10-12T12:00:00Z');
const fb = getFallback();

function fresh() {
  return createDataStore();
}

describe('freshness transitions', () => {
  it('starts unknown with no data', () => {
    const s = fresh().getState();
    expect(s.network).toMatchObject({ data: null, meta: null, freshness: 'unknown', ageMs: null });
  });

  it('live when the server says live and it is inside the window', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(1, T0), liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    expect(store.getState().network.freshness).toBe('live');
    expect(store.getState().network.ageMs).toBe(0);
  });

  it('adds time since arrival to the age the server reported', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(1, T0), liveMeta(T0, { ageMs: 7000 }), {
      receivedAt: T0,
      origin: 'rest',
    });
    store.getState().recompute(T0 + 3000);
    expect(store.getState().network.ageMs).toBe(10_000);
    expect(store.getState().network.freshness).toBe('live');
  });

  it.each([
    ['network', FRESH_WINDOW_MS.network],
    ['blocks', FRESH_WINDOW_MS.blocks],
    ['health', FRESH_WINDOW_MS.health],
    ['geo', FRESH_WINDOW_MS.geo],
  ] as const)('%s turns cached exactly at its window', (key, windowMs) => {
    const store = fresh();
    store.getState().ingest(key, fb[key] as never, liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    store.getState().recompute(T0 + windowMs - 1);
    expect(store.getState()[key].freshness).toBe('live');
    store.getState().recompute(T0 + windowMs);
    expect(store.getState()[key].freshness).toBe('cached');
  });

  it('windows are the documented ones', () => {
    expect(FRESH_WINDOW_MS).toEqual({ network: 45_000, geo: 900_000, blocks: 90_000, health: 240_000 });
  });

  it('cached when the server marks it stale or serves it from cache', () => {
    const store = fresh();
    const base = { receivedAt: T0, origin: 'rest' as const };
    store.getState().ingest('network', networkAt(1, T0), liveMeta(T0, { stale: true }), base);
    expect(store.getState().network.freshness).toBe('cached');
    store.getState().ingest('network', networkAt(2, T0), liveMeta(T0, { source: 'cache' }), base);
    expect(store.getState().network.freshness).toBe('cached');
  });

  it('offline when connection is down and the data is past its window; stays cached otherwise', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(1, T0), liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    store.getState().recompute(T0 + 60_000);
    expect(store.getState().network.freshness).toBe('cached');
    store.getState().setConnection('offline', T0 + 60_000);
    expect(store.getState().network.freshness).toBe('offline');
    // The last known value is kept and its age keeps counting.
    expect(store.getState().network.data?.chain.height).toBe(1);
    expect(store.getState().network.ageMs).toBe(60_000);
    // Inside the window it is still live even when the link just dropped.
    store.getState().ingest('network', networkAt(2, T0), liveMeta(T0 + 70_000), {
      receivedAt: T0 + 70_000,
      origin: 'rest',
    });
    expect(store.getState().network.freshness).toBe('live');
  });
});

describe('fallback honesty', () => {
  it('is tagged fallback, labelled offline, dated, and never live', () => {
    const store = fresh();
    store.getState().applyFallback(undefined, T0);
    for (const key of ['network', 'geo', 'blocks', 'health'] as const) {
      const v = store.getState()[key];
      expect(v.freshness).toBe('offline');
      expect(v.meta?.source).toBe('fallback');
      expect(v.meta?.asOf).toBe(FALLBACK_AS_OF);
      expect(v.data).not.toBeNull();
    }
    expect(store.getState().lastSuccess).toEqual({ network: null, geo: null, blocks: null, health: null });
    expect(store.getState().network.ageMs).toBe(T0 - Date.parse(FALLBACK_AS_OF));
  });

  it('every fixture says fallback, and health claims nothing', () => {
    expect(fb.health.apps.length).toBeGreaterThan(5);
    expect(fb.health.apps.every((a) => a.state === 'unknown' && a.checkedAt === null)).toBe(true);
    expect(fb.network.chain.height).toBe(3_031_000);
    expect(fb.network.nodes.tiers).toEqual({ cumulus: 3583, nimbus: 1689, stratus: 1830 });
    expect(fb.network.nodes.total).toBe(7102);
    expect(fb.network.rewards.nextReduction?.height).toBe(3_071_200);
    expect(fb.network.market?.priceUsd).toBe(0.086);
    expect(fb.network.chain.targetBlockSec).toBe(30);
    // Geo fixture is internally consistent.
    const countryNodes = fb.geo.countries.reduce((a, c) => a + c.nodes, 0);
    const pointNodes = fb.geo.points.reduce((a, p) => a + p.n, 0);
    expect(countryNodes).toBe(fb.geo.located);
    expect(pointNodes).toBe(fb.geo.located);
    expect(fb.geo.located).toBeLessThanOrEqual(fb.geo.total);
  });

  it('only fills empty slots and never replaces real data', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(5, T0), liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    store.getState().applyFallback(undefined, T0 + 1);
    expect(store.getState().network.meta?.source).toBe('live');
    expect(store.getState().network.data?.chain.height).toBe(5);
    expect(store.getState().geo.meta?.source).toBe('fallback');
  });

  it('real data replaces the fallback', () => {
    const store = fresh();
    store.getState().applyFallback(['network'], T0);
    store
      .getState()
      .ingest('network', networkAt(3_040_000, T0), liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    expect(store.getState().network.freshness).toBe('live');
    expect(store.getState().lastSuccess.network).toBe(T0);
  });
});

describe('references stay stable', () => {
  it('reuses the Sourced object between ticks when nothing visible changed', () => {
    const store = fresh();
    store.getState().applyFallback(['network'], T0);
    const a = store.getState().network;
    store.getState().recompute(T0 + 1000);
    // The fallback's age moves with the clock, so the view updates, but the data object is shared.
    expect(store.getState().network.data).toBe(a.data);
  });

  it('keeps unchanged health entries by reference across updates', () => {
    const store = fresh();
    const first = { apps: fb.health.apps.map((a) => ({ ...a, state: 'up' as const })) };
    store.getState().ingest('health', first, liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    const before = store.getState().health.data?.apps ?? [];
    const second = {
      apps: first.apps.map((a, i) => (i === 0 ? { ...a, state: 'down' as const } : { ...a })),
    };
    store
      .getState()
      .ingest('health', second, liveMeta(T0 + 60_000), { receivedAt: T0 + 60_000, origin: 'rest' });
    const after = store.getState().health.data?.apps ?? [];
    expect(after[0]).not.toBe(before[0]);
    expect(after[0]?.state).toBe('down');
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it('an identical payload keeps the identical data object', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(9, T0), liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    const d1 = store.getState().network.data;
    store.getState().ingest('network', networkAt(9, T0), liveMeta(T0 + 10_000), {
      receivedAt: T0 + 10_000,
      origin: 'rest',
    });
    expect(store.getState().network.data).toBe(d1);
  });

  it('shareStructure leaves genuinely different values alone', () => {
    const prev = { a: [1, 2, { x: 1 }], b: 'k' };
    const next = { a: [1, 2, { x: 2 }], b: 'k' };
    const out = shareStructure(prev, next);
    expect(out).toEqual(next);
    expect(out).not.toBe(prev);
  });
});

describe('ordering', () => {
  it('a slower REST response with an older height does not roll the network back', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(10, T0), liveMeta(T0), { receivedAt: T0, origin: 'sse' });
    const applied = store.getState().ingest('network', networkAt(9, T0 - 5000), liveMeta(T0 - 5000), {
      receivedAt: T0 + 100,
      origin: 'rest',
    });
    expect(applied).toBe(false);
    expect(store.getState().network.data?.chain.height).toBe(10);
  });

  it('a REST health response requested before a newer stream event does not overwrite it', () => {
    const store = fresh();
    const up = { apps: fb.health.apps.map((a) => ({ ...a, state: 'up' as const })) };
    const down = { apps: fb.health.apps.map((a) => ({ ...a, state: 'down' as const })) };
    store.getState().ingest('health', down, liveMeta(T0), { receivedAt: T0, origin: 'sse' });
    const applied = store.getState().ingest('health', up, liveMeta(T0), {
      receivedAt: T0 + 50,
      origin: 'rest',
      requestStartedAt: T0 - 100,
    });
    expect(applied).toBe(false);
    expect(store.getState().health.data?.apps[0]?.state).toBe('down');
  });
});

describe('blocks', () => {
  it('appends a streamed block with a computed interval, once', () => {
    const store = fresh();
    const tip = fb.blocks.blocks[fb.blocks.blocks.length - 1];
    if (!tip) throw new Error('fixture');
    const meta: Meta = liveMeta(T0);
    store.getState().ingest('blocks', fb.blocks, meta, { receivedAt: T0, origin: 'rest' });
    const t = new Date(Date.parse(tip.time) + 31_000).toISOString();
    expect(store.getState().appendBlock({ height: tip.height + 1, time: t, txCount: 2 }, T0 + 1)).toBe(true);
    expect(store.getState().appendBlock({ height: tip.height + 1, time: t, txCount: 2 }, T0 + 2)).toBe(false);
    const list = store.getState().blocks.data?.blocks ?? [];
    expect(list[list.length - 1]).toMatchObject({ height: tip.height + 1, intervalSec: 31 });
    expect(list.length).toBe(fb.blocks.blocks.length + 1);
    expect(store.getState().blocks.freshness).toBe('live');
  });

  it('does not build a live blocks list out of nothing or on top of the fallback', () => {
    const store = fresh();
    expect(store.getState().appendBlock({ height: 1, time: '2026-10-12T00:00:00Z', txCount: null }, T0)).toBe(
      false,
    );
    store.getState().applyFallback(['blocks'], T0);
    expect(store.getState().appendBlock({ height: 1, time: '2026-10-12T00:00:00Z', txCount: null }, T0)).toBe(
      false,
    );
  });

  it('a REST list that is older than streamed blocks keeps the newer streamed ones', () => {
    const store = fresh();
    const blocks = fb.blocks.blocks;
    const tip = blocks[blocks.length - 1];
    if (!tip) throw new Error('fixture');
    store.getState().ingest('blocks', fb.blocks, liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    const t = new Date(Date.parse(tip.time) + 30_000).toISOString();
    store.getState().appendBlock({ height: tip.height + 1, time: t, txCount: null }, T0 + 1);
    store.getState().ingest('blocks', fb.blocks, liveMeta(T0 + 2), { receivedAt: T0 + 2, origin: 'rest' });
    const list = store.getState().blocks.data?.blocks ?? [];
    expect(list[list.length - 1]?.height).toBe(tip.height + 1);
  });
});

describe('section freshness', () => {
  const stamp = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

  function viewWith(freshness: NonNullable<ReturnType<typeof networkAt>['freshness']>, ageAtArrival = 0) {
    const store = fresh();
    const data = { ...networkAt(10, T0), freshness };
    store.getState().ingest('network', data, liveMeta(T0, { ageMs: ageAtArrival }), {
      receivedAt: T0,
      origin: 'sse',
    });
    return store;
  }

  it('labels each section by its own stamp and window', () => {
    const store = viewWith({
      chain: stamp(-1000),
      nodes: stamp(-5000),
      capacity: stamp(-4 * 60_000),
      apps: stamp(-20 * 60_000),
      market: stamp(-2 * 60_000),
    });
    const c = store.getState().connection;
    const view = () => store.getState().network;
    expect(sectionStatus(view(), 'chain', c)).toMatchObject({ freshness: 'live', ageMs: 1000 });
    expect(sectionStatus(view(), 'market', c)).toMatchObject({ freshness: 'live', ageMs: 120_000 });
    expect(sectionStatus(view(), 'apps', c).freshness).toBe('live');
    expect(sectionStatus(view(), 'capacity', c).asOf).toBe(stamp(-4 * 60_000));

    // Ninety seconds later the chain and nodes are past their 45 s window, market is not.
    store.getState().recompute(T0 + 90_000);
    expect(sectionStatus(view(), 'chain', c).freshness).toBe('cached');
    expect(sectionStatus(view(), 'nodes', c).freshness).toBe('cached');
    expect(sectionStatus(view(), 'market', c).freshness).toBe('live');
    // And two minutes after that the price tile is past its five minute window.
    store.getState().recompute(T0 + 90_000 + 120_000);
    expect(sectionStatus(view(), 'market', c)).toMatchObject({ freshness: 'cached' });
    expect(SECTION_WINDOW_MS.market).toBe(300_000);
  });

  it('is skew free: it compares server stamps with the server generatedAt', () => {
    const store = fresh();
    const serverNow = T0 + 5 * 60_000; // server clock five minutes ahead of ours
    const data = {
      ...networkAt(10, serverNow),
      freshness: {
        chain: new Date(serverNow - 2000).toISOString(),
        nodes: null,
        capacity: null,
        apps: null,
        market: null,
      },
    };
    store.getState().ingest('network', data, liveMeta(serverNow), { receivedAt: T0, origin: 'sse' });
    expect(sectionStatus(store.getState().network, 'chain', 'live').ageMs).toBe(2000);
  });

  it('is unknown for a null stamp, unknown with no data, and offline for fallback', () => {
    const store = viewWith({ chain: stamp(0), nodes: stamp(0), capacity: null, apps: null, market: null });
    expect(sectionStatus(store.getState().network, 'capacity', 'live').freshness).toBe('unknown');
    expect(sectionStatus(fresh().getState().network, 'chain', 'live')).toEqual({
      freshness: 'unknown',
      asOf: null,
      ageMs: null,
    });
    const fb2 = fresh();
    fb2.getState().applyFallback(['network'], T0);
    expect(sectionStatus(fb2.getState().network, 'market', 'live')).toMatchObject({
      freshness: 'offline',
      asOf: FALLBACK_AS_OF,
    });
  });

  it('uses the whole snapshot freshness when the server sends no per-section stamps', () => {
    const store = fresh();
    store.getState().ingest('network', networkAt(10, T0), liveMeta(T0), { receivedAt: T0, origin: 'rest' });
    expect(sectionStatus(store.getState().network, 'market', 'live').freshness).toBe('live');
    store.getState().recompute(T0 + 60_000);
    expect(sectionStatus(store.getState().network, 'market', 'live').freshness).toBe('cached');
  });

  it('goes offline when the connection is down and the section is past its window', () => {
    const store = viewWith({
      chain: stamp(-1000),
      nodes: stamp(0),
      capacity: null,
      apps: null,
      market: stamp(0),
    });
    store.getState().recompute(T0 + 120_000);
    expect(sectionStatus(store.getState().network, 'chain', 'offline').freshness).toBe('offline');
  });
});
