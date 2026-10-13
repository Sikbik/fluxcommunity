/**
 * Node tiers as the Nodes tile shows them: counts, shares that add to exactly 100, the ring fill, the
 * collateral and the FLUX one node of the tier is paid per block. Framework-free.
 */
import type { NodeStats, Tier, TierCounts } from '@shared/api';
import { tierSharePercents } from '@/data';

export interface TierRow {
  tier: Tier;
  count: number;
  /** Percent of all nodes with one decimal. The three rows add to exactly 100. */
  percent: number;
  /** 0..1 fill for the ring: the tier's share of all nodes. */
  ring: number;
  /** FLUX of collateral one node needs. */
  collateral: number;
  /** FLUX paid per block to the one node of this tier that is paid. */
  perBlock: number;
}

export const TIER_ORDER: readonly Tier[] = ['cumulus', 'nimbus', 'stratus'];

export const TIER_NAMES: Record<Tier, string> = {
  cumulus: 'Cumulus',
  nimbus: 'Nimbus',
  stratus: 'Stratus',
};

export function tierRows(nodes: NodeStats, perTier: TierCounts): TierRow[] {
  const total = nodes.tiers.cumulus + nodes.tiers.nimbus + nodes.tiers.stratus;
  const percents = tierSharePercents(nodes.tiers, 1);
  return TIER_ORDER.map((tier) => ({
    tier,
    count: nodes.tiers[tier],
    percent: percents[tier],
    ring: total > 0 ? nodes.tiers[tier] / total : 0,
    collateral: nodes.collateral[tier],
    perBlock: perTier[tier],
  }));
}

/** The full sentence a screen reader gets for a tier row, so the visual grid is not the only form. */
export function tierSummary(row: TierRow): string {
  return `${TIER_NAMES[row.tier]}: ${row.count.toLocaleString('en-US')} nodes, ${row.percent} percent of the network. Collateral ${row.collateral.toLocaleString('en-US')} FLUX. ${row.perBlock} FLUX per block.`;
}
