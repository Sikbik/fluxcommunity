import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ManualClock } from '../src/core/clock.ts';
import { buildFallback } from '../src/data/fallback.ts';
import { NetworkService } from '../src/services/network.ts';

function names(n: number, prefix: string): Set<string> {
  return new Set(Array.from({ length: n }, (_, i) => `${prefix}${i}`));
}

function rig(opts: { tip?: boolean; subsidy?: number } = {}) {
  const clock = new ManualClock(Date.parse('2026-10-12T18:00:00Z'));
  const tipTime = clock.now() - 10_000;
  const blocks = {
    tip: () => (opts.tip === false ? null : { height: 3_031_200, hash: 'a', timeMs: tipTime, txCount: 3 }),
    lastPollOkAt: opts.tip === false ? null : clock.now(),
    version: 0,
    measuredBlockSec: (): number | null => 30.2,
    onBlock: () => () => {},
  };
  const state = { price: 0.085 as number | null, fleetFails: false };
  const deps = {
    daemon: {
      nodeCount: async () => ({ total: 7000, cumulus: 3500, nimbus: 1700, stratus: 1800 }),
      subsidy: async (h: number) => (h >= 3_071_200 ? 12.6 : (opts.subsidy ?? 14)),
    },
    stats: {
      fleet: async () => {
        if (state.fleetFails) throw new Error('stats down');
        return [
          {
            tier: 'CUMULUS',
            benchmark: { bench: { status: 'CUMULUS', cores: 4, ram: 8, ssd: 250 } },
            flux: { version: '8.20.0' },
            daemon: { info: { version: 9010050 } },
            geolocation: { lat: 50, lon: 8, countryCode: 'DE', country: 'Germany' },
          },
          {
            tier: 'NIMBUS',
            benchmark: { bench: { status: 'NIMBUS', cores: 8, ram: 32, ssd: 500 } },
            flux: { version: '8.20.0' },
            daemon: { info: { version: 9010050 } },
            geolocation: { lat: 40, lon: -75, countryCode: 'US', country: 'United States' },
          },
          ...Array.from({ length: 120 }, () => ({ tier: 'STRATUS', error: {} })),
        ];
      },
    },
    apps: {
      registered: async () => names(100, 'app'),
      running: async () => new Set([...names(90, 'app'), 'ghost1', 'ghost2']),
    },
    market: {
      flux: async () => {
        if (state.price === null) throw new Error('coingecko down');
        return { priceUsd: state.price, change24hPct: 1.5, marketCapUsd: 1_000_000 };
      },
    },
    blocks,
    config: {
      networkMs: 10_000,
      fleetMs: 300_000,
      priceMs: 60_000,
      appsRunningMs: 600_000,
      appsRegisteredMs: 1_800_000,
    },
    fallback: buildFallback(),
    clock,
  };
  const svc = new NetworkService(deps as never);
  return { svc, clock, state, blocks };
}

describe('NetworkService', () => {
  it('serves the baked fallback, labelled, before any upstream data exists', () => {
    const { svc } = rig({ tip: false });
    const s = svc.network();
    assert.equal(s.source, 'fallback');
    assert.equal(s.data.market, null);
    const g = svc.geo();
    assert.equal(g.source, 'fallback');
    assert.ok(g.data.points.length > 100);
  });

  it('assembles a live snapshot from the cells and stamps per-section freshness', async () => {
    const { svc, clock } = rig();
    await Promise.all([
      svc.nodeCount.refresh(),
      svc.fleet.refresh(),
      svc.registered.refresh(),
      svc.running.refresh(),
      svc.market.refresh(),
      svc.subsidy.refresh(),
    ]);
    const s = svc.network();
    assert.equal(s.source, 'live');
    const d = s.data;
    assert.equal(d.chain.height, 3_031_200);
    assert.equal(d.chain.measuredBlockSec, 30.2);
    assert.deepEqual(d.nodes.tiers, { cumulus: 3500, nimbus: 1700, stratus: 1800 });
    assert.equal(d.nodes.countries, 2);
    assert.deepEqual(d.capacity, { cores: 12, ramTb: 0, ssdTb: 0.8, reporting: 2 });
    assert.deepEqual(
      d.apps,
      { registered: 100, running: 90 },
      'unregistered ghost rows are not counted as running',
    );
    assert.deepEqual(d.versions, { fluxos: '8.20.0', daemon: '9.1.0' });
    assert.equal(d.market?.priceUsd, 0.085);
    assert.equal(d.rewards.nextReduction?.height, 3_071_200);
    assert.equal(d.freshness?.market, new Date(clock.now()).toISOString());
    assert.equal(svc.geo().source, 'live');
    assert.equal(svc.geo().data.points.length, 2);
  });

  it('goes stale with source=cache when polling stops, and drops an old price', async () => {
    const { svc, clock } = rig();
    await Promise.all([svc.nodeCount.refresh(), svc.market.refresh(), svc.fleet.refresh()]);
    assert.equal(svc.network().source, 'live');
    clock.advance(45_000); // beyond 3 x networkMs
    const s = svc.network();
    assert.equal(s.source, 'cache');
    assert.ok(s.data.market !== null, 'price is still young enough to show');
    clock.advance(31 * 60_000);
    assert.equal(svc.network().data.market, null, 'a price older than 30 minutes is null, not guessed');
    assert.ok(svc.network().data.capacity !== null, 'slow-moving capacity is kept, with its own timestamp');
  });

  it('keeps the last good geo when stats fails and reports cache', async () => {
    const { svc, clock, state } = rig();
    await svc.fleet.refresh();
    state.fleetFails = true;
    clock.advance(20 * 60_000);
    assert.equal(await svc.fleet.refresh(), false);
    const g = svc.geo();
    assert.equal(g.source, 'cache');
    assert.equal(g.data.points.length, 2);
  });

  it('trusts the live daemon subsidy over the formula and surfaces it', async () => {
    const { svc } = rig({ subsidy: 15.4 });
    await Promise.all([svc.nodeCount.refresh(), svc.subsidy.refresh()]);
    assert.equal(svc.network().data.rewards.perBlock, 15.4);
  });

  it('quotes the reduction ETA with the measured block interval and follows it as it changes', async () => {
    const { svc, blocks } = rig();
    await Promise.all([svc.nodeCount.refresh(), svc.subsidy.refresh()]);
    const tipMs = blocks.tip()?.timeMs ?? 0;
    const at = (sec: number) => new Date(tipMs + 40_000 * sec * 1000).toISOString();

    const first = svc.network().data;
    assert.equal(first.rewards.nextReduction?.blocksAway, 40_000);
    assert.equal(first.rewards.nextReduction?.etaIso, at(30.2), 'measured 30.2 s, not the 30 s target');
    assert.equal(first.chain.measuredBlockSec, 30.2);

    // The first minute after boot: fewer than 5 intervals buffered, so the target is used.
    blocks.measuredBlockSec = () => null;
    blocks.version += 1;
    assert.equal(svc.network().data.rewards.nextReduction?.etaIso, at(30));

    // A new measurement is picked up even if the tip and the poll stamp did not move (backfill).
    blocks.measuredBlockSec = () => 31.5;
    blocks.version += 1;
    assert.equal(svc.network().data.rewards.nextReduction?.etaIso, at(31.5));

    // An implausible measurement is ignored.
    blocks.measuredBlockSec = () => 75;
    blocks.version += 1;
    const out = svc.network().data;
    assert.equal(out.rewards.nextReduction?.etaIso, at(30));
    assert.equal(out.chain.measuredBlockSec, 75, 'the raw measurement is still reported as measured');
  });
});
