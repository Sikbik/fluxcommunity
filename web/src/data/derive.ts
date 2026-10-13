/**
 * Pure derivation and formatting helpers for the sections. No React, no store, no clock reads
 * (every time-dependent helper takes `nowMs`), so each one is trivially testable.
 */
import type {
  BlockSummary,
  BlocksSnapshot,
  NetworkSnapshot,
  NextReduction,
  Tier,
  TierCounts,
} from '@shared/api';
import { TIERS } from '@shared/api';
import { effectiveBlockSec } from '@shared/chain';
import type { ReductionCountdown } from './types';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Largest-remainder apportionment: integers that sum exactly to `total`, proportional to `weights`. */
export function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (Math.max(0, w) / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) {
    const item = order[k];
    if (item) out[item.i] = (out[item.i] ?? 0) + 1;
  }
  return out;
}

const COMPACT_UNITS = ['', 'K', 'M', 'B', 'T'] as const;

/**
 * Compact number with three significant digits: 999 -> "999", 7100 -> "7.1K", 3031112 -> "3.03M",
 * 12500 -> "12.5K", 125000 -> "125K". Non-finite input gives "--".
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '--';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000 && Math.round(abs) < 1000) return `${sign}${Math.round(abs)}`;
  let idx = Math.max(1, Math.min(COMPACT_UNITS.length - 1, Math.floor(Math.log10(abs) / 3)));
  const render = (i: number): number => {
    const v = abs / 1000 ** i;
    const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
    return Number(v.toFixed(digits));
  };
  let rounded = render(idx);
  if (rounded >= 1000 && idx < COMPACT_UNITS.length - 1) {
    idx += 1;
    rounded = render(idx);
  }
  return `${sign}${rounded}${COMPACT_UNITS[idx]}`;
}

const fullFormatters = new Map<string, Intl.NumberFormat>();

/** Grouped full number for tabular display: 3031112 -> "3,031,112". */
export function formatFull(n: number, maximumFractionDigits = 0, locale = 'en-US'): string {
  if (!Number.isFinite(n)) return '--';
  const key = `${locale}:${maximumFractionDigits}`;
  let f = fullFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits, minimumFractionDigits: 0 });
    fullFormatters.set(key, f);
  }
  return f.format(n);
}

/** USD price with precision that suits small prices: 0.086 -> "$0.086", 1.5 -> "$1.50". */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '--';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

/** Signed percentage with one decimal: 2.44 -> "+2.4%", -0.04 -> "0.0%". */
export function formatSignedPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '--';
  const fixed = n.toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${n > 0 ? '+' : ''}${fixed}%`;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

function toMs(when: number | string | Date | null | undefined): number | null {
  if (when == null) return null;
  const ms = when instanceof Date ? when.getTime() : typeof when === 'string' ? Date.parse(when) : when;
  return Number.isFinite(ms) ? ms : null;
}

/** "just now", "12 s ago", "3 min ago", "2 h ago", "5 d ago". Null or invalid gives "unknown". */
export function timeAgo(when: number | string | Date | null | undefined, nowMs: number): string {
  const ms = toMs(when);
  if (ms === null) return 'unknown';
  const secs = Math.floor((nowMs - ms) / 1000);
  if (secs < 5) return 'just now';
  return `${formatDuration(secs)} ago`;
}

/** Whole seconds as a short span: "12 s", "3 min", "2 h", "5 d". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86_400)} d`;
}

/** Chip text for a data age in milliseconds: "3 s", "2 min". */
export function formatAge(ageMs: number | null): string {
  return ageMs === null ? '' : formatDuration(ageMs / 1000);
}

export interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Split a remaining span in milliseconds for the countdown display. Clamped at zero. */
export function reductionParts(remainingMs: number): TimeParts {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

/** Each tier's share of the total as a 0..1 fraction. All zero when there are no nodes. */
export function tierShares(tiers: TierCounts): TierCounts {
  const total = tiers.cumulus + tiers.nimbus + tiers.stratus;
  if (total <= 0) return { cumulus: 0, nimbus: 0, stratus: 0 };
  return { cumulus: tiers.cumulus / total, nimbus: tiers.nimbus / total, stratus: tiers.stratus / total };
}

/** Tier shares as percentages that add to exactly 100 (largest remainder). */
export function tierSharePercents(tiers: TierCounts, decimals: 0 | 1 = 0): TierCounts {
  const scale = decimals === 1 ? 1000 : 100;
  const [c = 0, n = 0, s = 0] = apportion([tiers.cumulus, tiers.nimbus, tiers.stratus], scale);
  const d = scale / 100;
  return { cumulus: c / d, nimbus: n / d, stratus: s / d };
}

/** Collateral in FLUX needed for a tier, or null when the network snapshot is not available. */
export function collateralFor(net: NetworkSnapshot | null | undefined, tier: Tier): number | null {
  return net ? net.nodes.collateral[tier] : null;
}

/** FLUX paid per block to the one node of a tier. */
export function perBlockFor(net: NetworkSnapshot | null | undefined, tier: Tier): number | null {
  return net ? net.rewards.perTier[tier] : null;
}

/** Node count for a tier. */
export function nodesFor(net: NetworkSnapshot | null | undefined, tier: Tier): number | null {
  return net ? net.nodes.tiers[tier] : null;
}

/**
 * How often one given node is paid, on average, in hours: one node of each tier is paid per block,
 * so a tier with N nodes cycles every N blocks. Null when the inputs are not usable.
 */
export function paidEveryHours(tierNodes: number, blockSec: number): number | null {
  if (!Number.isFinite(tierNodes) || !Number.isFinite(blockSec) || tierNodes <= 0 || blockSec <= 0)
    return null;
  return (tierNodes * blockSec) / 3600;
}

/** "about 30 hours", "about 45 minutes", "about 3 days". Null when unknown. */
export function paidEveryLabel(tierNodes: number, blockSec: number): string | null {
  const h = paidEveryHours(tierNodes, blockSec);
  if (h === null) return null;
  if (h < 1) return `about ${Math.max(1, Math.round(h * 60))} minutes`;
  if (h < 48) {
    const r = Math.round(h);
    return `about ${r} ${r === 1 ? 'hour' : 'hours'}`;
  }
  return `about ${Math.round(h / 24)} days`;
}

export const TIER_LIST: readonly Tier[] = TIERS;

// ---------------------------------------------------------------------------
// Chain clock and reduction
// ---------------------------------------------------------------------------

export interface ChainProgress {
  sinceMs: number;
  toNextMs: number;
  /** 0..1, holds at 1 while the block is overdue. */
  progress: number;
}

export function chainProgress(nowMs: number, lastBlockAt: number, intervalMs: number): ChainProgress {
  const sinceMs = Math.max(0, nowMs - lastBlockAt);
  const interval = intervalMs > 0 ? intervalMs : 30_000;
  return {
    sinceMs,
    toNextMs: Math.max(0, interval - sinceMs),
    progress: Math.min(1, sinceMs / interval),
  };
}

export interface ReductionInput {
  next: NextReduction;
  /** Current tip height, when the chain clock is live. */
  height: number | null;
  /** Client-clock epoch ms of the tip block, when the chain clock is live. */
  lastBlockAt: number | null;
  targetBlockSec: number;
  /**
   * Measured mean block interval. Real chains run a little over the 30 s target, which adds hours
   * over a two week horizon, so the measured value is preferred when it is known.
   */
  measuredBlockSec?: number | null;
  nowMs: number;
}

/**
 * Countdown to the next reduction. With a live chain clock it is anchored to the current tip
 * (remaining blocks times the target block time). Without one it is projected from the snapshot's
 * own ETA and marked `live: false`. Returns null when that projection is already in the past,
 * because then the schedule is unknown rather than "zero seconds".
 */
export function computeReductionCountdown(input: ReductionInput): ReductionCountdown | null {
  const { next, height, lastBlockAt, targetBlockSec, nowMs } = input;
  const blockSec = effectiveBlockSec(targetBlockSec, input.measuredBlockSec).seconds;
  const anchored = height !== null && lastBlockAt !== null;
  let etaMs: number;
  let blocksAway: number;
  if (anchored) {
    blocksAway = Math.max(0, next.height - height);
    etaMs = lastBlockAt + blocksAway * blockSec * 1000;
  } else {
    blocksAway = next.blocksAway;
    etaMs = Date.parse(next.etaIso);
    if (!Number.isFinite(etaMs) || etaMs <= nowMs) return null;
  }
  return {
    height: next.height,
    blocksAway,
    etaMs,
    parts: reductionParts(etaMs - nowMs),
    fraction: next.fraction,
    perBlockAfter: next.perBlockAfter,
    live: anchored,
  };
}

// ---------------------------------------------------------------------------
// Block interval statistics
// ---------------------------------------------------------------------------

export interface BlockIntervalStats {
  /** Intervals in seconds, oldest first, at most `limit` of them. */
  intervals: number[];
  count: number;
  meanSec: number | null;
  medianSec: number | null;
  minSec: number | null;
  maxSec: number | null;
  stdDevSec: number | null;
  /** Share (0..1) of intervals within 20 percent of the target. */
  onTargetShare: number | null;
  /** A y-axis ceiling that keeps the target line comfortably inside the chart. */
  domainMaxSec: number;
}

export function blockIntervalStats(
  source: BlocksSnapshot | readonly BlockSummary[] | null | undefined,
  limit = 60,
  targetSec = 30,
): BlockIntervalStats {
  const blocks: readonly BlockSummary[] = !source ? [] : 'blocks' in source ? source.blocks : source;
  const all: number[] = [];
  blocks.forEach((b, i) => {
    let v: number | null = b.intervalSec;
    if (v === null) {
      const prev = blocks[i - 1];
      if (prev && prev.height === b.height - 1) {
        const dt = (Date.parse(b.time) - Date.parse(prev.time)) / 1000;
        v = Number.isFinite(dt) && dt >= 0 ? dt : null;
      }
    }
    if (v !== null && Number.isFinite(v) && v >= 0) all.push(v);
  });
  const intervals = all.slice(-Math.max(0, limit));
  const count = intervals.length;
  if (count === 0) {
    return {
      intervals,
      count,
      meanSec: null,
      medianSec: null,
      minSec: null,
      maxSec: null,
      stdDevSec: null,
      onTargetShare: null,
      domainMaxSec: targetSec * 2,
    };
  }
  const sum = intervals.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const sorted = [...intervals].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median =
    count % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / count;
  const max = sorted[count - 1] as number;
  const onTarget = intervals.filter((v) => Math.abs(v - targetSec) <= targetSec * 0.2).length;
  return {
    intervals,
    count,
    meanSec: mean,
    medianSec: median,
    minSec: sorted[0] as number,
    maxSec: max,
    stdDevSec: Math.sqrt(variance),
    onTargetShare: onTarget / count,
    domainMaxSec: Math.max(targetSec * 2, Math.ceil(max / 10) * 10),
  };
}

/** Map values to x/y points inside a box, y growing downward, for a sparkline path. */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  maxValue: number,
): Array<[x: number, y: number]> {
  if (values.length === 0 || maxValue <= 0) return [];
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => [i * step, height - (Math.min(v, maxValue) / maxValue) * height]);
}
