/**
 * Pure payout maths and tier formatting for the node tier explainer. No React, no clock.
 *
 * The one fact everything here rests on: one node of each tier is paid in every block, so a tier
 * with N nodes comes back around about every N blocks. `paidEveryHours` (data/derive) is the single
 * source of that maths; this module only chooses the block time, picks a readable unit and shapes
 * the three tiers into rows the readout can print without further thought.
 */
import type { ChainInfo, NetworkSnapshot, Tier } from '@shared/api';
import { TIERS } from '@shared/api';
import { type EffectiveBlockSec, effectiveBlockSec } from '@shared/chain';
import { type Freshness, paidEveryHours, tierSharePercents } from '@/data';

export const TIER_NAME: Record<Tier, string> = {
  cumulus: 'Cumulus',
  nimbus: 'Nimbus',
  stratus: 'Stratus',
};

/** One dot on an orbit stands for about this many nodes. The diagram says so out loud. */
export const NODES_PER_DOT = 150;

// ---------------------------------------------------------------------------
// Block time
// ---------------------------------------------------------------------------

/** `seconds` to quote, and whether it is the measured interval (true) or the protocol target (false). */
export type BlockTime = EffectiveBlockSec;

/**
 * The block time to quote. The rule (measured mean when it is plausible, otherwise the protocol
 * target) lives in one place, `effectiveBlockSec` in shared/chain.ts, so the server, the data layer
 * and this explainer can never disagree about it.
 */
export function blockTime(chain: Pick<ChainInfo, 'targetBlockSec' | 'measuredBlockSec'>): BlockTime {
  return effectiveBlockSec(chain.targetBlockSec, chain.measuredBlockSec);
}

/** "30" for 30, "30.3" for 30.25: one decimal, no trailing zero. */
export function formatBlockSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const one = Math.round(seconds * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}

// ---------------------------------------------------------------------------
// "Paid about every N hours"
// ---------------------------------------------------------------------------

export type EveryUnit = 'minutes' | 'hours' | 'days';

export interface PaidEvery {
  /** Whole number in `unit`: 30 for "30 hours". */
  value: number;
  unit: EveryUnit;
  /** The same interval in hours, unrounded. */
  hours: number;
  /** The unit as it reads next to `value`: "hours", "hour", "minutes", "days". */
  unitText: string;
  /** "30 hours", "1 hour", "45 minutes", "3 days". */
  text: string;
  /** "about 30 hours": the phrase to put in a sentence. */
  phrase: string;
}

/**
 * How often one node of a tier is paid, in a unit that reads well. The thresholds match
 * `paidEveryLabel` in data/derive (under an hour: minutes; under 48 hours: hours; else days) so the
 * two never disagree. Null when the inputs are unusable.
 */
export function paidEvery(tierNodes: number, blockSec: number): PaidEvery | null {
  const hours = paidEveryHours(tierNodes, blockSec);
  if (hours === null) return null;
  let value: number;
  let unit: EveryUnit;
  if (hours < 1) {
    value = Math.max(1, Math.round(hours * 60));
    unit = 'minutes';
  } else if (hours < 48) {
    value = Math.round(hours);
    unit = 'hours';
  } else {
    value = Math.round(hours / 24);
    unit = 'days';
  }
  const unitText = value === 1 ? unit.slice(0, -1) : unit;
  const text = `${value} ${unitText}`;
  return { value, unit, unitText, hours, text, phrase: `about ${text}` };
}

// ---------------------------------------------------------------------------
// FLUX amounts
// ---------------------------------------------------------------------------

/** FLUX paid per block: 1 -> "1", 3.5 -> "3.5", 3.15 -> "3.15", 8.1 -> "8.1". At most two decimals. */
export function formatFluxAmount(n: number): string {
  if (!Number.isFinite(n)) return '--';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

// ---------------------------------------------------------------------------
// Tier rows
// ---------------------------------------------------------------------------

export interface TierRow {
  tier: Tier;
  name: string;
  nodes: number;
  /** Whole percent of all nodes. The three rows add to exactly 100 (largest remainder). */
  sharePct: number;
  /** FLUX locked per node. */
  collateral: number;
  /** FLUX paid to the one node of this tier that is paid in a block. */
  perBlock: number;
  every: PaidEvery | null;
}

export interface TierModel {
  rows: TierRow[];
  blockTime: BlockTime;
  totalNodes: number;
}

export function buildTierModel(net: Pick<NetworkSnapshot, 'nodes' | 'rewards' | 'chain'>): TierModel {
  const bt = blockTime(net.chain);
  const shares = tierSharePercents(net.nodes.tiers, 0);
  const rows = TIERS.map<TierRow>((tier) => ({
    tier,
    name: TIER_NAME[tier],
    nodes: net.nodes.tiers[tier],
    sharePct: shares[tier],
    collateral: net.nodes.collateral[tier],
    perBlock: net.rewards.perTier[tier],
    every: paidEvery(net.nodes.tiers[tier], bt.seconds),
  }));
  const totalNodes = rows.reduce((sum, r) => sum + r.nodes, 0);
  return { rows, blockTime: bt, totalNodes };
}

/** Accessible one-liner for a row: "Nimbus: 1,692 nodes, 12,500 FLUX collateral, ...". */
export function describeRow(row: TierRow, fmt: (n: number) => string): string {
  const every = row.every ? `, paid ${row.every.phrase}` : '';
  return `${row.name}: ${fmt(row.nodes)} nodes, ${fmt(row.collateral)} FLUX collateral, ${formatFluxAmount(row.perBlock)} FLUX per block${every}`;
}

// ---------------------------------------------------------------------------
// Honesty
// ---------------------------------------------------------------------------

const RANK: Record<Freshness, number> = { live: 0, cached: 1, offline: 2, unknown: 3 };

/** The less trustworthy of two freshness states: a figure built from both is only as fresh as this. */
export function worstFreshness(a: Freshness, b: Freshness): Freshness {
  return RANK[a] >= RANK[b] ? a : b;
}
