# Flux Community server

One small Node process that powers the portal: it aggregates and caches Flux network data, probes the
community apps, watches the chain for new blocks, streams events to browsers, and serves the built web app.
One container, one port (42069), no runtime dependencies (only `node:http`, global `fetch`, `node:zlib`,
`node:crypto`). TypeScript is run directly by Node 24+ with type stripping; there is no build step.

The contract (paths and payload types) is `shared/api.ts`; the app catalog it probes is
`shared/catalog.ts`. Architecture notes are in `docs/ARCHITECTURE.md`.

## Run

```sh
npm --prefix server ci            # dev tools only (tsc, biome); nothing is needed at runtime
npm --prefix server run dev       # node --watch, API on :42069
npm --prefix server start         # production style
PORT=42101 npm --prefix server start
```

| Script | What it does |
| --- | --- |
| `npm run dev` | `node --watch` on `src/` and `../shared/` |
| `npm start` | `node src/main.ts` |
| `npm run typecheck` | `tsc --noEmit` (strict, erasable syntax only) |
| `npm run lint` | Biome over `server/`, `shared/`, `scripts/`, `deploy/` |
| `npm test` | `node --test` (about 130 tests, no network needed) |

### Offline

`FIXTURES=1` runs with no upstream calls at all: deterministic network, geo, blocks and health data, every
payload labelled `meta.source = "fallback"`, and a simulated block every 30 s on the stream.
`GET /api/v1/info` reports `mode: "fixtures"`. It is for development and CI; the server logs a warning at
start and it is never a default.

```sh
FIXTURES=1 PORT=42101 npm --prefix server start
```

If `WEB_DIST` (default `../web/dist`, `/app/web` in the image) does not exist the server runs API only:
`/` answers 503 with a short explanation, everything under `/api/v1` and `/healthz` works.

## Endpoints

All JSON bodies are `Envelope<T>`: `{ "data": ..., "meta": { generatedAt, asOf, ageMs, stale, source } }`.

- `generatedAt` is the response time, quantised to whole seconds.
- `asOf` is when the underlying data was fetched from upstream, `ageMs` is `generatedAt - asOf`.
- `stale` is `ageMs` over the endpoint's freshness window.
- `source` is `live` (within the window), `cache` (older, still served) or `fallback` (no upstream data
  yet: the baked snapshot, or fixtures).

Methods are `GET`, `HEAD` and `OPTIONS` only. JSON responses carry a weak `ETag` (derived from the data plus
`asOf`, `source`, `stale`, not from the ticking `generatedAt` and `ageMs`), `Vary: Accept-Encoding`, and
are brotli or gzip compressed above 1 KB. `If-None-Match` returns `304`.

| Path | Freshness window | `Cache-Control` |
| --- | --- | --- |
| `GET /api/v1/network` | 30 s (3 x refresh) | `public, max-age=5, stale-while-revalidate=30` |
| `GET /api/v1/geo` | 15 min | `public, max-age=60, stale-while-revalidate=300` |
| `GET /api/v1/blocks` | 90 s | `public, max-age=5, stale-while-revalidate=30` |
| `GET /api/v1/health` | 6 min (4 x probe interval) | `public, max-age=15, stale-while-revalidate=60` |
| `GET /api/v1/info` | n/a | `no-store` |
| `GET /api/v1/stream` | n/a | `no-store` (SSE) |
| `GET /healthz` | n/a | `no-store`, body `ok` |

Errors use `{ "error": { "code", "message" } }`: `404 not_found`, `405 method_not_allowed`,
`414 uri_too_long`, `429 rate_limited` (with `Retry-After`), `429 too_many_streams`,
`503 stream_capacity`, `500 internal`.

### `GET /api/v1/network`

Sampled live on 2026-10-12 (trimmed only by whitespace). The `etaIso` in it predates the measured interval
rule below: with this sample's `measuredBlockSec` of 30.7 the server now answers `2026-10-26T23:15:18.200Z`.

