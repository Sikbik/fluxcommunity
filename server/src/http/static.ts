import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { type CompressCache, compress, negotiateEncoding } from './compress.ts';
import { etagMatches, sendText } from './respond.ts';

/** MIME types for what a Vite build and the public/ folder contain. Unknown extensions are octet-stream. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
};

/** Types worth compressing on the fly (already-compressed media and fonts are not). */
const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.webmanifest',
  '.map',
  '.txt',
  '.xml',
  '.svg',
  '.ico',
  '.wasm',
  '.gltf',
]);

const MAX_COMPRESS_BYTES = 8 * 1024 * 1024;
const MIN_COMPRESS_BYTES = 1024;

export function mimeFor(ext: string): string {
  return MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

export type ResolveResult =
  | { kind: 'ok'; path: string; segments: string[] }
  | { kind: 'bad-request' }
  | { kind: 'not-found' };

/**
 * Maps a URL pathname to a candidate file path under `root`, refusing anything suspicious: NUL bytes,
 * backslashes, `.` or `..` segments, any segment starting with a dot (dotfiles), and results that escape
 * the root. Symlinks are checked separately with realpath.
 */
export function resolveSafe(root: string, pathname: string): ResolveResult {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { kind: 'bad-request' };
  }
  if (decoded.includes('\0')) return { kind: 'bad-request' };
  if (decoded.includes('\\')) return { kind: 'not-found' };
  const segments = decoded.split('/').filter((s) => s.length > 0);
  for (const s of segments) {
    if (s.startsWith('.')) return { kind: 'not-found' };
  }
  const path = join(root, ...segments);
  if (path !== root && !path.startsWith(root + sep)) return { kind: 'not-found' };
  return { kind: 'ok', path, segments };
}

export function cacheControlFor(segments: string[], ext: string): string {
  if (segments[0] === 'assets') return 'public, max-age=31536000, immutable';
  if (ext === '.html' || ext === '') return 'no-cache';
  if (['.webmanifest', '.txt', '.xml', '.json'].includes(ext)) return 'public, max-age=300';
  return 'public, max-age=3600, stale-while-revalidate=86400';
}

