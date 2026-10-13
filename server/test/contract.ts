import { readFileSync } from 'node:fs';

/**
 * A tiny structural validator for the payload types in shared/api.ts. It is strict: unknown keys fail,
 * so a field added on the server without the contract (or the other way round) is caught. A second test
 * parses shared/api.ts and checks these shapes list exactly the interface's top-level property names.
 */
export type Check = (v: unknown, path: string, errs: string[]) => void;

const fail = (errs: string[], path: string, msg: string) => errs.push(`${path}: ${msg}`);

export const str: Check = (v, p, e) => {
  if (typeof v !== 'string') fail(e, p, `expected string, got ${typeof v}`);
};
export const num: Check = (v, p, e) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(e, p, `expected finite number, got ${String(v)}`);
};
export const int: Check = (v, p, e) => {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(e, p, `expected integer, got ${String(v)}`);
};
export const bool: Check = (v, p, e) => {
  if (typeof v !== 'boolean') fail(e, p, `expected boolean, got ${typeof v}`);
};
export const iso: Check = (v, p, e) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v) ||
    Number.isNaN(Date.parse(v))
  ) {
    fail(e, p, `expected ISO-8601 UTC string, got ${JSON.stringify(v)}`);
  }
};
export const oneOf =
  (...vals: string[]): Check =>
  (v, p, e) => {
    if (typeof v !== 'string' || !vals.includes(v))
      fail(e, p, `expected one of ${vals.join('|')}, got ${JSON.stringify(v)}`);
  };
export const nullable =
  (c: Check): Check =>
  (v, p, e) => {
    if (v !== null) c(v, p, e);
  };
export const arr =
  (c: Check): Check =>
  (v, p, e) => {
    if (!Array.isArray(v)) return fail(e, p, 'expected array');
    for (const [i, x] of v.entries()) c(x, `${p}[${i}]`, e);
  };
export const tuple3 =
  (c: Check): Check =>
  (v, p, e) => {
    if (!Array.isArray(v) || v.length !== 3) return fail(e, p, 'expected 3-tuple');
    for (const [i, x] of v.entries()) c(x, `${p}[${i}]`, e);
  };
export const record =
  (c: Check): Check =>
  (v, p, e) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(e, p, 'expected object');
    for (const [k, x] of Object.entries(v)) c(x, `${p}.${k}`, e);
  };

/** Marks a key as optional (may be absent, but when present must satisfy `c`). */
export const optional = (c: Check): Check & { optional: true } =>
  Object.assign((v: unknown, p: string, e: string[]) => c(v, p, e), { optional: true as const });

export interface ObjCheck extends Check {
  keys: string[];
}
export function obj(shape: Record<string, Check>): ObjCheck {
  const check: Check = (v, p, e) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(e, p, 'expected object');
    const o = v as Record<string, unknown>;
    for (const [k, c] of Object.entries(shape)) {
      const isOpt = (c as { optional?: boolean }).optional === true;
      if (!(k in o)) {
        if (!isOpt) fail(e, `${p}.${k}`, 'missing');
        continue;
      }
      c(o[k], `${p}.${k}`, e);
    }
    for (const k of Object.keys(o)) if (!(k in shape)) fail(e, `${p}.${k}`, 'unexpected key');
  };
  return Object.assign(check, { keys: Object.keys(shape) });
}

// ---- shapes mirroring shared/api.ts -----------------------------------------------------------

const tierCounts = obj({ cumulus: num, nimbus: num, stratus: num });

export const Meta = obj({
  generatedAt: iso,
  asOf: iso,
  ageMs: num,
  stale: bool,
  source: oneOf('live', 'cache', 'fallback'),
});

