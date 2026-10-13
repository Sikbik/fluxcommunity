/**
 * What an app's health looks like on the page. Pure and framework-free.
 *
 * Honesty rules (DESIGN 8):
 *   - while no health payload has arrived the pill is a skeleton, never "Live";
 *   - fixtures and an unreachable API read as "Not checked yet", whatever the payload says;
 *   - a result older than its window keeps its state but is labelled with its age ("Up, 6 min ago");
 *   - the site itself is never probed and is shown as "You are here".
 */
import type { AppHealth, HealthState } from '@shared/api';
import type { Freshness } from '@/data/types';
import { formatAge } from '@/lib/format';

export type HealthKind = 'loading' | 'up' | 'degraded' | 'down' | 'unknown' | 'self';

export interface HealthView {
  kind: HealthKind;
  /** True only for a result that is inside its freshness window. */
  fresh: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  /** ISO time of the last probe. */
  checkedAt: string | null;
  /** ISO time since which the state has held, as observed by the probe. */
  since: string | null;
}

export interface HealthContext {
  /** A health payload (live, cached or baked) exists. */
  loaded: boolean;
  freshness: Freshness;
}

export const NO_HEALTH: HealthView = {
  kind: 'unknown',
  fresh: false,
  httpStatus: null,
  latencyMs: null,
  checkedAt: null,
  since: null,
};

/** Maps a probe result and the freshness of the payload to what the page may claim. */
export function describeHealth(
  health: AppHealth | null | undefined,
  ctx: HealthContext,
  self = false,
): HealthView {
  if (self) return { ...NO_HEALTH, kind: 'self' };
  if (!ctx.loaded) return { ...NO_HEALTH, kind: 'loading' };
  if (ctx.freshness === 'offline' || ctx.freshness === 'unknown' || !health) return NO_HEALTH;
  const state: HealthState = health.state;
  if (state === 'unknown') return NO_HEALTH;
  return {
    kind: state,
    fresh: ctx.freshness === 'live',
    httpStatus: health.httpStatus,
    latencyMs: health.latencyMs,
    checkedAt: health.checkedAt,
    since: health.since,
  };
}

/** 142 -> "142 ms", 2600 -> "2.6 s". Null for unknown. */
export function formatLatency(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export type PillTone = 'ok' | 'warn' | 'crit' | 'off' | 'pending';

export interface PillCopy {
  /** The word: "Live", "Degraded", "Offline right now", "Not checked yet", "You are here". */
  word: string;
  /** The small mono detail after the word: "142 ms", "6 min ago". */
  detail: string | null;
  tone: PillTone;
  /** A glyph name from the status set (a shape, so colour is never the only signal). */
  glyph: 'status-live' | 'status-ok' | 'status-warn' | 'status-crit' | 'status-off' | 'status-pending';
  /** The sentence a screen reader gets. */
  sr: string;
}

/** The words for a health view. `now` is epoch ms, for the age of a cached result. */
export function pillCopy(view: HealthView, now: number): PillCopy {
  const checked = view.checkedAt ? Date.parse(view.checkedAt) : Number.NaN;
  const age = Number.isFinite(checked) ? formatAge(Math.max(0, now - checked)) : '';
  const ago = age && age !== 'now' ? `${age} ago` : null;
  const latency = formatLatency(view.latencyMs);

  switch (view.kind) {
    case 'self':
      return {
        word: 'You are here',
        detail: null,
        tone: 'pending',
        glyph: 'status-pending',
        sr: 'You are here',
      };
    case 'loading':
      return {
        word: 'Checking',
        detail: null,
        tone: 'pending',
        glyph: 'status-pending',
        sr: 'Checking status',
      };
    case 'up':
      if (view.fresh) {
        return {
          word: 'Live',
          detail: latency,
          tone: 'ok',
          glyph: 'status-live',
          sr: latency ? `Live, ${latency} response` : 'Live',
        };
      }
      return {
        word: 'Up',
        detail: ago,
        tone: 'warn',
        glyph: 'status-pending',
        sr: ago ? `Up, last checked ${ago}` : 'Up, last check is old',
      };
    case 'degraded':
      return {
        word: 'Degraded',
        detail: view.fresh ? latency : ago,
        tone: 'warn',
        glyph: 'status-warn',
        sr: view.fresh
          ? 'Degraded: slow or answering with an error'
          : `Degraded, last checked ${ago ?? 'a while'} ago`,
      };
    case 'down':
      return {
        word: view.fresh ? 'Offline right now' : 'Offline',
        detail: view.fresh ? null : ago,
        tone: 'crit',
        glyph: 'status-crit',
        sr: view.fresh ? 'Offline right now' : `Offline, last checked ${ago ?? 'a while'} ago`,
      };
    default:
      return {
        word: 'Not checked yet',
        detail: null,
        tone: 'off',
        glyph: 'status-off',
        sr: 'Not checked yet',
      };
  }
}

/** The order apps sort in when sorting by status: healthy first, down last. Lower is better. */
export function statusRank(view: HealthView): number {
  switch (view.kind) {
    case 'self':
      return 1;
    case 'up':
      return view.fresh ? 0 : 2;
    case 'degraded':
      return 3;
    case 'unknown':
    case 'loading':
      return 4;
    case 'down':
      return 5;
    default:
      return 4;
  }
}

export interface HealthSummary {
  /** Apps with a probe result inside its window. */
  up: number;
  degraded: number;
  down: number;
  /** Apps nobody has checked (including the site itself). */
  unchecked: number;
  /** Apps with a usable result (up, degraded or down). */
  checked: number;
}

export function summarizeHealth(views: readonly HealthView[]): HealthSummary {
  let up = 0;
  let degraded = 0;
  let down = 0;
  let unchecked = 0;
  for (const v of views) {
    if (v.kind === 'up') up += 1;
    else if (v.kind === 'degraded') degraded += 1;
    else if (v.kind === 'down') down += 1;
    else unchecked += 1;
  }
  return { up, degraded, down, unchecked, checked: up + degraded + down };
}
