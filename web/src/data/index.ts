/**
 * Public surface of the data layer. Sections read data ONLY through these hooks; nothing else calls
 * `fetch`. Hook names and shapes are a stable contract: additions only.
 *
 * - Everything here is lazy. Importing this module starts nothing; `startDataLayer()` does.
 * - Hooks return referentially stable values: a component re-renders only when its slice changes.
 *   `ageMs` is the one field that moves on a shared one-second ticker, so a component that does not
 *   show an age should prefer the narrower hooks (`useNetworkSelect`, `useFreshness`, ...).
 * - Nothing here ever simulates a live network. Fixtures are labelled `offline`; the only exception
 *   is the dev-only `?demo=1` flag, which is logged to the console.
 */
import type { AppsHealthSnapshot, BlocksSnapshot, GeoSnapshot, NetworkSnapshot } from '@shared/api';
import { useMemo, useSyncExternalStore } from 'react';
import { useStageBus } from '../stage/bus';
import { browserEnv, getSharedTicker } from './clock';
import { chainProgress, computeReductionCountdown } from './derive';
import { createEngine } from './engine';
import { type SectionKey, sectionStatus } from './freshness';
import { createLayerController, demoRequested } from './layer';
import { type DataState, useDataStore } from './store';
import type {
  AppHealth,
  ChainClockView,
  Connection,
  DataLayerDebug,
  Freshness,
  ReductionCountdown,
  ResourceKey,
  Sourced,
} from './types';

export * from './derive';
export { FALLBACK_AS_OF, FALLBACK_HEIGHT } from './fixtures';
export type { SectionKey, SectionStatus } from './freshness';
export { FRESH_WINDOW_MS, SECTION_WINDOW_MS } from './freshness';
export type {
  AppHealth,
  ChainClockView,
  Connection,
  DataLayerDebug,
  Freshness,
  ReductionCountdown,
  ResourceKey,
  Sourced,
} from './types';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const controller = createLayerController(() =>
  createEngine({
    env: browserEnv(),
    ticker: getSharedTicker(),
    store: useDataStore,
    bus: {
      setChain: (chain) => useStageBus.getState().setChain(chain),
      firePulse: (kind) => useStageBus.getState().firePulse(kind),
    },
    demo: demoRequested(typeof location === 'undefined' ? '' : location.search, import.meta.env.DEV),
  }),
);

/**
 * Starts the REST client, the SSE stream and the stage-bus feed. Idempotent and refcounted: call it
 * from the app shell effect (StrictMode double mounts are fine). Returns a stop function.
 */
export function startDataLayer(): () => void {
  return controller.acquire();
}

if (import.meta.hot) {
  // Never leak a stream or timers across hot module reloads.
  import.meta.hot.dispose(() => controller.dispose());
}

// ---------------------------------------------------------------------------
// Resource hooks
// ---------------------------------------------------------------------------

const selNetwork = (s: DataState) => s.network;
const selGeo = (s: DataState) => s.geo;
const selBlocks = (s: DataState) => s.blocks;
const selHealth = (s: DataState) => s.health;
const selConnection = (s: DataState) => s.connection;

/** Network snapshot: chain, rewards, nodes, capacity, apps, market, versions. */
export function useNetwork(): Sourced<NetworkSnapshot> {
  return useDataStore(selNetwork);
}

/** Geo snapshot for the world map. */
export function useGeo(): Sourced<GeoSnapshot> {
  return useDataStore(selGeo);
}

/** Recent block intervals for the cadence sparkline. */
export function useBlocks(): Sourced<BlocksSnapshot> {
  return useDataStore(selBlocks);
}

/** Health of every catalog app. */
export function useAllHealth(): Sourced<AppsHealthSnapshot> {
  return useDataStore(selHealth);
}

/** Health of one app by catalog id; null means not checked yet. */
export function useAppHealth(id: string): AppHealth | null {
  return useDataStore((s) => s.health.data?.apps.find((a) => a.id === id) ?? null);
}

/** State of the live connection. */
export function useConnection(): Connection {
  return useDataStore(selConnection);
}

// ---------------------------------------------------------------------------
// Additional hooks (additive)
// ---------------------------------------------------------------------------

/**
 * Read one derived value from the network snapshot without subscribing to its age. Re-renders only
 * when the selected value changes. `select` must return a primitive or a stable reference, and
 * `null` is returned until a snapshot exists (fallback counts, so check `useFreshness`).
 */
export function useNetworkSelect<T>(select: (network: NetworkSnapshot) => T): T | null {
  return useDataStore((s) => (s.network.data ? select(s.network.data) : null));
}

/** Freshness of one resource, with no per-second `ageMs` churn. */
export function useFreshness(resource: ResourceKey): Freshness {
  return useDataStore((s) => s[resource].freshness);
}

/** The tip height; changes once per block. */
export function useChainHeight(): number | null {
  return useDataStore((s) => s.chain.height);
}

/**
 * Freshness of one section of the network snapshot (`market` is minutes old, `capacity` is a
 * five-minute figure, `apps` is slower still), so a tile can label its own number honestly.
 *
 * Returns the freshness and the ISO time the section was last refreshed upstream. It re-renders
 * only when one of those two changes (a threshold crossing or a new refresh), not every second.
 * Use `useSectionAge` when the age itself is displayed.
 */
