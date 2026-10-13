/**
 * Test doubles for the data layer: a fake API server (REST and SSE) behind a fake `fetch`, a fake
 * page environment, and a recording stage bus. No network, no DOM, no EventSource.
 *
 * Responses are plain objects rather than `Response` so that nothing depends on timers or streams
 * inside the runtime, which keeps fake timers fully deterministic.
 */

import type { Envelope, Meta, NetworkSnapshot } from '@shared/api';
import { API_PATHS } from '@shared/api';
import type { Env } from './clock';
import type { BusLike } from './engine';
import type { SnapshotSet } from './fixtures';
import { getFallback } from './fixtures';

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

export function liveMeta(nowMs: number, over: Partial<Meta> = {}): Meta {
  const iso = new Date(nowMs).toISOString();
  return { generatedAt: iso, asOf: iso, ageMs: 0, stale: false, source: 'live', ...over };
}

export function networkAt(height: number, tipMs: number): NetworkSnapshot {
  const base = getFallback().network;
  return { ...base, chain: { ...base.chain, height, tipTime: new Date(tipMs).toISOString() } };
}

export function envelope<T>(data: T, nowMs: number, over: Partial<Meta> = {}): Envelope<T> {
  return { data, meta: liveMeta(nowMs, over) };
}

// ---------------------------------------------------------------------------
// Fake SSE body
// ---------------------------------------------------------------------------

export class FakeStream {
  private queue: Uint8Array[] = [];
  private waiting: {
    resolve: (r: { done: boolean; value?: Uint8Array }) => void;
    reject: (e: unknown) => void;
  } | null = null;
  private ended = false;
  private failure: unknown = null;
  private encoder = new TextEncoder();
  aborted = false;

  constructor(readonly signal: AbortSignal | null | undefined) {
    signal?.addEventListener('abort', () => {
      this.aborted = true;
      this.fail(new DOMException('aborted', 'AbortError'));
    });
  }

  private wake() {
    if (!this.waiting) return;
    const w = this.waiting;
    if (this.queue.length > 0) {
      this.waiting = null;
      w.resolve({ done: false, value: this.queue.shift() });
    } else if (this.failure !== null) {
      this.waiting = null;
      w.reject(this.failure);
    } else if (this.ended) {
      this.waiting = null;
      w.resolve({ done: true });
    }
  }

  raw(text: string) {
    this.queue.push(this.encoder.encode(text));
    this.wake();
  }
  push(event: string, data: unknown) {
    this.raw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  comment(text = 'ping') {
    this.raw(`: ${text}\n\n`);
  }
  end() {
    this.ended = true;
    this.wake();
  }
  fail(err: unknown) {
    this.failure = err;
    this.wake();
  }

  readonly body = {
    getReader: () => ({
      read: () =>
        new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
          this.waiting = { resolve, reject };
          this.wake();
        }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Fake server
// ---------------------------------------------------------------------------

export type StreamMode = 'ok' | 'http503' | 'refuse' | 'html' | 'silent';
export type RestMode = 'ok' | 'http500' | 'refuse';

export interface FakeServer {
  fetch: typeof fetch;
  streams: FakeStream[];
  requests: string[];
  streamMode: StreamMode;
  restMode: RestMode;
  /** Send `hello` the moment a stream connects, like the real server does. */
  autoHello: boolean;
  /** Server clock offset from the test's Date.now(), in ms. */
  clockOffsetMs: number;
  data: SnapshotSet;
  /** Override meta for the next responses of a resource. */
  metaOver: Partial<Record<'network' | 'geo' | 'blocks' | 'health', Partial<Meta>>>;
  restCount(path: string): number;
  /** Open the next hello on the latest stream. */
  hello(
    stream?: FakeStream,
    over?: { network?: NetworkSnapshot | null; withMeta?: boolean; meta?: Partial<Meta> },
  ): void;
  /** Push a `network` envelope event, as the real server does. */
  networkEvent(data?: NetworkSnapshot, metaOver?: Partial<Meta>, stream?: FakeStream): void;
  /** Push a `health` envelope event. */
  healthEvent(data?: SnapshotSet['health'], metaOver?: Partial<Meta>, stream?: FakeStream): void;
  lastStream(): FakeStream;
}

type FetchInit = Parameters<typeof fetch>[1];

export function createFakeServer(): FakeServer {
  const base = getFallback();
  const server: FakeServer = {
    streams: [],
    requests: [],
    streamMode: 'ok',
    restMode: 'ok',
    autoHello: false,
    clockOffsetMs: 0,
    data: {
      network: networkAt(3_031_000, Date.now()),
      geo: base.geo,
      blocks: base.blocks,
      health: base.health,
    },
    metaOver: {},
    fetch: undefined as never,
    restCount(path) {
      return server.requests.filter((r) => r === path).length;
    },
    lastStream() {
      const s = server.streams[server.streams.length - 1];
      if (!s) throw new Error('no stream opened');
      return s;
    },
    hello(stream, over = {}) {
      const s = stream ?? server.lastStream();
      const now = Date.now() + server.clockOffsetMs;
      const withMeta = over.withMeta !== false;
      const meta = (key: 'network' | 'health') => liveMeta(now, { ...server.metaOver[key], ...over.meta });
      s.push('hello', {
        serverTime: new Date(now).toISOString(),
        network: over.network === undefined ? server.data.network : over.network,
        health: server.data.health,
        ...(withMeta ? { networkMeta: meta('network'), healthMeta: meta('health') } : {}),
      });
    },
    networkEvent(data, metaOver, stream) {
      const s = stream ?? server.lastStream();
      const now = Date.now() + server.clockOffsetMs;
      s.push('network', {
        data: data ?? server.data.network,
        meta: liveMeta(now, { ...server.metaOver.network, ...metaOver }),
      });
    },
    healthEvent(data, metaOver, stream) {
      const s = stream ?? server.lastStream();
      const now = Date.now() + server.clockOffsetMs;
      s.push('health', {
        data: data ?? server.data.health,
        meta: liveMeta(now, { ...server.metaOver.health, ...metaOver }),
      });
    },
  };

  const keyByPath: Record<string, 'network' | 'geo' | 'blocks' | 'health'> = {
    [API_PATHS.network]: 'network',
    [API_PATHS.geo]: 'geo',
    [API_PATHS.blocks]: 'blocks',
    [API_PATHS.health]: 'health',
  };

  const response = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
    stream?: FakeStream,
  ) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('not json');
      return body;
    },
    body: stream ? stream.body : null,
  });

