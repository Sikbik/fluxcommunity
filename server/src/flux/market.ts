import type { MarketStats } from '../../../shared/api.ts';
import { type Upstream, UpstreamError } from '../core/upstream.ts';

/** CoinGecko public price for FLUX (coin id `zelcash`). No key; the free tier is rate limited (429). */
export class MarketApi {
  readonly upstream: Upstream;

  constructor(upstream: Upstream) {
    this.upstream = upstream;
  }

  async flux(): Promise<MarketStats> {
    const res = await this.upstream.json({
      path: '/api/v3/simple/price',
      query: {
        ids: 'zelcash',
        vs_currencies: 'usd',
        include_24hr_change: 'true',
        include_market_cap: 'true',
      },
    });
    const z = (res.body as { zelcash?: Record<string, unknown> } | null)?.zelcash;
    const price = z?.usd;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      throw new UpstreamError('invalid', 'coingecko returned no usable zelcash price');
    }
    const change = z?.usd_24h_change;
    const cap = z?.usd_market_cap;
    return {
      priceUsd: price,
      change24hPct:
        typeof change === 'number' && Number.isFinite(change) ? Math.round(change * 100) / 100 : null,
      marketCapUsd: typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? Math.round(cap) : null,
    };
  }
}
