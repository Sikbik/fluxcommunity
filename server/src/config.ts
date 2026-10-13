import { resolve } from 'node:path';
import type { LogLevel } from './core/log.ts';
import { parseTrustProxy, TRUST_FDM, type TrustProxy } from './http/trust.ts';

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export interface Config {
  port: number;
  host: string;
  /** Absolute path of the built web bundle (may not exist: the server then runs API only). */
  webDist: string;
  logLevel: LogLevel;
  /** Which peers may name the visitor in X-Forwarded-For. Default: the Flux (FDM) app balancers only. */
  trustProxy: TrustProxy;
  /** Allowed CORS origins, or '*'. Empty = no CORS headers at all. */
  corsOrigins: string[] | '*';
  /** Offline mode with deterministic simulated data. Dev and CI only. */
  fixtures: boolean;
  /** Add `blob:` to worker-src (only if the web app spawns blob workers). */
  cspWorkerBlob: boolean;
  upstream: {
    /** Flux daemon API bases, tried in order on failure (api.runonflux.io fronts a load balancer). */
    fluxApi: string[];
    stats: string;
    coingecko: string;
    timeoutMs: number;
    userAgent: string;
  };
  intervals: {
    /** Block detection poll while a block is imminent / otherwise. */
    blockFastMs: number;
    blockSlowMs: number;
    networkMs: number;
    fleetMs: number;
    priceMs: number;
    appsRunningMs: number;
    appsRegisteredMs: number;
    healthMs: number;
  };
  health: {
    concurrency: number;
    timeoutMs: number;
    maxRedirects: number;
    slowMs: number;
    /** Delay before the confirmation re-probe after a first failure. */
    confirmDelayMs: number;
  };
  limits: {
    rateBurst: number;
    rateRefillPerSec: number;
    sseMaxClients: number;
    sseMaxPerIp: number;
    /** Bytes buffered for one SSE client before it is dropped as a slow consumer. */
    sseMaxBufferBytes: number;
    sseHeartbeatMs: number;
    compressCacheBytes: number;
  };
}

type Env = Record<string, string | undefined>;

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

class Reader {
  readonly env: Env;
  readonly problems: string[] = [];
  constructor(env: Env) {
    this.env = env;
  }
  str(key: string, def: string): string {
    const v = this.env[key];
    return v === undefined || v.trim() === '' ? def : v.trim();
  }
  int(key: string, def: number, min: number, max: number): number {
    const raw = this.env[key];
    if (raw === undefined || raw.trim() === '') return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      this.problems.push(`${key} must be an integer between ${min} and ${max} (got "${raw}")`);
      return def;
    }
    return n;
  }
  bool(key: string, def = false): boolean {
    const raw = this.env[key];
    if (raw === undefined || raw.trim() === '') return def;
    const v = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    this.problems.push(`${key} must be a boolean: 1/0, true/false (got "${raw}")`);
    return def;
  }
  url(key: string, def: string): string {
    const raw = this.str(key, def);
    return this.#checkUrl(key, raw, def);
  }
  urlList(key: string, def: string[]): string[] {
    const raw = this.env[key];
    if (raw === undefined || raw.trim() === '') return def;
    const out = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((u) => this.#checkUrl(key, u, ''));
    return out.filter(Boolean);
  }
  #checkUrl(key: string, raw: string, def: string): string {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
      return raw.replace(/\/+$/, '');
    } catch {
      this.problems.push(`${key} must be an http(s) URL (got "${raw}")`);
      return def;
    }
  }
}

export const DEFAULT_WEB_DIST = resolve(import.meta.dirname, '../../web/dist');

