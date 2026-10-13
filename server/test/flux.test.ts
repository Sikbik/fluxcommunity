import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { effectiveBlockSec } from '../../shared/chain.ts';
import { ManualClock } from '../src/core/clock.ts';
import { Upstream, UpstreamError } from '../src/core/upstream.ts';
import { AppsApi } from '../src/flux/apps.ts';
import { DaemonApi, decodeData } from '../src/flux/daemon.ts';
import { MarketApi } from '../src/flux/market.ts';
import {
  COLLATERAL,
  computeRewards,
  nextReductionHeight,
  reductionsDone,
  subsidyZat,
  tierZat,
} from '../src/flux/rewards.ts';

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

function upstream(handler: Handler, bases = ['https://api.test']) {
  const calls: URL[] = [];
  const u = new Upstream({
    name: 'flux-api',
    bases,
    timeoutMs: 1_000,
    userAgent: 'test',
    clock: new ManualClock(0),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push(url);
      return handler(url, init);
    },
  });
  return { u, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('reward schedule (mirrors fluxd GetBlockSubsidy / GetFluxnodeSubsidy)', () => {
  it('pays 14 FLUX split 1 / 3.5 / 9 / 0.5 before the first reduction', () => {
    for (const h of [2_020_000, 3_031_151, 3_071_199]) {
      assert.equal(subsidyZat(h), 1_400_000_000n, `height ${h}`);
      const t = tierZat(h);
      assert.deepEqual(
        [t.cumulus, t.nimbus, t.stratus, t.dev],
        [100_000_000n, 350_000_000n, 900_000_000n, 50_000_000n],
      );
    }
  });

  it('cuts exactly 10 percent at 3,071,200 and again 1,051,200 blocks later', () => {
    assert.equal(reductionsDone(3_071_199), 0);
    assert.equal(reductionsDone(3_071_200), 1);
    assert.equal(subsidyZat(3_071_200), 1_260_000_000n);
    assert.equal(subsidyZat(4_122_399), 1_260_000_000n);
    assert.equal(subsidyZat(4_122_400), 1_134_000_000n);
    const t = tierZat(3_071_200);
    assert.deepEqual(
      [t.cumulus, t.nimbus, t.stratus, t.dev],
      [90_000_000n, 315_000_000n, 810_000_000n, 45_000_000n],
    );
  });

  it('knows the next reduction and stops after 20', () => {
    assert.equal(nextReductionHeight(3_031_151), 3_071_200);
    assert.equal(nextReductionHeight(3_071_200), 4_122_400);
    assert.equal(nextReductionHeight(2_020_000 + 20 * 1_051_200), null);
  });

  it('numbers epochs: after the first cut the next one is 2 of 20 and starts at 3,071,200', () => {
    const { rewards } = computeRewards({ height: 3_071_200, tipTimeMs: 0 });
    const nr = rewards.nextReduction;
    assert.deepEqual(
      [nr?.height, nr?.epochStartHeight, nr?.index, nr?.of, nr?.perBlockAfter],
      [4_122_400, 3_071_200, 2, 20, 11.34],
    );
    // The 20th reduction is still announced; once exhausted nextReduction is null.
    const last = computeRewards({ height: 2_020_000 + 19 * 1_051_200, tipTimeMs: 0 }).rewards.nextReduction;
    assert.equal(last?.index, 20);
    assert.equal(
      computeRewards({ height: 2_020_000 + 20 * 1_051_200, tipTimeMs: 0 }).rewards.nextReduction,
      null,
    );
  });

  it('computeRewards fills NextReduction and trusts a differing live subsidy', () => {
    const tip = Date.UTC(2026, 9, 12, 18, 0, 0);
    const { rewards, mismatch } = computeRewards({ height: 3_031_200, tipTimeMs: tip });
    assert.equal(mismatch, null);
    assert.equal(rewards.perBlock, 14);
    assert.deepEqual(rewards.perTier, { cumulus: 1, nimbus: 3.5, stratus: 9 });
    assert.equal(rewards.devFund, 0.5);
    const nr = rewards.nextReduction;
    assert.ok(nr);
    assert.equal(nr.height, 3_071_200);
    assert.equal(nr.blocksAway, 40_000);
    assert.equal(nr.fraction, 0.1);
    assert.equal(nr.perBlockAfter, 12.6);
    assert.deepEqual([nr.epochStartHeight, nr.epochBlocks, nr.index, nr.of], [2_020_000, 1_051_200, 1, 20]);
    assert.equal(nr.etaIso, new Date(tip + 40_000 * 30_000).toISOString());

    const off = computeRewards({ height: 3_031_200, tipTimeMs: tip, liveSubsidy: 15.4 });
    assert.ok(off.mismatch);
    assert.equal(off.rewards.perBlock, 15.4);
    assert.ok(Math.abs(off.rewards.perTier.stratus - 9.9) < 1e-6);
  });

  it('collateral constants match fluxd V2_FLUXNODE_COLLAT_*', () => {
    assert.deepEqual({ ...COLLATERAL }, { cumulus: 1000, nimbus: 12500, stratus: 40000 });
  });
});

describe('effectiveBlockSec (shared by the server ETA and the web countdown)', () => {
  it('uses the target while nothing has been measured', () => {
    assert.deepEqual(effectiveBlockSec(30, null), { seconds: 30, measured: false });
    assert.deepEqual(effectiveBlockSec(30, undefined), { seconds: 30, measured: false });
    assert.deepEqual(effectiveBlockSec(30, Number.NaN), { seconds: 30, measured: false });
    assert.deepEqual(effectiveBlockSec(30, Number.POSITIVE_INFINITY), { seconds: 30, measured: false });
  });

  it('uses a measured mean inside 0.5x to 2x of the target, bounds included', () => {
    assert.deepEqual(effectiveBlockSec(30, 31.24), { seconds: 31.24, measured: true });
    assert.deepEqual(effectiveBlockSec(30, 30), { seconds: 30, measured: true });
    assert.deepEqual(effectiveBlockSec(30, 15), { seconds: 15, measured: true });
    assert.deepEqual(effectiveBlockSec(30, 60), { seconds: 60, measured: true });
  });

  it('rejects a measured mean below 0.5x or above 2x of the target', () => {
    assert.deepEqual(effectiveBlockSec(30, 30 * 0.4), { seconds: 30, measured: false });
    assert.deepEqual(effectiveBlockSec(30, 30 * 2.1), { seconds: 30, measured: false });
    assert.deepEqual(effectiveBlockSec(30, 0), { seconds: 30, measured: false });
    assert.deepEqual(effectiveBlockSec(30, -31), { seconds: 30, measured: false });
  });

  it('scales the band with the target and falls back to 30 for a bad target', () => {
    assert.deepEqual(effectiveBlockSec(60, 119), { seconds: 119, measured: true });
    assert.deepEqual(effectiveBlockSec(60, 121), { seconds: 60, measured: false });
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(effectiveBlockSec(bad, null), { seconds: 30, measured: false }, `target ${bad}`);
      assert.deepEqual(effectiveBlockSec(bad, 31), { seconds: 31, measured: true }, `target ${bad}`);
    }
  });
});

