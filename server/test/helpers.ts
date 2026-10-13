import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Config, loadConfig } from '../src/config.ts';
import { createLogger } from '../src/core/log.ts';
import { type RunningServer, startServer } from '../src/server.ts';
import { createFixturesRuntime, type Runtime } from '../src/services/runtime.ts';

export const quietLog = createLogger('silent');

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'silent', ...overrides });
}

export interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  text: string;
  json<T = unknown>(): T;
}

/** Raw HTTP request that does NOT decompress, so tests can inspect Content-Encoding and sizes. */
export function request(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: opts.method ?? 'GET',
        headers: { connection: 'close', ...opts.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
            get text() {
              return body.toString('utf8');
            },
            json<T>() {
              return JSON.parse(body.toString('utf8')) as T;
            },
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function makeWebDist(files: Record<string, string | Buffer>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fluxweb-'));
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

export interface TestServer extends RunningServer {
  runtime: Runtime;
  config: Config;
}

/** A real HTTP server in fixtures mode on an ephemeral port. */
export async function startFixtureServer(
  overrides: Record<string, string> = {},
  blockMs = 30_000,
): Promise<TestServer> {
  const config = testConfig({ FIXTURES: '1', ...overrides });
  const runtime = createFixturesRuntime(config, quietLog, undefined, blockMs);
  const running = await startServer(config, runtime, quietLog);
  return Object.assign(running, { runtime, config });
}
