import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appById,
  COMMUNITY_APPS,
  GATEWAYS,
  NODE_HOSTS,
  probeUrl,
  SOCIALS,
  withUtm,
} from '../../shared/catalog.ts';
import { ConfigError, loadConfig } from '../src/config.ts';
import { ManualClock } from '../src/core/clock.ts';
import { createLogger } from '../src/core/log.ts';
import { RateLimiter } from '../src/http/ratelimit.ts';
import { TRUST_FDM, TRUST_NONE, trustHops } from '../src/http/trust.ts';

describe('config', () => {
  it('has safe defaults', () => {
    const c = loadConfig({});
    assert.equal(c.port, 42069);
    assert.equal(c.host, '0.0.0.0');
    assert.equal(c.logLevel, 'info');
    assert.equal(c.fixtures, false);
    assert.equal(c.trustProxy, TRUST_FDM, 'with no TRUST_PROXY the Flux balancers are trusted, nobody else');
    assert.deepEqual(c.corsOrigins, []);
    assert.equal(c.upstream.fluxApi[0], 'https://api.runonflux.io');
    assert.equal(c.upstream.stats, 'https://stats.runonflux.io');
    assert.equal(c.intervals.healthMs, 90_000);
    assert.equal(c.health.concurrency, 4);
    assert.equal(c.health.timeoutMs, 8_000);
    assert.match(c.webDist, /web\/dist$/);
  });

  it('parses overrides', () => {
    const c = loadConfig({
      PORT: '8080',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'DEBUG',
      TRUST_PROXY: '2',
      CORS_ORIGINS: 'https://a.example, https://b.example:8443',
      FIXTURES: 'true',
      FLUX_API_URLS: 'https://one.test/, https://two.test',
      WEB_DIST: '/app/web',
      HEALTH_INTERVAL_MS: '30000',
    });
    assert.equal(c.port, 8080);
    assert.equal(c.logLevel, 'debug');
    assert.deepEqual(c.trustProxy, trustHops(2));
    assert.deepEqual(c.corsOrigins, ['https://a.example', 'https://b.example:8443']);
    assert.equal(c.fixtures, true);
    assert.deepEqual(c.upstream.fluxApi, ['https://one.test', 'https://two.test']);
    assert.equal(c.webDist, '/app/web');
    assert.equal(c.intervals.healthMs, 30_000);
    assert.equal(loadConfig({ CORS_ORIGINS: '*' }).corsOrigins, '*');
    assert.deepEqual(loadConfig({ TRUST_PROXY: 'true' }).trustProxy, trustHops(1));
  });

  it('reads TRUST_PROXY as fdm, off, a hop count, or a list of peers', () => {
    assert.equal(loadConfig({ TRUST_PROXY: 'fdm' }).trustProxy, TRUST_FDM);
    for (const off of ['0', 'false', 'no', 'off', 'none', 'FALSE']) {
      assert.equal(loadConfig({ TRUST_PROXY: off }).trustProxy, TRUST_NONE, off);
    }
    const mine = loadConfig({ TRUST_PROXY: '10.0.0.0/8, 192.0.2.7, 2001:db8::/32' }).trustProxy;
    assert.equal(mine.kind, 'peers');
    if (mine.kind === 'peers') assert.equal(mine.nets.length, 3);
    const both = loadConfig({ TRUST_PROXY: 'fdm,172.17.0.1' }).trustProxy;
    const fdm = TRUST_FDM.kind === 'peers' ? TRUST_FDM.nets.length : -1;
    assert.equal(both.kind === 'peers' ? both.nets.length : -2, fdm + 1, 'fdm stands for every balancer');
    for (const bad of ['10.0.0.0/33', '300.1.1.1', 'localhost', ',', '1.2.3.4/8/9', '10']) {
      assert.throws(() => loadConfig({ TRUST_PROXY: bad }), ConfigError, bad);
    }
  });

  it('reports every problem at once', () => {
    assert.throws(
      () =>
        loadConfig({
          PORT: 'abc',
          LOG_LEVEL: 'loud',
          TRUST_PROXY: 'maybe',
          FIXTURES: 'perhaps',
          CORS_ORIGINS: 'https://ok.example, not a url, https://x.example/path',
          FLUX_STATS_URL: 'ftp://nope',
          HEALTH_CONCURRENCY: '0',
        }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        const text = err.problems.join('\n');
        for (const key of [
          'PORT',
          'LOG_LEVEL',
          'TRUST_PROXY',
          'FIXTURES',
          'CORS_ORIGINS',
          'FLUX_STATS_URL',
          'HEALTH_CONCURRENCY',
        ]) {
          assert.ok(text.includes(key), `${key} not reported`);
        }
        return true;
      },
    );
  });
});

