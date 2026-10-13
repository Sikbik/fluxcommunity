import type { AppHealth, Meta } from '@shared/api';

/** How trustworthy a number is right now. Drives the freshness chip in the UI. */
export type Freshness = 'live' | 'cached' | 'offline' | 'unknown';

/** State of the live connection to the API server. */
export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

/** A payload plus how fresh it is. `data` is null only before the first response or fallback. */
export interface Sourced<T> {
  data: T | null;
  meta: Meta | null;
  freshness: Freshness;
  /** Milliseconds since the data was fetched upstream, updated about once a second. */
  ageMs: number | null;
}

export interface ChainClockView {
  height: number | null;
  /** Seconds since the tip block, null when unknown. */
  secondsSinceBlock: number | null;
  /** Seconds until the next expected block (never negative; holds at 0 while overdue). */
  secondsToNext: number | null;
  /** 0..1 progress through the current block interval. */
  progress: number;
  /** True only when height and timing come from the live API. */
  live: boolean;
}

export interface ReductionCountdown {
  /** Block height at which the subsidy steps down. */
  height: number;
  blocksAway: number;
  /** Estimated epoch ms of the reduction. */
  etaMs: number;
  /** Remaining time split for display; updates every second. */
  parts: { days: number; hours: number; minutes: number; seconds: number };
  /** Fractional cut, 0.1 = ten percent. */
  fraction: number;
  perBlockAfter: number;
  /**
   * True when the countdown is anchored to the live chain clock. False when it is projected from a
   * baked or last-known snapshot and should be labelled as an estimate.
   */
  live?: boolean;
}

export type { AppHealth };

// ---------------------------------------------------------------------------
// Additions by the data layer (additive; the names above are a stable contract)
// ---------------------------------------------------------------------------

/** The four resources the data layer keeps. */
export type ResourceKey = 'network' | 'geo' | 'blocks' | 'health';

/** Where the numbers in the store ultimately came from. */
export type RecordOrigin = 'rest' | 'sse' | 'fallback' | 'demo';

/** Transport diagnostics, for a debug overlay. Not needed for ordinary rendering. */
export interface DataLayerDebug {
  running: boolean;
  demo: boolean;
  hidden: boolean;
  /** `sse` while the stream is open, `polling` while REST polling carries the load. */
  transport: 'none' | 'sse' | 'polling' | 'demo';
  sse: 'idle' | 'connecting' | 'open' | 'backoff';
  sseFailures: number;
  restFailStreak: number;
}
