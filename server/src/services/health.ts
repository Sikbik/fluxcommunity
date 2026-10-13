import type { AppHealth, AppsHealthSnapshot, HealthState } from '../../../shared/api.ts';
import { type CommunityApp, probeUrl } from '../../../shared/catalog.ts';
import { type Clock, jitter, systemClock } from '../core/clock.ts';
import { errText, type Logger, silentLogger } from '../core/log.ts';
import { type Loop, startLoop } from '../core/loop.ts';
import { type ProbeResponse, probeRequest } from './probe-http.ts';

// ---------------------------------------------------------------------------
// Classification (pure)
// ---------------------------------------------------------------------------

export interface ProbeOutcome {
  /** HTTP status of the final response, null when no response arrived. */
  status: number | null;
  /** Milliseconds to response headers of the final request, null when no response arrived. */
  latencyMs: number | null;
  /** Short reason when there was no response (timeout, ENOTFOUND, cert error, blocked ...). */
  error?: string;
  /** The redirect chain was longer than allowed. */
  tooManyRedirects?: boolean;
}

export type RawState = 'up' | 'degraded' | 'down';

/**
 * up       2xx or 3xx faster than `slowMs`
 * degraded 2xx or 3xx slower than `slowMs`, a 4xx that is not 404 or 410 (the app answers but something is
 *          off, for example auth or rate limiting), or a redirect chain that never settles
 * down     5xx, 404, 410, any other status, timeout, DNS, TLS or connection failure
 */
export function classify(o: ProbeOutcome, slowMs = 2_500): RawState {
  if (o.status === null) return 'down';
  const s = o.status;
  if (s >= 200 && s < 400) {
    if (o.tooManyRedirects) return 'degraded';
    return (o.latencyMs ?? 0) < slowMs ? 'up' : 'degraded';
  }
  if (s >= 400 && s < 500 && s !== 404 && s !== 410) return 'degraded';
  return 'down';
}

export interface HealthRecord {
  state: HealthState;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: string | null;
  since: string | null;
  /** Consecutive probes that classified as down. */
  failStreak: number;
}

export const FAILURES_TO_DOWN = 2;

export function initialRecord(): HealthRecord {
  return { state: 'unknown', httpStatus: null, latencyMs: null, checkedAt: null, since: null, failStreak: 0 };
}

/**
 * Applies one probe to a record with flap damping: `down` needs two consecutive down results; a single
 * failure keeps the previous state (but still records what was seen) and is reported as `pending`.
 */
export function applyProbe(
  prev: HealthRecord,
  raw: RawState,
  outcome: ProbeOutcome,
  nowMs: number,
): { next: HealthRecord; pending: boolean } {
  const iso = new Date(nowMs).toISOString();
  let state: HealthState;
  let failStreak = 0;
  let pending = false;
  if (raw === 'down') {
    failStreak = prev.failStreak + 1;
    if (failStreak >= FAILURES_TO_DOWN || prev.state === 'down') state = 'down';
    else {
      state = prev.state;
      pending = true;
    }
  } else {
    state = raw;
  }
  const since = state === prev.state && prev.since !== null ? prev.since : state === 'unknown' ? null : iso;
  return {
    next: {
      state,
      httpStatus: outcome.status,
      latencyMs: outcome.latencyMs,
      checkedAt: iso,
      since,
      failStreak,
    },
    pending,
  };
}

// ---------------------------------------------------------------------------
// Probing one URL: HEAD then GET fallback, bounded redirects
// ---------------------------------------------------------------------------

export type Transport = (url: URL, method: 'HEAD' | 'GET', timeoutMs: number) => Promise<ProbeResponse>;

export interface ProbeOptions {
  timeoutMs: number;
  maxRedirects: number;
  transport: Transport;
  clock?: Clock;
}

function isRetryableHeadError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || code === 'EPIPE';
}

function errorReason(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  if (e?.code) return String(e.code);
  return errText(err);
}

