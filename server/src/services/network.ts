import type {
  AppsStats,
  DataSource,
  GeoSnapshot,
  MarketStats,
  NetworkSnapshot,
  TierCounts,
} from '../../../shared/api.ts';
import { type Clock, systemClock } from '../core/clock.ts';
import { errText, type Logger, silentLogger } from '../core/log.ts';
import { type Loop, startLoop } from '../core/loop.ts';
import { SwrCell } from '../core/swr.ts';
import type { AppsApi } from '../flux/apps.ts';
import type { DaemonApi, NodeCounts } from '../flux/daemon.ts';
import type { MarketApi } from '../flux/market.ts';
import {
  COLLATERAL,
  computeRewards,
  nextReductionHeight,
  reductionsDone,
  TARGET_BLOCK_SEC,
} from '../flux/rewards.ts';
import type { StatsApi } from '../flux/stats.ts';
import type { BlockWatcher } from './blocks.ts';
import { type CapacityResult, summariseCapacity, summariseGeo } from './fleet.ts';

export interface Served<T> {
  data: T;
  /** ms epoch the underlying data was fetched. */
  asOfMs: number;
  source: DataSource;
}

export interface NetworkConfig {
  networkMs: number;
  fleetMs: number;
  priceMs: number;
  appsRunningMs: number;
  appsRegisteredMs: number;
}

export interface NetworkDeps {
  daemon: DaemonApi;
  stats: StatsApi;
  apps: AppsApi;
  market: MarketApi;
  blocks: BlockWatcher;
  config: NetworkConfig;
  fallback: { network: NetworkSnapshot; geo: GeoSnapshot; asOfMs: number };
  clock?: Clock;
  log?: Logger;
}

interface Fleet extends CapacityResult {
  geo: GeoSnapshot;
}

interface SubsidyCheck {
  epoch: number;
  nextHeight: number | null;
  live: number;
  after: number | null;
}

const HOUR = 3_600_000;

/**
 * Owns every upstream-backed cell behind /network and /geo, the loops that refresh them, and assembly of
 * the NetworkSnapshot. Sections are fetched on their own cadence and each remembers when it was last
 * refreshed (`freshness`). The snapshot is only built from live parts when the chain tip and the node
 * count are both known; otherwise the baked fallback is served and labelled as such.
 */
export class NetworkService {
  readonly #d: NetworkDeps;
  readonly #clock: Clock;
  readonly #log: Logger;
  readonly nodeCount: SwrCell<NodeCounts>;
  readonly fleet: SwrCell<Fleet>;
  readonly registered: SwrCell<Set<string>>;
  readonly running: SwrCell<Set<string>>;
  readonly market: SwrCell<MarketStats>;
  readonly subsidy: SwrCell<SubsidyCheck>;
  readonly #loops: Loop[] = [];
  readonly #listeners = new Set<(s: NetworkSnapshot) => void>();
  #rebuildTimer: NodeJS.Timeout | null = null;
  #lastChangeKey = '';
  #memo: { key: string; data: NetworkSnapshot; asOfMs: number } | null = null;
  #unsubBlock: (() => void) | null = null;