```json
{"data":{"chain":{"height":3031194,"tipTime":"2026-10-12T18:05:34.000Z","targetBlockSec":30,"measuredBlockSec":30.7,"consensus":"Proof of Node"},
"rewards":{"perBlock":14,"perTier":{"cumulus":1,"nimbus":3.5,"stratus":9},"devFund":0.5,
  "nextReduction":{"height":3071200,"blocksAway":40006,"etaIso":"2026-10-26T15:28:34.000Z","fraction":0.1,"perBlockAfter":12.6,
    "epochStartHeight":2020000,"epochBlocks":1051200,"index":1,"of":20}},
"nodes":{"total":7106,"tiers":{"cumulus":3584,"nimbus":1692,"stratus":1830},"collateral":{"cumulus":1000,"nimbus":12500,"stratus":40000},"countries":56},
"capacity":{"cores":57883,"ramTb":194.3,"ssdTb":3409.3,"reporting":7009},
"apps":{"registered":2075,"running":1979},
"market":{"priceUsd":0.08553,"change24hPct":3.58,"marketCapUsd":36068424},
"versions":{"fluxos":"8.20.0","daemon":"9.1.0"},
"freshness":{"chain":"2026-10-12T18:05:38.728Z","nodes":"2026-10-12T18:05:34.756Z","capacity":"2026-10-12T18:05:25.609Z","apps":"2026-10-12T18:05:28.218Z","market":"2026-10-12T18:05:25.618Z"}},
"meta":{"generatedAt":"2026-10-12T18:05:39.000Z","asOf":"2026-10-12T18:05:34.756Z","ageMs":4244,"stale":false,"source":"live"}}
```

How each value is obtained and checked:

| Field | Source | Notes |
| --- | --- | --- |
| `chain.height`, `tipTime` | block watcher | Header time of the tip block. |
| `chain.measuredBlockSec` | block watcher | Mean interval over the buffered contiguous blocks, `null` below 5 intervals. Real chains run a little over the 30 s target (about 30.5 to 32 s). |
| `rewards` | computed, verified against `getblocksubsidy` | See below. |
| `nodes.total`, `nodes.tiers` | `/daemon/getfluxnodecount` (every 10 s) | `total` is trusted unless it is below the tier sum. |
| `nodes.collateral` | constant 1000 / 12500 / 40000 | fluxd `V2_FLUXNODE_COLLAT_*` and the `amount` of every row in the live node list. |
| `nodes.countries` | distinct country codes in the geo data | `null` until stats has answered once. |
| `capacity` | stats `/fluxinfo` projection | Sums nodes whose benchmark status is CUMULUS, NIMBUS or STRATUS; `reporting` is how many. RAM and SSD are GB / 1000 shown as TB. |
| `apps.registered` | distinct names in `/apps/globalappsspecifications` | See cost below. |
| `apps.running` | distinct names in `/apps/locations` that are also registered | Rows of removed apps linger up to about 2 h upstream, so they are excluded. |
| `market` | CoinGecko `simple/price?ids=zelcash` | Dropped to `null` after 30 min without a refresh. |
| `versions` | most common FluxOS version and fluxd version among reachable nodes | fluxd int `9010050` is shown as `9.1.0`. |
| `freshness` | per-section last refresh | Additive; lets the UI label tiles honestly. |

**Reward schedule** (verified 2026-10-12 against fluxd `master` and the live daemon, see `src/flux/rewards.ts`):
the subsidy is 14 FLUX per block, paid 1 Cumulus, 3.5 Nimbus, 9 Stratus and 0.5 to the development fund.
It is multiplied by 9/10 (integer zatoshi arithmetic) once per 1,051,200 blocks counted from the Proof of
Node activation height 2,020,000, at most 20 times. So the first reduction is at height 3,071,200 and the
split keeps its ratios (0.9 / 3.15 / 8.1 / 0.45 afterwards). The server computes it with the same integer
arithmetic as fluxd, then cross-checks `getblocksubsidy` at the tip and at the next reduction height (a
few dozen bytes, refreshed every 10 min and when a reduction height is crossed). If the daemon ever
disagrees it is trusted and a `reward schedule mismatch` warning is logged. `nextReduction` is `null`
after the 20th reduction has happened. `etaIso` is the tip time plus `blocksAway` times the effective block interval:
`chain.measuredBlockSec` when it is within 0.5x to 2x of `chain.targetBlockSec` (the real chain runs a
little over 30 s, which is hours over the two week horizon), otherwise the target, for example in the first
minute after boot before 5 intervals are buffered. The rule is `effectiveBlockSec` in `shared/chain.ts`,
shared with the web client so both quote the same date.
`epochStartHeight`, `epochBlocks`, `index` and `of` come from the same constants (current epoch start,
1,051,200, the 1-based number of the upcoming reduction, 20), so progress through the epoch is
`(height - epochStartHeight) / epochBlocks` with nothing guessed client side.

