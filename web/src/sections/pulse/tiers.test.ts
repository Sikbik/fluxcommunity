import type { NodeStats } from '@shared/api';
import { describe, expect, it } from 'vitest';
import { TIER_ORDER, tierRows, tierSummary } from './tiers';

const NODES: NodeStats = {
  total: 7108,
  tiers: { cumulus: 3586, nimbus: 1692, stratus: 1830 },
  collateral: { cumulus: 1000, nimbus: 12_500, stratus: 40_000 },
  countries: 56,
};
const PER_TIER = { cumulus: 1, nimbus: 3.5, stratus: 9 };

describe('tierRows', () => {
  const rows = tierRows(NODES, PER_TIER);

  it('lists the tiers in order with their facts', () => {
    expect(rows.map((r) => r.tier)).toEqual([...TIER_ORDER]);
    expect(rows[0]).toMatchObject({ count: 3586, collateral: 1000, perBlock: 1 });
    expect(rows[1]).toMatchObject({ count: 1692, collateral: 12_500, perBlock: 3.5 });
    expect(rows[2]).toMatchObject({ count: 1830, collateral: 40_000, perBlock: 9 });
  });

  it('shares add to exactly 100', () => {
    const sum = rows.reduce((a, r) => a + r.percent, 0);
    expect(Math.round(sum * 10) / 10).toBe(100);
  });

  it('ring fills are the share of all nodes', () => {
    expect(rows[0]?.ring).toBeCloseTo(3586 / 7108, 9);
    expect(rows.reduce((a, r) => a + r.ring, 0)).toBeCloseTo(1, 9);
  });

  it('survives a network with no nodes', () => {
    const empty = tierRows({ ...NODES, total: 0, tiers: { cumulus: 0, nimbus: 0, stratus: 0 } }, PER_TIER);
    expect(empty.every((r) => r.ring === 0 && r.percent === 0)).toBe(true);
  });
});

describe('tierSummary', () => {
  it('is a full sentence for assistive tech', () => {
    const s = tierSummary(tierRows(NODES, PER_TIER)[0] as ReturnType<typeof tierRows>[number]);
    expect(s).toContain('Cumulus');
    expect(s).toContain('3,586 nodes');
    expect(s).toContain('1,000 FLUX');
    expect(s).toContain('1 FLUX per block');
  });
});
