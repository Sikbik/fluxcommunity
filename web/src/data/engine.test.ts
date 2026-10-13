import { API_PATHS } from '@shared/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicker } from './clock';
import { createEngine, type EngineDeps, expectedIntervalMs } from './engine';
import { FALLBACK_AS_OF, FALLBACK_HEIGHT } from './fixtures';
import { createDataStore } from './store';
import { createFakeEnv, createFakeServer, createRecordingBus, type FakeServer, networkAt } from './testkit';

const START = Date.parse('2026-10-12T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
}
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

function harness(over: Partial<EngineDeps> = {}) {
  const server = createFakeServer();
  const env = createFakeEnv();
  const bus = createRecordingBus();
  const store = createDataStore();
  const ticker = createTicker(env);
  const engine = createEngine({
    env,
    ticker,
    store,
    bus,
    fetch: server.fetch,
    random: () => 0,
    ...over,
  });
  return { server, env, bus, store, ticker, engine };
}

/** Block event for the server's next height, stamped `ageMs` ago on the server clock. */
function blockEvent(server: FakeServer, height: number, ageMs = 1000) {
  return { height, time: new Date(Date.now() + server.clockOffsetMs - ageMs).toISOString(), txCount: 1 };
}

describe('SSE happy path', () => {
  it('connects, says live, ingests REST with real meta, and never pulses on hello', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    expect(h.store.getState().connection).toBe('connecting');
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    expect(h.store.getState().network.freshness).toBe('live');
    expect(h.store.getState().network.meta?.source).toBe('live');
    expect(h.store.getState().blocks.freshness).toBe('live');
    expect(h.store.getState().health.data).not.toBeNull();
    expect(h.store.getState().geo.data).not.toBeNull();
    expect(h.bus.pulses).toBe(0);
    expect(h.bus.chain).toMatchObject({ height: 3_031_000, live: true });
    expect(h.bus.chain.lastBlockAt).not.toBeNull();
    h.engine.stop();
  });

  it('fires one pulse per genuinely new block and never twice for the same height', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();

    const s = h.server.lastStream();
    s.push('block', blockEvent(h.server, 3_031_001));
    await flush();
    expect(h.bus.pulses).toBe(1);
    expect(h.bus.chain.height).toBe(3_031_001);

    // The same block again, and a network snapshot at the same height: nothing.
    s.push('block', blockEvent(h.server, 3_031_001));
    s.push('network', networkAt(3_031_001, Date.now() - 1000));
    await flush();
    expect(h.bus.pulses).toBe(1);

    // A network snapshot that is ahead of the block event pulses once; the block event after it does not.
    s.push('network', networkAt(3_031_002, Date.now() - 500));
    await flush();
    expect(h.bus.pulses).toBe(2);
    s.push('block', blockEvent(h.server, 3_031_002));
    await flush();
    expect(h.bus.pulses).toBe(2);
    expect(h.bus.chain.height).toBe(3_031_002);

    // An older height arriving late does not move the tip or pulse.
    s.push('block', blockEvent(h.server, 3_031_001));
    await flush();
    expect(h.bus.pulses).toBe(2);
    expect(h.bus.chain.height).toBe(3_031_002);
    h.engine.stop();
  });

  it('streamed blocks extend the blocks list and keep it live', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    const before = h.store.getState().blocks.data?.blocks.length ?? 0;
    h.server.lastStream().push('block', blockEvent(h.server, 3_031_001));
    await flush();
    expect(h.store.getState().blocks.data?.blocks.length).toBe(before + 1);
    expect(h.store.getState().lastSuccess.blocks).toBe(Date.now());
    h.engine.stop();
  });

  it('a reconnect hello that reports a newer height does not pulse (resync only)', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    h.server.lastStream().end();
    await flush();
    h.server.data.network = networkAt(3_031_006, Date.now());
    await advance(1100);
    h.server.hello();
    await flush();
    expect(h.bus.chain.height).toBe(3_031_006);
    expect(h.bus.pulses).toBe(0);
    h.engine.stop();
  });
});

