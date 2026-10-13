/**
 * Flux Community API contract, v1.
 *
 * The single source of truth for the shapes exchanged between `server/` and `web/`.
 * Both sides import this file. Changes must be ADDITIVE (new optional fields, new
 * endpoints); never rename or remove a field without updating both sides in the
 * same change.
 *
 * ERASABLE TYPESCRIPT ONLY: no enums, namespaces or parameter properties, and
 * no imports of runtime packages. Node runs this file directly with type
 * stripping, and Vite bundles it as-is.
 */

export const API_VERSION = 1 as const;
export const API_PREFIX = '/api/v1' as const;

/** Endpoint paths, relative to the site origin. */
export const API_PATHS = {
  /** GET: NetworkSnapshot (cached ~10 s server side). */
  network: `${API_PREFIX}/network`,
  /** GET: GeoSnapshot (cached several minutes). */
  geo: `${API_PREFIX}/geo`,
  /** GET: recent blocks for the cadence sparkline. */
  blocks: `${API_PREFIX}/blocks`,
  /** GET: AppsHealthSnapshot, one entry per catalog app. */
  health: `${API_PREFIX}/health`,
  /** GET (text/event-stream): StreamEvent frames. */
  stream: `${API_PREFIX}/stream`,
  /** GET: ServiceInfo. Not cached. */
  info: `${API_PREFIX}/info`,
  /** GET: liveness for the container platform. Plain `ok`. */
  healthz: '/healthz',
} as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Tier = 'cumulus' | 'nimbus' | 'stratus';
export const TIERS: readonly Tier[] = ['cumulus', 'nimbus', 'stratus'];

export interface TierCounts {
  cumulus: number;
  nimbus: number;
  stratus: number;
}

/**
 * Where a payload came from. The UI must be honest about this:
 * `live`     fetched from upstream within the freshness window
 * `cache`    older than the window, still being served (stale-while-revalidate)
 * `fallback` the server has no upstream data at all and is serving a baked-in
 *            snapshot (also what the web app uses when the API is unreachable)
 */
export type DataSource = 'live' | 'cache' | 'fallback';

export interface Meta {
  /** ISO-8601 UTC time the server produced this response. */
  generatedAt: string;
  /** ISO-8601 UTC time the underlying data was fetched from upstream. */
  asOf: string;
  /** Milliseconds between `asOf` and `generatedAt`. */
  ageMs: number;
  /** True when `ageMs` exceeds the endpoint's freshness window. */
  stale: boolean;
  source: DataSource;
}