export function useSectionFreshness(section: SectionKey): { freshness: Freshness; asOf: string | null } {
  const freshness = useDataStore((s) => sectionStatus(s.network, section, s.connection).freshness);
  const asOf = useDataStore((s) => sectionStatus(s.network, section, s.connection).asOf);
  return useMemo(() => ({ freshness, asOf }), [freshness, asOf]);
}

/** Age in milliseconds of one network section, updated on the shared one-second ticker. */
export function useSectionAge(section: SectionKey): number | null {
  return useDataStore((s) => sectionStatus(s.network, section, s.connection).ageMs);
}

/** Transport diagnostics for a debug overlay. */
export function useDataLayerDebug(): DataLayerDebug {
  return useDataStore((s) => s.debug);
}

// ---------------------------------------------------------------------------
// Time-derived hooks (one shared ticker, snapshots cached per tick)
// ---------------------------------------------------------------------------

const SERVER_CLOCK: ChainClockView = {
  height: null,
  secondsSinceBlock: null,
  secondsToNext: null,
  progress: 0,
  live: false,
};

let clockKey: { chain: unknown; tick: number } | null = null;
let clockView: ChainClockView = SERVER_CLOCK;

function computeClockView(): ChainClockView {
  const state = useDataStore.getState();
  const tick = getSharedTicker().tickCount();
  if (clockKey && clockKey.chain === state.chain && clockKey.tick === tick) return clockView;
  clockKey = { chain: state.chain, tick };

  const { height, lastBlockAt, intervalMs, live } = state.chain;
  let next: ChainClockView;
  if (height === null) {
    next = SERVER_CLOCK;
  } else if (!live || lastBlockAt === null) {
    next = { height, secondsSinceBlock: null, secondsToNext: null, progress: 0, live: false };
  } else {
    const p = chainProgress(Date.now(), lastBlockAt, intervalMs);
    next = {
      height,
      secondsSinceBlock: Math.floor(p.sinceMs / 1000),
      secondsToNext: Math.ceil(p.toNextMs / 1000),
      progress: p.progress,
      live: true,
    };
  }
  const prev = clockView;
  if (
    prev.height === next.height &&
    prev.secondsSinceBlock === next.secondsSinceBlock &&
    prev.secondsToNext === next.secondsToNext &&
    prev.progress === next.progress &&
    prev.live === next.live
  ) {
    return prev;
  }
  clockView = next;
  return next;
}

function subscribeClock(onChange: () => void): () => void {
  const offTick = getSharedTicker().subscribe(onChange);
  const offStore = useDataStore.subscribe((s, p) => {
    if (s.chain !== p.chain) onChange();
  });
  return () => {
    offTick();
    offStore();
  };
}

/** The chain clock, ticking once a second: height, time since block, time to next, progress. */
export function useChainClock(): ChainClockView {
  return useSyncExternalStore(subscribeClock, computeClockView, () => SERVER_CLOCK);
}

let reductionKey: { next: unknown; chain: unknown; tick: number } | null = null;
let reductionView: ReductionCountdown | null = null;

function computeReductionView(): ReductionCountdown | null {
  const state = useDataStore.getState();
  const next = state.network.data?.rewards.nextReduction ?? null;
  const tick = getSharedTicker().tickCount();
  if (
    reductionKey &&
    reductionKey.next === next &&
    reductionKey.chain === state.chain &&
    reductionKey.tick === tick
  ) {
    return reductionView;
  }
  reductionKey = { next, chain: state.chain, tick };

  let value: ReductionCountdown | null = null;
  const net = state.network.data;
  if (net && next) {
    const anchored = state.chain.live && state.chain.height !== null && state.chain.lastBlockAt !== null;
    value = computeReductionCountdown({
      next,
      height: anchored ? state.chain.height : null,
      lastBlockAt: anchored ? state.chain.lastBlockAt : null,
      targetBlockSec: net.chain.targetBlockSec,
      measuredBlockSec: net.chain.measuredBlockSec,
      nowMs: Date.now(),
    });
  }
  const prev = reductionView;
  if (
    prev &&
    value &&
    prev.height === value.height &&
    prev.blocksAway === value.blocksAway &&
    prev.etaMs === value.etaMs &&
    prev.live === value.live &&
    prev.parts.days === value.parts.days &&
    prev.parts.hours === value.parts.hours &&
    prev.parts.minutes === value.parts.minutes &&
    prev.parts.seconds === value.parts.seconds
  ) {
    return prev;
  }
  reductionView = value;
  return value;
}

function subscribeReduction(onChange: () => void): () => void {
  const offTick = getSharedTicker().subscribe(onChange);
  const offStore = useDataStore.subscribe((s, p) => {
    if (s.chain !== p.chain || s.network !== p.network) onChange();
  });
  return () => {
    offTick();
    offStore();
  };
}

/** Countdown to the next reward reduction, or null when unknown. */
export function useReductionCountdown(): ReductionCountdown | null {
  return useSyncExternalStore(subscribeReduction, computeReductionView, () => null);
}
