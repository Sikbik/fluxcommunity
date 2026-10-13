import { type Upstream, UpstreamError } from '../core/upstream.ts';

/**
 * Client for the FluxOS daemon RPC proxy (api.runonflux.io `/daemon/*`).
 *
 * Quirks handled here (all re-verified live on 2026-10-12, see server/README.md):
 * - Errors arrive as HTTP 200 with `{"status":"error","data":{code,name,message}}`.
 * - Success bodies are `{"status":"success","data":...}`; some `data` values are JSON-encoded strings.
 * - Two cache layers sit in front of fluxd: apicache (30 s, keyed on the full URL, so a unique `nc` query
 *   string bypasses it) and a 20 s daemon RPC cache that only stores SUCCESSFUL results. `getblockhash`
 *   for a height that does not exist yet is an error, errors are never cached, so polling
 *   `getblockhash/<tip+1>?nc=...` sees a new block the moment fluxd has it.
 * - `getblock` is cached for 1 h keyed by hash or height, so it is never stale for a given block.
 */

export interface DaemonBlock {
  hash: string;
  height: number;
  /** Unix seconds from the block header. */
  time: number;
  txCount: number | null;
  previousHash: string | null;
}

export interface NodeCounts {
  total: number;
  cumulus: number;
  nimbus: number;
  stratus: number;
}

type Envelope = { status?: unknown; data?: unknown };

const isEnvelope = (b: unknown): b is Envelope => typeof b === 'object' && b !== null && 'status' in b;

/** fluxd error code for "Block height out of range": the expected answer for a block not yet mined. */
const OUT_OF_RANGE = -8;

function errorInfo(data: unknown): { code?: number; message: string } {
  if (typeof data === 'object' && data !== null) {
    const d = data as { code?: unknown; message?: unknown };
    return {
      code: typeof d.code === 'number' ? d.code : undefined,
      message: typeof d.message === 'string' ? d.message : 'unknown error',
    };
  }
  return { message: typeof data === 'string' ? data.slice(0, 120) : 'unknown error' };
}

/** A body counts as an upstream failure unless it is a success or the expected "out of range" error. */
function isFailure(body: unknown): boolean {
  if (!isEnvelope(body)) return true;
  if (body.status === 'success') return false;
  return errorInfo(body.data).code !== OUT_OF_RANGE;
}

/** `data` may be a JSON-encoded string for object-valued RPCs; decode it when it clearly is one. */
export function decodeData(data: unknown): unknown {
  if (typeof data === 'string') {
    const t = data.trimStart();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
  }
  return data;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function cacheBuster(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class DaemonApi {
  readonly upstream: Upstream;

  constructor(upstream: Upstream) {
    this.upstream = upstream;
  }

  async #call(
    path: string,
    bust = true,
  ): Promise<{ ok: true; data: unknown } | { ok: false; code?: number }> {
    const res = await this.upstream.json({
      path: `/daemon/${path}`,
      query: bust ? { nc: cacheBuster() } : undefined,
      isFailure,
    });
    const body = res.body as Envelope;
    if (body.status === 'success') return { ok: true, data: decodeData(body.data) };
    return { ok: false, code: errorInfo(body.data).code };
  }

  /** Tip height as the daemon reports it (can lag the true tip by up to ~20 s because of the RPC cache). */
  async blockCount(): Promise<number> {
    const r = await this.#call('getblockcount');
    const n = r.ok ? num(r.data) : null;
    if (n === null || n < 0) throw new UpstreamError('invalid', 'getblockcount returned no height');
    return n;
  }

  /** Hash at `height`, or null when that block does not exist yet. */
  async blockHash(height: number): Promise<string | null> {
    const r = await this.#call(`getblockhash/${height}`);
    if (!r.ok) {
      if (r.code === OUT_OF_RANGE) return null;
      throw new UpstreamError('invalid', `getblockhash/${height} failed`);
    }
    if (typeof r.data !== 'string' || !/^[0-9a-f]{64}$/.test(r.data)) {
      throw new UpstreamError('invalid', 'getblockhash returned a malformed hash');
    }
    return r.data;
  }

  /** Block by hash or height at verbosity 1 (header fields plus txids, about 2 KB). */
  async block(hashOrHeight: string | number): Promise<DaemonBlock | null> {
    // No cache buster: getblock is cached 1 h by hash or height upstream, a unique URL would only add load.
    const r = await this.#call(`getblock/${hashOrHeight}/1`, false);
    if (!r.ok) {
      if (r.code === OUT_OF_RANGE) return null;
      throw new UpstreamError('invalid', `getblock/${hashOrHeight} failed`);
    }
    const d = r.data as Record<string, unknown> | null;
    const height = num(d?.height);
    const time = num(d?.time);
    if (!d || typeof d.hash !== 'string' || height === null || time === null) {
      throw new UpstreamError('invalid', 'getblock returned a malformed block');
    }
    return {
      hash: d.hash,
      height,
      time,
      txCount: Array.isArray(d.tx) ? d.tx.length : null,
      previousHash: typeof d.previousblockhash === 'string' ? d.previousblockhash : null,
    };
  }

  async nodeCount(): Promise<NodeCounts> {
    const r = await this.#call('getfluxnodecount');
    const d = (r.ok ? r.data : null) as Record<string, unknown> | null;
    if (!d) throw new UpstreamError('invalid', 'getfluxnodecount failed');
    const cumulus = num(d['cumulus-enabled'] ?? d['basic-enabled']);
    const nimbus = num(d['nimbus-enabled'] ?? d['super-enabled']);
    const stratus = num(d['stratus-enabled'] ?? d['bamf-enabled']);
    if (cumulus === null || nimbus === null || stratus === null) {
      throw new UpstreamError('invalid', 'getfluxnodecount is missing tier counts');
    }
    const sum = cumulus + nimbus + stratus;
    const reported = num(d.total);
    // `total` is authoritative when present, but a total below the tier sum is nonsense.
    const total = reported !== null && reported >= sum ? reported : sum;
    if (total <= 0) throw new UpstreamError('invalid', 'getfluxnodecount returned zero nodes');
    return { total, cumulus, nimbus, stratus };
  }

  /** `getblocksubsidy` for a height. Post-PoN it reports only the total (`miner`), in FLUX. */
  async subsidy(height: number): Promise<number> {
    const r = await this.#call(`getblocksubsidy/${height}`);
    const d = (r.ok ? r.data : null) as Record<string, unknown> | null;
    const miner = num(d?.miner);
    if (miner === null || miner <= 0) throw new UpstreamError('invalid', 'getblocksubsidy failed');
    return miner;
  }
}
