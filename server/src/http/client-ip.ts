import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { inNets, type TrustProxy } from './trust.ts';

/**
 * The address used for rate limiting and per-address caps. X-Forwarded-For is read only as `trust` allows
 * (see trust.ts), and only the entries a trusted proxy wrote: everything to the left of them is
 * client-controlled and spoofable. A missing or malformed header means the peer is the client, never an error.
 */
export function clientIp(req: IncomingMessage, trust: TrustProxy): string {
  const peer = normalise(req.socket.remoteAddress ?? 'unknown');
  if (trust.kind === 'none') return peer;
  const parts = forwardedFor(req);
  if (trust.kind === 'hops') {
    const candidate = parts[parts.length - trust.hops];
    return candidate && isIP(unbracket(candidate)) !== 0 ? normalise(candidate) : peer;
  }
  // Only a trusted peer may name the client. The client is then the right-most entry that is not itself a
  // trusted proxy, so a chain of trusted proxies resolves to the visitor behind all of them.
  if (!inNets(peer, trust.nets)) return peer;
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i] as string;
    if (isIP(unbracket(candidate)) === 0) return peer;
    const ip = normalise(candidate);
    if (!inNets(ip, trust.nets)) return ip;
  }
  return peer;
}

/** True when the request came through a proxy we trust, so its X-Forwarded-Proto may be believed. */
export function viaTrustedProxy(req: IncomingMessage, trust: TrustProxy): boolean {
  if (trust.kind === 'none') return false;
  if (trust.kind === 'hops') return true;
  return inNets(normalise(req.socket.remoteAddress ?? ''), trust.nets);
}

function forwardedFor(req: IncomingMessage): string[] {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : xff;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function unbracket(ip: string): string {
  return ip.replace(/^\[|\]$/g, '');
}

function normalise(ip: string): string {
  const v = unbracket(ip);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(v);
  return mapped ? (mapped[1] as string) : v.toLowerCase();
}
