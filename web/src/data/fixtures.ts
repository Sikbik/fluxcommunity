/**
 * Baked-in fallback snapshots.
 *
 * These are what the page shows when the API has never answered. Every one of them is tagged
 * `meta.source: 'fallback'` and dated `FALLBACK_AS_OF`, so the UI can only ever present them as
 * "offline, as of <date>". They are never used as live data, with one exception: the dev-only
 * `?demo=1` flag, which builds live-looking copies from them (see `demoSet`).
 *
 * Numbers are rounded, plausible values from the time they were baked. They are a stand-in, not a
 * record, and nothing here should be copied elsewhere as fact.
 */

import type {
  AppHealth,
  AppsHealthSnapshot,
  BlockSummary,
  BlocksSnapshot,
  GeoCountry,
  GeoPoint,
  GeoSnapshot,
  Meta,
  NetworkSnapshot,
  TierCounts,
} from '@shared/api';
import { COMMUNITY_APPS } from '@shared/catalog';
import { apportion } from './derive';

/** When these numbers were baked. The UI shows this as "as of <date>". */
export const FALLBACK_AS_OF = '2026-10-12T00:00:00.000Z';
export const FALLBACK_HEIGHT = 3_031_000;
const BLOCK_SEC = 30;
const REDUCTION_HEIGHT = 3_071_200;

export interface SnapshotSet {
  network: NetworkSnapshot;
  geo: GeoSnapshot;
  blocks: BlocksSnapshot;
  health: AppsHealthSnapshot;
}

export function fallbackMeta(): Meta {
  return { generatedAt: FALLBACK_AS_OF, asOf: FALLBACK_AS_OF, ageMs: 0, stale: true, source: 'fallback' };
}