/** Parse a single `bytes=a-b` range. Returns null for unsatisfiable/malformed, 'ignore' for multi-range. */
export function parseRange(header: string, size: number): { start: number; end: number } | 'ignore' | null {
  const m = /^bytes=(.+)$/i.exec(header.trim());
  if (!m) return 'ignore';
  const spec = (m[1] as string).trim();
  if (spec.includes(',')) return 'ignore';
  const r = /^(\d*)-(\d*)$/.exec(spec);
  if (!r) return 'ignore';
  const [, a, b] = r as unknown as [string, string, string];
  if (a === '' && b === '') return null;
  let start: number;
  let end: number;
  if (a === '') {
    const suffix = Number(b);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

export interface StaticOptions {
  root: string;
  cache: CompressCache;
}

export class StaticSite {
  readonly #root: string;
  readonly #cache: CompressCache;
  #realRoot: string | null = null;
  #availableAt = 0;
  #available = false;

  constructor(opts: StaticOptions) {
    this.#root = opts.root;
    this.#cache = opts.cache;
  }

  /** True when `index.html` exists under the root. Re-checked at most every 2 seconds. */
  async available(): Promise<boolean> {
    const now = Date.now();
    if (now - this.#availableAt < 2_000) return this.#available;
    this.#availableAt = now;
    try {
      const s = await stat(join(this.#root, 'index.html'));
      this.#available = s.isFile();
      if (this.#available) this.#realRoot = await realpath(this.#root);
    } catch {
      this.#available = false;
    }
    return this.#available;
  }

  /** Serves `pathname` (already stripped of the query). Always ends the response. */
  async handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    if (!(await this.available())) return this.#apiOnly(req, res, pathname);
    const r = resolveSafe(this.#root, pathname);
    if (r.kind === 'bad-request') return sendText(req, res, 400, 'Bad request\n');
    if (r.kind === 'not-found') return sendText(req, res, 404, 'Not found\n');

    let file = r.path;
    let segments = r.segments;
    let st = await this.#statFile(file);
    if (st?.isDirectory()) {
      file = join(file, 'index.html');
      segments = [...segments, 'index.html'];
      st = await this.#statFile(file);
    }
    if (!st?.isFile()) {
      const last = segments[segments.length - 1] ?? '';
      const accept = String(req.headers.accept ?? '');
      const wantsHtml = accept === '' || accept.includes('text/html') || accept.includes('*/*');
      // Extensionless routes belong to the single-page app; a missing asset stays a 404.
      if (!last.includes('.') && wantsHtml) {
        file = join(this.#root, 'index.html');
        segments = ['index.html'];
        st = await this.#statFile(file);
      }
      if (!st?.isFile()) return sendText(req, res, 404, 'Not found\n');
    }
    // Refuse symlinks that point outside the root.
    try {
      const real = await realpath(file);
      const rr = this.#realRoot ?? this.#root;
      if (real !== rr && !real.startsWith(rr + sep)) return sendText(req, res, 404, 'Not found\n');
    } catch {
      return sendText(req, res, 404, 'Not found\n');
    }
    return this.#serveFile(req, res, file, segments, st.size, st.mtimeMs);
  }

  async #statFile(path: string) {
    try {
      return await stat(path);
    } catch {
      return null;
    }
  }

  #apiOnly(req: IncomingMessage, res: ServerResponse, pathname: string): void {
    if (pathname === '/' || pathname === '/index.html') {
      const html =
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Flux Community API</title><body style="font:16px system-ui;margin:2rem;max-width:40rem">' +
        '<h1>Flux Community API</h1><p>The web bundle is not installed on this server, so only the API is available.</p>' +
        '<ul><li><a href="/api/v1/network">/api/v1/network</a></li><li><a href="/api/v1/health">/api/v1/health</a></li>' +
        '<li><a href="/api/v1/info">/api/v1/info</a></li><li><a href="/healthz">/healthz</a></li></ul></body>';
      const buf = Buffer.from(html);
      res.writeHead(503, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
      return;
    }
    sendText(req, res, 404, 'Not found\n');
  }

  async #serveFile(
    req: IncomingMessage,
    res: ServerResponse,
    file: string,
    segments: string[],
    size: number,
    mtimeMs: number,
  ): Promise<void> {
    const ext = extname(file).toLowerCase();
    const type = mimeFor(ext);
    const compressible = COMPRESSIBLE.has(ext);
    const etag = `W/"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
    const lastModified = new Date(mtimeMs).toUTCString();
    const headers: Record<string, string | number> = {
      'Content-Type': type,
      'Cache-Control': cacheControlFor(segments, ext),
      ETag: etag,
      'Last-Modified': lastModified,
      'Accept-Ranges': 'bytes',
    };
    if (compressible) headers.Vary = 'Accept-Encoding';

    // Conditional request.
    const inm = req.headers['if-none-match'];
    if (inm !== undefined ? etagMatches(inm, etag) : this.#notModifiedSince(req, mtimeMs)) {
      delete headers['Content-Type'];
      delete headers['Accept-Ranges'];
      res.writeHead(304, headers);
      res.end();
      return;
    }

    const isHead = req.method === 'HEAD';
    const rangeHeader = req.headers.range;
    const ifRange = req.headers['if-range'];
    const rangeApplies =
      typeof rangeHeader === 'string' && (ifRange === undefined || ifRange === lastModified);

    // Range requests are served from the identity representation.
    if (rangeApplies) {
      const range = parseRange(rangeHeader as string, size);
      if (range === null) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (range !== 'ignore') {
        const len = range.end - range.start + 1;
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Content-Length': len,
        });
        if (isHead) return void res.end();
        return this.#stream(res, file, range.start, range.end);
      }
    }

    // Compressed representation: a precompressed sibling wins, then a cached on-the-fly one.
    if (compressible && size >= MIN_COMPRESS_BYTES) {
      const enc = negotiateEncoding(req.headers['accept-encoding']);
      if (enc) {
        const sibling = await this.#sibling(file, enc);
        if (sibling) {
          res.writeHead(200, { ...headers, 'Content-Encoding': enc, 'Content-Length': sibling.size });
          if (isHead) return void res.end();
          return this.#stream(res, sibling.path, 0, sibling.size - 1);
        }
        if (size <= MAX_COMPRESS_BYTES) {
          let body: Buffer;
          try {
            body = await this.#cache.get(`static|${file}|${size}|${Math.floor(mtimeMs)}|${enc}`, async () =>
              compress(await readFile(file), enc, 6),
            );
          } catch {
            return sendText(req, res, 404, 'Not found\n');
          }
          res.writeHead(200, { ...headers, 'Content-Encoding': enc, 'Content-Length': body.length });
          res.end(isHead ? undefined : body);
          return;
        }
      }
    }

    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (isHead || size === 0) return void res.end();
    this.#stream(res, file, 0, size - 1);
  }

  #notModifiedSince(req: IncomingMessage, mtimeMs: number): boolean {
    const ims = req.headers['if-modified-since'];
    if (!ims) return false;
    const t = Date.parse(ims);
    return Number.isFinite(t) && Math.floor(mtimeMs / 1000) * 1000 <= t;
  }

  async #sibling(file: string, enc: 'br' | 'gzip'): Promise<{ path: string; size: number } | null> {
    const path = `${file}.${enc === 'br' ? 'br' : 'gz'}`;
    try {
      const s = await stat(path);
      return s.isFile() ? { path, size: s.size } : null;
    } catch {
      return null;
    }
  }

  #stream(res: ServerResponse, path: string, start: number, end: number): void {
    const rs = createReadStream(path, { start, end });
    pipeline(rs, res, () => {
      // pipeline destroys both sides on error; nothing else to do.
    });
  }
}
