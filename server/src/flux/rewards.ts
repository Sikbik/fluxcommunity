import type { NextReduction, RewardSchedule } from '../../../shared/api.ts';
import { effectiveBlockSec } from '../../../shared/chain.ts';

/**
 * The Flux reward schedule under Proof of Node, mirrored from fluxd (RunOnFlux/fluxd, master, read
 * 2026-10-12) and cross-checked against the live daemon:
 *
 *   src/chainparams.cpp  mainnet: UPGRADE_PON nActivationHeight = 2020000, nPONInitialSubsidy = 14,
 *                        nPONSubsidyReductionInterval = 1051200 (365 * 24 * 60 * 2 blocks), nPONMaxReductions
 *                        = 20, nPonTargetSpacing = 30.
 *   src/main.cpp         GetBlockSubsidy(): after PON activation, subsidy starts at 14 FLUX and is multiplied
 *                        by 9/10 (integer arithmetic in zatoshi) once per full interval elapsed since the
 *                        activation height, at most 20 times.
 *                        GetFluxnodeSubsidy(): Cumulus, Nimbus and Stratus each get 1.0, 3.5 and 9.0 of the
 *                        initial 14 FLUX, scaled by (current subsidy / 14). The development fund output is
 *                        what remains (GetMinDevFundAmount = subsidy - three tiers).
 *
 * So the FIRST reduction is at 2020000 + 1051200 = 3071200 (not "one year after genesis"), the cut is
 * exactly 10 percent, and the split keeps the 1 : 3.5 : 9 : 0.5 ratio. Live check: getblocksubsidy returns
 * {"miner":14} at 3071199, {"miner":12.6} at 3071200 and {"miner":11.34} at 4122400.
 */

export const COIN = 100_000_000n;
export const PON_ACTIVATION_HEIGHT = 2_020_000;
export const REDUCTION_INTERVAL = 1_051_200;
export const MAX_REDUCTIONS = 20;
export const INITIAL_SUBSIDY_FLUX = 14;
export const TARGET_BLOCK_SEC = 30;
/** Base per-tier amounts at the initial 14 FLUX subsidy (FLUX). */
export const TIER_BASE = { cumulus: 1, nimbus: 3.5, stratus: 9 } as const;
/**
 * Collateral per tier, FLUX. fluxd src/fluxnode/fluxnode.h V2_FLUXNODE_COLLAT_{CUMULUS,NIMBUS,STRATUS}
 * (1000, 12500, 40000), confirmed by the `amount` field of every row of the live node list.
 */
export const COLLATERAL = { cumulus: 1_000, nimbus: 12_500, stratus: 40_000 } as const;

export function reductionsDone(height: number): number {
  if (height < PON_ACTIVATION_HEIGHT) return 0;
  return Math.min(MAX_REDUCTIONS, Math.floor((height - PON_ACTIVATION_HEIGHT) / REDUCTION_INTERVAL));
}

/** Block subsidy at `height` in zatoshi (1e-8 FLUX), exactly as fluxd computes it. */
export function subsidyZat(height: number): bigint {
  let s = BigInt(INITIAL_SUBSIDY_FLUX) * COIN;
  for (let i = 0; i < reductionsDone(height); i++) s = (s * 9n) / 10n;
  return s;
}

const flux = (zat: bigint): number => Number(zat) / 1e8;

/** Per-tier payout at `height` in zatoshi: subsidy * base / 14, integer division like fluxd. */
export function tierZat(height: number): { cumulus: bigint; nimbus: bigint; stratus: bigint; dev: bigint } {
  const sub = subsidyZat(height);
  const initial = BigInt(INITIAL_SUBSIDY_FLUX) * COIN;
  const part = (baseTenths: bigint) => (sub * ((baseTenths * COIN) / 10n)) / initial;
  const cumulus = part(10n);
  const nimbus = part(35n);
  const stratus = part(90n);
  return { cumulus, nimbus, stratus, dev: sub - cumulus - nimbus - stratus };
}

/** Height of the next subsidy step after `height`, or null once all 20 reductions have happened. */
export function nextReductionHeight(height: number): number | null {
  const done = reductionsDone(height);
  if (done >= MAX_REDUCTIONS) return null;
  return PON_ACTIVATION_HEIGHT + (done + 1) * REDUCTION_INTERVAL;
}

export interface RewardInputs {
  height: number;
  /** ISO time of the tip block, the anchor for the ETA. */
  tipTimeMs: number;
  targetBlockSec?: number;
  /**
   * Measured mean block interval (BlockWatcher.measuredBlockSec). The ETA uses it when it is within
   * 0.5x to 2x of the target (see `effectiveBlockSec`), and the target otherwise, including while null.
   */
  measuredBlockSec?: number | null;
  /** `getblocksubsidy` `miner` (FLUX) at the tip, when verified live. Wins over the formula if different. */
  liveSubsidy?: number | null;
  /** `getblocksubsidy` `miner` (FLUX) at the next reduction height, when verified live. */
  liveSubsidyAfter?: number | null;
}

export function computeRewards(input: RewardInputs): { rewards: RewardSchedule; mismatch: string | null } {
  const blockSec = effectiveBlockSec(
    input.targetBlockSec ?? TARGET_BLOCK_SEC,
    input.measuredBlockSec,
  ).seconds;
  const t = tierZat(input.height);
  const formula = flux(subsidyZat(input.height));
  let perBlock = formula;
  let scale = 1;
  let mismatch: string | null = null;
  if (input.liveSubsidy != null && Math.abs(input.liveSubsidy - formula) > 1e-9) {
    mismatch = `getblocksubsidy ${input.liveSubsidy} differs from the schedule formula ${formula}`;
    perBlock = input.liveSubsidy;
    scale = input.liveSubsidy / formula;
  }
  const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
  const perTier = {
    cumulus: round8(flux(t.cumulus) * scale),
    nimbus: round8(flux(t.nimbus) * scale),
    stratus: round8(flux(t.stratus) * scale),
  };
  const devFund = round8(perBlock - perTier.cumulus - perTier.nimbus - perTier.stratus);

  let nextReduction: NextReduction | null = null;
  const nh = nextReductionHeight(input.height);
  if (nh !== null) {
    const blocksAway = nh - input.height;
    let after = flux(subsidyZat(nh)) * scale;
    if (input.liveSubsidyAfter != null && Math.abs(input.liveSubsidyAfter - after) > 1e-9) {
      mismatch ??= `getblocksubsidy ${input.liveSubsidyAfter} at ${nh} differs from the formula ${after}`;
      after = input.liveSubsidyAfter;
    }
    nextReduction = {
      height: nh,
      blocksAway,
      etaIso: new Date(input.tipTimeMs + blocksAway * blockSec * 1000).toISOString(),
      fraction: 0.1,
      perBlockAfter: round8(after),
      epochStartHeight: nh - REDUCTION_INTERVAL,
      epochBlocks: REDUCTION_INTERVAL,
      index: reductionsDone(input.height) + 1,
      of: MAX_REDUCTIONS,
    };
  }
  return { rewards: { perBlock: round8(perBlock), perTier, devFund, nextReduction }, mismatch };
}