describe('clock skew', () => {
  it('corrects block times by the hello serverTime', async () => {
    const h = harness();
    h.server.clockOffsetMs = 5 * 60_000; // the server clock is five minutes ahead
    h.server.data.network = networkAt(3_031_000, Date.now() + h.server.clockOffsetMs - 4000);
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.store.getState().skewMs).toBe(5 * 60_000);
    // Tip landed 4 s ago on the server clock, so 4 s ago on ours.
    expect(h.bus.chain.lastBlockAt).toBe(Date.now() - 4000);
    expect(h.bus.chain.live).toBe(true);

    // Without the correction the block would be five minutes in the future: check a new block too.
    h.server.lastStream().push('block', blockEvent(h.server, 3_031_001, 2000));
    await flush();
    expect(h.bus.chain.lastBlockAt).toBe(Date.now() - 2000);
    expect(h.bus.pulses).toBe(1);
    h.engine.stop();
  });

  it('works for a client clock that is ahead of the server too', async () => {
    const h = harness();
    h.server.clockOffsetMs = -90_000;
    h.server.data.network = networkAt(3_031_000, Date.now() + h.server.clockOffsetMs - 10_000);
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.bus.chain.lastBlockAt).toBe(Date.now() - 10_000);
    h.engine.stop();
  });

  it('estimates skew from REST when there is no stream', async () => {
    const h = harness();
    h.server.streamMode = 'refuse';
    h.server.clockOffsetMs = 60_000;
    h.engine.start();
    await flush();
    expect(h.store.getState().skewSource).toBe('rest');
    expect(h.store.getState().skewMs).toBe(60_000);
    h.engine.stop();
  });
});

describe('fallback and honesty', () => {
  it('with nothing reachable it shows the labelled fallback, no beat, offline connection', async () => {
    const h = harness();
    h.server.streamMode = 'refuse';
    h.server.restMode = 'refuse';
    h.engine.start();
    await advance(3000);
    const s = h.store.getState();
    expect(s.connection).toBe('offline');
    for (const key of ['network', 'geo', 'blocks', 'health'] as const) {
      expect(s[key].freshness).toBe('offline');
      expect(s[key].meta?.source).toBe('fallback');
      expect(s[key].meta?.asOf).toBe(FALLBACK_AS_OF);
    }
    expect(h.bus.pulses).toBe(0);
    expect(h.bus.chain).toMatchObject({ height: FALLBACK_HEIGHT, lastBlockAt: null, live: false });
    expect(s.lastSuccess).toEqual({ network: null, geo: null, blocks: null, health: null });
    // Time passing never produces a beat from fixtures.
    await advance(120_000);
    expect(h.bus.pulses).toBe(0);
    h.engine.stop();
  });

  it('shows the fallback after the grace period when the server is merely slow, then replaces it', async () => {
    const h = harness();
    const realFetch = h.server.fetch;
    const gateControl: { open: () => void } = { open: () => {} };
    const gate = new Promise<void>((r) => {
      gateControl.open = r;
    });
    const slow = (async (url: string, init: RequestInit) => {
      if (url !== API_PATHS.stream) await gate;
      return realFetch(url, init);
    }) as typeof fetch;
    const h2 = harness({ fetch: slow });
    h2.engine.start();
    await advance(1000);
    expect(h2.store.getState().network.freshness).toBe('unknown');
    await advance(3500);
    expect(h2.store.getState().network.freshness).toBe('offline');
    gateControl.open();
    await advance(10);
    expect(h2.store.getState().network.freshness).toBe('live');
    expect(h2.store.getState().network.meta?.source).toBe('live');
    // The real tip replaced the fallback height without a pulse for "advancing" from the baked one.
    expect(h2.bus.pulses).toBe(0);
    expect(h2.bus.chain.height).toBe(3_031_000);
    expect(h.store.getState().network.freshness).toBe('unknown');
    h2.engine.stop();
  });

  it('a payload the server labels fallback never drives the chain clock or a pulse', async () => {
    const h = harness();
    h.server.metaOver.network = { source: 'fallback', stale: true };
    h.server.metaOver.blocks = { source: 'fallback', stale: true };
    h.server.streamMode = 'http503';
    h.engine.start();
    await flush();
    expect(h.store.getState().network.freshness).toBe('offline');
    h.server.data.network = networkAt(3_031_001, Date.now() - 1000);
    await advance(10_500);
    expect(h.store.getState().network.data?.chain.height).toBe(3_031_001);
    expect(h.bus.pulses).toBe(0);
    expect(h.bus.chain.live).toBe(false);
    h.engine.stop();
  });

  it('keeps showing the last real value as cached then offline when the server goes away', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.store.getState().network.freshness).toBe('live');

    // Everything dies. No events, no REST.
    h.server.restMode = 'refuse';
    h.server.streamMode = 'refuse';
    h.server.lastStream().end();
    await advance(50_000);
    const s = h.store.getState();
    expect(s.network.data?.chain.height).toBe(3_031_000);
    expect(s.network.meta?.source).toBe('live'); // still the real payload, not the fallback
    expect(['cached', 'offline']).toContain(s.network.freshness);
    expect(s.network.freshness).toBe('offline');
    expect(s.connection).toBe('offline');
    expect(s.network.ageMs ?? 0).toBeGreaterThan(45_000);
    expect(h.bus.chain.live).toBe(false);
    h.engine.stop();
  });

  it('a quiet but healthy stream does not make data look old (safety refresh)', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    // Two minutes of pings only. No network events at all.
    for (let i = 0; i < 6; i++) {
      await advance(20_000);
      h.server.lastStream().comment('ping');
    }
    expect(h.store.getState().connection).toBe('live');
    expect(h.store.getState().network.freshness).toBe('live');
    expect(h.store.getState().health.freshness).toBe('live');
    h.engine.stop();
  });
});

