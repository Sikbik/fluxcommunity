import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  API_PATHS,
  type AppsHealthSnapshot,
  type BlocksSnapshot,
  type Envelope,
  type GeoSnapshot,
  type NetworkSnapshot,
  type ServiceInfo,
  type StreamEvent,
  type UpstreamStatus,
} from '../../../shared/api.ts';
import type { Config } from '../config.ts';
import { type Clock, systemClock } from '../core/clock.ts';
import { errText, type Logger } from '../core/log.ts';
import type { SseHub } from '../services/hub.ts';
import { clientIp } from './client-ip.ts';
import type { CompressCache } from './compress.ts';
import type { RateLimiter } from './ratelimit.ts';
import { buildMeta, sendEnvelope, sendError, sendText } from './respond.ts';
import type { SecurityHeaders } from './security.ts';
import type { StaticSite } from './static.ts';

export interface Served<T> {
  data: T;
  asOfMs: number;
  source: 'live' | 'cache' | 'fallback';
}

/** Everything the HTTP layer needs to know about the world. Live and fixture modes both implement it. */
export interface Providers {
  network(): Served<NetworkSnapshot>;
  geo(): Served<GeoSnapshot>;
  blocks(): Served<BlocksSnapshot>;
  health(): Served<AppsHealthSnapshot>;
  windows: { networkMs: number; geoMs: number; blocksMs: number; healthMs: number };
  upstreamStatus(): Record<string, UpstreamStatus>;
}

export interface AppDeps {
  config: Config;
  log: Logger;
  providers: Providers;
  hub: SseHub;
  limiter: RateLimiter;
  security: SecurityHeaders;
  site: StaticSite;
  compressCache: CompressCache;
  info: { name: string; version: string; startedAt: number; mode: 'live' | 'fixtures' };
  clock?: Clock;
}

const CACHE = {
  network: 'public, max-age=5, stale-while-revalidate=30',
  geo: 'public, max-age=60, stale-while-revalidate=300',
  blocks: 'public, max-age=5, stale-while-revalidate=30',
  health: 'public, max-age=15, stale-while-revalidate=60',
  info: 'no-store',
} as const;

const MAX_URL_LENGTH = 2048;

/**
 * The same envelope REST would return for the network snapshot right now. Streamed `network` events and
 * the `hello` metadata use this, so a streamed payload can never claim fresher provenance than REST.
 */
export function networkEnvelope(p: Providers, nowMs: number): Envelope<NetworkSnapshot> {
  const s = p.network();
  return {
    data: s.data,
    meta: buildMeta({ asOfMs: s.asOfMs, source: s.source, windowMs: p.windows.networkMs, nowMs }),
  };
}

export function healthEnvelope(p: Providers, nowMs: number): Envelope<AppsHealthSnapshot> {
  const s = p.health();
  return {
    data: s.data,
    meta: buildMeta({ asOfMs: s.asOfMs, source: s.source, windowMs: p.windows.healthMs, nowMs }),
  };
}

