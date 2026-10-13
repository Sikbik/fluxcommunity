import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import type { StreamEvent } from '../../shared/api.ts';
import { frame, SseHub } from '../src/services/hub.ts';

const hello: StreamEvent = {
  type: 'hello',
  data: { serverTime: '2026-10-12T12:00:00.000Z', network: null, health: null },
};

interface Harness {
  hub: SseHub;
  port: number;
  close(): Promise<void>;
}

async function harness(opts: Partial<ConstructorParameters<typeof SseHub>[0]> = {}): Promise<Harness> {
  const hub = new SseHub({
    maxClients: 100,
    maxPerIp: 100,
    maxBufferBytes: 1_000_000,
    heartbeatMs: 10_000,
    ...opts,
  });
  const server = http.createServer((req, res) => {
    const r = hub.add(req, res, req.headers['x-ip'] ? String(req.headers['x-ip']) : '1.1.1.1', hello);
    if (!r.ok) {
      res.writeHead(r.reason === 'per-ip' ? 429 : 503);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  hub.start();
  return {
    hub,
    port: (server.address() as AddressInfo).port,
    async close() {
      hub.stop();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}

function connect(port: number, headers: Record<string, string> = {}) {
  return new Promise<{ res: http.IncomingMessage; text: () => string; close: () => void }>(
    (resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, headers }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          buf += c;
        });
        resolve({ res, text: () => buf, close: () => req.destroy() });
      });
      req.on('error', reject);
    },
  );
}

const until = async (cond: () => boolean, ms = 1_500) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('SSE framing', () => {
  it('writes event/data lines terminated by a blank line', () => {
    assert.equal(
      frame({ type: 'block', data: { height: 5, time: 't', txCount: null } }),
      'event: block\ndata: {"height":5,"time":"t","txCount":null}\n\n',
    );
  });
});

describe('SseHub', () => {
  it('sets the stream headers and sends retry + hello first', async () => {
    const h = await harness();
    const c = await connect(h.port);
    assert.equal(c.res.statusCode, 200);
    assert.match(String(c.res.headers['content-type']), /^text\/event-stream/);
    assert.equal(c.res.headers['cache-control'], 'no-store');
    assert.equal(c.res.headers['x-accel-buffering'], 'no');
    await until(() => c.text().includes('event: hello'));
    assert.ok(c.text().startsWith('retry: 5000\n\nevent: hello\ndata: {'));
    c.close();
    await h.close();
  });

  it('fans one event out to every client', async () => {
    const h = await harness();
    const clients = await Promise.all([connect(h.port), connect(h.port), connect(h.port)]);
    await until(() => h.hub.size === 3);
    h.hub.broadcast({ type: 'block', data: { height: 42, time: '2026-10-12T12:00:30.000Z', txCount: 3 } });
    await until(() => clients.every((c) => c.text().includes('event: block')));
    for (const c of clients) {
      assert.ok(c.text().includes('data: {"height":42,"time":"2026-10-12T12:00:30.000Z","txCount":3}\n\n'));
      c.close();
    }
    await until(() => h.hub.size === 0);
    await h.close();
  });

  it('sends a shared ping comment and a named ping event', async () => {
    const h = await harness({ heartbeatMs: 30 });
    const c = await connect(h.port);
    await until(() => c.text().includes(': ping\n\nevent: ping\ndata: {}\n\n'));
    c.close();
    await h.close();
  });

  it('caps total clients and clients per IP', async () => {
    const h = await harness({ maxClients: 3, maxPerIp: 2 });
    const a1 = await connect(h.port, { 'x-ip': 'a' });
    const a2 = await connect(h.port, { 'x-ip': 'a' });
    const a3 = await connect(h.port, { 'x-ip': 'a' });
    assert.equal(a3.res.statusCode, 429);
    const b1 = await connect(h.port, { 'x-ip': 'b' });
    assert.equal(b1.res.statusCode, 200);
    const c1 = await connect(h.port, { 'x-ip': 'c' });
    assert.equal(c1.res.statusCode, 503);
    for (const c of [a1, a2, b1]) c.close();
    await h.close();
  });

  it('drops a slow consumer instead of buffering without bound', async () => {
    const h = await harness({ maxBufferBytes: 20_000 });
    const c = await connect(h.port);
    c.res.pause(); // never read: the socket buffers fill
    await until(() => h.hub.size === 1);
    const big = 'x'.repeat(60_000);
    for (let i = 0; i < 200 && h.hub.size > 0; i++) {
      h.hub.broadcast({ type: 'block', data: { height: i, time: big, txCount: null } });
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(h.hub.size, 0);
    assert.ok(h.hub.dropped >= 1);
    c.close();
    await h.close();
  });

  it('forgets a client that disconnects', async () => {
    const h = await harness();
    const c = await connect(h.port);
    await until(() => h.hub.size === 1);
    c.close();
    await until(() => h.hub.size === 0);
    await h.close();
  });
});
