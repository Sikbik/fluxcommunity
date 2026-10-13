import { API_PATHS } from '@shared/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api';
import { getFallback } from './fixtures';
import { createFakeServer, envelope, liveMeta } from './testkit';
import {
  parseBlocks,
  parseEnvelope,
  parseGeo,
  parseHealth,
  parseNetwork,
  parseStreamPayload,
} from './validate';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const fb = getFallback();

describe('validation', () => {
  it('accepts a good envelope and ignores unknown extra fields', () => {
    const raw = {
      data: { ...fb.network, somethingNew: { a: 1 } },
      meta: { ...liveMeta(Date.now()), extra: true },
      alsoNew: 1,
    };
    const parsed = parseEnvelope(raw, parseNetwork);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.data.chain.height).toBe(fb.network.chain.height);
      expect('somethingNew' in parsed.value.data).toBe(false);
    }
  });

  it('rejects a payload missing a required field', () => {
    const { chain: _chain, ...rest } = fb.network;
    expect(parseEnvelope({ data: rest, meta: liveMeta(0) }, parseNetwork).ok).toBe(false);
    expect(parseEnvelope({ data: fb.network, meta: { source: 'live' } }, parseNetwork).ok).toBe(false);
    expect(
      parseEnvelope({ data: fb.network, meta: liveMeta(0, { source: 'bogus' as never }) }, parseNetwork).ok,
    ).toBe(false);
    expect(parseEnvelope('nope', parseNetwork).ok).toBe(false);
  });

  it('normalises missing nullable parts to null instead of failing', () => {
    const { capacity: _c, apps: _a, market: _m, versions: _v, ...core } = fb.network;
    const p = parseNetwork(core);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.capacity).toBeNull();
      expect(p.value.apps).toBeNull();
      expect(p.value.market).toBeNull();
      expect(p.value.versions).toEqual({ fluxos: null, daemon: null });
    }
  });

  it('drops malformed list entries but keeps the rest', () => {
    const geo = parseGeo({
      located: 2,
      total: 3,
      countries: [
        { code: 'US', name: 'United States', nodes: 2, tiers: { cumulus: 1, nimbus: 1, stratus: 0 } },
        { code: 7 },
      ],
      points: [{ lat: 1, lon: 2, n: 1, t: [1, 0, 0] }, { lat: 'x' }, { lat: 1, lon: 2, n: 1, t: [1, 0] }],
    });
    expect(geo.ok && geo.value.countries).toHaveLength(1);
    expect(geo.ok && geo.value.points).toHaveLength(1);

    const blocks = parseBlocks({
      blocks: [
        { height: 5, time: '2026-10-12T00:00:30Z', intervalSec: 30, txCount: 2 },
        { height: 4, time: '2026-10-12T00:00:00Z' },
        { height: 'bad' },
      ],
    });
    expect(blocks.ok && blocks.value.blocks.map((b) => b.height)).toEqual([4, 5]);

    const health = parseHealth({ apps: [{ id: 'a', state: 'weird' }, { state: 'up' }] });
    expect(health.ok && health.value.apps).toEqual([
      { id: 'a', state: 'unknown', httpStatus: null, latencyMs: null, checkedAt: null, since: null },
    ]);
  });
});

describe('api client', () => {
  it('fetches and validates each resource', async () => {
    const server = createFakeServer();
    const api = createApiClient({ fetch: server.fetch });
    const r = await api.network();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.meta.source).toBe('live');
    expect((await api.geo()).ok).toBe(true);
    expect((await api.blocks()).ok).toBe(true);
    expect((await api.health()).ok).toBe(true);
    expect(server.requests).toEqual([API_PATHS.network, API_PATHS.geo, API_PATHS.blocks, API_PATHS.health]);
  });

  it('retries a 5xx once and then succeeds', async () => {
    const server = createFakeServer();
    server.restMode = 'http500';
    const api = createApiClient({ fetch: server.fetch, random: () => 0 });
    const p = api.network();
    await vi.advanceTimersByTimeAsync(10);
    server.restMode = 'ok';
    await vi.advanceTimersByTimeAsync(500);
    const r = await p;
    expect(r.ok).toBe(true);
    expect(server.restCount(API_PATHS.network)).toBe(2);
  });

  it('gives an error result after retries, never throwing', async () => {
    const server = createFakeServer();
    server.restMode = 'refuse';
    const api = createApiClient({ fetch: server.fetch, retries: 2, random: () => 0 });
    const p = api.network();
    await vi.advanceTimersByTimeAsync(5000);
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('network');
    expect(server.restCount(API_PATHS.network)).toBe(3);
  });

  it('does not retry an invalid payload', async () => {
    const server = createFakeServer();
    server.data.network = { ...server.data.network, chain: undefined } as never;
    const api = createApiClient({ fetch: server.fetch });
    const r = await api.network();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid');
    expect(server.restCount(API_PATHS.network)).toBe(1);
  });

  it('times out a hung request', async () => {
    const hung = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const api = createApiClient({ fetch: hung as never, timeoutMs: 1000, retries: 0 });
    const p = api.blocks();
    await vi.advanceTimersByTimeAsync(1001);
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timeout');
  });

  it('honours an external abort without retrying', async () => {
    const hung = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const ctl = new AbortController();
    const api = createApiClient({ fetch: hung as never, timeoutMs: 10_000, retries: 3 });
    const p = api.geo({ signal: ctl.signal });
    await vi.advanceTimersByTimeAsync(10);
    ctl.abort();
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('aborted');
    expect(hung).toHaveBeenCalledTimes(1);
  });

  it('passes Retry-After through on a 429', async () => {
    const f = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: (k: string) => (k === 'retry-after' ? '7' : null) },
      json: async () => ({}),
    }));
    const api = createApiClient({ fetch: f as never, retries: 0 });
    const r = await api.health();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.status).toBe(429);
      expect(r.error.retryAfterMs).toBe(7000);
    }
  });

  it('exposes the envelope meta untouched', async () => {
    const server = createFakeServer();
    server.metaOver.network = { source: 'cache', stale: true, ageMs: 120_000 };
    const api = createApiClient({ fetch: server.fetch });
    const r = await api.network();
    expect(r.ok && r.envelope.meta).toMatchObject({ source: 'cache', stale: true, ageMs: 120_000 });
    expect(envelope(1, 0).meta.source).toBe('live');
  });
});

