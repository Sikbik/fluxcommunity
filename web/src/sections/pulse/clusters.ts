/**
 * Cluster model for the world map: the API's coarse geo points, filtered to one tier or all of them,
 * with the numbers the renderer and the tooltip need. Framework-free and allocation-light.
 */
import type { GeoCountry, GeoPoint, Tier, TierCounts } from '@shared/api';
import { TIERS } from '@shared/api';
import { type MapView, project } from './projection';

export type TierFilter = 'all' | Tier;
export const TIER_FILTERS: readonly TierFilter[] = ['all', ...TIERS];

/** Index into a point's `t` tuple for a tier. */
export function tierIndex(tier: Tier): 0 | 1 | 2 {
  return tier === 'cumulus' ? 0 : tier === 'nimbus' ? 1 : 2;
}

export interface Cluster {
  /** Index of the source point in the snapshot. */
  index: number;
  lon: number;
  lat: number;
  /** Nodes counted under the active filter (the cluster's size). */
  n: number;
  /** Nodes in the cluster across every tier. */
  total: number;
  /** [cumulus, nimbus, stratus] across every tier. */
  tiers: readonly [number, number, number];
  cc: string | null;
  /** The tier with the most nodes under the active filter (ties favour the rarer tier). */
  dominant: Tier;
}

/** The tier with the most nodes; ties go to the rarer, higher tier so a lone Stratus node is not hidden. */
export function dominantTier(t: readonly [number, number, number], filter: TierFilter = 'all'): Tier {
  if (filter !== 'all') return filter;
  const [c, n, s] = t;
  if (s >= n && s >= c) return 'stratus';
  if (n >= c) return 'nimbus';
  return 'cumulus';
}

/** Nodes in a point under a filter. */
export function countFor(t: readonly [number, number, number], filter: TierFilter): number {
  if (filter === 'all') return t[0] + t[1] + t[2];
  return t[tierIndex(filter)] ?? 0;
}

/** Points with at least one node under the filter, biggest first so small ones are drawn on top. */
export function buildClusters(points: readonly GeoPoint[], filter: TierFilter): Cluster[] {
  const out: Cluster[] = [];
  points.forEach((p, index) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
    const n = countFor(p.t, filter);
    if (n <= 0) return;
    out.push({
      index,
      lon: p.lon,
      lat: p.lat,
      n,
      total: p.t[0] + p.t[1] + p.t[2],
      tiers: p.t,
      cc: p.cc ?? null,
      dominant: dominantTier(p.t, filter),
    });
  });
  return out.sort((a, b) => b.n - a.n);
}

/** Located nodes per tier, summed over the points. */
export function tierTotals(points: readonly GeoPoint[]): TierCounts {
  let cumulus = 0;
  let nimbus = 0;
  let stratus = 0;
  for (const p of points) {
    cumulus += p.t[0];
    nimbus += p.t[1];
    stratus += p.t[2];
  }
  return { cumulus, nimbus, stratus };
}

/**
 * Visual radii for a cluster of `n` nodes, in CSS px at the reference map width (800 px). The area
 * grows with the node count (so the radius with its square root) and is capped so one dense city
 * cannot swallow its neighbours. `scale` converts to the real canvas width.
 */
export function clusterRadii(n: number, scale = 1): { core: number; halo: number } {
  const root = Math.sqrt(Math.max(0, n));
  const core = Math.min(3.6, 1.25 + 0.12 * root);
  const halo = Math.min(20, 4 + 0.8 * root);
  return { core: core * scale, halo: halo * scale };
}

/** Map width to the radius scale: 1 at 800 px, never smaller than 0.42 or larger than 1.5. */
export function radiusScale(width: number): number {
  return Math.min(1.5, Math.max(0.42, width / 800));
}

export interface Placed extends Cluster {
  x: number;
  y: number;
  core: number;
  halo: number;
}

/** Clusters placed on the canvas, with their radii. */
export function placeClusters(clusters: readonly Cluster[], view: MapView): Placed[] {
  const scale = radiusScale(view.width);
  return clusters.map((c) => {
    const { x, y } = project(c.lon, c.lat, view);
    const r = clusterRadii(c.n, scale);
    return { ...c, x, y, core: r.core, halo: r.halo };
  });
}

/**
 * The cluster under a pointer: the nearest centre within its own hit radius (halo-ish, never less
 * than `minHit` so a one-node cluster is still easy to land on). Null when nothing is close.
 */
export function pickCluster(placed: readonly Placed[], x: number, y: number, minHit = 9): Placed | null {
  let best: Placed | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of placed) {
    const hit = Math.max(minHit, c.core * 2.2);
    const dx = c.x - x;
    const dy = c.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > hit * hit) continue;
    const score = d2 / (hit * hit);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** The biggest cluster of a country, for anchoring a country tooltip. */
export function anchorCluster(placed: readonly Placed[], cc: string): Placed | null {
  let best: Placed | null = null;
  for (const c of placed) if (c.cc === cc && (best === null || c.n > best.n)) best = c;
  return best;
}

export function countryName(countries: readonly GeoCountry[], code: string | null): string | null {
  if (!code) return null;
  return countries.find((c) => c.code === code)?.name ?? null;
}
