/**
 * Structural validation of API payloads. Tolerant by design: unknown extra fields are ignored,
 * optional or nullable fields that are missing normalise to null, malformed list entries are
 * dropped, and a missing REQUIRED field makes the whole payload invalid (the caller then falls
 * back rather than rendering a half-built object).
 *
 * No exceptions escape: every function returns a `Parsed<T>`.
 */
import type {
  AppHealth,
  AppsHealthSnapshot,
  AppsStats,
  BlockEvent,
  BlockSummary,
  BlocksSnapshot,
  CapacityStats,
  ChainInfo,
  DataSource,
  Envelope,
  GeoCountry,
  GeoPoint,
  GeoSnapshot,
  HealthState,
  HelloEvent,
  MarketStats,
  Meta,
  NetworkSnapshot,
  NextReduction,
  NodeStats,
  RewardSchedule,
  TierCounts,
} from '@shared/api';

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = (reason: string): Parsed<never> => ({ ok: false, reason });

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function numOrNull(v: unknown): number | null {
  return isNum(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function validIso(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(Date.parse(v));
}

const SOURCES: readonly DataSource[] = ['live', 'cache', 'fallback'];
const HEALTH_STATES: readonly HealthState[] = ['up', 'degraded', 'down', 'unknown'];

function tierCounts(v: unknown, what: string): Parsed<TierCounts> {
  if (!isRec(v)) return bad(`${what} is not an object`);
  const { cumulus, nimbus, stratus } = v;
  if (!isNum(cumulus) || !isNum(nimbus) || !isNum(stratus)) return bad(`${what} needs numeric tiers`);
  return ok({ cumulus, nimbus, stratus });
}

// ---------------------------------------------------------------------------
// Envelope and meta
// ---------------------------------------------------------------------------

export function parseMeta(v: unknown): Parsed<Meta> {
  if (!isRec(v)) return bad('meta is not an object');
  if (!SOURCES.includes(v.source as DataSource)) return bad('meta.source is not live, cache or fallback');
  if (!validIso(v.generatedAt)) return bad('meta.generatedAt is not an ISO date');
  if (!validIso(v.asOf)) return bad('meta.asOf is not an ISO date');
  if (!isNum(v.ageMs) || v.ageMs < 0) return bad('meta.ageMs is not a non-negative number');
  return ok({
    generatedAt: v.generatedAt,
    asOf: v.asOf,
    ageMs: v.ageMs,
    stale: v.stale === true,
    source: v.source as DataSource,
  });
}

export function parseEnvelope<T>(raw: unknown, parseData: (v: unknown) => Parsed<T>): Parsed<Envelope<T>> {
  if (!isRec(raw)) return bad('response is not an object');
  const meta = parseMeta(raw.meta);
  if (!meta.ok) return meta;
  const data = parseData(raw.data);
  if (!data.ok) return data;
  return ok({ data: data.value, meta: meta.value });
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

function parseChain(v: unknown): Parsed<ChainInfo> {
  if (!isRec(v)) return bad('chain is not an object');
  if (!isNum(v.height) || v.height < 0) return bad('chain.height missing');
  if (!validIso(v.tipTime)) return bad('chain.tipTime missing');
  const target = isNum(v.targetBlockSec) && v.targetBlockSec > 0 ? v.targetBlockSec : 30;
  return ok({
    height: Math.floor(v.height),
    tipTime: v.tipTime,
    targetBlockSec: target,
    measuredBlockSec: numOrNull(v.measuredBlockSec),
    consensus: typeof v.consensus === 'string' ? v.consensus : 'Proof of Node',
  });
}

function parseNextReduction(v: unknown): NextReduction | null {
  if (!isRec(v)) return null;
  if (!isNum(v.height) || !isNum(v.blocksAway) || !validIso(v.etaIso)) return null;
  const out: NextReduction = {
    height: v.height,
    blocksAway: Math.max(0, v.blocksAway),
    etaIso: v.etaIso,
    fraction: isNum(v.fraction) ? v.fraction : 0,
    perBlockAfter: isNum(v.perBlockAfter) ? v.perBlockAfter : 0,
  };
  // Additive epoch fields: kept when the server sends them, absent when it predates them.
  if (isNum(v.epochStartHeight)) out.epochStartHeight = v.epochStartHeight;
  if (isNum(v.epochBlocks) && v.epochBlocks > 0) out.epochBlocks = v.epochBlocks;
  if (isNum(v.index) && v.index >= 1) out.index = v.index;
  if (isNum(v.of) && v.of >= 1) out.of = v.of;
  return out;
}

function parseRewards(v: unknown): Parsed<RewardSchedule> {
  if (!isRec(v)) return bad('rewards is not an object');
  if (!isNum(v.perBlock)) return bad('rewards.perBlock missing');
  const perTier = tierCounts(v.perTier, 'rewards.perTier');
  if (!perTier.ok) return perTier;
  return ok({
    perBlock: v.perBlock,
    perTier: perTier.value,
    devFund: isNum(v.devFund) ? v.devFund : 0,
    nextReduction: parseNextReduction(v.nextReduction),
  });
}

function parseNodes(v: unknown): Parsed<NodeStats> {
  if (!isRec(v)) return bad('nodes is not an object');
  if (!isNum(v.total) || v.total < 0) return bad('nodes.total missing');
  const tiers = tierCounts(v.tiers, 'nodes.tiers');
  if (!tiers.ok) return tiers;
  const collateral = tierCounts(v.collateral, 'nodes.collateral');
  if (!collateral.ok) return collateral;
  return ok({
    total: v.total,
    tiers: tiers.value,
    collateral: collateral.value,
    countries: numOrNull(v.countries),
  });
}

function parseCapacity(v: unknown): CapacityStats | null {
  if (!isRec(v) || !isNum(v.cores) || !isNum(v.ramTb) || !isNum(v.ssdTb)) return null;
  const out: CapacityStats = { cores: v.cores, ramTb: v.ramTb, ssdTb: v.ssdTb };
  if (isNum(v.reporting)) out.reporting = v.reporting;
  return out;
}

const SECTION_KEYS = ['chain', 'nodes', 'capacity', 'apps', 'market'] as const;

/** Per-section refresh stamps. Absent when the server predates the field. */
function parseSectionFreshness(v: unknown): NetworkSnapshot['freshness'] {
  if (!isRec(v)) return undefined;
  const out = { chain: null, nodes: null, capacity: null, apps: null, market: null } as {
    [K in (typeof SECTION_KEYS)[number]]: string | null;
  };
  for (const k of SECTION_KEYS) out[k] = validIso(v[k]) ? v[k] : null;
  return out;
}

function parseApps(v: unknown): AppsStats | null {
  if (!isRec(v)) return null;
  return { registered: numOrNull(v.registered), running: numOrNull(v.running) };
}

function parseMarket(v: unknown): MarketStats | null {
  if (!isRec(v) || !isNum(v.priceUsd)) return null;
  return {
    priceUsd: v.priceUsd,
    change24hPct: numOrNull(v.change24hPct),
    marketCapUsd: numOrNull(v.marketCapUsd),
  };
}

export function parseNetwork(v: unknown): Parsed<NetworkSnapshot> {
  if (!isRec(v)) return bad('network is not an object');
  const chain = parseChain(v.chain);
  if (!chain.ok) return chain;
  const rewards = parseRewards(v.rewards);
  if (!rewards.ok) return rewards;
  const nodes = parseNodes(v.nodes);
  if (!nodes.ok) return nodes;
  const versions = isRec(v.versions) ? v.versions : {};
  const freshness = parseSectionFreshness(v.freshness);
  return ok({
    chain: chain.value,
    rewards: rewards.value,
    nodes: nodes.value,
    capacity: parseCapacity(v.capacity),
    apps: parseApps(v.apps),
    market: parseMarket(v.market),
    versions: { fluxos: strOrNull(versions.fluxos), daemon: strOrNull(versions.daemon) },
    ...(freshness ? { freshness } : {}),
  });
}

// ---------------------------------------------------------------------------
// Geo
// ---------------------------------------------------------------------------

function parseGeoPoint(v: unknown): GeoPoint | null {
  if (!isRec(v) || !isNum(v.lat) || !isNum(v.lon) || !isNum(v.n)) return null;
  const t = v.t;
  if (!Array.isArray(t) || t.length !== 3 || !t.every(isNum)) return null;
  const point: GeoPoint = {
    lat: v.lat,
    lon: v.lon,
    n: v.n,
    t: [t[0] as number, t[1] as number, t[2] as number],
  };
  if (typeof v.cc === 'string' && v.cc.length > 0) point.cc = v.cc;
  return point;
}

function parseGeoCountry(v: unknown): GeoCountry | null {
  if (!isRec(v) || !isStr(v.code) || !isNum(v.nodes)) return null;
  const tiers = tierCounts(v.tiers, 'country.tiers');
  if (!tiers.ok) return null;
  return {
    code: v.code,
    name: typeof v.name === 'string' ? v.name : v.code,
    nodes: v.nodes,
    tiers: tiers.value,
  };
}

export function parseGeo(v: unknown): Parsed<GeoSnapshot> {
  if (!isRec(v)) return bad('geo is not an object');
  if (!isNum(v.located) || !isNum(v.total)) return bad('geo.located or geo.total missing');
  if (!Array.isArray(v.countries) || !Array.isArray(v.points))
    return bad('geo.countries or geo.points missing');
  const countries = v.countries.map(parseGeoCountry).filter((c): c is GeoCountry => c !== null);
  const points = v.points.map(parseGeoPoint).filter((p): p is GeoPoint => p !== null);
  return ok({ located: v.located, total: v.total, countries, points });
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function parseBlockSummary(v: unknown): BlockSummary | null {
  if (!isRec(v) || !isNum(v.height) || !validIso(v.time)) return null;
  return {
    height: Math.floor(v.height),
    time: v.time,
    intervalSec: isNum(v.intervalSec) && v.intervalSec >= 0 ? v.intervalSec : null,
    txCount: numOrNull(v.txCount),
  };
}

export function parseBlocks(v: unknown): Parsed<BlocksSnapshot> {
  if (!isRec(v) || !Array.isArray(v.blocks)) return bad('blocks.blocks missing');
  const blocks = v.blocks.map(parseBlockSummary).filter((b): b is BlockSummary => b !== null);
  blocks.sort((a, b) => a.height - b.height);
  return ok({ blocks });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

function parseAppHealth(v: unknown): AppHealth | null {
  if (!isRec(v) || !isStr(v.id)) return null;
  const state = HEALTH_STATES.includes(v.state as HealthState) ? (v.state as HealthState) : 'unknown';
  return {
    id: v.id,
    state,
    httpStatus: numOrNull(v.httpStatus),
    latencyMs: numOrNull(v.latencyMs),
    checkedAt: validIso(v.checkedAt) ? v.checkedAt : null,
    since: validIso(v.since) ? v.since : null,
  };
}

export function parseHealth(v: unknown): Parsed<AppsHealthSnapshot> {
  if (!isRec(v) || !Array.isArray(v.apps)) return bad('health.apps missing');
  return ok({ apps: v.apps.map(parseAppHealth).filter((a): a is AppHealth => a !== null) });
}

// ---------------------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------------------

export function parseBlockEvent(v: unknown): Parsed<BlockEvent> {
  if (!isRec(v) || !isNum(v.height) || !validIso(v.time)) return bad('block event needs height and time');
  return ok({ height: Math.floor(v.height), time: v.time, txCount: numOrNull(v.txCount) });
}

export function parseHello(v: unknown): Parsed<HelloEvent> {
  if (!isRec(v) || !validIso(v.serverTime)) return bad('hello.serverTime missing');
  // A malformed network or health inside hello is dropped, not fatal: the hello itself still counts.
  const network = v.network == null ? null : parseNetwork(v.network);
  const health = v.health == null ? null : parseHealth(v.health);
  const networkMeta = v.networkMeta == null ? null : parseMeta(v.networkMeta);
  const healthMeta = v.healthMeta == null ? null : parseMeta(v.healthMeta);
  return ok({
    serverTime: v.serverTime,
    network: network?.ok ? network.value : null,
    health: health?.ok ? health.value : null,
    // Meta is only meaningful alongside its payload.
    networkMeta: network?.ok && networkMeta?.ok ? networkMeta.value : null,
    healthMeta: health?.ok && healthMeta?.ok ? healthMeta.value : null,
  });
}

/** A streamed snapshot: its meta when the server sent an envelope, null for a bare snapshot. */
export interface StreamPayload<T> {
  data: T;
  meta: Meta | null;
}

/**
 * Stream `network` and `health` events are `Envelope<T>`. Be tolerant of the older bare snapshot:
 * anything that is not a `{ data, meta }` pair is parsed as the snapshot itself with `meta: null`.
 */
export function parseStreamPayload<T>(
  raw: unknown,
  parseData: (v: unknown) => Parsed<T>,
): Parsed<StreamPayload<T>> {
  if (isRec(raw) && isRec(raw.data) && 'meta' in raw) {
    const data = parseData(raw.data);
    if (!data.ok) return data;
    const meta = parseMeta(raw.meta);
    return ok({ data: data.value, meta: meta.ok ? meta.value : null });
  }
  const bare = parseData(raw);
  if (!bare.ok) return bare;
  return ok({ data: bare.value, meta: null });
}
