/**
 * Server-Sent Events client for `/api/v1/stream`.
 *
 * Why not `EventSource`? It silently discards `: ping` comment lines, so a page using it cannot tell
 * a quiet healthy stream from a half-open dead one, and the contract promises a ping every 20 s for
 * exactly that purpose. This client reads the response body directly, sees every byte (so pings
 * count as activity), and owns reconnection: exponential backoff with jitter from 1 s up to 30 s, a
 * dead-connection watchdog (45 s of silence), and a hello deadline.
 *
 * It is framework free and has no globals beyond `fetch`, `AbortController` and timers, so it runs
 * under fake timers and a fake fetch in tests.
 */

import type { AppsHealthSnapshot, BlockEvent, HelloEvent, Meta, NetworkSnapshot } from '@shared/api';
import { API_PATHS } from '@shared/api';
import { parseBlockEvent, parseHealth, parseHello, parseNetwork, parseStreamPayload } from './validate';

// ---------------------------------------------------------------------------
// Incremental SSE parser
// ---------------------------------------------------------------------------

export interface SseMessage {
  event: string;
  data: string;
}

export interface SseParser {
  /** Feed decoded text. Complete messages are delivered through `onMessage` as they finish. */
  push(chunk: string): void;
}

export function createSseParser(onMessage: (m: SseMessage) => void): SseParser {
  let buf = '';
  let first = true;
  let eventName = '';
  let data: string[] = [];

  const processLine = (line: string) => {
    if (line === '') {
      if (data.length > 0) onMessage({ event: eventName || 'message', data: data.join('\n') });
      eventName = '';
      data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'data') data.push(value);
    // `id` and `retry` are accepted and ignored: `hello` makes reconnects idempotent.
  };

  return {
    push(chunk) {
      buf += chunk;
      if (first && buf.length > 0) {
        first = false;
        if (buf.charCodeAt(0) === 0xfeff) buf = buf.slice(1);
      }
      // A trailing CR may be the first half of a CRLF split across chunks: hold it back.
      let hold = '';
      let work = buf;
      if (work.endsWith('\r')) {
        hold = '\r';
        work = work.slice(0, -1);
      }
      work = work.replace(/\r\n?/g, '\n');
      const lastNl = work.lastIndexOf('\n');
      if (lastNl === -1) {
        buf = work + hold;
        return;
      }
      const complete = work.slice(0, lastNl);
      buf = work.slice(lastNl + 1) + hold;
      for (const line of complete.split('\n')) processLine(line);
    },
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** `open` means a valid `hello` has been received on the current connection. */
export type SseStatus = 'idle' | 'connecting' | 'open' | 'backoff';

export interface SseCloseInfo {
  /** The connection had reached `open` before it ended. */
  wasOpen: boolean;
  reason: string;
  /** Consecutive failures counted so far (0 after a stable connection ended). */
  failures: number;
  nextDelayMs: number;
}

/**
 * A validated stream event. `network` and `health` carry the server's `meta` when it sent an
 * envelope, or `null` for a bare snapshot (older servers); the consumer decides how to label that.
 * `ping` is liveness only.
 */
export type ClientStreamEvent =
  | { type: 'hello'; data: HelloEvent }
  | { type: 'block'; data: BlockEvent }
  | { type: 'network'; data: NetworkSnapshot; meta: Meta | null }
  | { type: 'health'; data: AppsHealthSnapshot; meta: Meta | null }
  | { type: 'ping' };

export interface SseClientOptions {
  url?: string;
  fetch?: typeof fetch;
  /** Called for every validated event, after `hello` has opened the connection. */
  onEvent: (event: ClientStreamEvent) => void;
  onStatus?: (status: SseStatus) => void;
  onClose?: (info: SseCloseInfo) => void;
  random?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** No bytes (events or pings) for this long means the connection is dead. */
  deadAfterMs?: number;
  /** The server must say hello within this long of the response starting. */
  helloTimeoutMs?: number;
  /** A connection that lived this long counts as healthy and resets the backoff. */
  stableMs?: number;
}

export interface SseClient {
  start(): void;
  stop(): void;
  /** Drop the current attempt and connect immediately with a fresh backoff. */
  restart(): void;
  status(): SseStatus;
  failures(): number;
}

type Timer = ReturnType<typeof setTimeout>;

/** Delay before retry number `failures` (1-based): 1 s, 2 s, 4 s ... capped, with jitter. */
export function backoffDelay(failures: number, random: () => number, baseMs = 1000, maxMs = 30_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
  const jitter = exp >= maxMs ? 0.75 + 0.25 * random() : 1 + 0.25 * random();
  return Math.min(maxMs, Math.round(exp * jitter));
}

export function createSseClient(options: SseClientOptions): SseClient {
  const url = options.url ?? API_PATHS.stream;
  const random = options.random ?? Math.random;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const deadAfterMs = options.deadAfterMs ?? 45_000;
  const helloTimeoutMs = options.helloTimeoutMs ?? 10_000;
  const stableMs = options.stableMs ?? 10_000;

  let status: SseStatus = 'idle';
  let failures = 0;
  let generation = 0;
  let controller: AbortController | null = null;
  let retryTimer: Timer | null = null;
  let helloTimer: Timer | null = null;
  let deadTimer: Timer | null = null;

  const setStatus = (s: SseStatus) => {
    if (status === s) return;
    status = s;
    options.onStatus?.(s);
  };
  const clearTimers = () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (helloTimer) clearTimeout(helloTimer);
    if (deadTimer) clearTimeout(deadTimer);
    retryTimer = helloTimer = deadTimer = null;
  };

  function connect(): void {
    const gen = ++generation;
    const ctl = new AbortController();
    controller = ctl;
    setStatus('connecting');
    let opened = false;
    let openedAt = 0;
    let finished = false;

    const finish = (reason: string) => {
      if (finished || gen !== generation) return;
      finished = true;
      clearTimers();
      ctl.abort();
      controller = null;
      if (opened && Date.now() - openedAt >= stableMs) failures = 0;
      failures += 1;
      const nextDelayMs = backoffDelay(failures, random, baseDelayMs, maxDelayMs);
      setStatus('backoff');
      options.onClose?.({ wasOpen: opened, reason, failures, nextDelayMs });
      if (gen !== generation) return; // the callback stopped or restarted us
      retryTimer = setTimeout(connect, nextDelayMs);
    };

    const armDead = () => {
      if (deadTimer) clearTimeout(deadTimer);
      deadTimer = setTimeout(() => finish(`no data for ${deadAfterMs} ms`), deadAfterMs);
    };

    const handle = (m: SseMessage) => {
      if (finished || gen !== generation) return;
      let json: unknown;
      try {
        json = JSON.parse(m.data);
      } catch {
        return;
      }
      let event: ClientStreamEvent | null = null;
      switch (m.event) {
        case 'hello': {
          const p = parseHello(json);
          if (!p.ok) return;
          if (!opened) {
            opened = true;
            openedAt = Date.now();
            if (helloTimer) clearTimeout(helloTimer);
            helloTimer = null;
            setStatus('open');
          }
          event = { type: 'hello', data: p.value };
          break;
        }
        case 'block': {
          const p = parseBlockEvent(json);
          if (p.ok) event = { type: 'block', data: p.value };
          break;
        }
        case 'network': {
          const p = parseStreamPayload(json, parseNetwork);
          if (p.ok) event = { type: 'network', data: p.value.data, meta: p.value.meta };
          break;
        }
        case 'health': {
          const p = parseStreamPayload(json, parseHealth);
          if (p.ok) event = { type: 'health', data: p.value.data, meta: p.value.meta };
          break;
        }
        case 'ping':
          // Liveness only. Any received bytes already reset the watchdog; this is explicit.
          event = { type: 'ping' };
          break;
        default:
          return; // anything newer than this client
      }
      if (event && opened) options.onEvent(event);
    };

    const parser = createSseParser(handle);
    const decoder = new TextDecoder();

    void (async () => {
      helloTimer = setTimeout(() => finish('no hello'), helloTimeoutMs);
      armDead();
      try {
        const f = options.fetch ?? globalThis.fetch;
        const res = await f(url, {
          signal: ctl.signal,
          headers: { accept: 'text/event-stream' },
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (gen !== generation) return;
        if (!res.ok) return finish(`HTTP ${res.status}`);
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('text/event-stream')) return finish(`unexpected content-type ${type || 'none'}`);
        if (!res.body) return finish('no response body');
        const reader = res.body.getReader();
        armDead();
        for (;;) {
          const { done, value } = await reader.read();
          if (gen !== generation) return;
          if (done) return finish('stream ended');
          armDead();
          parser.push(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        if (gen !== generation || finished) return;
        finish(e instanceof Error ? e.message : 'stream error');
      }
    })();
  }

  const teardown = () => {
    generation += 1;
    clearTimers();
    controller?.abort();
    controller = null;
  };

  return {
    start() {
      if (status !== 'idle') return;
      connect();
    },
    stop() {
      teardown();
      setStatus('idle');
    },
    restart() {
      teardown();
      failures = 0;
      connect();
    },
    status: () => status,
    failures: () => failures,
  };
}