describe('SSE to polling and back', () => {
  it('falls back to polling when the stream cannot be established', async () => {
    const h = harness();
    h.server.streamMode = 'http503';
    h.engine.start();
    await flush();
    expect(h.store.getState().connection).toBe('polling');
    expect(h.store.getState().network.freshness).toBe('live');
    const n0 = h.server.restCount(API_PATHS.network);

    // Polling cadence: network every ~10 s.
    await advance(10_100);
    await advance(10_100);
    expect(h.server.restCount(API_PATHS.network)).toBeGreaterThanOrEqual(n0 + 2);
    expect(h.store.getState().network.freshness).toBe('live');
    expect(h.store.getState().debug.transport).toBe('polling');
    h.engine.stop();
  });

  it('the beat runs from polled height changes', async () => {
    const h = harness();
    h.server.streamMode = 'http503';
    h.engine.start();
    await flush();
    expect(h.bus.pulses).toBe(0);
    h.server.data.network = networkAt(3_031_001, Date.now() - 2000);
    await advance(10_500);
    expect(h.bus.pulses).toBe(1);
    expect(h.bus.chain.height).toBe(3_031_001);
    await advance(10_500); // unchanged height: no further beat
    expect(h.bus.pulses).toBe(1);
    h.engine.stop();
  });

  it('returns to SSE on its own once the stream works, and relaxes polling', async () => {
    const h = harness();
    h.server.streamMode = 'http503';
    h.engine.start();
    await advance(20_000);
    expect(h.store.getState().connection).toBe('polling');

    h.server.streamMode = 'ok';
    h.server.autoHello = true;
    // The client keeps retrying with backoff in the background (up to 30 s apart).
    await advance(35_000);
    expect(h.server.streams.length).toBeGreaterThan(0);
    expect(h.store.getState().connection).toBe('live');
    expect(h.store.getState().debug.transport).toBe('sse');

    // Polling relaxed to the safety cadence: 25 quiet seconds is at most one network request,
    // where 10 s polling would have made two or three.
    const n = h.server.restCount(API_PATHS.network);
    for (let i = 0; i < 5; i++) {
      await advance(5000);
      h.server.lastStream().comment('ping');
    }
    expect(h.server.restCount(API_PATHS.network) - n).toBeLessThanOrEqual(1);
    h.engine.stop();
  });

  it('a stream that drops after being live moves to polling and reconnects', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    h.server.streamMode = 'http503';
    h.server.lastStream().end();
    await advance(2000);
    expect(h.store.getState().connection).toBe('polling');
    h.server.streamMode = 'ok';
    await advance(5000);
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    h.engine.stop();
  });

  it('recovers a dead connection (no bytes for 45 s) by reconnecting', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    const first = h.server.lastStream();
    await advance(46_000);
    expect(first.aborted).toBe(true);
    await advance(2000);
    expect(h.server.streams.length).toBe(2);
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    h.engine.stop();
  });
});