export interface Envelope<T> {
  data: T;
  meta: Meta;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// GET /api/v1/network
// ---------------------------------------------------------------------------

export interface ChainInfo {
  /** Tip block height. */
  height: number;
  /** ISO-8601 UTC time of the tip block header. */
  tipTime: string;
  /** Protocol target block interval in seconds (30 under Proof of Node). */
  targetBlockSec: number;
  /** Measured mean interval over the most recent blocks the server has seen. */
  measuredBlockSec: number | null;
  /** Display label for the consensus mechanism, e.g. "Proof of Node". */
  consensus: string;
}

export interface NextReduction {
  /** Block height at which the subsidy steps down. */
  height: number;
  blocksAway: number;
  /**
   * Estimated ISO-8601 UTC time: `blocksAway` times the effective block interval, added to the tip
   * block time. The effective interval is `chain.measuredBlockSec` when it is within 0.5x to 2x of
   * `chain.targetBlockSec`, otherwise the target (see `effectiveBlockSec` in shared/chain.ts).
   */
  etaIso: string;
  /** Fractional cut, 0.1 means the subsidy drops by 10 percent. */
  fraction: number;
  /** Total FLUX created per block after the reduction. */
  perBlockAfter: number;
  /** Height at which the current reward epoch began (2,020,000, PoN activation, for the first). Additive. */
  epochStartHeight?: number;
  /** Length of a reward epoch in blocks (1,051,200). Additive. */
  epochBlocks?: number;
  /** 1-based number of the upcoming reduction. Additive. */
  index?: number;
  /** Maximum number of reductions the schedule has (20). Additive. */
  of?: number;
}

export interface RewardSchedule {
  /** FLUX created per block now, all outputs included. */
  perBlock: number;
  /** FLUX paid per block to the one node of each tier. */
  perTier: TierCounts;
  /** FLUX per block to the development fund. */
  devFund: number;
  /** null when unknown or when the schedule has no further reductions. */
  nextReduction: NextReduction | null;
}

export interface NodeStats {
  total: number;
  tiers: TierCounts;
  /** Collateral in FLUX needed per tier. */
  collateral: TierCounts;
  /** Distinct countries with a located node, null until geo data exists. */
  countries: number | null;
}

export interface CapacityStats {
  cores: number;
  ramTb: number;
  ssdTb: number;
  /** Nodes whose benchmark passed and that are summed above (a subset of nodes.total). Additive. */
  reporting?: number;
}

export interface AppsStats {
  /** Apps registered on chain. */
  registered: number | null;
  /** Apps with at least one running instance. */
  running: number | null;
}

export interface MarketStats {
  priceUsd: number;
  change24hPct: number | null;
  marketCapUsd: number | null;
}

export interface NetworkSnapshot {
  chain: ChainInfo;
  rewards: RewardSchedule;
  nodes: NodeStats;
  capacity: CapacityStats | null;
  apps: AppsStats | null;
  market: MarketStats | null;
  versions: { fluxos: string | null; daemon: string | null };
  /**
   * When each section was last refreshed from upstream (ISO-8601 UTC), null when the section is null or
   * has never been fetched. The envelope `meta` describes the snapshot as a whole; this lets the UI label
   * individual tiles honestly (price is minutes old, capacity is an hourly figure). Additive.
   */
  freshness?: {
    chain: string | null;
    nodes: string | null;
    capacity: string | null;
    apps: string | null;
    market: string | null;
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/geo
// ---------------------------------------------------------------------------

export interface GeoPoint {
  lat: number;
  lon: number;
  /** Nodes clustered into this point. */
  n: number;
  /**
   * ISO 3166-1 alpha-2 of the dominant country among the nodes in this point. Clusters are keyed by
   * country as well as by grid cell, so a point rarely straddles two countries. Omitted when unknown.
   */
  cc?: string;
  /** [cumulus, nimbus, stratus] counts inside this point. */
  t: [number, number, number];
}

export interface GeoCountry {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  nodes: number;
  tiers: TierCounts;
}

export interface GeoSnapshot {
  /** Nodes with a usable location. */
  located: number;
  /** All nodes the server counted, located or not. */
  total: number;
  countries: GeoCountry[];
  /** Clustered to a coarse grid server side; at most a few hundred points. */
  points: GeoPoint[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/blocks
// ---------------------------------------------------------------------------

export interface BlockSummary {
  height: number;
  /** ISO-8601 UTC. */
  time: string;
  /** Seconds since the previous block, null for the oldest entry. */
  intervalSec: number | null;
  txCount: number | null;
}

export interface BlocksSnapshot {
  /** Newest last. Whatever the server has buffered, up to 120 entries. */
  blocks: BlockSummary[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/health   (community app health checks)
// ---------------------------------------------------------------------------

export type HealthState = 'up' | 'degraded' | 'down' | 'unknown';

export interface AppHealth {
  /** CommunityApp.id from shared/catalog.ts. */
  id: string;
  state: HealthState;
  httpStatus: number | null;
  latencyMs: number | null;
  /** ISO-8601 UTC of the last probe. */
  checkedAt: string | null;
  /** ISO-8601 UTC since which `state` has held, when known. */
  since: string | null;
}

export interface AppsHealthSnapshot {
  apps: AppHealth[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/stream   (Server-Sent Events)
// ---------------------------------------------------------------------------
// Wire format is standard SSE: `event: <type>` then `data: <json>`. The server
// sends a `hello` first, then events as they happen, plus a `: ping` comment
// and an `event: ping` frame every 20 s. Browsers reconnect on their own;
// `hello` makes that idempotent.
//
// `network` and `health` events carry the SAME Envelope<T> the REST endpoints
// return, with `meta.source` exactly what REST would say at that moment, so a
// streamed payload is never labelled `live` unless it came from a live
// upstream fetch within its freshness window.

export interface BlockEvent {
  height: number;
  /** ISO-8601 UTC time of the block header. */
  time: string;
  txCount: number | null;
}

export interface HelloEvent {
  /** ISO-8601 UTC server clock, so clients can correct for skew. */
  serverTime: string;
  /** Raw snapshot (kept for compatibility); its freshness is in `networkMeta`. */
  network: NetworkSnapshot | null;
  /** Raw snapshot (kept for compatibility); its freshness is in `healthMeta`. */
  health: AppsHealthSnapshot | null;
  /** Same semantics as `Envelope.meta` for `network`. Additive. */
  networkMeta?: Meta | null;
  /** Same semantics as `Envelope.meta` for `health`. Additive. */
  healthMeta?: Meta | null;
}

export type StreamEvent =
  | { type: 'hello'; data: HelloEvent }
  | { type: 'block'; data: BlockEvent }
  | { type: 'network'; data: Envelope<NetworkSnapshot> }
  | { type: 'health'; data: Envelope<AppsHealthSnapshot> }
  | { type: 'ping'; data: Record<string, never> };

export const STREAM_EVENT_TYPES = ['hello', 'block', 'network', 'health', 'ping'] as const;

// ---------------------------------------------------------------------------
// GET /api/v1/info
// ---------------------------------------------------------------------------

export interface UpstreamStatus {
  ok: boolean;
  lastOkAt: string | null;
  lastError: string | null;
}

export interface ServiceInfo {
  name: string;
  version: string;
  startedAt: string;
  uptimeSec: number;
  upstream: Record<string, UpstreamStatus>;
  /** `fixtures` when the server runs offline with simulated data (dev and CI only). Additive. */
  mode?: 'live' | 'fixtures';
  /** Currently connected SSE clients. Additive. */
  sseClients?: number;
}
