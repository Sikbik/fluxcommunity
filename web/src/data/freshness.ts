/**
 * How trustworthy a number is right now. Pure functions over a stored record and a clock reading.
 *
 * Rules (see docs/DESIGN.md section 8):
 * - `unknown`  nothing has arrived and nothing is baked in yet.
 * - `offline`  the baked fallback is shown, or the connection is down and the data is past its window.
 * - `cached`   the server said `stale`/`cache`, or the data is older than its window.
 * - `live`     the server said `live` and the data is younger than its window.
 */
import type { AppsHealthSnapshot, BlocksSnapshot, GeoSnapshot, Meta, NetworkSnapshot } from '@shared/api';
import type { Connection, Freshness, RecordOrigin, ResourceKey, Sourced } from './types';

/** How long a payload counts as fresh, per resource. */
export const FRESH_WINDOW_MS: Readonly<Record<ResourceKey, number>> = {
  network: 45_000,
  geo: 15 * 60_000,
  blocks: 90_000,
  health: 4 * 60_000,
};

export interface Payloads {
  network: NetworkSnapshot;
  geo: GeoSnapshot;
  blocks: BlocksSnapshot;
  health: AppsHealthSnapshot;
}

export interface RawRecord<T> {
  data: T;
  meta: Meta;
  /** Client clock (epoch ms) when this arrived. Age is measured from here, so skew never matters. */
  receivedAt: number;
  origin: RecordOrigin;
}

export const UNKNOWN: Sourced<never> = { data: null, meta: null, freshness: 'unknown', ageMs: null };

/** Age of a record in milliseconds at `now`, or null when there is no record. */
export function recordAgeMs(rec: RawRecord<unknown> | null, now: number): number | null {
  if (!rec) return null;
  if (rec.origin === 'fallback' || rec.meta.source === 'fallback') {
    const asOf = Date.parse(rec.meta.asOf);
    return Number.isFinite(asOf) ? Math.max(0, now - asOf) : null;
  }
  return Math.max(0, rec.meta.ageMs + (now - rec.receivedAt));
}

export function freshnessOf(
  key: ResourceKey,
  rec: RawRecord<unknown> | null,
  now: number,
  connection: Connection,
): Freshness {
  if (!rec) return 'unknown';
  if (rec.origin === 'fallback' || rec.meta.source === 'fallback') return 'offline';
  const age = recordAgeMs(rec, now) ?? Number.POSITIVE_INFINITY;
  const past = rec.meta.stale || age >= FRESH_WINDOW_MS[key];
  if (past) return connection === 'offline' ? 'offline' : 'cached';
  return rec.meta.source === 'live' ? 'live' : 'cached';
}

/**
 * Build the `Sourced` view for a record, reusing `prev` (same object) when nothing visible changed
 * so selectors keep stable references between ticks.
 */
export function sourcedFrom<T>(
  key: ResourceKey,
  rec: RawRecord<T> | null,
  now: number,
  connection: Connection,
  prev: Sourced<T>,
): Sourced<T> {
  if (!rec) return prev.freshness === 'unknown' && prev.data === null ? prev : (UNKNOWN as Sourced<T>);
  const freshness = freshnessOf(key, rec, now, connection);
  const ageMs = recordAgeMs(rec, now);
  if (
    prev.data === rec.data &&
    prev.meta === rec.meta &&
    prev.freshness === freshness &&
    prev.ageMs === ageMs
  ) {
    return prev;
  }
  return { data: rec.data, meta: rec.meta, freshness, ageMs };
}

// ---------------------------------------------------------------------------
// Per-section freshness (NetworkSnapshot.freshness)
// ---------------------------------------------------------------------------

export type SectionKey = 'chain' | 'nodes' | 'capacity' | 'apps' | 'market';

/**
 * How long each network section counts as fresh. They refresh on very different schedules (chain
 * and node counts every few seconds, price every minute, capacity every 5 minutes, app counts every
 * 10 to 30 minutes), so one window for the whole snapshot would mislabel the slow ones.
 */
export const SECTION_WINDOW_MS: Readonly<Record<SectionKey, number>> = {
  chain: 45_000,
  nodes: 45_000,
  capacity: 15 * 60_000,
  apps: 45 * 60_000,
  market: 5 * 60_000,
};

export interface SectionStatus {
  freshness: Freshness;
  /** ISO time the section was last refreshed upstream, or the snapshot's own `asOf` as a fallback. */
  asOf: string | null;
  /** Milliseconds since `asOf`, as of the last store tick. */
  ageMs: number | null;
}

const SECTION_UNKNOWN: SectionStatus = { freshness: 'unknown', asOf: null, ageMs: null };

/**
 * Freshness of one section of the network snapshot. Pure function of the network view, so it moves
 * only when the store ticks. The age is `meta.generatedAt - stamp` (both server clock, so skew
 * cancels) plus the time since the snapshot arrived.
 */
export function sectionStatus(
  view: Sourced<NetworkSnapshot>,
  section: SectionKey,
  connection: Connection,
): SectionStatus {
  const { data, meta } = view;
  if (!data || !meta) return SECTION_UNKNOWN;
  if (view.freshness === 'offline' && meta.source === 'fallback') {
    return { freshness: 'offline', asOf: meta.asOf, ageMs: view.ageMs };
  }
  const stamp = data.freshness?.[section];
  if (stamp === undefined) {
    // An older server without per-section stamps: the whole snapshot's freshness is all there is.
    return { freshness: view.freshness, asOf: meta.asOf, ageMs: view.ageMs };
  }
  if (stamp === null) return SECTION_UNKNOWN;
  const stampMs = Date.parse(stamp);
  const generatedMs = Date.parse(meta.generatedAt);
  if (!Number.isFinite(stampMs) || !Number.isFinite(generatedMs) || view.ageMs === null) {
    return { freshness: view.freshness, asOf: stamp, ageMs: null };
  }
  const sinceArrival = view.ageMs - meta.ageMs;
  const ageMs = Math.max(0, generatedMs - stampMs + sinceArrival);
  const past = ageMs >= SECTION_WINDOW_MS[section];
  const freshness: Freshness = past ? (connection === 'offline' ? 'offline' : 'cached') : 'live';
  return { freshness, asOf: stamp, ageMs };
}