async function request(
  start: URL,
  method: 'HEAD' | 'GET',
  o: ProbeOptions,
): Promise<ProbeOutcome & { cause?: unknown }> {
  const clock = o.clock ?? systemClock;
  const deadline = clock.now() + o.timeoutMs;
  let url = start;
  let hops = 0;
  for (;;) {
    const remaining = Math.max(250, deadline - clock.now());
    const t0 = clock.now();
    let res: ProbeResponse;
    try {
      res = await o.transport(url, method, remaining);
    } catch (err) {
      return { status: null, latencyMs: null, error: errorReason(err), cause: err };
    }
    const latencyMs = Math.max(0, clock.now() - t0);
    const isRedirect = res.status >= 300 && res.status < 400 && res.status !== 304 && res.location !== null;
    if (!isRedirect) return { status: res.status, latencyMs };
    if (hops >= o.maxRedirects) return { status: res.status, latencyMs, tooManyRedirects: true };
    let next: URL;
    try {
      next = new URL(res.location as string, url);
    } catch {
      return { status: res.status, latencyMs };
    }
    const defaultPort = (u: URL) => (u.port === '' ? (u.protocol === 'https:' ? '443' : '80') : u.port);
    const portOk = defaultPort(next) === defaultPort(start) || ['80', '443'].includes(defaultPort(next));
    if ((next.protocol !== 'http:' && next.protocol !== 'https:') || !portOk) {
      return { status: null, latencyMs: null, error: 'redirect to a disallowed target' };
    }
    url = next;
    hops += 1;
  }
}

/**
 * Probes `urlStr`: HEAD first (cheap), GET when HEAD fails to show success because some servers mishandle
 * HEAD (405/403/404/5xx) or reset the connection. The GET result is authoritative when it runs.
 */
export async function probeUrlOnce(urlStr: string, o: ProbeOptions): Promise<ProbeOutcome> {
  const url = new URL(urlStr);
  const head = await request(url, 'HEAD', o);
  const good = head.status !== null && head.status >= 200 && head.status < 400;
  if (good) return strip(head);
  const retry = head.status !== null || isRetryableHeadError(head.cause);
  if (!retry) return strip(head);
  return strip(await request(url, 'GET', o));
}

function strip(o: ProbeOutcome & { cause?: unknown }): ProbeOutcome {
  const { cause: _cause, ...rest } = o;
  return rest;
}

// ---------------------------------------------------------------------------
// The prober service
// ---------------------------------------------------------------------------

export interface HealthProberOptions {
  apps: readonly CommunityApp[];
  intervalMs: number;
  concurrency: number;
  timeoutMs: number;
  maxRedirects: number;
  slowMs: number;
  confirmDelayMs: number;
  userAgent: string;
  transport?: Transport;
  /** Tests only: allow loopback targets. */
  allowPrivate?: boolean;
  clock?: Clock;
  log?: Logger;
  rand?: () => number;
}

export const PROBE_USER_AGENT = 'FluxCommunityHealth/2.0 (+https://community.app.runonflux.io)';

export class HealthProber {
  readonly #o: HealthProberOptions;
  readonly #clock: Clock;
  readonly #log: Logger;
  readonly #transport: Transport;
  readonly #records = new Map<string, HealthRecord>();
  readonly #targets: { id: string; url: string }[] = [];
  readonly #listeners = new Set<(snapshot: AppsHealthSnapshot) => void>();
  readonly #confirmTimers = new Map<string, NodeJS.Timeout>();
  #loop: Loop | null = null;
  #lastRoundAt: number | null = null;
  #stopped = false;
  #version = 0;

  constructor(opts: HealthProberOptions) {
    this.#o = opts;
    this.#clock = opts.clock ?? systemClock;
    this.#log = (opts.log ?? silentLogger).child({ svc: 'health' });
    this.#transport =
      opts.transport ??
      ((url, method, timeoutMs) =>
        probeRequest(url, {
          method,
          timeoutMs,
          userAgent: opts.userAgent,
          allowPrivate: opts.allowPrivate,
        }));
    for (const app of opts.apps) {
      this.#records.set(app.id, initialRecord());
      const url = probeUrl(app);
      if (url !== null) this.#targets.push({ id: app.id, url });
    }
  }

  /** Number of apps that are probed (catalog apps with a probe URL). */
  get targetCount(): number {
    return this.#targets.length;
  }

