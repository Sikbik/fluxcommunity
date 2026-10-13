import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * Outbound HTTP for health probes, with SSRF defence in depth. Probe URLs come only from the static
 * catalog, but the transport still refuses to talk to private, loopback, link-local or otherwise
 * non-public addresses, checking at CONNECT time (a custom `lookup`) so a DNS answer that changes between
 * a check and a connect cannot slip through, and again for every redirect hop.
 */

const blocked = new BlockList();
const V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
for (const [net, prefix] of V4) blocked.addSubnet(net, prefix, 'ipv4');
const V6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
for (const [net, prefix] of V6) blocked.addSubnet(net, prefix, 'ipv6');

/** True when `ip` is a public unicast address that probes may connect to. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 0) return false;
  if (kind === 4) return !blocked.check(ip, 'ipv4');
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the embedded IPv4 address.
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPublicAddress(mapped[1] as string);
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = Number.parseInt(hex[1] as string, 16);
    const lo = Number.parseInt(hex[2] as string, 16);
    return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return !blocked.check(ip, 'ipv6');
}

export class ProbeBlockedError extends Error {
  readonly code = 'EBLOCKED';
  constructor(host: string) {
    super(`refusing to probe non-public address for ${host}`);
    this.name = 'ProbeBlockedError';
  }
}

type LookupCb = (err: Error | null, address?: string | LookupAddress[], family?: number) => void;

function makeLookup(allowPrivate: boolean) {
  return (hostname: string, options: { all?: boolean; family?: number }, cb: LookupCb) => {
    dnsLookup(hostname, { all: true, family: options.family ?? 0, verbatim: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!allowPrivate && addrs.some((a) => !isPublicAddress(a.address))) {
        return cb(new ProbeBlockedError(hostname));
      }
      const first = addrs[0];
      if (!first) return cb(new Error('no address'));
      if (options.all) return cb(null, addrs);
      cb(null, first.address, first.family);
    });
  };
}

export interface ProbeResponse {
  status: number;
  location: string | null;
}

export interface ProbeRequestOptions {
  method: 'HEAD' | 'GET';
  timeoutMs: number;
  userAgent: string;
  allowPrivate?: boolean;
}

/** Issues one request (no redirects, body discarded) and resolves with status and Location. */
export function probeRequest(url: URL, opts: ProbeRequestOptions): Promise<ProbeResponse> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error(`unsupported scheme ${url.protocol}`));
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) !== 0 && !opts.allowPrivate && !isPublicAddress(host)) {
      return reject(new ProbeBlockedError(host));
    }
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: opts.method,
        agent: false,
        signal: AbortSignal.timeout(opts.timeoutMs),
        lookup: makeLookup(opts.allowPrivate === true) as never,
        headers: {
          'user-agent': opts.userAgent,
          accept: '*/*',
          'accept-encoding': 'identity',
          connection: 'close',
        },
      },
      (res) => {
        const loc = res.headers.location;
        resolve({ status: res.statusCode ?? 0, location: typeof loc === 'string' ? loc : null });
        res.destroy();
      },
    );
    req.on('error', reject);
    req.end();
  });
}
