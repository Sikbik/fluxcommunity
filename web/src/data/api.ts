/**
 * Typed REST client for the Flux Community API. The only module that issues one-shot requests.
 *
 * - Every call has a timeout (AbortController) and a small retry with jitter.
 * - The envelope is validated structurally (see validate.ts). A bad payload is an error result,
 *   never a half-built object.
 * - Nothing throws: callers always get an `ApiResult`.
 */

import type { AppsHealthSnapshot, BlocksSnapshot, Envelope, GeoSnapshot, NetworkSnapshot } from '@shared/api';
import { API_PATHS } from '@shared/api';
import { type Parsed, parseBlocks, parseEnvelope, parseGeo, parseHealth, parseNetwork } from './validate';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid' | 'aborted';

export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  /** From a Retry-After header on 429/503, in milliseconds. */
  retryAfterMs?: number;
}

export type ApiResult<T> =
  | { ok: true; envelope: Envelope<T>; requestStartedAt: number; receivedAt: number }
  | { ok: false; error: ApiError; requestStartedAt: number; receivedAt: number };

export interface ApiOptions {
  fetch?: typeof fetch;
  /** Prefix for every path. Empty means same origin, which is what production uses. */
  baseUrl?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first (so 1 means at most two requests). */
  retries?: number;
  /** First retry delay; doubles each time, plus up to 50 percent jitter. */
  retryBaseMs?: number;
  random?: () => number;
  /** Test seam: replaces the real delay between attempts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Override the client's retry count for this call. */
  retries?: number;
}

export interface ApiClient {
  network(opts?: RequestOptions): Promise<ApiResult<NetworkSnapshot>>;
  geo(opts?: RequestOptions): Promise<ApiResult<GeoSnapshot>>;
  blocks(opts?: RequestOptions): Promise<ApiResult<BlocksSnapshot>>;
  health(opts?: RequestOptions): Promise<ApiResult<AppsHealthSnapshot>>;
}

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_BASE_MS = 400;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, Math.min(secs, 120)) * 1000;
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, Math.min(when - Date.now(), 120_000)) : undefined;
}

function retryable(e: ApiError): boolean {
  if (e.kind === 'network' || e.kind === 'timeout') return true;
  if (e.kind === 'http') return e.status === 408 || e.status === 429 || (e.status ?? 0) >= 500;
  return false;
}

export function createApiClient(options: ApiOptions = {}): ApiClient {
  const doFetch = options.fetch;
  const baseUrl = options.baseUrl ?? '';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const defaultRetries = options.retries ?? DEFAULT_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  async function attempt<T>(
    path: string,
    parse: (v: unknown) => Parsed<T>,
    external: AbortSignal | undefined,
  ): Promise<{ ok: true; envelope: Envelope<T> } | { ok: false; error: ApiError }> {
    const f = doFetch ?? globalThis.fetch;
    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    if (external?.aborted) return { ok: false, error: { kind: 'aborted', message: 'aborted' } };
    external?.addEventListener('abort', onExternalAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const res = await f(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        return {
          ok: false,
          error: {
            kind: 'http',
            message: `HTTP ${res.status}`,
            status: res.status,
            retryAfterMs: parseRetryAfter(res),
          },
        };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, error: { kind: 'invalid', message: 'response is not JSON' } };
      }
      const parsed = parseEnvelope(body, parse);
      if (!parsed.ok) return { ok: false, error: { kind: 'invalid', message: parsed.reason } };
      return { ok: true, envelope: parsed.value };
    } catch (e) {
      if (timedOut)
        return { ok: false, error: { kind: 'timeout', message: `timed out after ${timeoutMs} ms` } };
      if (external?.aborted) return { ok: false, error: { kind: 'aborted', message: 'aborted' } };
      return {
        ok: false,
        error: { kind: 'network', message: e instanceof Error ? e.message : 'network error' },
      };
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }
  }

  async function get<T>(
    path: string,
    parse: (v: unknown) => Parsed<T>,
    opts: RequestOptions = {},
  ): Promise<ApiResult<T>> {
    const requestStartedAt = Date.now();
    const maxRetries = opts.retries ?? defaultRetries;
    let last: ApiError = { kind: 'network', message: 'no attempt made' };
    for (let i = 0; i <= maxRetries; i++) {
      const r = await attempt(path, parse, opts.signal);
      if (r.ok) return { ok: true, envelope: r.envelope, requestStartedAt, receivedAt: Date.now() };
      last = r.error;
      if (!retryable(last) || i === maxRetries) break;
      const wait = retryBaseMs * 2 ** i * (1 + random() * 0.5);
      await sleep(wait, opts.signal);
      if (opts.signal?.aborted) {
        last = { kind: 'aborted', message: 'aborted' };
        break;
      }
    }
    return { ok: false, error: last, requestStartedAt, receivedAt: Date.now() };
  }

  return {
    network: (o) => get(API_PATHS.network, parseNetwork, o),
    geo: (o) => get(API_PATHS.geo, parseGeo, o),
    blocks: (o) => get(API_PATHS.blocks, parseBlocks, o),
    health: (o) => get(API_PATHS.health, parseHealth, o),
  };
}
