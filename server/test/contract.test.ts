import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { API_PATHS } from '../../shared/api.ts';
import { COMMUNITY_APPS } from '../../shared/catalog.ts';
import { buildFallback } from '../src/data/fallback.ts';
import {
  ApiErrorBody,
  AppsHealthSnapshot,
  BlockEvent,
  BlocksSnapshot,
  envelope,
  GeoSnapshot,
  HealthEvent,
  HelloEvent,
  interfaceKeys,
  NetworkEvent,
  NetworkSnapshot,
  type ObjCheck,
  ServiceInfo,
  validate,
} from './contract.ts';
import { request, startFixtureServer, type TestServer } from './helpers.ts';

describe('contract validator stays in sync with shared/api.ts', () => {
  const shapes: Record<string, ObjCheck> = {
    NetworkSnapshot,
    GeoSnapshot,
    BlocksSnapshot,
    AppsHealthSnapshot,
    ServiceInfo,
    HelloEvent,
    BlockEvent,
  };
  for (const [name, shape] of Object.entries(shapes)) {
    it(`${name} lists exactly the interface's properties`, () => {
      assert.deepEqual([...shape.keys].sort(), interfaceKeys(name).sort());
    });
  }
  for (const [name, shape] of Object.entries({ GeoPoint: null, CapacityStats: null })) {
    void shape;
    it(`${name} property list includes the additive fields`, () => {
      const keys = interfaceKeys(name);
      if (name === 'GeoPoint') assert.ok(keys.includes('cc'));
      if (name === 'CapacityStats') assert.ok(keys.includes('reporting'));
    });
  }
});

describe('every endpoint conforms to the contract', () => {
  let s: TestServer;
  before(async () => {
    s = await startFixtureServer({ WEB_DIST: '/nonexistent' }, 120);
  });
  after(async () => {
    await s.stop();
  });

  const get = async (path: string) =>
    (await request(s.port, path, { headers: { 'accept-encoding': 'identity' } })).json();

  it('GET /api/v1/network', async () => {
    const body = await get(API_PATHS.network);
    assert.deepEqual(validate(envelope(NetworkSnapshot), body), []);
  });
  it('GET /api/v1/geo', async () => {
    const body = (await get(API_PATHS.geo)) as {
      data: { points: { cc?: string }[]; located: number; countries: { nodes: number }[] };
    };
    assert.deepEqual(validate(envelope(GeoSnapshot), body), []);
    assert.ok(body.data.points.length > 100);
    assert.ok(
      body.data.points.every((p) => typeof p.cc === 'string' && /^[A-Z]{2}$/.test(p.cc)),
      'cc populated',
    );
    assert.equal(
      body.data.countries.reduce((a, c) => a + c.nodes, 0),
      body.data.located,
    );
  });
  it('GET /api/v1/blocks', async () => {
    const body = (await get(API_PATHS.blocks)) as {
      data: { blocks: { height: number; intervalSec: number | null }[] };
    };
    assert.deepEqual(validate(envelope(BlocksSnapshot), body), []);
    assert.equal(body.data.blocks.length, 120);
    assert.equal(body.data.blocks[0]?.intervalSec, null);
    assert.ok(body.data.blocks.slice(1).every((b) => b.intervalSec === 30));
  });
  it('GET /api/v1/health lists every catalog app', async () => {
    const body = (await get(API_PATHS.health)) as { data: { apps: { id: string; state: string }[] } };
    assert.deepEqual(validate(envelope(AppsHealthSnapshot), body), []);
    assert.deepEqual(
      body.data.apps.map((a) => a.id),
      COMMUNITY_APPS.map((a) => a.id),
    );
    assert.equal(body.data.apps.find((a) => a.id === 'claimcalc')?.state, 'down');
    assert.equal(body.data.apps.find((a) => a.id === 'community')?.state, 'unknown');
  });
  it('GET /api/v1/info', async () => {
    const body = (await get(API_PATHS.info)) as { data: { mode: string } };
    assert.deepEqual(validate(envelope(ServiceInfo), body), []);
    assert.equal(body.data.mode, 'fixtures');
  });
  it('error bodies match ApiErrorBody', async () => {
    assert.deepEqual(validate(ApiErrorBody, await get('/api/v1/zzz')), []);
  });
  it('the SSE hello event conforms and labels provenance exactly like REST', async () => {
    const frames = await collectFrames(s.port, (f) => f.some((x) => x.event === 'hello'));
    const hello = JSON.parse(frames.find((f) => f.event === 'hello')?.data ?? 'null');
    assert.deepEqual(validate(HelloEvent, hello, 'hello'), []);
    assert.equal(hello.networkMeta.source, 'fallback', 'fixtures never claim live');
    assert.equal(hello.healthMeta.source, 'fallback');
    const rest = (await get(API_PATHS.network)) as { meta: { source: string } };
    assert.equal(hello.networkMeta.source, rest.meta.source);
  });

  it('streamed network and block events conform, and network carries an envelope', async () => {
    const frames = await collectFrames(
      s.port,
      (f) => f.some((x) => x.event === 'network') && f.some((x) => x.event === 'block'),
    );
    const net = JSON.parse(frames.find((f) => f.event === 'network')?.data ?? 'null');
    assert.deepEqual(validate(NetworkEvent, net, 'network'), []);
    assert.equal(net.meta.source, 'fallback');
    const block = JSON.parse(frames.find((f) => f.event === 'block')?.data ?? 'null');
    assert.deepEqual(validate(BlockEvent, block, 'block'), []);
  });

  it('the health event envelope shape is the REST health envelope', async () => {
    const rest = await get(API_PATHS.health);
    assert.deepEqual(validate(HealthEvent, rest, 'health'), []);
  });
});

interface Frame {
  event: string;
  data: string;
}

async function collectFrames(port: number, done: (frames: Frame[]) => boolean, ms = 4_000): Promise<Frame[]> {
  const res = await fetch(`http://127.0.0.1:${port}${API_PATHS.stream}`);
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  const frames: Frame[] = [];
  let buf = '';
  const end = Date.now() + ms;
  while (Date.now() < end && !done(frames)) {
    const { value, done: closed } = await reader.read();
    if (closed) break;
    buf += dec.decode(value);
    let i = buf.indexOf('\n\n');
    while (i !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(raw)?.[1];
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (ev && data !== undefined) frames.push({ event: ev, data });
      i = buf.indexOf('\n\n');
    }
  }
  await reader.cancel();
  return frames;
}

describe('baked fallback conforms', () => {
  it('network and geo fallbacks validate', () => {
    const fb = buildFallback();
    assert.deepEqual(validate(NetworkSnapshot, fb.network, 'network'), []);
    assert.deepEqual(validate(GeoSnapshot, fb.geo, 'geo'), []);
    assert.equal(fb.network.market, null, 'no stale price in the fallback');
    assert.ok(fb.geo.points.length > 100);
  });
});