  /** Increments on every probe result; lets callers cache derived output. */
  get version(): number {
    return this.#version;
  }

  get lastRoundAt(): number | null {
    return this.#lastRoundAt;
  }

  /** ms epoch of the newest probe of any app, null when nothing was probed yet. */
  get lastCheckedAt(): number | null {
    let max: number | null = null;
    for (const r of this.#records.values()) {
      if (r.checkedAt) {
        const t = Date.parse(r.checkedAt);
        if (max === null || t > max) max = t;
      }
    }
    return max;
  }

  snapshot(): AppsHealthSnapshot {
    const apps: AppHealth[] = [];
    for (const app of this.#o.apps) {
      const r = this.#records.get(app.id) as HealthRecord;
      apps.push({
        id: app.id,
        state: r.state,
        httpStatus: r.httpStatus,
        latencyMs: r.latencyMs,
        checkedAt: r.checkedAt,
        since: r.since,
      });
    }
    return { apps };
  }

  onChange(fn: (snapshot: AppsHealthSnapshot) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  start(): void {
    if (this.#loop || this.#targets.length === 0) return;
    this.#stopped = false;
    this.#loop = startLoop({
      name: 'health',
      intervalMs: this.#o.intervalMs,
      // The first round runs shortly after boot so the page has real statuses within seconds.
      initialDelayMs: jitter(1_500, 0.5, this.#o.rand),
      jitterRatio: 0.15,
      rand: this.#o.rand,
      run: async () => {
        await this.runRound();
        return true;
      },
      onError: (err) => this.#log.error('round failed', { err: errText(err) }),
    });
  }

  stop(): void {
    this.#stopped = true;
    this.#loop?.stop();
    this.#loop = null;
    for (const t of this.#confirmTimers.values()) clearTimeout(t);
    this.#confirmTimers.clear();
  }

  /** Probe every target once with bounded concurrency. Never throws. */
  async runRound(): Promise<void> {
    const queue = [...this.#targets];
    const workers = Array.from({ length: Math.min(this.#o.concurrency, queue.length) }, async () => {
      for (;;) {
        const t = queue.shift();
        if (!t || this.#stopped) return;
        await this.probeApp(t.id);
      }
    });
    await Promise.all(workers);
    this.#lastRoundAt = this.#clock.now();
  }

  /** Probe one app now and fold the result into its record. */
  async probeApp(id: string): Promise<HealthRecord> {
    const target = this.#targets.find((t) => t.id === id);
    const prev = this.#records.get(id);
    if (!target || !prev) throw new Error(`unknown probe target ${id}`);
    let outcome: ProbeOutcome;
    try {
      outcome = await probeUrlOnce(target.url, {
        timeoutMs: this.#o.timeoutMs,
        maxRedirects: this.#o.maxRedirects,
        transport: this.#transport,
        clock: this.#clock,
      });
    } catch (err) {
      outcome = { status: null, latencyMs: null, error: errorReason(err) };
    }
    const raw = classify(outcome, this.#o.slowMs);
    const { next, pending } = applyProbe(prev, raw, outcome, this.#clock.now());
    this.#records.set(id, next);
    this.#version += 1;
    if (next.state !== prev.state) {
      this.#log.info('state', {
        app: id,
        from: prev.state,
        to: next.state,
        status: next.httpStatus,
        err: outcome.error,
      });
      this.#emit();
    }
    if (pending && !this.#stopped) this.#scheduleConfirm(id);
    return next;
  }

  #scheduleConfirm(id: string): void {
    if (this.#confirmTimers.has(id)) return;
    const t = setTimeout(
      () => {
        this.#confirmTimers.delete(id);
        if (!this.#stopped) void this.probeApp(id).catch(() => {});
      },
      jitter(this.#o.confirmDelayMs, 0.2, this.#o.rand),
    );
    this.#confirmTimers.set(id, t);
  }

  #emit(): void {
    const snap = this.snapshot();
    for (const fn of this.#listeners) {
      try {
        fn(snap);
      } catch (err) {
        this.#log.warn('listener failed', { err: errText(err) });
      }
    }
  }
}
