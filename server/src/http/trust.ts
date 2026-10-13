import { isIP } from 'node:net';

/**
 * Who may tell us the visitor's address.
 *
 * On Flux the app is reached through the Flux domain manager (FDM): an HAProxy fleet that terminates TLS and
 * adds the visitor's address to `X-Forwarded-For` (`option forwardfor`). The TCP peer the container sees is
 * then an FDM balancer, never the visitor. Two ways to get that wrong:
 *
 * - ignore the header, and every visitor behind one balancer shares one rate-limit bucket and one set of
 *   stream slots (a handful of first-time visitors in a few seconds start getting 429 for static files);
 * - believe the header from anyone, and a caller who reaches `<node-ip>:<port>` directly picks its own
 *   address and walks around every per-address limit.
 *
 * So the default trusts the header from the FDM app balancers and from nobody else. A request that does not
 * come from a balancer is attributed to its socket peer whatever headers it carries.
 */
export type TrustProxy =
  | { readonly kind: 'none' }
  /** Every peer is trusted; the client is the entry that many hops from the right of X-Forwarded-For. */
  | { readonly kind: 'hops'; readonly hops: number }
  /** Only these peers are trusted; the client is the right-most entry that is not itself a trusted peer. */
  | { readonly kind: 'peers'; readonly nets: readonly Net[] };

export interface Net {
  readonly v: 4 | 6;
  readonly addr: bigint;
  readonly prefix: number;
}

/**
 * The FDM balancers that front `<app>.app.runonflux.io`: production (EU, Singapore, US) and staging.
 * Source: RunOnFlux/flux `ZelBack/config/default.js`, `fdmAddresses`, entries under "apps" (read 2026-10-13).
 * The same list backs Flux Atlas. A balancer missing here is only treated as a visitor (the shared-bucket
 * behaviour above), never trusted by mistake; refresh the list from that file if FDM grows.
 */
export const FDM_APP_BALANCERS: readonly string[] = [
  // Production, EU.
  '5.39.57.42',
  '5.39.57.43',
  '5.39.57.44',
  '5.39.57.45',
  // Production, Singapore.
  '146.190.83.190',
  '146.190.103.145',
  '134.209.107.70',
  '146.190.105.10',
  // Production, US.
  '5.161.211.14',
  '5.161.178.20',
  '5.161.42.73',
  '5.161.81.155',
  // Staging.
  '5.161.215.75',
  '5.161.109.34',
  '5.39.57.46',
  '5.39.57.47',
];

interface Address {
  v: 4 | 6;
  n: bigint;
}

/** Parses an IPv4 or IPv6 address (brackets allowed; zone ids are not). Null when it is neither. */
export function parseAddress(raw: string): Address | null {
  const s = raw.trim().replace(/^\[|\]$/g, '');
  const kind = isIP(s);
  if (kind === 4) {
    const [a, b, c, d] = s.split('.').map(Number) as [number, number, number, number];
    return { v: 4, n: BigInt(((a << 24) | (b << 16) | (c << 8) | d) >>> 0) };
  }
  if (kind === 6) {
    const n = ipv6ToBigInt(s);
    return n === null ? null : { v: 6, n };
  }
  return null;
}

function ipv6ToBigInt(input: string): bigint | null {
  let s = input.toLowerCase();
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (tail) {
    const [, a, b, c, d] = tail.map(Number) as [number, number, number, number, number];
    s = `${s.slice(0, s.length - (tail[0]?.length ?? 0))}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(Number.parseInt(g, 16));
  }
  return n;
}

/** Parses `a.b.c.d`, `a.b.c.d/n`, `x::y` or `x::y/n`. Null when it is not a valid address block. */
export function parseNet(token: string): Net | null {
  const [addrPart, prefixPart, ...extra] = token.trim().split('/');
  if (extra.length > 0 || !addrPart) return null;
  const a = parseAddress(addrPart);
  if (!a) return null;
  const max = a.v === 4 ? 32 : 128;
  let prefix = max;
  if (prefixPart !== undefined) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > max) return null;
  }
  return { v: a.v, addr: a.n, prefix };
}

/** True when `ip` (an IPv4 or IPv6 address) falls inside any of the blocks. */
export function inNets(ip: string, nets: readonly Net[]): boolean {
  const a = parseAddress(ip);
  if (!a) return false;
  const bits = a.v === 4 ? 32n : 128n;
  return nets.some((net) => {
    if (net.v !== a.v) return false;
    const shift = bits - BigInt(net.prefix);
    return a.n >> shift === net.addr >> shift;
  });
}

const FDM_NETS: readonly Net[] = FDM_APP_BALANCERS.map((a) => parseNet(a)).filter(
  (n): n is Net => n !== null,
);

export const TRUST_NONE: TrustProxy = { kind: 'none' };
export const TRUST_FDM: TrustProxy = { kind: 'peers', nets: FDM_NETS };
export const trustHops = (hops: number): TrustProxy => ({ kind: 'hops', hops });

/**
 * Parses TRUST_PROXY. Unset or `fdm`: the FDM app balancers (the default, right for Flux). `false`, `0`, `no`,
 * `off`, `none`: nobody. `true` or `1` to `9`: every peer, that many hops from the right (a reverse proxy you
 * run yourself). Otherwise a comma-separated list of addresses and CIDR blocks, where `fdm` stands for the
 * balancers: only those peers. Null when the value is none of these.
 */
export function parseTrustProxy(raw: string): TrustProxy | null {
  const v = raw.trim().toLowerCase();
  if (v === '' || v === 'fdm') return TRUST_FDM;
  if (['0', 'false', 'no', 'off', 'none'].includes(v)) return TRUST_NONE;
  if (['true', 'yes', 'on'].includes(v)) return trustHops(1);
  if (/^[1-9]$/.test(v)) return trustHops(Number(v));
  const nets: Net[] = [];
  for (const token of v
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)) {
    if (token === 'fdm') {
      nets.push(...FDM_NETS);
      continue;
    }
    const net = parseNet(token);
    if (!net) return null;
    nets.push(net);
  }
  return nets.length > 0 ? { kind: 'peers', nets } : null;
}
