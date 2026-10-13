/**
 * Reward reduction maths and labels: how far through the current reward epoch the chain is, how big
 * the cut is, and how to say it. Framework-free; the countdown itself comes from the data layer.
 */
import type { NextReduction } from '@shared/api';

export interface EpochProgress {
  /** 0..1 of the epoch's blocks that have elapsed. */
  fraction: number;
  elapsedBlocks: number;
  epochBlocks: number;
  /** First block of the epoch (Proof of Node activation for the first one). */
  startHeight: number;
  /** The block at which the reduction lands. */
  endHeight: number;
}

/**
 * How far through the current epoch the chain is, from the server's `epochStartHeight` and
 * `epochBlocks` and the blocks still to go. Null when either field is absent or they disagree with the
 * reduction height: the bar is hidden rather than guessed.
 */
export function epochProgress(next: NextReduction | null, blocksAway: number | null): EpochProgress | null {
  if (!next || blocksAway === null || !Number.isFinite(blocksAway)) return null;
  const { epochStartHeight, epochBlocks } = next;
  if (epochStartHeight === undefined || epochBlocks === undefined) return null;
  if (!Number.isFinite(epochStartHeight) || !Number.isFinite(epochBlocks) || epochBlocks <= 0) return null;
  if (epochStartHeight + epochBlocks !== next.height) return null;
  const elapsed = Math.min(epochBlocks, Math.max(0, epochBlocks - Math.max(0, blocksAway)));
  return {
    fraction: elapsed / epochBlocks,
    elapsedBlocks: elapsed,
    epochBlocks,
    startHeight: epochStartHeight,
    endHeight: next.height,
  };
}

/** A fractional cut as a percentage: 0.1 gives "10%", 0.125 gives "12.5%". Null when not a fraction. */
export function formatCut(fraction: number | null | undefined): string | null {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction) || fraction <= 0) return null;
  return `${Number((fraction * 100).toFixed(2))}%`;
}

/** "Reduction 1 of 20". Without the schedule length: "Reduction 1". Null when the index is unknown. */
export function reductionOrdinal(index: number | undefined, of: number | undefined): string | null {
  if (index === undefined || !Number.isFinite(index)) return null;
  return of !== undefined && Number.isFinite(of) ? `Reduction ${index} of ${of}` : `Reduction ${index}`;
}

/**
 * The estimated date in the visitor's locale and time zone, for example "Mon, Oct 26, 2026, 3:28 PM
 * UTC". Falls back to ISO if the runtime cannot format it.
 */
export function formatEta(ms: number, locale?: string): string {
  if (!Number.isFinite(ms)) return '--';
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

/** The countdown units a segmented clock shows, with the labels that sit under them. */
export const COUNTDOWN_UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;
export type CountdownUnit = (typeof COUNTDOWN_UNITS)[number];