describe('stream payload parsing and new optional fields', () => {
  it('parses per-section freshness, capacity.reporting and geo cc', () => {
    const stamp = '2026-10-12T18:05:25.609Z';
    const net = parseNetwork({
      ...fb.network,
      capacity: { cores: 1, ramTb: 2, ssdTb: 3, reporting: 7009 },
      freshness: { chain: stamp, nodes: stamp, capacity: stamp, apps: null, market: 'garbage' },
    });
    expect(net.ok).toBe(true);
    if (net.ok) {
      expect(net.value.capacity?.reporting).toBe(7009);
      expect(net.value.freshness).toEqual({
        chain: stamp,
        nodes: stamp,
        capacity: stamp,
        apps: null,
        market: null,
      });
    }
    const geo = parseGeo({
      located: 1,
      total: 1,
      countries: [],
      points: [
        { lat: 1, lon: 2, n: 1, cc: 'DE', t: [1, 0, 0] },
        { lat: 3, lon: 4, n: 1, t: [0, 1, 0] },
      ],
    });
    expect(geo.ok && geo.value.points.map((p) => p.cc)).toEqual(['DE', undefined]);
  });

  it('keeps the additive reduction epoch fields and drops bad ones', () => {
    const base = fb.network.rewards.nextReduction;
    expect(base).not.toBeNull();
    const withEpoch = parseNetwork({
      ...fb.network,
      rewards: {
        ...fb.network.rewards,
        nextReduction: {
          ...base,
          epochStartHeight: 2020000,
          epochBlocks: 1051200,
          index: 1,
          of: 20,
        },
      },
    });
    expect(withEpoch.ok).toBe(true);
    if (withEpoch.ok) {
      expect(withEpoch.value.rewards.nextReduction).toMatchObject({
        epochStartHeight: 2020000,
        epochBlocks: 1051200,
        index: 1,
        of: 20,
      });
    }
    const bad = parseNetwork({
      ...fb.network,
      rewards: {
        ...fb.network.rewards,
        nextReduction: { ...base, epochStartHeight: 'x', epochBlocks: 0, index: 0, of: -3 },
      },
    });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      const nr = bad.value.rewards.nextReduction;
      expect(nr && 'epochStartHeight' in nr).toBe(false);
      expect(nr && 'epochBlocks' in nr).toBe(false);
      expect(nr && 'index' in nr).toBe(false);
      expect(nr && 'of' in nr).toBe(false);
    }
  });

  it('omits freshness entirely for an older server', () => {
    const { freshness: _f, ...rest } = fb.network;
    const net = parseNetwork(rest);
    expect(net.ok && 'freshness' in net.value).toBe(false);
  });

  it('parseStreamPayload reads an envelope, a bare snapshot, and rejects bad data', () => {
    const meta = liveMeta(0);
    const env = parseStreamPayload({ data: fb.network, meta }, parseNetwork);
    expect(env.ok && env.value.meta).toEqual(meta);
    const bare = parseStreamPayload(fb.network, parseNetwork);
    expect(bare.ok && bare.value.meta).toBeNull();
    expect(parseStreamPayload({ data: { x: 1 }, meta }, parseNetwork).ok).toBe(false);
    expect(parseStreamPayload(null, parseHealth).ok).toBe(false);
  });
});
