import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backoffDelay,
  type ClientStreamEvent,
  createSseClient,
  createSseParser,
  type SseCloseInfo,
  type SseMessage,
} from './stream';
import { createFakeServer, networkAt } from './testkit';

describe('SSE parser', () => {
  const collect = (chunks: string[]) => {
    const out: SseMessage[] = [];
    const p = createSseParser((m) => out.push(m));
    for (const c of chunks) p.push(c);
    return out;
  };

  it('parses event and data, ignoring comments', () => {
    expect(collect(['event: block\ndata: {"a":1}\n\n: ping\n\n'])).toEqual([
      { event: 'block', data: '{"a":1}' },
    ]);
  });

  it('handles chunk boundaries anywhere, including inside a CRLF', () => {
    const wire = 'event: hello\r\ndata: {"x":1}\r\n\r\nevent: block\r\ndata: {"y":2}\r\n\r\n';
    for (let i = 1; i < wire.length; i++) {
      const out = collect([wire.slice(0, i), wire.slice(i)]);
      expect(out).toEqual([
        { event: 'hello', data: '{"x":1}' },
        { event: 'block', data: '{"y":2}' },
      ]);
    }
  });

  it('joins multi-line data, defaults the event name, and strips a BOM', () => {
    expect(collect(['﻿data: a\ndata: b\n\n'])).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('does not dispatch a block with no data', () => {
    expect(collect(['event: block\n\n'])).toEqual([]);
  });
});

describe('backoffDelay', () => {
  it('doubles from 1 s and is capped at 30 s, with jitter', () => {
    expect(backoffDelay(1, () => 0)).toBe(1000);
    expect(backoffDelay(1, () => 1)).toBe(1250);
    expect(backoffDelay(2, () => 0)).toBe(2000);
    expect(backoffDelay(3, () => 0)).toBe(4000);
    expect(backoffDelay(5, () => 0)).toBe(16_000);
    for (const f of [6, 7, 12, 40]) {
      const lo = backoffDelay(f, () => 0);
      const hi = backoffDelay(f, () => 1);
      expect(lo).toBeGreaterThanOrEqual(22_500);
      expect(hi).toBe(30_000);
    }
  });
});

describe('SSE client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const flush = async () => {
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(0);
  };

  function setup(opts: { stableMs?: number } = {}) {
    const server = createFakeServer();
    const events: ClientStreamEvent[] = [];
    const closes: SseCloseInfo[] = [];
    const statuses: string[] = [];
    const client = createSseClient({
      url: '/api/v1/stream',
      fetch: server.fetch,
      random: () => 0,
      onEvent: (e) => events.push(e),
      onClose: (c) => closes.push(c),
      onStatus: (s) => statuses.push(s),
      ...opts,
    });
    return { server, client, events, closes, statuses };
  }

  it('opens on hello and delivers validated events in order', async () => {
    const { server, client, events, statuses } = setup();
    client.start();
    await flush();
    expect(client.status()).toBe('connecting');
    server.hello();
    await flush();
    expect(client.status()).toBe('open');
    server.lastStream().push('block', { height: 3_031_001, time: '2026-10-12T12:00:00Z', txCount: 3 });
    server.lastStream().push('network', networkAt(3_031_001, Date.now()));
    server.lastStream().push('weird-future-event', { a: 1 });
    server.lastStream().push('block', { height: 'nope' });
    await flush();
    expect(events.map((e) => e.type)).toEqual(['hello', 'block', 'network']);
    expect(statuses).toEqual(['connecting', 'open']);
    client.stop();
  });

  it('ignores events that arrive before hello', async () => {
    const { server, client, events } = setup();
    client.start();
    await flush();
    server.lastStream().push('block', { height: 5, time: '2026-10-12T12:00:00Z', txCount: null });
    await flush();
    expect(events).toHaveLength(0);
    client.stop();
  });

  it('reconnects with exponential backoff and resets after a stable connection', async () => {
    const { server, client, closes } = setup({ stableMs: 10_000 });
    server.streamMode = 'http503';
    client.start();
    await flush();
    // failure 1 -> 1 s, failure 2 -> 2 s, failure 3 -> 4 s
    expect(closes.map((c) => c.failures)).toEqual([1]);
    expect(closes[0]?.nextDelayMs).toBe(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(closes.map((c) => c.nextDelayMs)).toEqual([1000, 2000]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(closes.map((c) => c.nextDelayMs)).toEqual([1000, 2000, 4000]);
    expect(server.requests.filter((r) => r === '/api/v1/stream')).toHaveLength(3);

    // The server recovers; the next attempt opens.
    server.streamMode = 'ok';
    await vi.advanceTimersByTimeAsync(4000);
    server.hello();
    await flush();
    expect(client.status()).toBe('open');

    // Healthy for longer than stableMs, then dropped: backoff starts over at 1 s.
    await vi.advanceTimersByTimeAsync(15_000);
    server.lastStream().end();
    await flush();
    expect(closes[closes.length - 1]).toMatchObject({ wasOpen: true, failures: 1, nextDelayMs: 1000 });
    client.stop();
  });

  it('does not reset the backoff when a connection drops right after opening', async () => {
    const { server, client, closes } = setup({ stableMs: 10_000 });
    client.start();
    await flush();
    server.hello();
    await flush();
    server.lastStream().end();
    await flush();
    expect(closes[0]).toMatchObject({ wasOpen: true, failures: 1, nextDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    server.hello();
    await flush();
    server.lastStream().end();
    await flush();
    expect(closes[1]).toMatchObject({ failures: 2, nextDelayMs: 2000 });
    client.stop();
  });

  it('detects a dead connection after 45 s of silence', async () => {
    const { server, client, closes } = setup();
    client.start();
    await flush();
    server.hello();
    await flush();
    await vi.advanceTimersByTimeAsync(44_000);
    expect(client.status()).toBe('open');
    await vi.advanceTimersByTimeAsync(1500);
    expect(closes).toHaveLength(1);
    expect(closes[0]?.reason).toMatch(/no data/);
    expect(client.status()).toBe('backoff');
    expect(server.streams[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.streams).toHaveLength(2);
    client.stop();
  });

  it('counts ping comments as activity', async () => {
    const { server, client, closes } = setup();
    client.start();
    await flush();
    server.hello();
    await flush();
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      server.lastStream().comment('ping');
    }
    await flush();
    expect(closes).toHaveLength(0);
    expect(client.status()).toBe('open');
    client.stop();
  });

  it('fails an attempt that never says hello', async () => {
    const { server, client, closes } = setup();
    client.start();
    await flush();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(closes[0]?.reason).toBe('no hello');
    expect(server.streams[0]?.aborted).toBe(true);
    client.stop();
  });

  it('rejects a non event-stream response (an HTML fallback page)', async () => {
    const { server, client, closes } = setup();
    server.streamMode = 'html';
    client.start();
    await flush();
    expect(closes[0]?.reason).toMatch(/content-type/);
    client.stop();
  });

  it('treats a refused connection as a failure and keeps retrying', async () => {
    const { server, client, closes } = setup();
    server.streamMode = 'refuse';
    client.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(closes).toHaveLength(2);
    client.stop();
  });

  it('stop() aborts the request and cancels every timer', async () => {
    const { server, client } = setup();
    client.start();
    await flush();
    server.hello();
    await flush();
    client.stop();
    expect(server.lastStream().aborted).toBe(true);
    expect(client.status()).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restart() reconnects immediately with a fresh backoff', async () => {
    const { server, client, closes } = setup();
    server.streamMode = 'http503';
    client.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.failures()).toBe(2);
    server.streamMode = 'ok';
    client.restart();
    await flush();
    expect(client.failures()).toBe(0);
    expect(client.status()).toBe('connecting');
    server.hello();
    await flush();
    expect(client.status()).toBe('open');
    expect(closes).toHaveLength(2);
    client.stop();
  });

  describe('payload shapes', () => {
    it('delivers envelope network and health events with their real meta', async () => {
      const { server, client, events } = setup();
      client.start();
      await flush();
      server.hello();
      await flush();
      server.networkEvent(undefined, { source: 'cache', stale: true, ageMs: 70_000 });
      server.healthEvent(undefined, { source: 'fallback' });
      await flush();
      const net = events.find((e) => e.type === 'network');
      const health = events.find((e) => e.type === 'health');
      expect(net).toMatchObject({ type: 'network', meta: { source: 'cache', stale: true, ageMs: 70_000 } });
      expect(health).toMatchObject({ type: 'health', meta: { source: 'fallback' } });
      if (net?.type === 'network') expect(net.data.chain.height).toBe(3_031_000);
      client.stop();
    });

    it('still accepts a bare snapshot, with meta null', async () => {
      const { server, client, events } = setup();
      client.start();
      await flush();
      server.hello();
      await flush();
      server.lastStream().push('network', networkAt(3_031_009, Date.now()));
      await flush();
      const net = events.find((e) => e.type === 'network');
      expect(net).toMatchObject({ type: 'network', meta: null });
      if (net?.type === 'network') expect(net.data.chain.height).toBe(3_031_009);
      client.stop();
    });

    it('keeps the data when an envelope has a malformed meta, and drops an envelope with bad data', async () => {
      const { server, client, events } = setup();
      client.start();
      await flush();
      server.hello();
      await flush();
      server
        .lastStream()
        .push('network', { data: networkAt(3_031_010, Date.now()), meta: { source: 'bogus' } });
      server.lastStream().push('network', { data: { nope: true }, meta: { source: 'live' } });
      await flush();
      const nets = events.filter((e) => e.type === 'network');
      expect(nets).toHaveLength(1);
      expect(nets[0]).toMatchObject({ meta: null });
      client.stop();
    });

    it('parses hello networkMeta and healthMeta, and ignores meta without its payload', async () => {
      const { server, client, events } = setup();
      client.start();
      await flush();
      server.hello(undefined, { meta: { source: 'fallback' } });
      await flush();
      const hello = events.find((e) => e.type === 'hello');
      expect(hello?.type === 'hello' && hello.data.networkMeta?.source).toBe('fallback');
      expect(hello?.type === 'hello' && hello.data.healthMeta?.source).toBe('fallback');
      client.stop();

      const second = setup();
      second.client.start();
      await flush();
      second.server.hello(undefined, { network: null });
      await flush();
      const h2 = second.events.find((e) => e.type === 'hello');
      expect(h2?.type === 'hello' && h2.data.network).toBeNull();
      expect(h2?.type === 'hello' && h2.data.networkMeta).toBeNull();
      second.client.stop();
    });

    it('treats event: ping frames as liveness and surfaces them', async () => {
      const { server, client, events, closes } = setup();
      client.start();
      await flush();
      server.hello();
      await flush();
      for (let i = 0; i < 9; i++) {
        await vi.advanceTimersByTimeAsync(20_000);
        server.lastStream().push('ping', {});
      }
      await flush();
      expect(closes).toHaveLength(0);
      expect(events.filter((e) => e.type === 'ping')).toHaveLength(9);
      expect(client.status()).toBe('open');
      client.stop();
    });
  });
});