**Cost of the app counts.** There is no cheap network-wide counter upstream, so the two counts are computed
by downloading lists: `/apps/globalappsspecifications` is about 1.5 MB brotli (2.9 MB raw, 2,074 apps) and
`/apps/locations` about 350 KB brotli (8,764 rows). Running is refreshed every 10 min (about 50 MB/day per
server instance), registered every 30 min with `If-None-Match` (up to about 70 MB/day, less when the
catalog is unchanged). Each Flux instance does this independently.

### `GET /api/v1/geo`

```json
{"data":{"located":7029,"total":7106,
 "countries":[{"code":"DE","name":"Germany","nodes":1519,"tiers":{"cumulus":689,"nimbus":298,"stratus":532}}, "..."],
 "points":[{"lat":60.17,"lon":24.94,"n":986,"t":[306,167,513],"cc":"FI"},{"lat":50.48,"lon":12.36,"n":550,"t":[100,101,349],"cc":"DE"}, "..."]},
 "meta":{"generatedAt":"2026-10-12T18:05:46.000Z","asOf":"2026-10-12T18:05:25.609Z","ageMs":20391,"stale":false,"source":"live"}}
```

Source is stats `/fluxinfo?projection=...` (about 60 KB brotli, one request every 5 min, shared with the
capacity numbers). Unreachable nodes (`error: {}`, zeroed coordinates) count toward `total` but are never
located. Nodes are clustered on a 2 degree grid keyed by country as well as by cell, so a point never
straddles a border and `cc` is exact; the grid coarsens (up to 12 degrees) if there would be more than 400
points (today: 218). Coordinates are the mean of the members, rounded to 0.01. About 17 KB raw, 4 KB brotli.

### `GET /api/v1/blocks`

```json
{"data":{"blocks":[{"height":3031140,"time":"2026-10-12T17:34:34.000Z","intervalSec":null,"txCount":9},
 {"height":3031141,"time":"2026-10-12T17:35:04.000Z","intervalSec":30,"txCount":11}, "...",
 {"height":3031194,"time":"2026-10-12T18:05:34.000Z","intervalSec":30,"txCount":14}]},
 "meta":{"generatedAt":"2026-10-12T18:05:46.000Z","asOf":"2026-10-12T18:05:44.908Z","ageMs":1092,"stale":false,"source":"live"}}
```

Newest last, up to 120 entries. At boot the buffer fills from the tip downwards at about 2 requests per
second, so a fresh instance has all 120 blocks after about a minute. `asOf` is the time of the last
successful poll (the buffer is current as of then, even if no block arrived).

### `GET /api/v1/health`

One entry per catalog app, in catalog order:

```json
{"data":{"apps":[
 {"id":"noxide","state":"up","httpStatus":200,"latencyMs":254,"checkedAt":"2026-10-12T18:05:25.981Z","since":"2026-10-12T18:05:25.981Z"},
 {"id":"community","state":"unknown","httpStatus":null,"latencyMs":null,"checkedAt":null,"since":null},
 {"id":"example-app","state":"down","httpStatus":503,"latencyMs":166,"checkedAt":"2026-10-12T18:05:36.523Z","since":"2026-10-12T18:05:36.523Z"}, "..."]},
 "meta":{"generatedAt":"2026-10-12T18:05:46.000Z","asOf":"2026-10-12T18:05:36.523Z","ageMs":9477,"stale":false,"source":"live"}}
```

The site itself (`probe: false`) is always `unknown`. Before the first round completes (the first probes
run about 1.5 s after boot) every app is `unknown` and `source` is `fallback`.

### `GET /api/v1/info`

```json
{"data":{"name":"flux-community","version":"2.0.0","startedAt":"2026-10-12T18:05:24.409Z","uptimeSec":14,
 "upstream":{"flux-api":{"ok":true,"lastOkAt":"2026-10-12T18:05:39.295Z","lastError":null},
  "stats":{"ok":true,"lastOkAt":"2026-10-12T18:05:25.598Z","lastError":null},
  "coingecko":{"ok":true,"lastOkAt":"2026-10-12T18:05:25.618Z","lastError":null}},
 "mode":"live","sseClients":0},"meta":{"...":"..."}}
```

### `GET /api/v1/stream` (Server-Sent Events)

```
retry: 5000

event: hello
data: {"serverTime":"...","network":{...},"health":{...},"networkMeta":{...},"healthMeta":{...}}

event: block
data: {"height":3031195,"time":"2026-10-12T18:06:20.000Z","txCount":11}

event: network
data: {"data":{...NetworkSnapshot},"meta":{"source":"live",...}}

: ping

event: ping
data: {}
```