describe('computeRewards ETA uses the measured block interval', () => {
  const tip = Date.UTC(2026, 9, 12, 18, 0, 0);
  const height = 3_031_200; // 40_000 blocks before the first reduction
  const eta = (extra: { measuredBlockSec?: number | null; targetBlockSec?: number }) =>
    computeRewards({ height, tipTimeMs: tip, ...extra }).rewards.nextReduction;

  it('is exactly tip + blocksAway * measured when the measurement is sane', () => {
    const nr = eta({ measuredBlockSec: 31.24 });
    assert.ok(nr);
    assert.equal(nr.blocksAway, 40_000);
    // 40_000 * 31.24 s = 1_249_600 s = 14 d 11 h 6 min 40 s, against 13 d 21 h 20 min at a flat 30 s.
    assert.equal(nr.etaIso, new Date(tip + 1_249_600_000).toISOString());
    assert.equal(nr.etaIso, '2026-10-27T05:06:40.000Z');
  });

  it('keeps every other field identical to the unmeasured result', () => {
    const plain = computeRewards({ height, tipTimeMs: tip });
    const measured = computeRewards({ height, tipTimeMs: tip, measuredBlockSec: 31.24 });
    assert.deepEqual(
      { ...measured.rewards, nextReduction: { ...measured.rewards.nextReduction, etaIso: '' } },
      { ...plain.rewards, nextReduction: { ...plain.rewards.nextReduction, etaIso: '' } },
    );
    assert.equal(measured.mismatch, plain.mismatch);
  });

  it('falls back to the target for null, undefined, 0.4x and 2.1x', () => {
    const base = '2026-10-26T15:20:00.000Z'; // tip + 40_000 * 30 s = 13 d 21 h 20 min
    for (const measuredBlockSec of [null, undefined, 12, 63, Number.NaN]) {
      assert.equal(eta({ measuredBlockSec })?.etaIso, base, `measured ${measuredBlockSec}`);
    }
    assert.equal(eta({})?.etaIso, base);
  });

  it('is the target ETA in the first minute after boot, before 5 intervals are buffered', () => {
    // BlockWatcher.measuredBlockSec() returns null with fewer than 5 contiguous intervals.
    const nr = eta({ measuredBlockSec: null });
    assert.equal(nr?.etaIso, new Date(tip + 40_000 * 30_000).toISOString());
  });

  it('applies the 0.5x to 2x band to a custom target', () => {
    const nr = eta({ targetBlockSec: 10, measuredBlockSec: 11 });
    assert.equal(nr?.etaIso, new Date(tip + 40_000 * 11_000).toISOString());
    const rejected = eta({ targetBlockSec: 10, measuredBlockSec: 31 });
    assert.equal(rejected?.etaIso, new Date(tip + 40_000 * 10_000).toISOString());
  });
});

