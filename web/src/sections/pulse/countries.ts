/**
 * The top-countries list: rank the API's per-country counts under a tier filter, with a share of the
 * located nodes and a bar length relative to the leader. Framework-free.
 */
import type { GeoCountry, TierCounts } from '@shared/api';
import type { TierFilter } from './clusters';

export interface CountryRow {
  code: string;
  name: string;
  /** Nodes under the active filter. */
  nodes: number;
  /** 0..1 of the located nodes under the active filter. */
  share: number;
  /** 0..1 relative to the leading country: the bar's length. */
  bar: number;
  /** Every tier, for the stacked tier mix on the bar and the tooltip. */
  tiers: TierCounts;
  /** 1-based rank. */
  rank: number;
}

export function countryNodes(country: GeoCountry, filter: TierFilter): number {
  return filter === 'all' ? country.nodes : country.tiers[filter];
}

/** Total located nodes under a filter, from the country list. */
export function locatedTotal(countries: readonly GeoCountry[], filter: TierFilter): number {
  let total = 0;
  for (const c of countries) total += countryNodes(c, filter);
  return total;
}

/** The `limit` leading countries under a filter. Ties keep the API's order (then the name) so it is stable. */
export function topCountries(countries: readonly GeoCountry[], filter: TierFilter, limit = 5): CountryRow[] {
  const total = locatedTotal(countries, filter);
  const ranked = countries
    .map((c, i) => ({ c, i, n: countryNodes(c, filter) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name) || a.i - b.i)
    .slice(0, Math.max(0, limit));
  const lead = ranked[0]?.n ?? 0;
  return ranked.map(({ c, n }, k) => ({
    code: c.code,
    name: c.name,
    nodes: n,
    share: total > 0 ? n / total : 0,
    bar: lead > 0 ? n / lead : 0,
    tiers: c.tiers,
    rank: k + 1,
  }));
}

/** A country's tier mix as three 0..1 fractions of its own nodes (for the stacked bar). */
export function tierMix(tiers: TierCounts): TierCounts {
  const total = tiers.cumulus + tiers.nimbus + tiers.stratus;
  if (total <= 0) return { cumulus: 0, nimbus: 0, stratus: 0 };
  return { cumulus: tiers.cumulus / total, nimbus: tiers.nimbus / total, stratus: tiers.stratus / total };
}