  constructor(deps: NetworkDeps) {
    this.#d = deps;
    this.#clock = deps.clock ?? systemClock;
    this.#log = (deps.log ?? silentLogger).child({ svc: 'network' });
    const c = deps.config;
    const bump = () => this.#scheduleRebuild();
    const warn = (name: string) => (err: unknown) =>
      this.#log.warn('refresh failed', { cell: name, err: errText(err) });
    const base = { clock: this.#clock };

    this.nodeCount = new SwrCell({
      ...base,
      name: 'nodeCount',
      ttlMs: c.networkMs * 3,
      load: () => deps.daemon.nodeCount(),
      onUpdate: bump,
      onError: warn('nodeCount'),
    });
    this.fleet = new SwrCell({
      ...base,
      name: 'fleet',
      ttlMs: c.fleetMs * 3,
      maxAgeMs: 24 * HOUR,
      load: async () => {
        const rows = await deps.stats.fleet();
        return { ...summariseCapacity(rows), geo: summariseGeo(rows) };
      },
      onUpdate: bump,
      onError: warn('fleet'),
    });
    this.registered = new SwrCell({
      ...base,
      name: 'appsRegistered',
      ttlMs: c.appsRegisteredMs * 2,
      maxAgeMs: 24 * HOUR,
      load: () => deps.apps.registered(),
      onUpdate: bump,
      onError: warn('appsRegistered'),
    });
    this.running = new SwrCell({
      ...base,
      name: 'appsRunning',
      ttlMs: c.appsRunningMs * 2,
      maxAgeMs: 24 * HOUR,
      load: () => deps.apps.running(),
      onUpdate: bump,
      onError: warn('appsRunning'),
    });
    this.market = new SwrCell({
      ...base,
      name: 'market',
      ttlMs: c.priceMs * 3,
      // A price older than this is worse than no price.
      maxAgeMs: 30 * 60_000,
      load: () => deps.market.flux(),
      onUpdate: bump,
      onError: warn('market'),
    });
    this.subsidy = new SwrCell({
      ...base,
      name: 'subsidy',
      ttlMs: 12 * HOUR,
      load: async () => {
        const tip = deps.blocks.tip();
        if (!tip) throw new Error('no tip yet');
        const live = await deps.daemon.subsidy(tip.height);
        const nextHeight = nextReductionHeight(tip.height);
        const after = nextHeight === null ? null : await deps.daemon.subsidy(nextHeight);
        return { epoch: reductionsDone(tip.height), nextHeight, live, after };
      },
      onUpdate: bump,
      onError: warn('subsidy'),
    });
  }

  start(): void {
    const c = this.#d.config;
    const mk = (name: string, intervalMs: number, run: () => Promise<boolean>, initialDelayMs?: number) =>
      this.#loops.push(startLoop({ name, intervalMs, run, initialDelayMs }));
    mk('nodeCount', c.networkMs, () => this.nodeCount.refresh(), 0);
    mk('fleet', c.fleetMs, () => this.fleet.refresh(), 500);
    mk('price', c.priceMs, () => this.market.refresh(), 1_000);
    mk('appsRunning', c.appsRunningMs, () => this.running.refresh(), 3_000);
    mk('appsRegistered', c.appsRegisteredMs, () => this.registered.refresh(), 6_000);
    mk('subsidy', 10 * 60_000, () => this.subsidy.refresh(), 4_000);
    this.#unsubBlock = this.#d.blocks.onBlock((e) => {
      this.#scheduleRebuild();
      // A reduction boundary was crossed: re-verify against the daemon right away.
      const have = this.subsidy.peek().value;
      if (have && have.epoch !== reductionsDone(e.height)) void this.subsidy.refresh();
    });
    this.#scheduleRebuild();
  }

  stop(): void {
    for (const l of this.#loops) l.stop();
    this.#loops.length = 0;
    this.#unsubBlock?.();
    if (this.#rebuildTimer) clearTimeout(this.#rebuildTimer);
    this.#rebuildTimer = null;
  }

  onChange(fn: (s: NetworkSnapshot) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** The current network snapshot, never null. */
  network(): Served<NetworkSnapshot> {
    return this.#build();
  }

  geo(): Served<GeoSnapshot> {
    const f = this.fleet.read();
    if (f.value && f.fetchedAt !== null) {
      return { data: f.value.geo, asOfMs: f.fetchedAt, source: f.fresh ? 'live' : 'cache' };
    }
    return { data: this.#d.fallback.geo, asOfMs: this.#d.fallback.asOfMs, source: 'fallback' };
  }

  /** Freshness window of the network snapshot (ms), used for meta.stale. */
  get networkWindowMs(): number {
    return this.#d.config.networkMs * 3;
  }
  get geoWindowMs(): number {
    return this.#d.config.fleetMs * 3;
  }

  #scheduleRebuild(): void {
    if (this.#rebuildTimer) return;
    this.#rebuildTimer = setTimeout(() => {
      this.#rebuildTimer = null;
      const served = this.#build();
      // Section freshness stamps move on every poll; only real data changes are worth an event.
      const key = JSON.stringify({ ...served.data, freshness: undefined });
      if (key !== this.#lastChangeKey) {
        this.#lastChangeKey = key;
        // Never announce the baked fallback as a change event.
        if (served.source !== 'fallback') {
          for (const fn of this.#listeners) {
            try {
              fn(served.data);
            } catch (err) {
              this.#log.warn('listener failed', { err: errText(err) });
            }
          }
        }
      }
    }, 250);
  }

  #build(): Served<NetworkSnapshot> {
    const tip = this.#d.blocks.tip();
    const chainAt = this.#d.blocks.lastPollOkAt;
    const nodes = this.nodeCount.peek();
    if (!tip || chainAt === null || !nodes.value || nodes.fetchedAt === null) {
      const fb = this.#d.fallback;
      return { data: fb.network, asOfMs: fb.asOfMs, source: 'fallback' };
    }
    const now = this.#clock.now();
    const key = [
      tip.height,
      // Backfill and reorgs change the measured interval (and so the reduction ETA) without moving the tip.
      this.#d.blocks.version,
      chainAt,
      nodes.fetchedAt,
      this.fleet.peek().fetchedAt,
      this.registered.peek().fetchedAt,
      this.running.peek().fetchedAt,
      this.market.peek().fetchedAt,
      this.subsidy.peek().fetchedAt,
      Math.floor(now / 60_000), // lets age-limited sections (price) drop out on time
    ].join('|');
    const sourceFor = (asOfMs: number): DataSource =>
      Math.max(0, now - asOfMs) <= this.networkWindowMs ? 'live' : 'cache';
    if (this.#memo && this.#memo.key === key) {
      return { data: this.#memo.data, asOfMs: this.#memo.asOfMs, source: sourceFor(this.#memo.asOfMs) };
    }
    const tiers: TierCounts = {
      cumulus: nodes.value.cumulus,
      nimbus: nodes.value.nimbus,
      stratus: nodes.value.stratus,
    };

    const sub = this.subsidy.peek().value;
    const epoch = reductionsDone(tip.height);
    const verified = sub !== null && sub.epoch === epoch;
    const measuredBlockSec = this.#d.blocks.measuredBlockSec();
    const { rewards, mismatch } = computeRewards({
      height: tip.height,
      tipTimeMs: tip.timeMs,
      measuredBlockSec,
      liveSubsidy: verified ? sub.live : null,
      liveSubsidyAfter: verified ? sub.after : null,
    });
    if (mismatch) this.#log.warn('reward schedule mismatch', { detail: mismatch });

    const fleet = this.fleet.peek();
    const reg = this.registered.peek();
    const run = this.running.peek();
    const mkt = this.market.peek();

    let apps: AppsStats | null = null;
    let appsAt: number | null = null;
    if (reg.value || run.value) {
      // A running count is only meaningful for registered apps; intersect when both are known.
      const running = run.value
        ? reg.value
          ? [...run.value].filter((n) => reg.value?.has(n)).length
          : run.value.size
        : null;
      apps = { registered: reg.value ? reg.value.size : null, running };
      appsAt = Math.min(reg.fetchedAt ?? Number.POSITIVE_INFINITY, run.fetchedAt ?? Number.POSITIVE_INFINITY);
    }
    const iso = (ms: number | null | undefined) =>
      ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString();

    const data: NetworkSnapshot = {
      chain: {
        height: tip.height,
        tipTime: new Date(tip.timeMs).toISOString(),
        targetBlockSec: TARGET_BLOCK_SEC,
        measuredBlockSec,
        consensus: 'Proof of Node',
      },
      rewards,
      nodes: {
        total: nodes.value.total,
        tiers,
        collateral: { ...COLLATERAL },
        countries: fleet.value ? fleet.value.geo.countries.length : null,
      },
      capacity: fleet.value?.capacity ?? null,
      apps,
      market: mkt.value ?? null,
      versions: fleet.value?.versions ?? { fluxos: null, daemon: null },
      freshness: {
        chain: iso(chainAt),
        nodes: iso(nodes.fetchedAt),
        capacity: fleet.value?.capacity ? iso(fleet.fetchedAt) : null,
        apps: apps ? iso(appsAt) : null,
        market: mkt.value ? iso(mkt.fetchedAt) : null,
      },
    };
    const asOfMs = Math.min(chainAt, nodes.fetchedAt);
    this.#memo = { key, data, asOfMs };
    return { data, asOfMs, source: sourceFor(asOfMs) };
  }
}
