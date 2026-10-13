import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import type { CommunityApp } from '../../shared/catalog.ts';
import {
  applyProbe,
  classify,
  HealthProber,
  initialRecord,
  type ProbeOutcome,
  probeUrlOnce,
  type Transport,
} from '../src/services/health.ts';
import { isPublicAddress, probeRequest } from '../src/services/probe-http.ts';

const out = (
  status: number | null,
  latencyMs: number | null = 100,
  extra: Partial<ProbeOutcome> = {},
): ProbeOutcome => ({
  status,
  latencyMs,
  ...extra,
});

describe('health classification', () => {
  it('up: 2xx/3xx under 2.5 s', () => {
    assert.equal(classify(out(200, 120)), 'up');
    assert.equal(classify(out(301, 2_499)), 'up');
  });
  it('degraded: slow 2xx/3xx, 4xx other than 404/410, redirect loops', () => {
    assert.equal(classify(out(200, 2_500)), 'degraded');
    assert.equal(classify(out(200, 9_000)), 'degraded');
    for (const s of [400, 401, 403, 405, 429]) assert.equal(classify(out(s)), 'degraded', String(s));
    assert.equal(classify(out(302, 50, { tooManyRedirects: true })), 'degraded');
  });
  it('down: 5xx, 404, 410, no response', () => {
    for (const s of [500, 502, 503, 504, 404, 410]) assert.equal(classify(out(s)), 'down', String(s));
    assert.equal(classify(out(null, null, { error: 'timeout' })), 'down');
    assert.equal(classify(out(null, null, { error: 'ENOTFOUND' })), 'down');
  });
});

describe('flap damping', () => {
  const t0 = Date.parse('2026-10-12T12:00:00Z');
  it('needs two consecutive failures before down, and tracks since', () => {
    let rec = initialRecord();
    let step = applyProbe(rec, 'up', out(200), t0);
    rec = step.next;
    assert.equal(rec.state, 'up');
    assert.equal(rec.since, new Date(t0).toISOString());

    step = applyProbe(rec, 'down', out(503), t0 + 90_000);
    assert.equal(step.next.state, 'up', 'one failure does not flip');
    assert.equal(step.pending, true);
    assert.equal(step.next.since, new Date(t0).toISOString(), 'since is unchanged while holding');
    assert.equal(step.next.httpStatus, 503, 'the observed status is still recorded');
    rec = step.next;

    step = applyProbe(rec, 'down', out(503), t0 + 180_000);
    assert.equal(step.next.state, 'down');
    assert.equal(step.next.since, new Date(t0 + 180_000).toISOString());
    rec = step.next;

    step = applyProbe(rec, 'down', out(503), t0 + 270_000);
    assert.equal(step.next.state, 'down');
    assert.equal(step.next.since, new Date(t0 + 180_000).toISOString(), 'since does not move while down');
    rec = step.next;

    step = applyProbe(rec, 'up', out(200), t0 + 360_000);
    assert.equal(step.next.state, 'up', 'recovery is immediate');
    assert.equal(step.next.since, new Date(t0 + 360_000).toISOString());
  });

  it('a success between failures resets the streak', () => {
    let rec = applyProbe(initialRecord(), 'up', out(200), t0).next;
    rec = applyProbe(rec, 'down', out(500), t0 + 1).next;
    rec = applyProbe(rec, 'up', out(200), t0 + 2).next;
    rec = applyProbe(rec, 'down', out(500), t0 + 3).next;
    assert.equal(rec.state, 'up');
  });

  it('a never-probed app stays unknown after one failure and goes down on the second', () => {
    let step = applyProbe(initialRecord(), 'down', out(null, null), t0);
    assert.equal(step.next.state, 'unknown');
    assert.equal(step.next.since, null);
    step = applyProbe(step.next, 'down', out(null, null), t0 + 10_000);
    assert.equal(step.next.state, 'down');
  });
});

describe('probeUrlOnce (HEAD then GET, redirects)', () => {
  const opts = (transport: Transport, maxRedirects = 3) => ({ timeoutMs: 1_000, maxRedirects, transport });

  it('uses HEAD when it succeeds and never issues a GET', async () => {
    const seen: string[] = [];
    const r = await probeUrlOnce(
      'https://app.test/',
      opts(async (_u, m) => {
        seen.push(m);
        return { status: 200, location: null };
      }),
    );
    assert.deepEqual(seen, ['HEAD']);
    assert.equal(r.status, 200);
  });

  it('falls back to GET when HEAD is rejected (405)', async () => {
    const seen: string[] = [];
    const r = await probeUrlOnce(
      'https://app.test/',
      opts(async (_u, m) => {
        seen.push(m);
        return { status: m === 'HEAD' ? 405 : 200, location: null };
      }),
    );
    assert.deepEqual(seen, ['HEAD', 'GET']);
    assert.equal(r.status, 200);
  });

  it('reports the GET result when both fail (503 stays 503)', async () => {
    const r = await probeUrlOnce(
      'https://app.test/',
      opts(async () => ({ status: 503, location: null })),
    );
    assert.equal(r.status, 503);
  });

  it('does not retry with GET after a timeout or DNS failure', async () => {
    const seen: string[] = [];
    const r = await probeUrlOnce(
      'https://app.test/',
      opts(async (_u, m) => {
        seen.push(m);
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      }),
    );
    assert.deepEqual(seen, ['HEAD']);
    assert.equal(r.status, null);
    assert.equal(r.error, 'ENOTFOUND');
  });

  it('follows at most three redirects', async () => {
    let hops = 0;
    const transport: Transport = async (u) => {
      hops += 1;
      return { status: 302, location: `https://app.test/${u.pathname.length + 1}` };
    };
    const r = await probeUrlOnce('https://app.test/', opts(transport, 3));
    assert.equal(r.tooManyRedirects, true);
    assert.equal(classify(r), 'degraded');
    // The original request plus three followed redirects; a 3xx counts as success so no GET fallback.
    assert.equal(hops, 4);
  });

  it('follows a redirect to a final 200 and refuses a non-http target', async () => {
    const ok = await probeUrlOnce(
      'http://app.test/',
      opts(async (u) =>
        u.protocol === 'http:'
          ? { status: 301, location: 'https://app.test/home' }
          : { status: 200, location: null },
      ),
    );
    assert.equal(ok.status, 200);
    const bad = await probeUrlOnce(
      'https://app.test/',
      opts(async () => ({ status: 302, location: 'file:///etc/passwd' })),
    );
    assert.equal(bad.status, null);
  });
});

