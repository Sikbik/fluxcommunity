import type { CapacityStats, GeoCountry, GeoPoint, GeoSnapshot, TierCounts } from '../../../shared/api.ts';

/**
 * Pure reductions over stats.runonflux.io `/fluxinfo` rows (see flux/stats.ts for the projection).
 * Rules that decide what counts:
 * - A row with an `error` key is an unreachable node: counted in `geo.total`, never located, never
 *   summed into capacity, never voting for a version.
 * - Capacity sums only rows whose benchmark status is CUMULUS, NIMBUS or STRATUS (the tier name means the
 *   benchmark passed). `running` and `failed` rows are excluded. RAM and SSD are reported by the benchmark
 *   in GB and shown in decimal TB (GB / 1000), which matches the earlier research note's scale.
 * - Versions are the plurality value among reachable nodes (FluxOS "8.20.0"; fluxd int 9010050 -> "9.1.0").
 */

type Row = Record<string, unknown>;

const TIER_INDEX: Record<string, 0 | 1 | 2> = { CUMULUS: 0, NIMBUS: 1, STRATUS: 2 };
const TIER_KEYS = ['cumulus', 'nimbus', 'stratus'] as const;

const asObj = (v: unknown): Row | null => (typeof v === 'object' && v !== null ? (v as Row) : null);
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const hasError = (r: Row): boolean => r.error !== undefined && r.error !== null && r.error !== false;

export function formatDaemonVersion(v: number): string | null {
  if (!Number.isInteger(v) || v < 1_000_000) return null;
  const major = Math.floor(v / 1_000_000);
  const minor = Math.floor(v / 10_000) % 100;
  const patch = Math.floor(v / 100) % 100;
  return `${major}.${minor}.${patch}`;
}

function plurality(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of counts) {
    if (c > n || (c === n && best !== null && k > best)) {
      best = k;
      n = c;
    }
  }
  return best;
}

export interface CapacityResult {
  capacity: CapacityStats | null;
  versions: { fluxos: string | null; daemon: string | null };
}

export function summariseCapacity(rows: unknown[]): CapacityResult {
  let cores = 0;
  let ramGb = 0;
  let ssdGb = 0;
  let reporting = 0;
  const fluxos = new Map<string, number>();
  const daemon = new Map<string, number>();
  for (const raw of rows) {
    const r = asObj(raw);
    if (!r || hasError(r)) continue;
    const bench = asObj(asObj(r.benchmark)?.bench);
    const status = typeof bench?.status === 'string' ? bench.status : '';
    if (bench && status in TIER_INDEX) {
      const c = finite(bench.cores);
      const ram = finite(bench.ram);
      const ssd = finite(bench.ssd);
      if (c !== null && c > 0 && ram !== null && ram >= 0 && ssd !== null && ssd >= 0) {
        cores += c;
        ramGb += ram;
        ssdGb += ssd;
        reporting += 1;
      }
    }
    const fv = asObj(r.flux)?.version;
    if (typeof fv === 'string' && /^\d+\.\d+\.\d+/.test(fv)) fluxos.set(fv, (fluxos.get(fv) ?? 0) + 1);
    const dv = finite(asObj(asObj(r.daemon)?.info)?.version);
    const dvs = dv === null ? null : formatDaemonVersion(dv);
    if (dvs) daemon.set(dvs, (daemon.get(dvs) ?? 0) + 1);
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    capacity:
      reporting === 0 ? null : { cores, ramTb: round1(ramGb / 1000), ssdTb: round1(ssdGb / 1000), reporting },
    versions: { fluxos: plurality(fluxos), daemon: plurality(daemon) },
  };
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

/** Upper bound on points; the grid coarsens until the clustered result fits. */
export const MAX_GEO_POINTS = 400;
const START_CELL_DEG = 2;
const MAX_CELL_DEG = 12;

interface Located {
  lat: number;
  lon: number;
  tier: 0 | 1 | 2;
  cc: string | undefined;
}

export function summariseGeo(rows: unknown[]): GeoSnapshot {
  let total = 0;
  const located: Located[] = [];
  const countryAgg = new Map<string, { names: Map<string, number>; nodes: number; tiers: number[] }>();

  for (const raw of rows) {
    const r = asObj(raw);
    if (!r) continue;
    total += 1;
    if (hasError(r)) continue;
    const tier = TIER_INDEX[String(r.tier ?? '').toUpperCase()];
    if (tier === undefined) continue;
    const g = asObj(r.geolocation);
    const lat = finite(g?.lat);
    const lon = finite(g?.lon);
    if (
      lat === null ||
      lon === null ||
      (lat === 0 && lon === 0) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      continue;
    }
    const ccRaw = typeof g?.countryCode === 'string' ? g.countryCode.toUpperCase() : '';
    const cc = /^[A-Z]{2}$/.test(ccRaw) ? ccRaw : undefined;
    located.push({ lat, lon, tier, cc });
    if (cc) {
      let agg = countryAgg.get(cc);
      if (!agg) {
        agg = { names: new Map(), nodes: 0, tiers: [0, 0, 0] };
        countryAgg.set(cc, agg);
      }
      agg.nodes += 1;
      agg.tiers[tier] = (agg.tiers[tier] ?? 0) + 1;
      const nm = typeof g?.country === 'string' ? g.country.trim() : '';
      if (nm) agg.names.set(nm, (agg.names.get(nm) ?? 0) + 1);
    }
  }

  const countries: GeoCountry[] = [...countryAgg.entries()]
    .map(([code, a]) => {
      const tiers: TierCounts = {
        cumulus: a.tiers[0] ?? 0,
        nimbus: a.tiers[1] ?? 0,
        stratus: a.tiers[2] ?? 0,
      };
      return { code, name: plurality(a.names) ?? code, nodes: a.nodes, tiers };
    })
    .sort((x, y) => y.nodes - x.nodes || x.code.localeCompare(y.code));

  return { located: located.length, total, countries, points: cluster(located) };
}

function cluster(nodes: Located[]): GeoPoint[] {
  for (let cell = START_CELL_DEG; ; cell += 1) {
    const buckets = new Map<
      string,
      { n: number; lat: number; lon: number; t: [number, number, number]; cc?: string }
    >();
    for (const p of nodes) {
      // Keyed by country as well as by cell so a point never straddles a border.
      const key = `${p.cc ?? '--'}|${Math.floor(p.lat / cell)}|${Math.floor(p.lon / cell)}`;
      let b = buckets.get(key);
      if (!b) {
        b = { n: 0, lat: 0, lon: 0, t: [0, 0, 0], cc: p.cc };
        buckets.set(key, b);
      }
      b.n += 1;
      b.lat += p.lat;
      b.lon += p.lon;
      b.t[p.tier] += 1;
    }
    if (buckets.size <= MAX_GEO_POINTS || cell >= MAX_CELL_DEG) {
      return [...buckets.values()]
        .map((b): GeoPoint => {
          const pt: GeoPoint = {
            lat: Math.round((b.lat / b.n) * 100) / 100,
            lon: Math.round((b.lon / b.n) * 100) / 100,
            n: b.n,
            t: b.t,
          };
          if (b.cc) pt.cc = b.cc;
          return pt;
        })
        .sort((a, b) => b.n - a.n || a.lat - b.lat || a.lon - b.lon);
    }
  }
}

export { TIER_KEYS };
