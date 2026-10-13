/**
 * Chain timing helpers shared by `server/` (the reduction ETA in the API) and `web/` (the live
 * countdown and the chain clock), so both sides always quote the same block interval.
 *
 * ERASABLE TYPESCRIPT ONLY (see shared/api.ts). No enums, no runtime imports.
 */

/** The Proof of Node target block interval, used when a caller supplies no usable target. */
export const DEFAULT_BLOCK_SEC = 30;

/**
 * A measured mean is only trusted within this band around the target. Outside it the sample is more
 * likely a stalled or backfilling buffer than a real change in the chain's pace.
 */
export const MEASURED_MIN_FACTOR = 0.5;
export const MEASURED_MAX_FACTOR = 2;

export interface EffectiveBlockSec {
  /** The interval to use for projections, in seconds. */
  seconds: number;
  /** True when `seconds` is the measured mean, false when it is the protocol target. */
  measured: boolean;
}

/**
 * The block interval to project with. The protocol target is 30 s, but the real chain averages a
 * little over it (slot skips), which adds hours to a projection two weeks out. So the measured mean
 * is preferred, but only while it is finite and within 0.5x to 2x of the target; otherwise the
 * target is used. A non-positive or non-finite target falls back to 30 s.
 */
export function effectiveBlockSec(
  targetSec: number,
  measuredSec: number | null | undefined,
): EffectiveBlockSec {
  const target = Number.isFinite(targetSec) && targetSec > 0 ? targetSec : DEFAULT_BLOCK_SEC;
  if (
    measuredSec !== null &&
    measuredSec !== undefined &&
    Number.isFinite(measuredSec) &&
    measuredSec >= target * MEASURED_MIN_FACTOR &&
    measuredSec <= target * MEASURED_MAX_FACTOR
  ) {
    return { seconds: measuredSec, measured: true };
  }
  return { seconds: target, measured: false };
}