describe('Upstream', () => {
  it('fails over to the next base URL and remembers the one that worked', async () => {
    const { u, calls } = upstream(
      (url) => {
        if (url.host === 'a.test') throw new TypeError('fetch failed');
        return json({ status: 'success', data: 1 });
      },
      ['https://a.test', 'https://b.test'],
    );
    await u.json({ path: '/x' });
    assert.deepEqual(
      calls.map((c) => c.host),
      ['a.test', 'b.test'],
    );
    await u.json({ path: '/x' });
    assert.deepEqual(
      calls.slice(2).map((c) => c.host),
      ['b.test'],
      'sticky to the healthy base',
    );
    assert.equal(u.status().ok, true);
  });

  it('opens the breaker after repeated failures and then fails fast without calling fetch', async () => {
    const { u, calls } = upstream(() => new Response('nope', { status: 502 }));
    for (let i = 0; i < 5; i++) await assert.rejects(u.json({ path: '/x' }), UpstreamError);
    assert.equal(u.breaker.state, 'open');
    const n = calls.length;
    await assert.rejects(u.json({ path: '/x' }), /circuit open/);
    assert.equal(calls.length, n);
    assert.equal(u.status().ok, false);
    assert.match(u.status().lastError ?? '', /HTTP 502|circuit/);
  });

  it('enforces the response size cap', async () => {
    const u = new Upstream({
      name: 's',
      bases: ['https://x.test'],
      timeoutMs: 1_000,
      userAgent: 't',
      maxBytes: 10,
      fetch: async () => new Response('{"a":"0123456789abcdef"}', { status: 200 }),
    });
    await assert.rejects(u.json({ path: '/' }), /exceeds|too large/);
  });

  it('turns a hung request into a timeout error', async () => {
    const u = new Upstream({
      name: 's',
      bases: ['https://x.test'],
      timeoutMs: 30,
      userAgent: 't',
      fetch: (_i, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () =>
            rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
          );
        }),
    });
    await assert.rejects(
      u.json({ path: '/' }),
      (e: unknown) => e instanceof UpstreamError && e.kind === 'timeout',
    );
  });
});