export function loadConfig(env: Env = process.env): Config {
  const r = new Reader(env);

  const port = r.int('PORT', 42069, 0, 65535);
  const host = r.str('HOST', '0.0.0.0');
  const webDist = resolve(r.str('WEB_DIST', DEFAULT_WEB_DIST));

  const levelRaw = r.str('LOG_LEVEL', 'info').toLowerCase();
  let logLevel: LogLevel = 'info';
  if ((LOG_LEVELS as readonly string[]).includes(levelRaw)) logLevel = levelRaw as LogLevel;
  else r.problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${levelRaw}")`);

  const trustRaw = r.str('TRUST_PROXY', '');
  const trusted = parseTrustProxy(trustRaw);
  if (trusted === null) {
    r.problems.push(
      `TRUST_PROXY must be fdm, false, true, a hop count 1-9, or a list of addresses and CIDR blocks (got "${trustRaw}")`,
    );
  }
  const trustProxy: TrustProxy = trusted ?? TRUST_FDM;

  let corsOrigins: string[] | '*' = [];
  const corsRaw = r.str('CORS_ORIGINS', '');
  if (corsRaw === '*') corsOrigins = '*';
  else if (corsRaw) {
    corsOrigins = [];
    for (const o of corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      try {
        const u = new URL(o);
        if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.origin !== o.replace(/\/+$/, '')) {
          throw new Error('not an origin');
        }
        corsOrigins.push(u.origin);
      } catch {
        r.problems.push(`CORS_ORIGINS entry "${o}" must be a bare origin like https://example.com`);
      }
    }
  }

  const config: Config = {
    port,
    host,
    webDist,
    logLevel,
    trustProxy,
    corsOrigins,
    fixtures: r.bool('FIXTURES', false),
    cspWorkerBlob: r.bool('CSP_WORKER_BLOB', false),
    upstream: {
      fluxApi: r.urlList('FLUX_API_URLS', ['https://api.runonflux.io']),
      stats: r.url('FLUX_STATS_URL', 'https://stats.runonflux.io'),
      coingecko: r.url('COINGECKO_URL', 'https://api.coingecko.com'),
      timeoutMs: r.int('UPSTREAM_TIMEOUT_MS', 10_000, 500, 60_000),
      userAgent: r.str(
        'UPSTREAM_USER_AGENT',
        'FluxCommunityPortal/2.0 (+https://community.app.runonflux.io)',
      ),
    },
    intervals: {
      blockFastMs: r.int('BLOCK_POLL_FAST_MS', 1_000, 250, 30_000),
      blockSlowMs: r.int('BLOCK_POLL_SLOW_MS', 3_000, 500, 60_000),
      networkMs: r.int('NETWORK_REFRESH_MS', 10_000, 2_000, 600_000),
      fleetMs: r.int('FLEET_REFRESH_MS', 300_000, 30_000, 3_600_000),
      priceMs: r.int('PRICE_REFRESH_MS', 60_000, 15_000, 3_600_000),
      appsRunningMs: r.int('APPS_RUNNING_REFRESH_MS', 600_000, 60_000, 86_400_000),
      appsRegisteredMs: r.int('APPS_REGISTERED_REFRESH_MS', 1_800_000, 60_000, 86_400_000),
      healthMs: r.int('HEALTH_INTERVAL_MS', 90_000, 10_000, 3_600_000),
    },
    health: {
      concurrency: r.int('HEALTH_CONCURRENCY', 4, 1, 16),
      timeoutMs: r.int('HEALTH_TIMEOUT_MS', 8_000, 1_000, 30_000),
      maxRedirects: r.int('HEALTH_MAX_REDIRECTS', 3, 0, 10),
      slowMs: r.int('HEALTH_SLOW_MS', 2_500, 100, 30_000),
      confirmDelayMs: r.int('HEALTH_CONFIRM_DELAY_MS', 10_000, 1_000, 120_000),
    },
    limits: {
      rateBurst: r.int('RATE_LIMIT_BURST', 150, 1, 100_000),
      rateRefillPerSec: r.int('RATE_LIMIT_RPS', 30, 1, 100_000),
      sseMaxClients: r.int('SSE_MAX_CLIENTS', 2_000, 1, 100_000),
      sseMaxPerIp: r.int('SSE_MAX_PER_IP', 8, 1, 1_000),
      sseMaxBufferBytes: r.int('SSE_MAX_BUFFER_BYTES', 262_144, 4_096, 16_777_216),
      sseHeartbeatMs: r.int('SSE_HEARTBEAT_MS', 20_000, 1_000, 120_000),
      compressCacheBytes: r.int('COMPRESS_CACHE_BYTES', 33_554_432, 0, 1_073_741_824),
    },
  };

  if (config.upstream.fluxApi.length === 0) r.problems.push('FLUX_API_URLS must list at least one URL');
  if (r.problems.length > 0) throw new ConfigError(r.problems);
  return config;
}
