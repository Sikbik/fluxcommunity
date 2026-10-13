import type {
  AppsHealthSnapshot,
  BlockEvent,
  BlocksSnapshot,
  GeoSnapshot,
  NetworkSnapshot,
  UpstreamStatus,
} from '../../../shared/api.ts';
import { COMMUNITY_APPS } from '../../../shared/catalog.ts';
import type { Config } from '../config.ts';
import { type Clock, systemClock } from '../core/clock.ts';
import type { Logger } from '../core/log.ts';
import { Upstream } from '../core/upstream.ts';
import { buildFallback } from '../data/fallback.ts';
import { AppsApi } from '../flux/apps.ts';
import { DaemonApi } from '../flux/daemon.ts';
import { MarketApi } from '../flux/market.ts';
import { COLLATERAL, computeRewards, TARGET_BLOCK_SEC } from '../flux/rewards.ts';
import { StatsApi } from '../flux/stats.ts';
import type { Providers, Served } from '../http/app.ts';
import { BlockWatcher } from './blocks.ts';
import { HealthProber, PROBE_USER_AGENT } from './health.ts';
import { NetworkService } from './network.ts';

/** The wired-up data side of the server: live (upstream backed) or fixtures (offline simulation). */
export interface Runtime {
  providers: Providers;
  mode: 'live' | 'fixtures';
  start(): void;
  stop(): Promise<void>;
  onBlock(fn: (e: BlockEvent) => void): () => void;
  onNetwork(fn: (s: NetworkSnapshot) => void): () => void;
  onHealth(fn: (s: AppsHealthSnapshot) => void): () => void;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

function statusOf(u: Upstream): UpstreamStatus {
  const s = u.status();
  return { ok: s.ok, lastOkAt: iso(s.lastOkAt), lastError: s.lastError };
}

export function createLiveRuntime(config: Config, log: Logger, clock: Clock = systemClock): Runtime {
  const mk = (name: string, bases: string[]) =>
    new Upstream({
      name,
      bases,
      timeoutMs: config.upstream.timeoutMs,
      userAgent: config.upstream.userAgent,
      clock,
      log,
    });
  const fluxApi = mk('flux-api', config.upstream.fluxApi);
  const stats = mk('stats', [config.upstream.stats]);
  const gecko = mk('coingecko', [config.upstream.coingecko]);

  const daemon = new DaemonApi(fluxApi);
  const blocks = new BlockWatcher({
    source: daemon,
    log,
    clock,
    fastMs: config.intervals.blockFastMs,
    slowMs: config.intervals.blockSlowMs,
  });
  const fallback = buildFallback();
  const network = new NetworkService({
    daemon,
    stats: new StatsApi(stats),
    apps: new AppsApi(fluxApi),
    market: new MarketApi(gecko),
    blocks,
    config: config.intervals,
    fallback,
    clock,
    log,
  });
  const health = new HealthProber({
    apps: COMMUNITY_APPS,
    intervalMs: config.intervals.healthMs,
    concurrency: config.health.concurrency,
    timeoutMs: config.health.timeoutMs,
    maxRedirects: config.health.maxRedirects,
    slowMs: config.health.slowMs,
    confirmDelayMs: config.health.confirmDelayMs,
    userAgent: PROBE_USER_AGENT,
    clock,
    log,
  });

  const startedAt = clock.now();
  const blocksWindowMs = 90_000;
  const healthWindowMs = config.intervals.healthMs * 4;

  let blocksVersion = -1;
  let blocksCached: BlocksSnapshot = { blocks: [] };
  let healthVersion = -1;
  let healthCached: AppsHealthSnapshot = health.snapshot();

  const providers: Providers = {
    network: () => network.network(),
    geo: () => network.geo(),
    blocks(): Served<BlocksSnapshot> {
      if (blocks.version !== blocksVersion) {
        blocksVersion = blocks.version;
        blocksCached = blocks.snapshot();
      }
      const at = blocks.lastPollOkAt;
      if (blocksCached.blocks.length === 0 || at === null) {
        return { data: blocksCached, asOfMs: fallback.asOfMs, source: 'fallback' };
      }
      return {
        data: blocksCached,
        asOfMs: at,
        source: clock.now() - at <= blocksWindowMs ? 'live' : 'cache',
      };
    },
    health(): Served<AppsHealthSnapshot> {
      if (health.version !== healthVersion) {
        healthVersion = health.version;
        healthCached = health.snapshot();
      }
      const at = health.lastCheckedAt;
      if (at === null) return { data: healthCached, asOfMs: startedAt, source: 'fallback' };
      return {
        data: healthCached,
        asOfMs: at,
        source: clock.now() - at <= healthWindowMs ? 'live' : 'cache',
      };
    },
    windows: {
      networkMs: network.networkWindowMs,
      geoMs: network.geoWindowMs,
      blocksMs: blocksWindowMs,
      healthMs: healthWindowMs,
    },
    upstreamStatus: () => ({
      'flux-api': statusOf(fluxApi),
      stats: statusOf(stats),
      coingecko: statusOf(gecko),
    }),
  };

  return {
    providers,
    mode: 'live',
    start() {
      blocks.start();
      network.start();
      health.start();
    },
    async stop() {
      health.stop();
      network.stop();
      await blocks.stop();
    },
    onBlock: (fn) => blocks.onBlock(fn),
    onNetwork: (fn) => network.onChange(fn),
    onHealth: (fn) => health.onChange(fn),
  };
}

// ---------------------------------------------------------------------------
// Fixtures: fully offline, deterministic, always labelled `fallback`
// ---------------------------------------------------------------------------

const FIXTURE_HEIGHT = 3_031_151;

function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createFixturesRuntime(
  _config: Config,
  log: Logger,
  clock: Clock = systemClock,
  /** Simulated block interval; 30 s like the chain. Tests shorten it. */
  blockMs = 30_000,
): Runtime {
  const fallback = buildFallback();
  const bootMs = Math.floor(clock.now() / 1000) * 1000;
  const blockList: { height: number; timeMs: number; txCount: number }[] = [];
  for (let i = 119; i >= 0; i--) {
    const height = FIXTURE_HEIGHT - i;
    blockList.push({ height, timeMs: bootMs - i * 30_000, txCount: 5 + (stableHash(`b${height}`) % 14) });
  }
  const blockListeners = new Set<(e: BlockEvent) => void>();
  const networkListeners = new Set<(s: NetworkSnapshot) => void>();
  const healthListeners = new Set<(s: AppsHealthSnapshot) => void>();
  let timer: NodeJS.Timeout | null = null;

  const healthSnap: AppsHealthSnapshot = {
    apps: COMMUNITY_APPS.map((a) => {
      const probed = a.probe !== false;
      if (!probed) {
        return {
          id: a.id,
          state: 'unknown',
          httpStatus: null,
          latencyMs: null,
          checkedAt: null,
          since: null,
        };
      }
      const h = stableHash(a.id);
      const down = a.id === 'claimcalc';
      const slow = a.id === 'fluxtracker';
      return {
        id: a.id,
        state: down ? 'down' : slow ? 'degraded' : 'up',
        httpStatus: down ? 503 : 200,
        latencyMs: down ? 180 : slow ? 3_100 : 90 + (h % 420),
        checkedAt: new Date(bootMs).toISOString(),
        since: new Date(bootMs - (down ? 3_600_000 : 86_400_000)).toISOString(),
      };
    }),
  };

  const networkSnapshot = (): NetworkSnapshot => {
    const tip = blockList[blockList.length - 1] as { height: number; timeMs: number };
    const { rewards } = computeRewards({ height: tip.height, tipTimeMs: tip.timeMs });
    const base = fallback.network;
    return {
      ...base,
      chain: {
        height: tip.height,
        tipTime: new Date(tip.timeMs).toISOString(),
        targetBlockSec: TARGET_BLOCK_SEC,
        measuredBlockSec: 30,
        consensus: 'Proof of Node',
      },
      rewards,
      nodes: { ...base.nodes, collateral: { ...COLLATERAL } },
      market: { priceUsd: 0.085, change24hPct: 3.04, marketCapUsd: 35_900_000 },
      freshness: { chain: null, nodes: null, capacity: null, apps: null, market: null },
    };
  };

  let networkCached = networkSnapshot();
  let blocksCached: BlocksSnapshot = snapshotOf();

  function snapshotOf(): BlocksSnapshot {
    return {
      blocks: blockList.map((b, i) => ({
        height: b.height,
        time: new Date(b.timeMs).toISOString(),
        intervalSec: i === 0 ? null : (b.timeMs - (blockList[i - 1] as { timeMs: number }).timeMs) / 1000,
        txCount: b.txCount,
      })),
    };
  }

  const lastMs = () => (blockList[blockList.length - 1] as { timeMs: number }).timeMs;
  const providers: Providers = {
    network: () => ({ data: networkCached, asOfMs: lastMs(), source: 'fallback' }),
    geo: () => ({ data: fallback.geo as GeoSnapshot, asOfMs: bootMs, source: 'fallback' }),
    blocks: () => ({ data: blocksCached, asOfMs: lastMs(), source: 'fallback' }),
    health: () => ({ data: healthSnap, asOfMs: bootMs, source: 'fallback' }),
    windows: { networkMs: 90_000, geoMs: 900_000, blocksMs: 90_000, healthMs: 360_000 },
    upstreamStatus: () => ({
      'flux-api': { ok: false, lastOkAt: null, lastError: 'fixtures mode: upstream disabled' },
      stats: { ok: false, lastOkAt: null, lastError: 'fixtures mode: upstream disabled' },
      coingecko: { ok: false, lastOkAt: null, lastError: 'fixtures mode: upstream disabled' },
    }),
  };

  return {
    providers,
    mode: 'fixtures',
    start() {
      log.warn('FIXTURES=1: serving simulated data, upstreams are disabled. Never use in production.');
      timer = setInterval(() => {
        const height = (blockList[blockList.length - 1] as { height: number }).height + 1;
        const timeMs = Math.floor(clock.now() / 1000) * 1000;
        blockList.push({ height, timeMs, txCount: 5 + (stableHash(`b${height}`) % 14) });
        if (blockList.length > 120) blockList.shift();
        blocksCached = snapshotOf();
        networkCached = networkSnapshot();
        const ev: BlockEvent = {
          height,
          time: new Date(timeMs).toISOString(),
          txCount: blockList[blockList.length - 1]?.txCount ?? null,
        };
        for (const fn of blockListeners) fn(ev);
        for (const fn of networkListeners) fn(networkCached);
      }, blockMs);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    onBlock: (fn) => {
      blockListeners.add(fn);
      return () => blockListeners.delete(fn);
    },
    onNetwork: (fn) => {
      networkListeners.add(fn);
      return () => networkListeners.delete(fn);
    },
    onHealth: (fn) => {
      healthListeners.add(fn);
      return () => healthListeners.delete(fn);
    },
  };
}