describe('DaemonApi (FluxOS envelope quirks)', () => {
  it('treats "Block height out of range" as null, not as an upstream failure', async () => {
    const { u } = upstream(() =>
      json({ status: 'error', data: { code: -8, name: 'Error', message: 'Block height out of range' } }),
    );
    const d = new DaemonApi(u);
    assert.equal(await d.blockHash(3_031_200), null);
    assert.equal(u.breaker.state, 'closed');
    for (let i = 0; i < 10; i++) await d.blockHash(3_031_200);
    assert.equal(u.breaker.state, 'closed', 'expected answers never trip the breaker');
  });

  it('sees HTTP 200 + status:error for real errors and counts them as failures', async () => {
    const { u } = upstream(() => json({ status: 'error', data: { code: -1, message: 'daemon busy' } }));
    const d = new DaemonApi(u);
    await assert.rejects(d.blockCount());
    assert.equal(u.status().ok, false);
  });

  it('adds a cache-busting query to RPC calls but not to getblock', async () => {
    const { u, calls } = upstream((url) => {
      if (url.pathname.includes('getblockhash')) return json({ status: 'success', data: 'a'.repeat(64) });
      return json({
        status: 'success',
        data: {
          hash: 'b'.repeat(64),
          height: 5,
          time: 1_700_000_000,
          tx: ['x', 'y'],
          previousblockhash: 'c'.repeat(64),
        },
      });
    });
    const d = new DaemonApi(u);
    assert.equal(await d.blockHash(5), 'a'.repeat(64));
    const b = await d.block(5);
    assert.deepEqual(b, {
      hash: 'b'.repeat(64),
      height: 5,
      time: 1_700_000_000,
      txCount: 2,
      previousHash: 'c'.repeat(64),
    });
    assert.ok(calls[0]?.searchParams.get('nc'));
    assert.equal(calls[1]?.search, '');
  });

  it('parses node counts with legacy tier aliases and a wrong total', async () => {
    const { u } = upstream(() =>
      json({
        status: 'success',
        data: { total: 10, 'basic-enabled': 6, 'super-enabled': 3, 'bamf-enabled': 4 },
      }),
    );
    const c = await new DaemonApi(u).nodeCount();
    assert.deepEqual(c, { total: 13, cumulus: 6, nimbus: 3, stratus: 4 });
  });

  it('decodes JSON-encoded string data', () => {
    assert.deepEqual(decodeData('{"a":1}'), { a: 1 });
    assert.equal(decodeData('abc123'), 'abc123');
    assert.equal(decodeData(5), 5);
  });

  it('rejects a malformed block hash', async () => {
    const { u } = upstream(() => json({ status: 'success', data: 'not-a-hash' }));
    await assert.rejects(new DaemonApi(u).blockHash(1), /malformed/);
  });
});

describe('AppsApi and MarketApi', () => {
  const names = (n: number, prefix = 'app') =>
    Array.from({ length: n }, (_, i) => ({ name: `${prefix}${i}` }));

  it('counts registered apps with a conditional request and reuses the set on 304', async () => {
    let seenIfNoneMatch: string | null = null;
    let call = 0;
    const { u } = upstream((_url, init) => {
      call += 1;
      const h = new Headers(init?.headers);
      if (call === 2) {
        seenIfNoneMatch = h.get('if-none-match');
        return new Response(null, { status: 304 });
      }
      return json({ status: 'success', data: names(80) }, { headers: { etag: 'W/"abc"' } });
    });
    const apps = new AppsApi(u);
    const first = await apps.registered();
    assert.equal(first.size, 80);
    const second = await apps.registered();
    assert.equal(seenIfNoneMatch, 'W/"abc"');
    assert.equal(second, first);
  });

  it('refuses an implausibly small app list instead of reporting it', async () => {
    const { u } = upstream(() => json({ status: 'success', data: names(3) }));
    await assert.rejects(new AppsApi(u).registered(), /only 3/);
  });

  it('reads the CoinGecko shape and rejects a missing price', async () => {
    const good = upstream(() =>
      json({ zelcash: { usd: 0.0854, usd_24h_change: 2.9234, usd_market_cap: 35954998.4 } }),
    );
    assert.deepEqual(await new MarketApi(good.u).flux(), {
      priceUsd: 0.0854,
      change24hPct: 2.92,
      marketCapUsd: 35954998,
    });
    const bad = upstream(() => json({ zelcash: {} }));
    await assert.rejects(new MarketApi(bad.u).flux(), /usable/);
  });
});
