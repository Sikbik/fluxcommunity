import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { KeyedSingleFlight } from '../core/singleflight.ts';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

export type Encoding = 'br' | 'gzip';

/** Picks the best supported encoding from an Accept-Encoding header (q-values honoured). */
export function negotiateEncoding(header: string | string[] | undefined): Encoding | null {
  if (!header) return null;
  const value = Array.isArray(header) ? header.join(',') : header;
  const q: Record<string, number> = {};
  for (const part of value.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    let weight = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(p);
      if (m) weight = Number(m[1]);
    }
    q[name.trim()] = Number.isFinite(weight) ? weight : 0;
  }
  const star = q['*'] ?? 0;
  const br = q.br ?? star;
  const gz = q.gzip ?? q['x-gzip'] ?? star;
  if (br > 0 && br >= gz) return 'br';
  if (gz > 0) return 'gzip';
  return null;
}

export function compress(buf: Buffer, enc: Encoding, quality = 5): Promise<Buffer> {
  if (enc === 'br') {
    return brotliAsync(buf, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: quality,
        [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    });
  }
  return gzipAsync(buf, { level: 6 });
}

/**
 * Byte-bounded LRU of compressed payloads with single-flight computation, so a burst of requests for the
 * same variant compresses once.
 */
export class CompressCache {
  readonly #max: number;
  readonly #entries = new Map<string, Buffer>();
  readonly #flight = new KeyedSingleFlight<Buffer>();
  #bytes = 0;

  constructor(maxBytes: number) {
    this.#max = maxBytes;
  }

  get bytes(): number {
    return this.#bytes;
  }

  get size(): number {
    return this.#entries.size;
  }

  async get(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.#entries.get(key);
    if (hit) {
      this.#entries.delete(key);
      this.#entries.set(key, hit);
      return hit;
    }
    return this.#flight.run(key, async () => {
      const buf = await make();
      this.#put(key, buf);
      return buf;
    });
  }

  #put(key: string, buf: Buffer): void {
    if (buf.length > this.#max / 2) return;
    this.#entries.set(key, buf);
    this.#bytes += buf.length;
    for (const [k, v] of this.#entries) {
      if (this.#bytes <= this.#max) break;
      this.#entries.delete(k);
      this.#bytes -= v.length;
    }
  }
}
