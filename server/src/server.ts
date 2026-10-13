import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Config } from './config.ts';
import { type Clock, systemClock } from './core/clock.ts';
import type { Logger } from './core/log.ts';
import { createHandler, healthEnvelope, networkEnvelope } from './http/app.ts';
import { CompressCache } from './http/compress.ts';
import { RateLimiter } from './http/ratelimit.ts';
import { createSecurityHeaders } from './http/security.ts';
import { StaticSite } from './http/static.ts';
import { SseHub } from './services/hub.ts';
import type { Runtime } from './services/runtime.ts';

export interface RunningServer {
  server: http.Server;
  hub: SseHub;
  limiter: RateLimiter;
  /** The port actually bound (useful when `config.port` is 0). */
  port: number;
  stop(): Promise<void>;
}

export function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Wires the HTTP server around a data runtime and starts listening. */
export async function startServer(
  config: Config,
  runtime: Runtime,
  log: Logger,
  clock: Clock = systemClock,
): Promise<RunningServer> {
  const hub = new SseHub({
    maxClients: config.limits.sseMaxClients,
    maxPerIp: config.limits.sseMaxPerIp,
    maxBufferBytes: config.limits.sseMaxBufferBytes,
    heartbeatMs: config.limits.sseHeartbeatMs,
    log,
  });
  const limiter = new RateLimiter({
    burst: config.limits.rateBurst,
    refillPerSec: config.limits.rateRefillPerSec,
    clock,
  });
  const compressCache = new CompressCache(config.limits.compressCacheBytes);
  const site = new StaticSite({ root: config.webDist, cache: compressCache });
  const security = createSecurityHeaders(config);

  const handler = createHandler({
    config,
    log,
    providers: runtime.providers,
    hub,
    limiter,
    security,
    site,
    compressCache,
    info: { name: 'flux-community', version: readVersion(), startedAt: clock.now(), mode: runtime.mode },
    clock,
  });

  const server = http.createServer(
    {
      headersTimeout: 10_000,
      requestTimeout: 15_000,
      keepAliveTimeout: 65_000,
      maxHeaderSize: 8_192,
    },
    handler,
  );
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  const offs = [
    runtime.onBlock((e) => hub.broadcast({ type: 'block', data: e })),
    // Streamed snapshots carry the same envelope REST would return at this instant.
    runtime.onNetwork(() =>
      hub.broadcast({ type: 'network', data: networkEnvelope(runtime.providers, clock.now()) }),
    ),
    runtime.onHealth(() =>
      hub.broadcast({ type: 'health', data: healthEnvelope(runtime.providers, clock.now()) }),
    ),
  ];

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  hub.start();
  limiter.startSweeper();
  runtime.start();
  const port = (server.address() as AddressInfo).port;

  let stopping: Promise<void> | null = null;
  const stop = () => {
    stopping ??= (async () => {
      for (const off of offs) off();
      hub.stop();
      limiter.stop();
      await runtime.stop();
      await new Promise<void>((resolve) => {
        const force = setTimeout(() => {
          server.closeAllConnections();
        }, 5_000);
        server.close(() => {
          clearTimeout(force);
          resolve();
        });
        server.closeIdleConnections();
      });
    })();
    return stopping;
  };

  return { server, hub, limiter, port, stop };
}
