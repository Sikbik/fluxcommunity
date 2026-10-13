import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatDaemonVersion,
  MAX_GEO_POINTS,
  summariseCapacity,
  summariseGeo,
} from '../src/services/fleet.ts';

const row = (o: Record<string, unknown>) => o;

describe('fleet capacity and versions', () => {
  const rows = [
    row({
      tier: 'CUMULUS',
      benchmark: { bench: { status: 'CUMULUS', cores: 4, ram: 7.5, ssd: 240 } },
      flux: { version: '8.20.0' },
      daemon: { info: { version: 9010050 } },
    }),
    row({
      tier: 'STRATUS',
      benchmark: { bench: { status: 'STRATUS', cores: 16, ram: 62.5, ssd: 1000 } },
      flux: { version: '8.20.0' },
      daemon: { info: { version: 9010050 } },
    }),
    // benchmark still running or failed: not summed
    row({
      tier: 'NIMBUS',
      benchmark: { bench: { status: 'running', cores: 8, ram: 30, ssd: 500 } },
      flux: { version: '8.19.0' },
      daemon: { info: { version: 9000650 } },
    }),
    row({
      tier: 'NIMBUS',
      benchmark: { bench: { status: 'failed', cores: 8, ram: 30, ssd: 500 } },
      flux: { version: '8.19.0' },
      daemon: { info: { version: 9000650 } },
    }),
    // unreachable placeholder: counted nowhere
    row({
      tier: 'CUMULUS',
      error: {},
      benchmark: { bench: { status: '0', cores: 0, ram: 0, ssd: 0 } },
      flux: { version: '' },
      daemon: { info: { version: 0 } },
    }),
  ];

  it('sums only passing benchmarks and ignores unreachable rows', () => {
    const r = summariseCapacity(rows);
    assert.deepEqual(r.capacity, { cores: 20, ramTb: 0.1, ssdTb: 1.2, reporting: 2 });
    assert.deepEqual(r.versions, { fluxos: '8.20.0', daemon: '9.1.0' });
  });

  it('returns null capacity when nothing benchmarked', () => {
    assert.equal(summariseCapacity([row({ error: {} })]).capacity, null);
    assert.deepEqual(summariseCapacity([]).versions, { fluxos: null, daemon: null });
  });

  it('formats the integer fluxd version', () => {
    assert.equal(formatDaemonVersion(9010050), '9.1.0');
    assert.equal(formatDaemonVersion(9000650), '9.0.6');
    assert.equal(formatDaemonVersion(0), null);
  });
});

describe('geo clustering', () => {
  const node = (tier: string, lat: number, lon: number, cc: string, country = cc) =>
    row({ tier, ip: `${lat}:${lon}`, geolocation: { lat, lon, countryCode: cc, country } });

  it('counts unreachable and zeroed rows in total but never locates them', () => {
    const g = summariseGeo([
      node('CUMULUS', 50.1, 8.6, 'DE', 'Germany'),
      node('NIMBUS', 50.2, 8.7, 'DE', 'Germany'),
      row({ tier: 'CUMULUS', error: {}, geolocation: { lat: 0, lon: 0, countryCode: '' } }),
      row({ tier: 'STRATUS', geolocation: { lat: 0, lon: 0, countryCode: 'US' } }),
    ]);
    assert.equal(g.total, 4);
    assert.equal(g.located, 2);
    assert.deepEqual(g.countries, [
      { code: 'DE', name: 'Germany', nodes: 2, tiers: { cumulus: 1, nimbus: 1, stratus: 0 } },
    ]);
    assert.equal(g.points.length, 1);
    assert.deepEqual(g.points[0], { lat: 50.15, lon: 8.65, n: 2, t: [1, 1, 0], cc: 'DE' });
  });

  it('never merges nodes of different countries into one point', () => {
    // Same 2 degree cell, different country codes (a border town).
    const g = summariseGeo([
      node('CUMULUS', 47.5, 7.6, 'CH'),
      node('CUMULUS', 47.55, 7.62, 'DE'),
      node('NIMBUS', 47.52, 7.61, 'FR'),
    ]);
    assert.equal(g.points.length, 3);
    assert.deepEqual(g.points.map((p) => p.cc).sort(), ['CH', 'DE', 'FR']);
  });

  it('coarsens the grid so points stay under the cap', () => {
    const rows = [];
    for (let i = 0; i < 3000; i++)
      rows.push(node('CUMULUS', -80 + (i % 60) * 2.6, -170 + Math.floor(i / 60) * 6.5, 'US'));
    const g = summariseGeo(rows);
    assert.equal(g.located, 3000);
    assert.ok(g.points.length <= MAX_GEO_POINTS, `${g.points.length} points`);
    assert.equal(
      g.points.reduce((a, p) => a + p.n, 0),
      3000,
    );
  });

  it('omits cc when the country code is unknown', () => {
    const g = summariseGeo([row({ tier: 'CUMULUS', geolocation: { lat: 10, lon: 10, countryCode: '' } })]);
    assert.equal(g.points[0] && 'cc' in g.points[0], false);
  });
});
