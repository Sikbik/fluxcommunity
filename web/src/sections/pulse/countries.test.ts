import type { GeoCountry } from '@shared/api';
import { describe, expect, it } from 'vitest';
import { countryNodes, locatedTotal, tierMix, topCountries } from './countries';

const COUNTRIES: GeoCountry[] = [
  { code: 'DE', name: 'Germany', nodes: 1519, tiers: { cumulus: 689, nimbus: 298, stratus: 532 } },
  { code: 'US', name: 'United States', nodes: 1227, tiers: { cumulus: 624, nimbus: 388, stratus: 215 } },
  { code: 'FI', name: 'Finland', nodes: 998, tiers: { cumulus: 315, nimbus: 170, stratus: 513 } },
  { code: 'FR', name: 'France', nodes: 765, tiers: { cumulus: 442, nimbus: 186, stratus: 137 } },
  { code: 'DK', name: 'Denmark', nodes: 522, tiers: { cumulus: 453, nimbus: 60, stratus: 9 } },
  { code: 'CA', name: 'Canada', nodes: 369, tiers: { cumulus: 172, nimbus: 157, stratus: 40 } },
  { code: 'NZ', name: 'New Zealand', nodes: 3, tiers: { cumulus: 3, nimbus: 0, stratus: 0 } },
];

describe('topCountries', () => {
  it('ranks by nodes and returns the top five', () => {
    const rows = topCountries(COUNTRIES, 'all');
    expect(rows.map((r) => r.code)).toEqual(['DE', 'US', 'FI', 'FR', 'DK']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('bars are relative to the leader and shares to the located total', () => {
    const rows = topCountries(COUNTRIES, 'all');
    expect(rows[0]?.bar).toBe(1);
    expect(rows[1]?.bar).toBeCloseTo(1227 / 1519, 6);
    const total = locatedTotal(COUNTRIES, 'all');
    expect(total).toBe(1519 + 1227 + 998 + 765 + 522 + 369 + 3);
    expect(rows[0]?.share).toBeCloseTo(1519 / total, 6);
  });

  it('re-ranks under a tier filter and counts only that tier', () => {
    const cumulus = topCountries(COUNTRIES, 'cumulus');
    expect(cumulus.map((r) => r.code)).toEqual(['DE', 'US', 'DK', 'FR', 'FI']);
    expect(cumulus[0]?.nodes).toBe(689);
    const stratus = topCountries(COUNTRIES, 'stratus');
    expect(stratus.map((r) => r.code)).toEqual(['DE', 'FI', 'US', 'FR', 'CA']);
    expect(stratus.every((r) => r.nodes > 0)).toBe(true);
  });

  it('drops countries with none of the filtered tier', () => {
    const nimbus = topCountries(COUNTRIES, 'nimbus', 10);
    expect(nimbus.map((r) => r.code)).not.toContain('NZ');
  });

  it('is stable for ties and handles empty input', () => {
    const tie: GeoCountry[] = [
      { code: 'BB', name: 'Beta', nodes: 5, tiers: { cumulus: 5, nimbus: 0, stratus: 0 } },
      { code: 'AA', name: 'Alpha', nodes: 5, tiers: { cumulus: 5, nimbus: 0, stratus: 0 } },
    ];
    expect(topCountries(tie, 'all').map((r) => r.code)).toEqual(['AA', 'BB']);
    expect(topCountries([], 'all')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(topCountries(COUNTRIES, 'all', 2)).toHaveLength(2);
    expect(topCountries(COUNTRIES, 'all', 0)).toEqual([]);
  });
});

describe('countryNodes and tierMix', () => {
  it('reads the filtered count', () => {
    expect(countryNodes(COUNTRIES[0] as GeoCountry, 'all')).toBe(1519);
    expect(countryNodes(COUNTRIES[0] as GeoCountry, 'nimbus')).toBe(298);
  });

  it('mixes sum to one, or zero for an empty country', () => {
    const m = tierMix({ cumulus: 689, nimbus: 298, stratus: 532 });
    expect(m.cumulus + m.nimbus + m.stratus).toBeCloseTo(1, 9);
    expect(tierMix({ cumulus: 0, nimbus: 0, stratus: 0 })).toEqual({ cumulus: 0, nimbus: 0, stratus: 0 });
  });
});