- `hello` is sent on connect: the raw network and health snapshots, plus `networkMeta` and `healthMeta`
  (same meaning as `Envelope.meta`).
- `block` on every new block, a second or two after its header time (measured 0.8 to 2.1 s).
- `network` and `health` carry the same `Envelope` REST would return at that instant, so `meta.source` is
  exactly what REST says (in fixtures mode both say `fallback`). `network` is sent when the data changes
  (every block, node count change, price update ...); `health` when any app's state changes.
- Every 20 s one shared timer writes both a `: ping` comment and an `event: ping` frame with `data: {}`.
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`.
- Caps: 2,000 clients total and 8 per client address (`503` / `429` with `Retry-After: 30`). A client whose
  socket queue exceeds 256 KB is dropped; `EventSource` reconnects and `hello` makes that idempotent.

## Caching and refresh

| Data | Upstream | Refresh | Freshness window |
| --- | --- | --- | --- |
| Chain tip, blocks | `/daemon/getblockhash/<tip+1>?nc=...`, `/daemon/getblock/<hash>/1` | poll every 1 s when a block is due, 3 s in the 22 s after one (about 0.5 req/s) | 90 s |
| Node counts | `/daemon/getfluxnodecount?nc=...` | 10 s | 30 s |
| Capacity, versions, geo | stats `/fluxinfo?projection=` | 5 min | 15 min (geo), 24 h kept (capacity) |
| Price | CoinGecko | 60 s | kept 30 min, then `null` |
| Apps running / registered | `/apps/locations`, `/apps/globalappsspecifications` | 10 min / 30 min | kept 24 h |
| Reward check | `/daemon/getblocksubsidy/<h>` | 10 min and at epoch change | n/a |
| Community app health | the apps themselves | 90 s +/- 15 % | 6 min |

All loops are jittered (+/- 15 %), never overlap themselves, and back off exponentially (capped at 5 min)
while failing.

### Beating the 20 s daemon cache

The FluxOS API caches every successful `/daemon/*` answer for 20 s (plus 30 s of HTTP caching keyed on the
full URL). `getblockcount` and `getbestblockhash` therefore lag a new block by 20 to 50 s. But errors are
never cached, and `getblockhash/<tip+1>` is an error ("Block height out of range", code -8) until fluxd
has that block. Polling it with a unique `nc` query string sees the block the moment it exists; the block
is then fetched by hash (`getblock` is cached for an hour per hash, so it is always exact). Verified live
on 2026-10-12: five consecutive blocks were received 0.8 to 2.1 s after their header time.

## Failure behaviour

A dead upstream must never take the site down, and the server never throws to a client.

- **Per call:** every upstream call has an `AbortSignal.timeout` (10 s, 30 s for the large downloads), a
  response size cap (16 MB) and strict validation; an HTTP 200 with `status: "error"` is an error, except
  the expected "block not found yet".
- **Circuit breaker per upstream** (`flux-api`, `stats`, `coingecko`): opens after 5 consecutive failures,
  fails fast for a cool-down that doubles per trip (5 s up to 2 min, jittered), then admits one trial call.
- **Single flight:** concurrent refreshes of a cell share one request; reads never block on upstream.
- **Stale while revalidate:** a failed refresh keeps the previous value. It is served with
  `source: "cache"` and `stale: true` once older than its window, and a stale read triggers one background
  refresh (rate limited after failures).
- **Nothing ever loaded:** the baked fallback (`src/data/baked.ts`, regenerate with
  `node server/scripts/bake-fallback.ts`) is served with `source: "fallback"`. It has no price on purpose.
  An empty blocks list and all-`unknown` health are likewise `fallback`.
- **Bad data is refused, not shown:** an implausibly small `fluxinfo` (under 100 rows) or app list (under
  50) is rejected so a partial upstream outage cannot erase the map.
- **Reorgs:** each new block must link to the buffered tip by `previousblockhash`; otherwise the tip is
  dropped and the canonical block is refetched.

## How app health is classified

Targets are the catalog apps where `probeUrl(app) !== null` (everything except `probe: false`). Probe URLs
come only from `shared/catalog.ts`, never from a request.

1. `HEAD` first; if it does not return 2xx/3xx (405, 403, 404, 5xx) or the connection is reset, a `GET`
   is made and its result is authoritative. Timeouts, DNS and TLS failures do not trigger a second request.
2. Up to 3 redirects are followed (only to http/https on the original port or 80/443). Time is measured to
   the response headers of the final request, including DNS and TLS. Timeout is 8 s overall.
3. Classification:

| State | When |
| --- | --- |
| `up` | 2xx or 3xx in under 2.5 s |
| `degraded` | 2xx or 3xx at 2.5 s or slower, a 4xx other than 404 and 410, or a redirect chain longer than 3 |
| `down` | 5xx, 404, 410, timeout, DNS or TLS failure, connection refused |
| `unknown` | never probed (or `probe: false`) |

4. **Flap damping:** `down` needs two consecutive failing probes. After the first failure the previous
   state is kept (the observed status is still recorded) and a confirmation probe runs 10 s later instead
   of waiting for the next round. Recovery is immediate. `since` is the time the current state began and
   does not move while the state holds.
5. Rounds run every 90 s +/- 15 % with at most 4 probes in flight, a User-Agent of
   `FluxCommunityHealth/2.0 (+https://community.app.runonflux.io)`.
6. **SSRF defence in depth:** the probe transport resolves names itself and refuses to connect when any
   resolved address is private, loopback, link-local, CGNAT, multicast, documentation or IPv4-mapped
   private (checked at connect time and for every redirect hop; IP literals are checked before connecting).

## Security and limits

- Headers on every response: the CSP from `docs/ARCHITECTURE.md` section 9 (`default-src 'self'`,
  `connect-src 'self'`, `img-src 'self' data: blob:`, `font-src 'self'`, `style-src 'self' 'unsafe-inline'`,
  `script-src 'self'`, `frame-ancestors 'self'`, `base-uri 'none'`, `form-action 'none'`, plus
  `media-src 'self'` and `object-src 'none'`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone,
  geolocation, payment, usb denied; accelerometer and gyroscope for self), `Cross-Origin-Opener-Policy:
  same-origin`, `X-Frame-Options: SAMEORIGIN`. `Strict-Transport-Security` is added only when a trusted
  proxy reports HTTPS.
- `worker-src` is omitted on purpose: workers fall back to `script-src 'self'`, which covers same-origin
  Vite workers. Nothing in `web/src` creates blob workers or WebAssembly today. Set `CSP_WORKER_BLOB=1` if
  that changes rather than loosening `script-src`.
- No CORS headers unless `CORS_ORIGINS` is set (an allow-list, or `*`).
- Rate limit: token bucket per client address, burst 150, 30 requests/s sustained (`RATE_LIMIT_*`).
  `/healthz` is exempt. The address is the socket peer unless `TRUST_PROXY` is set.
- Timeouts: 10 s for headers, 15 s for a whole request, 65 s keep-alive; 8 KB header limit; URLs over
  2,048 characters get 414.
- Graceful shutdown on SIGTERM and SIGINT: stop accepting, end streams, stop loops, exit.

## Static files

Served from `WEB_DIST` with: safe path resolution (no `..`, no dotfiles, no NUL or backslashes, and a
`realpath` check against symlinks leaving the root), MIME types for what a Vite build contains,
`Cache-Control: public, max-age=31536000, immutable` under `/assets/`, `no-cache` for HTML, a one hour
`stale-while-revalidate` policy for other public files, weak `ETag` and `Last-Modified` with 304, `Range`
for media (206, 416), precompressed `.br` / `.gz` siblings when present, otherwise on-the-fly brotli or
gzip for text types over 1 KB kept in a byte-bounded in-memory cache, and an SPA fallback to `index.html`
for extensionless paths (a missing file with an extension is a 404).

## Logging

One JSON object per line on stdout: `{"t":"...","level":"info","msg":"...", ...fields}`. No secrets and no
client addresses are logged. Requests are logged at `info` except `/healthz`, static assets and the stream
endpoint (`debug`); 5xx are `error`. State changes, circuit breaker trips and watcher problems are logged
as they happen.

## Layout

```
src/main.ts            entry: config, runtime, signals
src/server.ts          http server, SSE wiring, shutdown
src/config.ts          env parsing and validation
src/core/              log, clock, breaker, single flight, swr cell, loop, upstream client
src/flux/              daemon, stats, apps, market clients and the reward schedule
src/services/          block watcher, fleet reductions, network service, health prober, SSE hub, runtime
src/http/              request handler, security headers, rate limiter, compression, static files
src/data/              baked fallback (generated)
scripts/bake-fallback.ts   regenerate src/data/baked.ts from the live upstreams
test/                  node:test suites (contract conformance, static, SSE, health, watcher, ...)
```
