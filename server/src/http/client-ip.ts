import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/**
 * The address used for rate limiting and per-IP caps. X-Forwarded-For is honoured only when
 * `trustedHops` > 0, and then only the entry that the Nth trusted proxy appended (counted from the right),
 * because everything to its left is client-controlled and spoofable.
 */
export function clientIp(req: IncomingMessage, trustedHops: number): string {
  const direct = req.socket.remoteAddress ?? 'unknown';
  if (trustedHops <= 0) return normalise(direct);
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : xff;
  if (!raw) return normalise(direct);
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = parts[parts.length - trustedHops];
  if (candidate && isIP(candidate.replace(/^\[|\]$/g, '')) !== 0) return normalise(candidate);
  return normalise(direct);
}

function normalise(ip: string): string {
  const v = ip.replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(v);
  return mapped ? (mapped[1] as string) : v.toLowerCase();
}