describe('logging', () => {
  it('emits one compact JSON object per line and respects the level', () => {
    const lines: string[] = [];
    const log = createLogger('warn', (l) => lines.push(l), { app: 'x' });
    log.info('hidden');
    log.warn('shown', { n: 1 });
    log.child({ svc: 's' }).error('boom', { err: 'e' });
    assert.equal(lines.length, 2);
    const a = JSON.parse(lines[0] as string);
    assert.equal(a.msg, 'shown');
    assert.equal(a.level, 'warn');
    assert.equal(a.app, 'x');
    assert.equal(a.n, 1);
    assert.match(a.t, /^\d{4}-\d\d-\d\dT/);
    const b = JSON.parse(lines[1] as string);
    assert.equal(b.svc, 's');
    assert.ok(!lines[0]?.includes('\n'));
  });
});

describe('RateLimiter (token bucket)', () => {
  it('allows the burst, then refills over time', () => {
    const clock = new ManualClock(0);
    const rl = new RateLimiter({ burst: 3, refillPerSec: 1, clock });
    assert.deepEqual(
      [rl.take('a').ok, rl.take('a').ok, rl.take('a').ok, rl.take('a').ok],
      [true, true, true, false],
    );
    const denied = rl.take('a');
    assert.equal(denied.ok, false);
    assert.equal(denied.retryAfterSec, 1);
    clock.advance(1_000);
    assert.equal(rl.take('a').ok, true);
    assert.equal(rl.take('a').ok, false);
    clock.advance(60_000);
    assert.deepEqual(
      [rl.take('a').ok, rl.take('a').ok, rl.take('a').ok, rl.take('a').ok],
      [true, true, true, false],
      'capped at burst',
    );
  });

  it('keeps clients independent and bounds memory', () => {
    const clock = new ManualClock(0);
    const rl = new RateLimiter({ burst: 1, refillPerSec: 1, maxKeys: 100, clock });
    assert.equal(rl.take('a').ok, true);
    assert.equal(rl.take('a').ok, false);
    assert.equal(rl.take('b').ok, true, 'another IP is unaffected');
    for (let i = 0; i < 1000; i++) rl.take(`ip${i}`);
    assert.ok(rl.size <= 100);
    clock.advance(10_000);
    rl.sweep();
    assert.equal(rl.size, 0, 'idle buckets are dropped');
  });
});

describe('catalog integrity', () => {
  const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);
  const unique = (xs: string[]) => new Set(xs).size === xs.length;
  const isHttpUrl = (s: string) => {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  };

  it('has unique, kebab-case ids in every list', () => {
    for (const list of [COMMUNITY_APPS, NODE_HOSTS, GATEWAYS, SOCIALS]) {
      assert.ok(unique(ids(list)), 'duplicate id');
      for (const id of ids(list)) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
    }
  });

  it('has valid https URLs and hosts that match them', () => {
    for (const a of COMMUNITY_APPS) {
      assert.ok(isHttpUrl(a.url), `${a.id} url`);
      assert.equal(new URL(a.url).protocol, 'https:', `${a.id} should be https`);
      assert.equal(new URL(a.url).hostname, a.host.split('/')[0], `${a.id} host`);
      if (typeof a.probe === 'string') assert.ok(isHttpUrl(a.probe), `${a.id} probe`);
    }
    for (const g of GATEWAYS) assert.ok(isHttpUrl(g.url), g.id);
    for (const h of NODE_HOSTS) if (h.url !== null) assert.ok(isHttpUrl(h.url), h.id);
    for (const s of SOCIALS) assert.ok(isHttpUrl(s.url), s.id);
  });

  it('replacedBy and replaces reference real, reciprocal ids', () => {
    for (const a of COMMUNITY_APPS) {
      if (a.replacedBy) {
        const next = appById(a.replacedBy);
        assert.ok(next, `${a.id} replacedBy ${a.replacedBy} does not exist`);
        assert.equal(next.replaces, a.id, `${a.replacedBy} should list replaces: ${a.id}`);
        assert.equal(a.lifecycle, 'retiring');
      }
      if (a.replaces) {
        const prev = appById(a.replaces);
        assert.ok(prev, `${a.id} replaces ${a.replaces} does not exist`);
        assert.equal(prev.replacedBy, a.id);
      }
    }
  });

  it('gives retiring apps a valid retiresOn date', () => {
    for (const a of COMMUNITY_APPS) {
      if (a.lifecycle === 'retiring') {
        assert.match(a.retiresOn ?? '', /^\d{4}-\d{2}-\d{2}$/, `${a.id} retiresOn`);
        const d = new Date(`${a.retiresOn}T00:00:00Z`);
        assert.ok(!Number.isNaN(d.getTime()));
        assert.equal(d.toISOString().slice(0, 10), a.retiresOn, 'not a real calendar date');
      } else {
        assert.equal(a.retiresOn, undefined, `${a.id} has retiresOn but is not retiring`);
      }
    }
  });

  it('probes every app except the site itself, and only catalog URLs', () => {
    const self = COMMUNITY_APPS.filter((a) => a.self);
    assert.equal(self.length, 1);
    assert.equal(probeUrl(self[0] as never), null);
    for (const a of COMMUNITY_APPS.filter((x) => !x.self)) assert.ok(probeUrl(a), a.id);
    assert.equal(withUtm('https://x.test/a'), 'https://x.test/a?utm_source=community');
  });
});
