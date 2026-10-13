import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clientIp, viaTrustedProxy } from '../src/http/client-ip.ts';
import {
  FDM_APP_BALANCERS,
  inNets,
  parseAddress,
  parseNet,
  parseTrustProxy,
  TRUST_FDM,
  TRUST_NONE,
  trustHops,
} from '../src/http/trust.ts';

const req = (xff: string | string[] | undefined, remote: string) =>
  ({
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: remote },
  }) as never;

describe('addresses and blocks', () => {
  it('parses IPv4 and IPv6, with brackets, and refuses anything else', () => {
    assert.equal(parseAddress('0.0.0.0')?.n, 0n);
    assert.equal(parseAddress('255.255.255.255')?.n, 0xffffffffn);
    assert.equal(parseAddress('5.39.57.42')?.v, 4);
    assert.equal(parseAddress('::1')?.n, 1n);
    assert.equal(parseAddress('[2001:db8::1]')?.v, 6);
    assert.equal(parseAddress('::ffff:1.2.3.4')?.n, 0xffff01020304n);
    assert.equal(parseAddress('2001:0db8:0000:0000:0000:0000:0000:0001')?.n, parseAddress('2001:db8::1')?.n);
    for (const bad of [
      '',
      'localhost',
      '1.2.3',
      '256.1.1.1',
      '1.2.3.4.5',
      '2001:db8::1::2',
      'fe80::1%eth0',
      '1:2:3',
    ]) {
      assert.equal(parseAddress(bad), null, bad);
    }
  });

  it('matches addresses against blocks of the same family only', () => {
    const nets = [parseNet('10.0.0.0/8'), parseNet('192.0.2.7'), parseNet('2001:db8::/32')].filter(
      (n) => n !== null,
    );
    assert.equal(nets.length, 3);
    assert.ok(inNets('10.255.1.1', nets));
    assert.ok(inNets('192.0.2.7', nets));
    assert.ok(!inNets('192.0.2.8', nets), 'a bare address is a /32');
    assert.ok(inNets('2001:db8:ffff::1', nets));
    assert.ok(!inNets('2001:db9::1', nets));
    assert.ok(!inNets('11.0.0.1', nets));
    assert.ok(!inNets('not-an-ip', nets));
    // 0.0.0.0/0 is everything in its own family and nothing in the other.
    const all4 = [parseNet('0.0.0.0/0')].filter((n) => n !== null);
    assert.ok(inNets('203.0.113.9', all4));
    assert.ok(!inNets('2001:db8::1', all4));
  });

  it('refuses malformed blocks', () => {
    for (const bad of [
      '',
      '10.0.0.0/33',
      '10.0.0.0/-1',
      '10.0.0.0/x',
      '1.2.3.4/8/9',
      '2001:db8::/129',
      'host/8',
    ]) {
      assert.equal(parseNet(bad), null, bad);
    }
  });
});

describe('the Flux domain manager balancers', () => {
  it('lists 16 distinct, valid IPv4 addresses', () => {
    assert.equal(FDM_APP_BALANCERS.length, 16);
    assert.equal(new Set(FDM_APP_BALANCERS).size, 16);
    for (const a of FDM_APP_BALANCERS) assert.equal(parseAddress(a)?.v, 4, a);
    assert.equal(TRUST_FDM.kind === 'peers' ? TRUST_FDM.nets.length : 0, 16);
  });
});

describe('client address behind FDM (the default)', () => {
  const fdm = '5.39.57.42';

  it('is the visitor named by a balancer', () => {
    assert.equal(clientIp(req('198.51.100.7', fdm), TRUST_FDM), '198.51.100.7');
    assert.equal(clientIp(req('2001:db8::7', fdm), TRUST_FDM), '2001:db8::7');
  });

  it('takes the entry the balancer wrote, not one the caller put to its left', () => {
    assert.equal(clientIp(req('6.6.6.6, 198.51.100.7', fdm), TRUST_FDM), '198.51.100.7');
    assert.equal(clientIp(req(['6.6.6.6', '198.51.100.7'], fdm), TRUST_FDM), '198.51.100.7');
  });

  it('skips balancers that appear in the chain itself', () => {
    assert.equal(clientIp(req('198.51.100.7, 5.161.211.14', fdm), TRUST_FDM), '198.51.100.7');
  });

  it('ignores the header from a peer that is not a balancer (a direct hit on the node)', () => {
    assert.equal(clientIp(req('198.51.100.7', '203.0.113.50'), TRUST_FDM), '203.0.113.50');
    assert.equal(
      clientIp(req('5.39.57.42', '203.0.113.50'), TRUST_FDM),
      '203.0.113.50',
      'claiming to be FDM does nothing',
    );
  });

  it('falls back to the balancer when the header is missing, empty or malformed', () => {
    assert.equal(clientIp(req(undefined, fdm), TRUST_FDM), fdm);
    assert.equal(clientIp(req('', fdm), TRUST_FDM), fdm);
    assert.equal(clientIp(req('unknown', fdm), TRUST_FDM), fdm);
    assert.equal(clientIp(req('198.51.100.7, not-an-ip', fdm), TRUST_FDM), fdm);
  });

  it('recognises a balancer that arrives as an IPv4-mapped IPv6 peer', () => {
    assert.equal(clientIp(req('198.51.100.7', '::ffff:5.39.57.42'), TRUST_FDM), '198.51.100.7');
  });

  it('is the peer when nobody is trusted, whatever the header says', () => {
    assert.equal(clientIp(req('198.51.100.7', fdm), TRUST_NONE), fdm);
  });

  it('resolves through a chain of trusted peers you name yourself', () => {
    const own = parseTrustProxy('fdm,10.0.0.0/8');
    assert.ok(own);
    assert.equal(clientIp(req('198.51.100.7, 10.1.1.1', '10.2.2.2'), own), '198.51.100.7');
    assert.equal(clientIp(req('198.51.100.7', fdm), own), '198.51.100.7');
  });
});

describe('X-Forwarded-Proto is believed only through a trusted proxy', () => {
  it('follows the same trust rule as the client address', () => {
    assert.equal(viaTrustedProxy(req(undefined, '5.39.57.42'), TRUST_FDM), true);
    assert.equal(viaTrustedProxy(req(undefined, '::ffff:5.39.57.43'), TRUST_FDM), true);
    assert.equal(viaTrustedProxy(req(undefined, '203.0.113.50'), TRUST_FDM), false);
    assert.equal(viaTrustedProxy(req(undefined, '5.39.57.42'), TRUST_NONE), false);
    assert.equal(viaTrustedProxy(req(undefined, '203.0.113.50'), trustHops(1)), true);
  });
});
