import type { GeoCountry, GeoPoint, GeoSnapshot, NetworkSnapshot } from '../../../shared/api.ts';
import { COLLATERAL, computeRewards, TARGET_BLOCK_SEC } from '../flux/rewards.ts';
import { BAKED } from './baked.ts';

/**
 * Baked-in snapshot served (with `meta.source = "fallback"`) only when the server has never received
 * upstream data since boot. Regenerate with `node server/scripts/bake-fallback.ts` (needs network access).
 * It is a floor, not a feature: the height is whatever it was on the bake date, so the web app must keep
 * labelling it as fallback. Price is deliberately absent because a months-old price is misleading.
 */
export interface Baked {
  bakedAt: string;
  height: number;
  tipTimeSec: number;
  nodes: { total: number; cumulus: number; nimbus: number; stratus: number };
  capacity: { cores: number; ramTb: number; ssdTb: number; reporting: number };
  apps: { registered: number; running: number };
  versions: { fluxos: string; daemon: string };
  geo: {
    located: number;
    total: number;
    countries: [code: string, name: string, cumulus: number, nimbus: number, stratus: number][];
    /** [lat, lon, cumulus, nimbus, stratus, cc] */
    points: [number, number, number, number, number, string][];
  };
}

export interface Fallback {
  network: NetworkSnapshot;
  geo: GeoSnapshot;
  asOfMs: number;
}

export function buildFallback(b: Baked = BAKED): Fallback {
  const tipTimeMs = b.tipTimeSec * 1000;
  const { rewards } = computeRewards({ height: b.height, tipTimeMs });
  const network: NetworkSnapshot = {
    chain: {
      height: b.height,
      tipTime: new Date(tipTimeMs).toISOString(),
      targetBlockSec: TARGET_BLOCK_SEC,
      measuredBlockSec: null,
      consensus: 'Proof of Node',
    },
    rewards,
    nodes: {
      total: b.nodes.total,
      tiers: { cumulus: b.nodes.cumulus, nimbus: b.nodes.nimbus, stratus: b.nodes.stratus },
      collateral: { ...COLLATERAL },
      countries: b.geo.countries.length,
    },
    capacity: { ...b.capacity },
    apps: { ...b.apps },
    market: null,
    versions: { ...b.versions },
    freshness: { chain: null, nodes: null, capacity: null, apps: null, market: null },
  };
  const countries: GeoCountry[] = b.geo.countries.map(([code, name, c, n, s]) => ({
    code,
    name,
    nodes: c + n + s,
    tiers: { cumulus: c, nimbus: n, stratus: s },
  }));
  const points: GeoPoint[] = b.geo.points.map(([lat, lon, c, n, s, cc]) => {
    const p: GeoPoint = { lat, lon, n: c + n + s, t: [c, n, s] };
    if (cc) p.cc = cc;
    return p;
  });
  return {
    network,
    geo: { located: b.geo.located, total: b.geo.total, countries, points },
    asOfMs: Date.parse(b.bakedAt),
  };
}