export const ChainInfo = obj({
  height: int,
  tipTime: iso,
  targetBlockSec: num,
  measuredBlockSec: nullable(num),
  consensus: str,
});
export const NextReduction = obj({
  height: int,
  blocksAway: int,
  etaIso: iso,
  fraction: num,
  perBlockAfter: num,
  epochStartHeight: optional(int),
  epochBlocks: optional(int),
  index: optional(int),
  of: optional(int),
});
export const RewardSchedule = obj({
  perBlock: num,
  perTier: tierCounts,
  devFund: num,
  nextReduction: nullable(NextReduction),
});
export const NodeStats = obj({
  total: int,
  tiers: tierCounts,
  collateral: tierCounts,
  countries: nullable(int),
});
export const CapacityStats = obj({ cores: num, ramTb: num, ssdTb: num, reporting: optional(int) });
export const AppsStats = obj({ registered: nullable(int), running: nullable(int) });
export const MarketStats = obj({ priceUsd: num, change24hPct: nullable(num), marketCapUsd: nullable(num) });
export const NetworkSnapshot = obj({
  chain: ChainInfo,
  rewards: RewardSchedule,
  nodes: NodeStats,
  capacity: nullable(CapacityStats),
  apps: nullable(AppsStats),
  market: nullable(MarketStats),
  versions: obj({ fluxos: nullable(str), daemon: nullable(str) }),
  freshness: optional(
    obj({
      chain: nullable(iso),
      nodes: nullable(iso),
      capacity: nullable(iso),
      apps: nullable(iso),
      market: nullable(iso),
    }),
  ),
});
export const GeoPoint = obj({ lat: num, lon: num, n: int, cc: optional(str), t: tuple3(int) });
export const GeoCountry = obj({ code: str, name: str, nodes: int, tiers: tierCounts });
export const GeoSnapshot = obj({
  located: int,
  total: int,
  countries: arr(GeoCountry),
  points: arr(GeoPoint),
});
export const BlockSummary = obj({
  height: int,
  time: iso,
  intervalSec: nullable(num),
  txCount: nullable(int),
});
export const BlocksSnapshot = obj({ blocks: arr(BlockSummary) });
export const AppHealth = obj({
  id: str,
  state: oneOf('up', 'degraded', 'down', 'unknown'),
  httpStatus: nullable(int),
  latencyMs: nullable(num),
  checkedAt: nullable(iso),
  since: nullable(iso),
});
export const AppsHealthSnapshot = obj({ apps: arr(AppHealth) });
export const BlockEvent = obj({ height: int, time: iso, txCount: nullable(int) });
export const HelloEvent = obj({
  serverTime: iso,
  network: nullable(NetworkSnapshot),
  health: nullable(AppsHealthSnapshot),
  networkMeta: optional(nullable(Meta)),
  healthMeta: optional(nullable(Meta)),
});
export const UpstreamStatus = obj({ ok: bool, lastOkAt: nullable(iso), lastError: nullable(str) });
export const ServiceInfo = obj({
  name: str,
  version: str,
  startedAt: iso,
  uptimeSec: num,
  upstream: record(UpstreamStatus),
  mode: optional(oneOf('live', 'fixtures')),
  sseClients: optional(int),
});
export const ApiErrorBody = obj({ error: obj({ code: str, message: str }) });

export const envelope = (data: Check): ObjCheck => obj({ data, meta: Meta });
/** SSE `network` and `health` event payloads are plain envelopes. */
export const NetworkEvent = envelope(NetworkSnapshot);
export const HealthEvent = envelope(AppsHealthSnapshot);
export const PingEvent = obj({});

export function validate(check: Check, value: unknown, name = 'value'): string[] {
  const errs: string[] = [];
  check(value, name, errs);
  return errs;
}

/** Property names declared directly on `export interface <name>` in shared/api.ts. */
export function interfaceKeys(name: string): string[] {
  const src = readFileSync(new URL('../../shared/api.ts', import.meta.url), 'utf8');
  const start = src.indexOf(`export interface ${name} {`);
  if (start < 0) throw new Error(`interface ${name} not found`);
  const body = src.slice(start, src.indexOf('\n}', start));
  const keys: string[] = [];
  for (const m of body.matchAll(/^ {2}(\w+)\??:/gm)) keys.push(m[1] as string);
  return keys;
}
