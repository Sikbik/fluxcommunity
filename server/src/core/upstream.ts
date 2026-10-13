import { BreakerOpenError, CircuitBreaker } from './breaker.ts';
import { type Clock, systemClock } from './clock.ts';
import { errText, type Logger, silentLogger } from './log.ts';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type UpstreamErrorKind = 'http' | 'timeout' | 'network' | 'parse' | 'size' | 'envelope' | 'invalid';

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status?: number;
  readonly code?: number;
  constructor(kind: UpstreamErrorKind, message: string, extra: { status?: number; code?: number } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
  }
}

export interface UpstreamOptions {
  name: string;
  /** Base URLs, tried in order. The one that last answered is preferred next time. */
  bases: string[];
  timeoutMs: number;
  userAgent: string;
  maxBytes?: number;
  fetch?: FetchLike;
  clock?: Clock;
  log?: Logger;
  breaker?: CircuitBreaker;
}

export interface JsonRequest {
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Classify a parsed body as a failure for circuit-breaker and status purposes. */
  isFailure?: (body: unknown) => boolean;
}

export interface JsonResult {
  status: number;
  body: unknown;
  headers: Headers;
  /** True for a 304 answer to a conditional request (body is null). */
  notModified: boolean;
}

export interface UpstreamStatusSnapshot {
  ok: boolean;
  lastOkAt: number | null;
  lastError: string | null;
}

/**
 * One external service: base URL failover, per-call timeouts, response size cap, a circuit breaker and a
 * status record for /api/v1/info. It never retries on its own; callers own retry policy through their
 * loops so one slow upstream cannot stack requests up.
 */
export class Upstream {
  readonly name: string;
  readonly breaker: CircuitBreaker;
  readonly #bases: string[];
  readonly #timeoutMs: number;
  readonly #ua: string;
  readonly #maxBytes: number;
  readonly #fetch: FetchLike;
  readonly #clock: Clock;
  readonly #log: Logger;
  #preferred = 0;
  #lastOkAt: number | null = null;
  #lastError: string | null = null;
  #ok = false;

  constructor(opts: UpstreamOptions) {
    this.name = opts.name;
    this.#bases = opts.bases;
    this.#timeoutMs = opts.timeoutMs;
    this.#ua = opts.userAgent;
    this.#maxBytes = opts.maxBytes ?? 16 * 1024 * 1024;
    this.#fetch = opts.fetch ?? ((i, init) => fetch(i, init));
    this.#clock = opts.clock ?? systemClock;
    this.#log = (opts.log ?? silentLogger).child({ upstream: opts.name });
    this.breaker =
      opts.breaker ??
      new CircuitBreaker({
        name: opts.name,
        clock: this.#clock,
        onChange: (state, info) => {
          const level = state === 'open' ? 'warn' : 'info';
          this.#log[level]('circuit', { state, ...info });
        },
      });
  }

  status(): UpstreamStatusSnapshot {
    return { ok: this.#ok, lastOkAt: this.#lastOkAt, lastError: this.#lastError };
  }

  /** GET a JSON document. Rejects with UpstreamError or BreakerOpenError; resolves only on a usable answer. */
  async json(req: JsonRequest): Promise<JsonResult> {
    if (!this.breaker.allow()) {
      const err = new BreakerOpenError(this.name, this.breaker.retryAfterMs);
      this.#ok = false;
      this.#lastError ??= errText(err);
      throw err;
    }
    let lastErr: unknown;
    const n = this.#bases.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.#preferred + i) % n;
      try {
        const res = await this.#once(this.#bases[idx] as string, req);
        if (req.isFailure?.(res.body)) {
          throw new UpstreamError('envelope', `upstream reported an error for ${req.path}`);
        }
        this.#preferred = idx;
        this.#ok = true;
        this.#lastOkAt = this.#clock.now();
        this.#lastError = null;
        this.breaker.success();
        return res;
      } catch (err) {
        lastErr = err;
        // An envelope-level failure is the daemon speaking, not a transport problem: no failover.
        if (err instanceof UpstreamError && err.kind === 'envelope') break;
      }
    }
    this.#ok = false;
    this.#lastError = errText(lastErr);
    this.breaker.failure();
    throw lastErr;
  }

  async #once(base: string, req: JsonRequest): Promise<JsonResult> {
    const url = new URL(base + req.path);
    for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-encoding': 'br, gzip',
      'user-agent': this.#ua,
      ...req.headers,
    };
    let res: Response;
    try {
      res = await this.#fetch(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(req.timeoutMs ?? this.#timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new UpstreamError('timeout', `timeout calling ${this.name} ${req.path}`);
      }
      throw new UpstreamError('network', `${this.name} ${req.path}: ${errText(err)}`);
    }
    if (res.status === 304) {
      void res.body?.cancel().catch(() => {});
      return { status: 304, body: null, headers: res.headers, notModified: true };
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      throw new UpstreamError('http', `${this.name} ${req.path}: HTTP ${res.status}`, { status: res.status });
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > this.#maxBytes) {
      void res.body?.cancel().catch(() => {});
      throw new UpstreamError('size', `${this.name} ${req.path}: response too large (${declared} bytes)`);
    }
    const text = await this.#readText(res, req.path);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new UpstreamError('parse', `${this.name} ${req.path}: body is not JSON`);
    }
    return { status: res.status, body, headers: res.headers, notModified: false };
  }

  async #readText(res: Response, path: string): Promise<string> {
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.#maxBytes) {
          void reader.cancel().catch(() => {});
          throw new UpstreamError('size', `${this.name} ${path}: response exceeds ${this.#maxBytes} bytes`);
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      const name = (err as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new UpstreamError('timeout', `timeout reading ${this.name} ${path}`);
      }
      throw new UpstreamError('network', `${this.name} ${path}: ${errText(err)}`);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