describe('stream envelopes, hello meta and ping', () => {
  it('populates network and health straight from hello, using the server meta, with no extra REST', async () => {
    const h = harness();
    h.server.restMode = 'refuse'; // the stream is the only thing that works
    h.engine.start();
    await flush();
    h.server.hello(undefined, { meta: { ageMs: 4000 } });
    await flush();
    const s = h.store.getState();
    expect(s.network.freshness).toBe('live');
    expect(s.network.meta?.ageMs).toBe(4000);
    expect(s.network.data?.chain.height).toBe(3_031_000);
    expect(s.health.freshness).toBe('live');
    expect(s.lastSuccess.network).not.toBeNull();
    expect(h.bus.pulses).toBe(0);
    expect(h.bus.chain).toMatchObject({ height: 3_031_000, live: true });
    // Only the initial attempt (plus its retry) hit REST for these two; hello added nothing.
    const before = h.server.restCount(API_PATHS.network);
    expect(before).toBeLessThanOrEqual(2);
    h.engine.stop();
  });

  it('shows the server meta honestly: a cache/stale hello is cached, not live', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello(undefined, { meta: { source: 'cache', stale: true, ageMs: 90_000 } });
    await flush();
    expect(h.store.getState().network.freshness).toBe('cached');
    expect(h.store.getState().network.ageMs).toBeGreaterThanOrEqual(90_000);
    h.engine.stop();
  });

  it('falls back to a REST refresh on hello only when the meta is absent', async () => {
    const h = harness();
    h.server.restMode = 'refuse';
    h.engine.start();
    await advance(1500); // initial REST attempts fail, fallback not yet shown
    h.server.hello(undefined, { withMeta: false });
    await flush();
    const afterHello = h.server.restCount(API_PATHS.network);
    h.server.restMode = 'ok';
    await advance(1000);
    // The legacy hello (no meta) did not populate the store itself; REST did.
    expect(h.server.restCount(API_PATHS.network)).toBeGreaterThanOrEqual(afterHello);
    expect(h.store.getState().network.meta?.source).toBe('live');
    expect(h.store.getState().network.freshness).toBe('live');
    h.engine.stop();
  });

  it('stores a streamed network envelope with its real meta', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    h.server.networkEvent(networkAt(3_031_001, Date.now() - 800), { ageMs: 6000 });
    await flush();
    expect(h.store.getState().network.meta?.ageMs).toBe(6000);
    expect(h.store.getState().network.freshness).toBe('live');
    expect(h.bus.pulses).toBe(1);

    h.server.networkEvent(networkAt(3_031_002, Date.now()), { source: 'cache', stale: true, ageMs: 200_000 });
    await flush();
    expect(h.store.getState().network.freshness).toBe('cached');
    h.engine.stop();
  });

  it('FIXTURES-mode stream: everything labelled fallback is offline and never drives clock or pulse', async () => {
    const h = harness();
    h.server.metaOver.network = { source: 'fallback', stale: true };
    h.server.metaOver.health = { source: 'fallback', stale: true };
    h.server.metaOver.blocks = { source: 'fallback', stale: true };
    h.server.metaOver.geo = { source: 'fallback', stale: true };
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    const s = h.store.getState();
    expect(s.connection).toBe('live'); // the stream itself works
    for (const key of ['network', 'health', 'blocks', 'geo'] as const) {
      expect(s[key].freshness).toBe('offline');
      expect(s[key].meta?.source).toBe('fallback');
    }
    expect(s.lastSuccess).toEqual({ network: null, geo: null, blocks: null, health: null });
    expect(h.bus.chain.live).toBe(false);

    h.server.lastStream().push('block', blockEvent(h.server, 3_031_001));
    h.server.networkEvent(networkAt(3_031_001, Date.now()));
    h.server.healthEvent();
    await flush();
    expect(h.bus.pulses).toBe(0);
    expect(h.store.getState().network.freshness).toBe('offline');
    expect(h.store.getState().health.freshness).toBe('offline');
    expect(h.bus.chain.live).toBe(false);
    // The streamed block did not extend the (fallback) list.
    expect(h.store.getState().blocks.data?.blocks.length).toBe(h.server.data.blocks.blocks.length);

    // The server later gets real upstream data: the stream goes live and the beat starts.
    h.server.metaOver = {};
    h.server.networkEvent(networkAt(3_031_002, Date.now() - 500));
    await flush();
    expect(h.store.getState().network.freshness).toBe('live');
    expect(h.bus.chain.live).toBe(true);
    h.engine.stop();
  });

  it('event: ping frames alone keep a healthy stream open', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    for (let i = 0; i < 9; i++) {
      await advance(20_000);
      h.server.lastStream().push('ping', {});
    }
    expect(h.server.streams).toHaveLength(1);
    expect(h.store.getState().connection).toBe('live');
    expect(h.store.getState().debug.sseFailures).toBe(0);
    h.engine.stop();
  });
});