function liveMeta(nowIso: string): Meta {
  return { generatedAt: nowIso, asOf: nowIso, ageMs: 0, stale: false, source: 'live' };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

function buildNetwork(height: number, tipIso: string): NetworkSnapshot {
  const blocksAway = Math.max(0, REDUCTION_HEIGHT - height);
  const etaMs = Date.parse(tipIso) + blocksAway * BLOCK_SEC * 1000;
  return {
    chain: {
      height,
      tipTime: tipIso,
      targetBlockSec: BLOCK_SEC,
      measuredBlockSec: 30.1,
      consensus: 'Proof of Node',
    },
    rewards: {
      perBlock: 14,
      perTier: { cumulus: 1, nimbus: 3.5, stratus: 9 },
      devFund: 0.5,
      nextReduction: {
        height: REDUCTION_HEIGHT,
        blocksAway,
        etaIso: new Date(etaMs).toISOString(),
        fraction: 0.1,
        perBlockAfter: 12.6,
      },
    },
    nodes: {
      total: 7102,
      tiers: { cumulus: 3583, nimbus: 1689, stratus: 1830 },
      collateral: { cumulus: 1000, nimbus: 12_500, stratus: 40_000 },
      countries: 27,
    },
    // Estimated from the tier minimum specs and node counts, not measured.
    capacity: { cores: 33_700, ramTb: 86, ssdTb: 3140 },
    apps: null,
    market: { priceUsd: 0.086, change24hPct: null, marketCapUsd: null },
    versions: { fluxos: null, daemon: null },
  };
}

// ---------------------------------------------------------------------------
// Geo
// ---------------------------------------------------------------------------

type City = [lat: number, lon: number, weight: number];
type CountrySeed = [code: string, name: string, weight: number, cities: City[]];

const COUNTRY_SEEDS: CountrySeed[] = [
  [
    'US',
    'United States',
    1640,
    [
      [39.0, -77.5, 4],
      [37.4, -122.1, 2],
      [41.9, -87.6, 2],
      [32.8, -96.8, 2],
      [47.6, -122.3, 1],
      [33.7, -84.4, 1],
    ],
  ],
  [
    'DE',
    'Germany',
    905,
    [
      [50.1, 8.7, 5],
      [48.1, 11.6, 2],
      [52.5, 13.4, 2],
      [49.4, 11.1, 2],
    ],
  ],
  [
    'FR',
    'France',
    610,
    [
      [48.9, 2.4, 4],
      [50.6, 3.1, 2],
      [43.3, 5.4, 1],
    ],
  ],
  [
    'GB',
    'United Kingdom',
    390,
    [
      [51.5, -0.1, 4],
      [53.5, -2.2, 1],
    ],
  ],
  ['NL', 'Netherlands', 330, [[52.4, 4.9, 1]]],
  [
    'CA',
    'Canada',
    290,
    [
      [45.5, -73.6, 2],
      [43.7, -79.4, 2],
      [49.3, -123.1, 1],
    ],
  ],
  [
    'FI',
    'Finland',
    270,
    [
      [60.2, 24.9, 2],
      [60.5, 27.2, 1],
    ],
  ],
  ['SG', 'Singapore', 215, [[1.35, 103.8, 1]]],
  [
    'JP',
    'Japan',
    190,
    [
      [35.7, 139.7, 3],
      [34.7, 135.5, 1],
    ],
  ],
  [
    'PL',
    'Poland',
    160,
    [
      [52.2, 21.0, 1],
      [50.1, 19.9, 1],
    ],
  ],
  [
    'AU',
    'Australia',
    150,
    [
      [-33.9, 151.2, 2],
      [-37.8, 145.0, 1],
    ],
  ],
  [
    'IT',
    'Italy',
    140,
    [
      [45.5, 9.2, 2],
      [41.9, 12.5, 1],
    ],
  ],
  ['ES', 'Spain', 120, [[40.4, -3.7, 1]]],
  ['SE', 'Sweden', 110, [[59.3, 18.1, 1]]],
  ['CH', 'Switzerland', 100, [[47.4, 8.5, 1]]],
  [
    'IN',
    'India',
    95,
    [
      [19.1, 72.9, 1],
      [12.97, 77.6, 1],
    ],
  ],
  ['BR', 'Brazil', 90, [[-23.5, -46.6, 1]]],
  ['RU', 'Russia', 85, [[55.8, 37.6, 1]]],
  ['KR', 'South Korea', 80, [[37.6, 127.0, 1]]],
  ['IE', 'Ireland', 70, [[53.3, -6.3, 1]]],
  ['AT', 'Austria', 65, [[48.2, 16.4, 1]]],
  ['CZ', 'Czechia', 60, [[50.1, 14.4, 1]]],
  ['HK', 'Hong Kong', 55, [[22.3, 114.2, 1]]],
  ['TR', 'Turkey', 50, [[41.0, 29.0, 1]]],
  ['ZA', 'South Africa', 40, [[-26.2, 28.0, 1]]],
  ['MX', 'Mexico', 35, [[19.4, -99.1, 1]]],
  ['NO', 'Norway', 30, [[59.9, 10.7, 1]]],
];

function buildGeo(net: NetworkSnapshot): GeoSnapshot {
  const total = net.nodes.total;
  const located = total - Math.round(total * 0.017);
  const tierWeights = [net.nodes.tiers.cumulus, net.nodes.tiers.nimbus, net.nodes.tiers.stratus];
  const perCountry = apportion(
    COUNTRY_SEEDS.map((c) => c[2]),
    located,
  );
  const countries: GeoCountry[] = [];
  const points: GeoPoint[] = [];
  COUNTRY_SEEDS.forEach(([code, name, , cities], i) => {
    const nodes = perCountry[i] ?? 0;
    const [c = 0, n = 0, s = 0] = apportion(tierWeights, nodes);
    const tiers: TierCounts = { cumulus: c, nimbus: n, stratus: s };
    countries.push({ code, name, nodes, tiers });
    const perCity = apportion(
      cities.map((x) => x[2]),
      nodes,
    );
    cities.forEach(([lat, lon], j) => {
      const count = perCity[j] ?? 0;
      if (count === 0) return;
      const [pc = 0, pn = 0, ps = 0] = apportion(tierWeights, count);
      points.push({ lat, lon, n: count, t: [pc, pn, ps] });
    });
  });
  return { located, total, countries, points };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** Deterministic unit-interval hash of (height, salt), so a block always has the same interval. */
function hashUnit(height: number, salt: number): number {
  let h = Math.imul(height ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 0x100000000;
}

/** Seconds between block `height - 1` and block `height`: about 30 with a plausible spread. */
function intervalFor(height: number): number {
  return Math.max(8, Math.round(BLOCK_SEC + (hashUnit(height, 1) + hashUnit(height, 2) - 1) * 14));
}

function buildBlocks(height: number, tipMs: number, count = 60): BlocksSnapshot {
  const blocks: BlockSummary[] = [];
  let t = tipMs;
  for (let i = 0; i < count; i++) {
    const h = height - i;
    const interval = intervalFor(h);
    blocks.push({
      height: h,
      time: new Date(t).toISOString(),
      intervalSec: i === count - 1 ? null : interval,
      txCount: null,
    });
    t -= interval * 1000;
  }
  return { blocks: blocks.reverse() };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

function buildHealth(): AppsHealthSnapshot {
  // Nothing has been checked, so nothing is claimed: every app is `unknown`.
  const apps: AppHealth[] = COMMUNITY_APPS.map((a) => ({
    id: a.id,
    state: 'unknown',
    httpStatus: null,
    latencyMs: null,
    checkedAt: null,
    since: null,
  }));
  return { apps };
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

let memo: SnapshotSet | null = null;

/** The baked fallback set. Built once on first use, never at import time. */
export function getFallback(): SnapshotSet {
  if (!memo) {
    const network = buildNetwork(FALLBACK_HEIGHT, FALLBACK_AS_OF);
    memo = {
      network,
      geo: buildGeo(network),
      blocks: buildBlocks(FALLBACK_HEIGHT, Date.parse(FALLBACK_AS_OF)),
      health: buildHealth(),
    };
  }
  return memo;
}

export interface DemoSet extends SnapshotSet {
  meta: Meta;
}

/**
 * Live-looking snapshots for `?demo=1`. The same baked numbers, moved to the present, with a
 * little life added (price change, health variety) so the live visuals have something to show.
 */
export function demoSet(nowMs: number, height: number, tipMs: number): DemoSet {
  const base = getFallback();
  const tipIso = new Date(tipMs).toISOString();
  const network = buildNetwork(height, tipIso);
  network.market = { priceUsd: 0.086, change24hPct: 2.4, marketCapUsd: 38_000_000 };
  network.apps = { registered: 1540, running: 1380 };
  network.versions = { fluxos: '0.0.0-demo', daemon: '0.0.0-demo' };
  const stamp = new Date(nowMs).toISOString();
  network.freshness = { chain: stamp, nodes: stamp, capacity: stamp, apps: stamp, market: stamp };
  const health: AppsHealthSnapshot = {
    apps: base.health.apps.map((a, i) => {
      const state = i % 11 === 5 ? 'down' : i % 7 === 3 ? 'degraded' : 'up';
      const checkedAt = new Date(nowMs - 20_000).toISOString();
      return {
        ...a,
        state,
        httpStatus: state === 'down' ? 503 : 200,
        latencyMs: state === 'down' ? null : 90 + ((i * 53) % 420),
        checkedAt,
        since: new Date(nowMs - (3_600_000 + i * 977_000)).toISOString(),
      };
    }),
  };
  return {
    network,
    geo: base.geo,
    blocks: buildBlocks(height, tipMs),
    health,
    meta: liveMeta(new Date(nowMs).toISOString()),
  };
}
