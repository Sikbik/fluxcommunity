import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { API_PATHS } from '../../shared/api.ts';
import { clientIp } from '../src/http/client-ip.ts';
import { negotiateEncoding } from '../src/http/compress.ts';
import { buildMeta, etagMatches } from '../src/http/respond.ts';
import { buildCsp } from '../src/http/security.ts';
import { makeWebDist, request, startFixtureServer, type TestServer } from './helpers.ts';

describe('API over HTTP (fixtures runtime)', () => {
  let s: TestServer;
  before(async () => {
    const dist = await makeWebDist({ 'index.html': '<!doctype html><title>x</title>' });
    s = await startFixtureServer({ WEB_DIST: dist });
  });
  after(async () => {
    await s.stop();
  });

  it('serves /healthz as plain ok without noise', async () => {
    const r = await request(s.port, '/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.text, 'ok\n');
    assert.match(String(r.headers['content-type']), /^text\/plain/);
    assert.equal(r.headers['cache-control'], 'no-store');
  });

  it('puts the security headers on every kind of response', async () => {
    const paths = ['/healthz', API_PATHS.network, '/api/v1/nope', '/', '/missing.png', '/%00', '/api/v2/x'];
    for (const p of paths) {
      const r = await request(s.port, p);
      assert.equal(r.headers['content-security-policy'], buildCsp({ workerBlob: false }), p);
      assert.equal(r.headers['x-content-type-options'], 'nosniff', p);
      assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin', p);
      assert.equal(r.headers['cross-origin-opener-policy'], 'same-origin', p);
      assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN', p);
      assert.match(
        String(r.headers['permissions-policy']),
        /camera=\(\).*microphone=\(\).*geolocation=\(\).*payment=\(\).*accelerometer=\(self\).*gyroscope=\(self\)/,
        p,
      );
    }
    const csp = buildCsp({ workerBlob: false });
    for (const d of [
      "default-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      assert.ok(csp.includes(d), d);
    }
    assert.ok(!csp.includes('worker-src'));
    assert.ok(buildCsp({ workerBlob: true }).includes("worker-src 'self' blob:"));
  });

  it('answers envelopes with accurate meta and conditional caching headers', async () => {
    const r = await request(s.port, API_PATHS.network);
    assert.equal(r.status, 200);
    assert.match(String(r.headers['content-type']), /^application\/json/);
    assert.match(String(r.headers['cache-control']), /max-age=\d+, stale-while-revalidate=\d+/);
    assert.match(String(r.headers.vary), /Accept-Encoding/);
    assert.match(String(r.headers.etag), /^W\/"/);
    const body = r.json<{
      data: unknown;
      meta: { generatedAt: string; asOf: string; ageMs: number; source: string; stale: boolean };
    }>();
    assert.equal(body.meta.source, 'fallback', 'fixtures are always labelled fallback');
    assert.equal(Date.parse(body.meta.generatedAt) - Date.parse(body.meta.asOf), body.meta.ageMs);
  });

  it('returns 304 for a matching If-None-Match and a fresh 200 otherwise', async () => {
    const first = await request(s.port, API_PATHS.geo);
    const etag = String(first.headers.etag);
    const second = await request(s.port, API_PATHS.geo, { headers: { 'if-none-match': etag } });
    assert.equal(second.status, 304);
    assert.equal(second.body.length, 0);
    assert.equal(second.headers.etag, etag);
    const third = await request(s.port, API_PATHS.geo, { headers: { 'if-none-match': 'W/"other"' } });
    assert.equal(third.status, 200);
  });

  it('compresses JSON over 1 KB with br or gzip and leaves small bodies alone', async () => {
    const plain = await request(s.port, API_PATHS.geo, { headers: { 'accept-encoding': 'identity' } });
    assert.equal(plain.headers['content-encoding'], undefined);
    const br = await request(s.port, API_PATHS.geo, { headers: { 'accept-encoding': 'gzip, br' } });
    assert.equal(br.headers['content-encoding'], 'br');
    assert.ok(br.body.length < plain.body.length / 2);
    assert.equal(
      JSON.parse(brotliDecompressSync(br.body).toString()).data.total,
      plain.json<{ data: { total: number } }>().data.total,
    );
    const gz = await request(s.port, API_PATHS.geo, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.ok(JSON.parse(gunzipSync(gz.body).toString()).data.points.length > 0);
    // /info is tiny: never compressed
    const info = await request(s.port, API_PATHS.info, { headers: { 'accept-encoding': 'br' } });
    assert.equal(info.headers['content-encoding'], undefined);
    assert.equal(info.headers['cache-control'], 'no-store');
  });

  it('supports HEAD and OPTIONS and rejects other methods', async () => {
    const head = await request(s.port, API_PATHS.network, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.ok(Number(head.headers['content-length']) > 0 || head.headers['content-length'] === undefined);
    const opt = await request(s.port, API_PATHS.network, { method: 'OPTIONS' });
    assert.equal(opt.status, 204);
    assert.equal(opt.headers['access-control-allow-origin'], undefined, 'no CORS by default');
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await request(s.port, API_PATHS.network, { method: m });
      assert.equal(r.status, 405, m);
      assert.equal(r.headers.allow, 'GET, HEAD, OPTIONS');
      assert.equal(r.json<{ error: { code: string } }>().error.code, 'method_not_allowed');
    }
  });

  it('never sets CORS headers by default', async () => {
    const r = await request(s.port, API_PATHS.network, { headers: { origin: 'https://evil.example' } });
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  });

  it('returns a JSON error body for unknown API paths', async () => {
    const r = await request(s.port, '/api/v1/unknown');
    assert.equal(r.status, 404);
    assert.equal(r.json<{ error: { code: string } }>().error.code, 'not_found');
  });

  it('rejects over-long URLs', async () => {
    const r = await request(s.port, `/api/v1/network?${'a'.repeat(3000)}`);
    assert.equal(r.status, 414);
  });
});

describe('opt-in CORS', () => {
  let s: TestServer;
  before(async () => {
    s = await startFixtureServer({
      CORS_ORIGINS: 'https://friend.example, https://other.example',
      WEB_DIST: '/nonexistent',
    });
  });
  after(async () => {
    await s.stop();
  });

  it('echoes only allow-listed origins', async () => {
    const ok = await request(s.port, API_PATHS.network, { headers: { origin: 'https://friend.example' } });
    assert.equal(ok.headers['access-control-allow-origin'], 'https://friend.example');
    assert.match(String(ok.headers.vary), /Origin/);
    const no = await request(s.port, API_PATHS.network, { headers: { origin: 'https://evil.example' } });
    assert.equal(no.headers['access-control-allow-origin'], undefined);
    const pre = await request(s.port, API_PATHS.network, {
      method: 'OPTIONS',
      headers: { origin: 'https://friend.example' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers['access-control-allow-origin'], 'https://friend.example');
    assert.equal(pre.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS');
  });
});

describe('rate limiting over HTTP', () => {
  it('answers 429 with Retry-After once the burst is spent, but never limits /healthz', async () => {
    const s = await startFixtureServer({
      RATE_LIMIT_BURST: '5',
      RATE_LIMIT_RPS: '1',
      WEB_DIST: '/nonexistent',
    });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 8; i++) codes.push((await request(s.port, API_PATHS.blocks)).status);
      assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
      assert.ok(
        codes.slice(5).every((c) => c === 429),
        codes.join(','),
      );
      const limited = await request(s.port, API_PATHS.blocks);
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers['retry-after']) >= 1);
      assert.equal(limited.json<{ error: { code: string } }>().error.code, 'rate_limited');
      for (let i = 0; i < 10; i++) assert.equal((await request(s.port, '/healthz')).status, 200);
    } finally {
      await s.stop();
    }
  });
});

describe('SSE over HTTP', () => {
  it('streams hello first with headers and the fixtures hello payload', async () => {
    const s = await startFixtureServer({ WEB_DIST: '/nonexistent' });
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}${API_PATHS.stream}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-accel-buffering'), 'no');
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      let text = '';
      const dec = new TextDecoder();
      while (!text.includes('\n\nevent: hello') && !text.includes('event: hello\ndata:')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
        if (text.includes('event: hello') && text.endsWith('\n\n')) break;
      }
      await reader.cancel();
      assert.ok(text.startsWith('retry: 5000'));
      const data = text.split('event: hello\ndata: ')[1]?.split('\n\n')[0] ?? '';
      const hello = JSON.parse(data) as {
        serverTime: string;
        network: { chain: { height: number } };
        health: { apps: unknown[] };
      };
      assert.ok(hello.network.chain.height > 3_000_000);
      assert.ok(hello.health.apps.length > 5);
    } finally {
      await s.stop();
    }
  });

  it('enforces the per-IP stream cap with a 429', async () => {
    const s = await startFixtureServer({ SSE_MAX_PER_IP: '1', WEB_DIST: '/nonexistent' });
    try {
      const a = await fetch(`http://127.0.0.1:${s.port}${API_PATHS.stream}`);
      assert.equal(a.status, 200);
      const b = await fetch(`http://127.0.0.1:${s.port}${API_PATHS.stream}`);
      assert.equal(b.status, 429);
      assert.equal(b.headers.get('retry-after'), '30');
      await a.body?.cancel();
      await b.body?.cancel();
    } finally {
      await s.stop();
    }
  });
});

describe('helpers', () => {
  it('weak-compares ETags', () => {
    assert.equal(etagMatches('W/"a"', 'W/"a"'), true);
    assert.equal(etagMatches('"a"', 'W/"a"'), true);
    assert.equal(etagMatches('W/"b", W/"a"', 'W/"a"'), true);
    assert.equal(etagMatches('*', 'W/"a"'), true);
    assert.equal(etagMatches('W/"b"', 'W/"a"'), false);
    assert.equal(etagMatches(undefined, 'W/"a"'), false);
  });

  it('negotiates encodings with q-values', () => {
    assert.equal(negotiateEncoding('gzip, deflate, br'), 'br');
    assert.equal(negotiateEncoding('gzip'), 'gzip');
    assert.equal(negotiateEncoding('br;q=0, gzip'), 'gzip');
    assert.equal(negotiateEncoding('identity'), null);
    assert.equal(negotiateEncoding(undefined), null);
    assert.equal(negotiateEncoding('*'), 'br');
  });

  it('builds accurate meta from a quantised clock', () => {
    const m = buildMeta({ asOfMs: 10_000, source: 'cache', windowMs: 5_000, nowMs: 20_999 });
    assert.equal(m.generatedAt, new Date(20_000).toISOString());
    assert.equal(m.ageMs, 10_000);
    assert.equal(m.stale, true);
    const fresh = buildMeta({ asOfMs: 19_500, source: 'live', windowMs: 5_000, nowMs: 20_000 });
    assert.equal(fresh.ageMs, 500);
    assert.equal(fresh.stale, false);
  });

  it('honours X-Forwarded-For only for the configured number of trusted hops', () => {
    const req = (xff: string | undefined, remote = '10.0.0.9') =>
      ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: remote } }) as never;
    assert.equal(clientIp(req('1.2.3.4'), 0), '10.0.0.9', 'ignored without TRUST_PROXY');
    assert.equal(clientIp(req('6.6.6.6, 1.2.3.4'), 1), '1.2.3.4', 'rightmost entry is the trusted proxy hop');
    assert.equal(clientIp(req('1.2.3.4, 7.7.7.7'), 2), '1.2.3.4');
    assert.equal(clientIp(req('not-an-ip'), 1), '10.0.0.9');
    assert.equal(clientIp(req(undefined), 1), '10.0.0.9');
    assert.equal(clientIp(req(undefined, '::ffff:192.0.2.1'), 0), '192.0.2.1');
  });
});