describe('real block intervals are not 30.0', () => {
  it('uses the measured mean for the chain clock interval when it is sane', async () => {
    const h = harness();
    h.server.data.network = {
      ...networkAt(3_031_000, Date.now() - 3000),
      chain: { ...networkAt(3_031_000, Date.now() - 3000).chain, measuredBlockSec: 31.24 },
    };
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.bus.chain.intervalMs).toBe(31_200);
    h.engine.stop();
  });

  it('falls back to the target when the measured value is missing or absurd', () => {
    expect(expectedIntervalMs(30, null)).toBe(30_000);
    expect(expectedIntervalMs(30, 3)).toBe(30_000);
    expect(expectedIntervalMs(30, 300)).toBe(30_000);
    expect(expectedIntervalMs(30, 30.5)).toBe(30_500);
    expect(expectedIntervalMs(30, 31.96)).toBe(32_000);
  });
});

describe('page visibility and connectivity', () => {
  it('does no work while hidden and refreshes immediately when visible again', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    h.env.setHidden(true);
    await flush();
    expect(h.server.lastStream().aborted).toBe(true);
    const requests = h.server.requests.length;
    await advance(120_000);
    expect(h.server.requests.length).toBe(requests);
    expect(vi.getTimerCount()).toBe(0);

    h.server.data.network = networkAt(3_031_004, Date.now() - 3000);
    h.env.setHidden(false);
    await flush();
    expect(h.server.requests.length).toBeGreaterThan(requests);
    expect(h.store.getState().network.data?.chain.height).toBe(3_031_004);
    expect(h.server.streams.length).toBe(2);
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    h.engine.stop();
  });

  it('reacts to offline and online events', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');

    h.env.setOnline(false);
    expect(h.store.getState().connection).toBe('offline');
    expect(h.bus.chain.live).toBe(false);

    const before = h.server.requests.length;
    h.env.setOnline(true);
    await flush();
    expect(h.server.requests.length).toBeGreaterThan(before);
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    expect(h.bus.chain.live).toBe(true);
    h.engine.stop();
  });

  it('starts offline when the browser says so', async () => {
    const env = createFakeEnv();
    env.online = false;
    const h = harness({ env });
    h.server.streamMode = 'refuse';
    h.server.restMode = 'refuse';
    h.engine.start();
    await advance(3000);
    expect(h.store.getState().connection).toBe('offline');
    h.engine.stop();
  });
});

describe('lifecycle', () => {
  it('start is idempotent and stop leaves no timers or listeners behind', async () => {
    const h = harness();
    h.engine.start();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.server.streams).toHaveLength(1);
    h.engine.stop();
    h.engine.stop();
    expect(h.engine.running()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.env.listeners()).toBe(0);
    expect(h.ticker.size()).toBe(0);
    expect(h.server.streams[0]?.aborted).toBe(true);
    // Stopped for good: no late request from an in-flight timer.
    const n = h.server.requests.length;
    await advance(60_000);
    expect(h.server.requests.length).toBe(n);
  });

  it('can be started again after a stop and keeps the data it already had', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    h.engine.stop();
    expect(h.store.getState().network.data).not.toBeNull();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.store.getState().connection).toBe('live');
    expect(h.bus.pulses).toBe(0);
    h.engine.stop();
  });

  it('ticks the store ages from one shared interval', async () => {
    const h = harness();
    h.engine.start();
    await flush();
    h.server.hello();
    await flush();
    expect(h.ticker.size()).toBe(1);
    const age0 = h.store.getState().network.ageMs ?? 0;
    await advance(5000);
    const age1 = h.store.getState().network.ageMs ?? 0;
    expect(age1 - age0).toBeGreaterThanOrEqual(4000);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(8);
    h.engine.stop();
  });
});

describe('demo mode', () => {
  it('treats fixtures as live and simulates a block every 30 s, logging once', async () => {
    const warn = vi.fn();
    const h = harness({ demo: true, warn });
    h.engine.start();
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(h.store.getState().connection).toBe('live');
    expect(h.store.getState().network.freshness).toBe('live');
    expect(h.store.getState().network.meta?.source).toBe('live');
    expect(h.bus.chain.live).toBe(true);
    expect(h.bus.pulses).toBe(0);
    expect(h.server.requests).toHaveLength(0);

    const h0 = h.bus.chain.height;
    await advance(31_000);
    expect(h.bus.pulses).toBe(1);
    expect(h.bus.chain.height).toBe(h0 + 1);
    await advance(30_000);
    expect(h.bus.pulses).toBe(2);
    expect(h.store.getState().network.data?.chain.height).toBe(h0 + 2);
    expect(h.store.getState().network.freshness).toBe('live');
    expect(warn).toHaveBeenCalledTimes(1);
    h.engine.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