  server.fetch = (async (input: unknown, init?: FetchInit) => {
    const path = String(input);
    server.requests.push(path);
    if (path === API_PATHS.stream) {
      switch (server.streamMode) {
        case 'refuse':
          throw new TypeError('fetch failed');
        case 'http503':
          return response(503, 'unavailable');
        case 'html':
          return response(
            200,
            '<html></html>',
            { 'content-type': 'text/html' },
            new FakeStream(init?.signal),
          );
        default: {
          const s = new FakeStream(init?.signal);
          server.streams.push(s);
          if (server.autoHello) server.hello(s);
          return response(200, null, { 'content-type': 'text/event-stream' }, s);
        }
      }
    }
    const key = keyByPath[path];
    if (!key) return response(404, 'nope');
    if (server.restMode === 'refuse') throw new TypeError('fetch failed');
    if (server.restMode === 'http500') return response(500, 'boom');
    const now = Date.now() + server.clockOffsetMs;
    return response(200, envelope(server.data[key], now, server.metaOver[key]));
  }) as unknown as typeof fetch;

  return server;
}

// ---------------------------------------------------------------------------
// Fake page environment and recording bus
// ---------------------------------------------------------------------------

export interface FakeEnv extends Env {
  hidden: boolean;
  online: boolean;
  setHidden(hidden: boolean): void;
  setOnline(online: boolean): void;
  listeners(): number;
}

export function createFakeEnv(): FakeEnv {
  const vis = new Set<() => void>();
  const onl = new Set<(online: boolean) => void>();
  const env: FakeEnv = {
    hidden: false,
    online: true,
    isHidden: () => env.hidden,
    isOnline: () => env.online,
    onVisibility(cb) {
      vis.add(cb);
      return () => vis.delete(cb);
    },
    onOnline(cb) {
      onl.add(cb);
      return () => onl.delete(cb);
    },
    setHidden(h) {
      env.hidden = h;
      for (const cb of [...vis]) cb();
    },
    setOnline(o) {
      env.online = o;
      for (const cb of [...onl]) cb(o);
    },
    listeners: () => vis.size + onl.size,
  };
  return env;
}

export interface RecordingBus extends BusLike {
  chain: { height: number; lastBlockAt: number | null; intervalMs: number; live: boolean };
  chainCalls: number;
  pulses: number;
}

export function createRecordingBus(): RecordingBus {
  const bus: RecordingBus = {
    chain: { height: 0, lastBlockAt: null, intervalMs: 30_000, live: false },
    chainCalls: 0,
    pulses: 0,
    setChain(c) {
      bus.chainCalls += 1;
      bus.chain = { ...bus.chain, ...c } as RecordingBus['chain'];
    },
    firePulse() {
      bus.pulses += 1;
    },
  };
  return bus;
}
