import { type Upstream, UpstreamError } from '../core/upstream.ts';

/**
 * stats.runonflux.io `/fluxinfo` is the Flux team's aggregation of every node's `/flux/info`
 * (one row per node, ~7,100 rows, 22 MB raw unprojected). `?projection=` (Mongo style, dotted paths) cuts
 * it to what we need: about 2.3 MB raw and ~90 KB brotli, in one request, about 1 s. One collection round
 * takes ~15-18 min upstream and the response is cached ~90 s by Cloudflare, so polling every 5 min is plenty.
 *
 * Unreachable nodes come back with `error: {}` and zeroed placeholders (lat 0 / lon 0, status "0",
 * empty versions): they are counted but never treated as data.
 */
export const FLEET_PROJECTION = [
  'ip',
  'tier',
  'error',
  'benchmark.bench.status',
  'benchmark.bench.cores',
  'benchmark.bench.ram',
  'benchmark.bench.ssd',
  'flux.version',
  'daemon.info.version',
  'geolocation.lat',
  'geolocation.lon',
  'geolocation.country',
  'geolocation.countryCode',
].join(',');

export class StatsApi {
  readonly upstream: Upstream;

  constructor(upstream: Upstream) {
    this.upstream = upstream;
  }

  async fleet(): Promise<unknown[]> {
    const res = await this.upstream.json({
      path: '/fluxinfo',
      query: { projection: FLEET_PROJECTION },
      timeoutMs: 30_000,
    });
    const body = res.body as { status?: unknown; data?: unknown } | null;
    if (body?.status !== 'success' || !Array.isArray(body.data)) {
      throw new UpstreamError('invalid', 'fluxinfo did not return a success envelope with rows');
    }
    // Refuse an implausibly small answer so a partial upstream outage cannot erase the map.
    if (body.data.length < 100) {
      throw new UpstreamError('invalid', `fluxinfo returned only ${body.data.length} rows`);
    }
    return body.data;
  }
}
