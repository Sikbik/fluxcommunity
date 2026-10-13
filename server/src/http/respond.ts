import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiErrorBody, DataSource, Meta } from '../../../shared/api.ts';
import { type CompressCache, compress, negotiateEncoding } from './compress.ts';

/** Bodies below this are not worth compressing. */
export const COMPRESS_MIN_BYTES = 1024;

export function sendText(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) return;
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

export function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) return;
  const body: ApiErrorBody = { error: { code, message } };
  const buf = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

/** Weak-compare If-None-Match against an ETag. */
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const value = Array.isArray(header) ? header.join(',') : header;
  if (value.trim() === '*') return true;
  const strip = (s: string) => s.trim().replace(/^W\//, '');
  const mine = strip(etag);
  return value.split(',').some((t) => strip(t) === mine);
}

export interface MetaInput {
  /** ms epoch the underlying data was fetched. */
  asOfMs: number;
  source: DataSource;
  /** Freshness window in ms; `stale` is ageMs > window. */
  windowMs: number;
  /** Response time. Quantised to whole seconds so identical bodies can be shared and compressed once. */
  nowMs: number;
}

export function buildMeta(m: MetaInput): Meta {
  const generated = Math.floor(m.nowMs / 1000) * 1000;
  const asOf = Math.min(m.asOfMs, generated);
  const ageMs = generated - asOf;
  return {
    generatedAt: new Date(generated).toISOString(),
    asOf: new Date(asOf).toISOString(),
    ageMs,
    stale: ageMs > m.windowMs,
    source: m.source,
  };
}

export interface JsonSendOptions {
  /** Pre-serialised `data` (cached by the caller per snapshot version). */
  dataJson: string;
  meta: Meta;
  cacheControl: string;
  cache: CompressCache;
  /** Extra header lines (CORS and similar). */
  headers?: Record<string, string>;
}

/**
 * Sends `{ data, meta }` with a weak ETag, Vary, conditional 304 and br/gzip for bodies over 1 KB.
 * The ETag covers the data plus the parts of meta that describe it (asOf, source, stale) but not
 * generatedAt/ageMs, which tick every second, so a poller that revalidates gets 304s while data is flat.
 */
export async function sendEnvelope(
  req: IncomingMessage,
  res: ServerResponse,
  o: JsonSendOptions,
): Promise<void> {
  if (res.headersSent) return;
  const metaJson = JSON.stringify(o.meta);
  const etag = `W/"${createHash('sha256')
    .update(o.dataJson)
    .update(`|${o.meta.asOf}|${o.meta.source}|${o.meta.stale}`)
    .digest('base64url')
    .slice(0, 22)}"`;
  const base: Record<string, string | number> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': o.cacheControl,
    ETag: etag,
    Vary: 'Accept-Encoding',
    ...o.headers,
  };
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, base);
    res.end();
    return;
  }
  const raw = Buffer.from(`{"data":${o.dataJson},"meta":${metaJson}}`, 'utf8');
  let body: Buffer = raw;
  if (raw.length >= COMPRESS_MIN_BYTES) {
    const enc = negotiateEncoding(req.headers['accept-encoding']);
    if (enc) {
      const key = `json|${etag}|${o.meta.generatedAt}|${enc}`;
      body = await o.cache.get(key, () => compress(raw, enc, 5));
      base['Content-Encoding'] = enc;
    }
  }
  if (res.headersSent || res.destroyed) return;
  base['Content-Length'] = body.length;
  res.writeHead(200, base);
  res.end(req.method === 'HEAD' ? undefined : body);
}