describe('SSRF defence', () => {
  it('classifies private, loopback, link-local and mapped addresses as non-public', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:10.0.0.1',
    ]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
    for (const ip of ['5.161.211.14', '216.150.1.65', '8.8.8.8', '2606:4700::6810:84e5', '::ffff:8.8.8.8']) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
    assert.equal(isPublicAddress('not-an-ip'), false);
  });

  it('refuses to connect to a loopback literal, and to localhost by name', async () => {
    const server = http.createServer((_q, r) => r.end('secret'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const o = { method: 'GET' as const, timeoutMs: 1_000, userAgent: 't' };
      await assert.rejects(probeRequest(new URL(`http://127.0.0.1:${port}/`), o), /non-public/);
      await assert.rejects(probeRequest(new URL(`http://localhost:${port}/`), o), /non-public/);
      await assert.rejects(probeRequest(new URL(`http://[::1]:${port}/`), o), /non-public/);
      const ok = await probeRequest(new URL(`http://127.0.0.1:${port}/`), { ...o, allowPrivate: true });
      assert.equal(ok.status, 200);
    } finally {
      server.close();
    }
  });
});

describe('HealthProber', () => {
  const app = (id: string, extra: Partial<CommunityApp> = {}): CommunityApp => ({
    id,
    name: id,
    tagline: '',
    description: '',
    category: 'network',
    builder: null,
    url: `https://${id}.test`,
    host: `${id}.test`,
    lifecycle: 'live',
    ...extra,
  });

  const base = {
    intervalMs: 60_000,
    concurrency: 4,
    timeoutMs: 1_000,
    maxRedirects: 3,
    slowMs: 2_500,
    confirmDelayMs: 20,
    userAgent: 'FluxCommunityHealth/test',
  };

  it('covers every catalog app, skips probe:false, and never exceeds the concurrency cap', async () => {
    let inflight = 0;
    let peak = 0;
    const urls: string[] = [];
    const transport: Transport = async (u) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      urls.push(u.hostname);
      await new Promise((r) => setTimeout(r, 15));
      inflight -= 1;
      return { status: 200, location: null };
    };
    const apps = [
      ...Array.from({ length: 10 }, (_, i) => app(`a${i}`)),
      app('self', { probe: false, self: true }),
    ];
    const p = new HealthProber({ ...base, apps, transport });
    assert.equal(p.targetCount, 10);
    assert.deepEqual(
      p.snapshot().apps.map((a) => [a.id, a.state]),
      apps.map((a) => [a.id, 'unknown']),
    );
    await p.runRound();
    assert.ok(peak <= 4, `peak concurrency ${peak}`);
    assert.ok(urls.every((u) => u !== 'self.test'));
    const snap = p.snapshot();
    assert.equal(snap.apps.length, 11, 'one entry per catalog app, in catalog order');
    assert.equal(snap.apps.filter((a) => a.state === 'up').length, 10);
    assert.equal(snap.apps.find((a) => a.id === 'self')?.state, 'unknown');
    assert.ok(p.lastCheckedAt !== null);
  });

  it('flips to down only after the confirmation probe, and emits one change', async () => {
    let status = 200;
    const transport: Transport = async () => ({ status, location: null });
    const p = new HealthProber({ ...base, apps: [app('x')], transport });
    const changes: string[] = [];
    p.onChange((s) => changes.push(s.apps[0]?.state ?? '?'));
    await p.runRound();
    assert.deepEqual(changes, ['up']);
    status = 503;
    await p.runRound();
    assert.equal(p.snapshot().apps[0]?.state, 'up', 'first failure is held');
    // The prober schedules its own quick confirmation probe.
    const end = Date.now() + 1_000;
    while (p.snapshot().apps[0]?.state !== 'down' && Date.now() < end)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(p.snapshot().apps[0]?.state, 'down');
    assert.deepEqual(changes, ['up', 'down']);
    p.stop();
  });

  it('sends the portal user agent and works against a real local server', async () => {
    let ua = '';
    const server = http.createServer((req, res) => {
      ua = String(req.headers['user-agent']);
      res.statusCode = req.url === '/missing' ? 404 : 200;
      res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const p = new HealthProber({
        ...base,
        confirmDelayMs: 5,
        apps: [
          app('good', { url: `http://127.0.0.1:${port}/` }),
          app('gone', { url: `http://127.0.0.1:${port}/missing` }),
        ],
        allowPrivate: true,
      });
      await p.runRound();
      await p.runRound();
      const byId = Object.fromEntries(p.snapshot().apps.map((a) => [a.id, a]));
      assert.equal(byId.good?.state, 'up');
      assert.equal(byId.good?.httpStatus, 200);
      assert.ok((byId.good?.latencyMs ?? -1) >= 0);
      assert.equal(byId.gone?.state, 'down');
      assert.equal(byId.gone?.httpStatus, 404);
      assert.match(ua, /^FluxCommunityHealth\/test$/);
      p.stop();
    } finally {
      server.close();
    }
  });
});