export function createHandler(deps: AppDeps): (req: IncomingMessage, res: ServerResponse) => void {
  const { config, log, providers, hub, limiter, security, site, compressCache } = deps;
  const clock = deps.clock ?? systemClock;
  const jsonMemo = new WeakMap<object, string>();
  const dataJson = (data: object): string => {
    let s = jsonMemo.get(data);
    if (s === undefined) {
      s = JSON.stringify(data);
      jsonMemo.set(data, s);
    }
    return s;
  };

  const corsHeaders = (req: IncomingMessage): Record<string, string> => {
    const allow = config.corsOrigins;
    if (allow === '*') return { 'Access-Control-Allow-Origin': '*' };
    if (allow.length === 0) return {};
    const origin = req.headers.origin;
    if (typeof origin === 'string' && allow.includes(origin)) {
      return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin, Accept-Encoding' };
    }
    return {};
  };

  async function api(req: IncomingMessage, res: ServerResponse, path: string, ip: string): Promise<void> {
    const cors = corsHeaders(req);
    const now = clock.now();
    switch (path) {
      case API_PATHS.network: {
        const s = providers.network();
        return sendEnvelope(req, res, {
          dataJson: dataJson(s.data),
          meta: buildMeta({
            asOfMs: s.asOfMs,
            source: s.source,
            windowMs: providers.windows.networkMs,
            nowMs: now,
          }),
          cacheControl: CACHE.network,
          cache: compressCache,
          headers: cors,
        });
      }
      case API_PATHS.geo: {
        const s = providers.geo();
        return sendEnvelope(req, res, {
          dataJson: dataJson(s.data),
          meta: buildMeta({
            asOfMs: s.asOfMs,
            source: s.source,
            windowMs: providers.windows.geoMs,
            nowMs: now,
          }),
          cacheControl: CACHE.geo,
          cache: compressCache,
          headers: cors,
        });
      }
      case API_PATHS.blocks: {
        const s = providers.blocks();
        return sendEnvelope(req, res, {
          dataJson: dataJson(s.data),
          meta: buildMeta({
            asOfMs: s.asOfMs,
            source: s.source,
            windowMs: providers.windows.blocksMs,
            nowMs: now,
          }),
          cacheControl: CACHE.blocks,
          cache: compressCache,
          headers: cors,
        });
      }
      case API_PATHS.health: {
        const s = providers.health();
        return sendEnvelope(req, res, {
          dataJson: dataJson(s.data),
          meta: buildMeta({
            asOfMs: s.asOfMs,
            source: s.source,
            windowMs: providers.windows.healthMs,
            nowMs: now,
          }),
          cacheControl: CACHE.health,
          cache: compressCache,
          headers: cors,
        });
      }
      case API_PATHS.info: {
        const info: ServiceInfo = {
          name: deps.info.name,
          version: deps.info.version,
          startedAt: new Date(deps.info.startedAt).toISOString(),
          uptimeSec: Math.floor((now - deps.info.startedAt) / 1000),
          upstream: providers.upstreamStatus(),
          mode: deps.info.mode,
          sseClients: hub.size,
        };
        return sendEnvelope(req, res, {
          dataJson: JSON.stringify(info),
          meta: buildMeta({ asOfMs: now, source: 'live', windowMs: 60_000, nowMs: now }),
          cacheControl: CACHE.info,
          cache: compressCache,
          headers: cors,
        });
      }
      case API_PATHS.stream:
        return stream(req, res, ip);
      default:
        return sendError(req, res, 404, 'not_found', 'Unknown API endpoint');
    }
  }

  function stream(req: IncomingMessage, res: ServerResponse, ip: string): void {
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      res.end();
      return;
    }
    const now = clock.now();
    const net = networkEnvelope(providers, now);
    const hl = healthEnvelope(providers, now);
    const hello: StreamEvent = {
      type: 'hello',
      data: {
        serverTime: new Date(now).toISOString(),
        network: net.data,
        health: hl.data,
        networkMeta: net.meta,
        healthMeta: hl.meta,
      },
    };
    const cors = corsHeaders(req);
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    const r = hub.add(req, res, ip, hello);
    if (!r.ok) {
      if (r.reason === 'per-ip') {
        sendError(req, res, 429, 'too_many_streams', 'Too many open streams from this address', {
          'Retry-After': '30',
        });
      } else {
        sendError(req, res, 503, 'stream_capacity', 'The stream is at capacity, try again shortly', {
          'Retry-After': '30',
        });
      }
    }
  }

  return (req, res) => {
    const started = process.hrtime.bigint();
    const method = req.method ?? 'GET';
    let logPath = '-';
    res.on('close', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const quiet =
        logPath === '/healthz' || logPath.startsWith('/assets/') || /\.[a-z0-9]{2,5}$/.test(logPath);
      const fields = { m: method, p: logPath, s: res.statusCode, ms: Math.round(ms * 10) / 10 };
      if (res.statusCode >= 500) log.error('req', fields);
      else if (quiet) log.debug('req', fields);
      else if (logPath === API_PATHS.stream) log.debug('req', fields);
      else log.info('req', fields);
    });

    void (async () => {
      try {
        security.apply(req, res);

        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          return sendError(req, res, 405, 'method_not_allowed', 'Only GET, HEAD and OPTIONS are supported', {
            Allow: 'GET, HEAD, OPTIONS',
          });
        }
        const rawUrl = req.url ?? '/';
        if (rawUrl.length > MAX_URL_LENGTH) return sendError(req, res, 414, 'uri_too_long', 'URI too long');
        let url: URL;
        try {
          url = new URL(rawUrl, 'http://local');
        } catch {
          return sendError(req, res, 400, 'bad_request', 'Malformed URL');
        }
        const path = url.pathname;
        logPath = path.length > 120 ? `${path.slice(0, 120)}...` : path;

        if (method === 'OPTIONS') {
          const cors = corsHeaders(req);
          res.writeHead(204, {
            Allow: 'GET, HEAD, OPTIONS',
            ...cors,
            ...(cors['Access-Control-Allow-Origin']
              ? { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Max-Age': '600' }
              : {}),
            'Cache-Control': 'no-store',
          });
          return void res.end();
        }

        if (path === API_PATHS.healthz) {
          return sendText(req, res, 200, 'ok\n');
        }

        const ip = clientIp(req, config.trustProxy);
        const taken = limiter.take(ip);
        if (!taken.ok) {
          return sendError(req, res, 429, 'rate_limited', 'Too many requests, slow down', {
            'Retry-After': String(taken.retryAfterSec),
          });
        }

        if (path.startsWith('/api/')) {
          if (!path.startsWith('/api/v1/'))
            return sendError(req, res, 404, 'not_found', 'Unknown API version');
          return await api(req, res, path.replace(/\/+$/, ''), ip);
        }
        return await site.handle(req, res, path);
      } catch (err) {
        log.error('handler error', { err: errText(err), p: logPath });
        if (!res.headersSent) sendError(req, res, 500, 'internal', 'Internal error');
        else res.destroy();
      }
    })();
  };
}
