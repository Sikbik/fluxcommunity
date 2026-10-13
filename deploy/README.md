# Deploying Flux Community on Flux

The portal is one container (`littlestache/community:latest`) that serves the web app, the JSON API and the
live stream on port 42069. `deploy/flux_app_spec.json` is a Flux app specification (version 8) for it.

## Deploy

1. Make sure the image exists. Publishing is deliberate: run the CI workflow by hand from `main` with
   `publish` ticked (`gh workflow run ci.yml --ref main -f publish=true`) and it pushes
   `littlestache/community:latest` and `littlestache/community:sha-<short>` (see `.github/workflows/ci.yml`).
2. Copy `flux_app_spec.json` and replace `"owner": "YOUR_ZELID_HERE"` with your own ZelID. The placeholder is
   deliberate: the real ID is supplied at deploy time and never committed.
3. In FluxCloud (cloud.runonflux.com) choose Register New App, import the JSON, review the price for the
   resources and expiry, sign and pay. An app named `community` is already registered on the network, so it
   can only be changed with Update App by the ZelID that owns it; another owner has to pick a different `name`
   (names are 3 to 63 characters, letters, digits and inner hyphens, and cannot start with `flux` or `zel`).
4. Keep `latest` in `repotag`. The app follows it: nothing else is needed to ship a release.

## Releases and updates

A release is publishing an image (step 1). Flux then updates the app on its own: the instances pick up the
new `latest` without anyone running Update App, signing or paying. They do not switch at the same moment,
so for a while after a release two builds are live. The app is built to cope with that:

- FDM pins a browser to one instance with an `FDMSERVERID` cookie, and the files under `/assets/` carry a
  content hash, so a page and its scripts come from the same build.
- A tab left open across a switch can show "This section did not load" for a section it had not fetched yet;
  its Reload button fixes it.
- Every instance keeps its own caches and probers, so nothing has to be migrated or coordinated.

Use Update App only when the spec itself changes: resources, instances, environment, expiry. What runs is the
registered spec, not this file, so read it back from
`https://api.runonflux.io/apps/appspecifications/community` before changing anything. Specs of version 8 are
encrypted only when the `enterprise` field is used; this one is plain.

The one thing that is not hands-off is the subscription. The app is registered for `expire` blocks counted
from its last registration or update (88,000 blocks, about 30 days, at 30 s per block), and Flux removes it
when they run out. Extend it in FluxCloud before then.

## What the spec asks for

| Field | Value | Why |
| --- | --- | --- |
| `instances` | 2 | Redundancy. FluxOS accepts 1 to 100 for a version 8 spec (3 was the minimum before version 8). Every instance runs its own caches, block watcher and health prober; the design tolerates that. |
| `cpu` / `ram` / `hdd` | 0.1 / 100 MB / 1 GB | The server is mostly idle. Replaying 60 first-time visitors in 20 seconds against a container held to exactly this (`docker run --cpus 0.1 --memory 100m`) gave no errors and no restarts, with memory peaking near 60 MiB (a 32 MB compression cache is the largest part) and CPU about one tenth of a core. |
| `ports` / `containerPorts` | 42069 | The port the existing deployment already maps. |
| `containerData` | `/tmp` | The server writes nothing to disk; Flux requires a path. |
| `environmentParameters` | `[]` | Nothing to set. The image carries its own defaults (`NODE_ENV`, `PORT`, `HOST`, `WEB_DIST`, `LOG_LEVEL`), and Flux balancers are trusted for visitor addresses without being told to (see `TRUST_PROXY` below). |
| `expire` | 88000 blocks | About 30 days at 30 s blocks. Raise it (up to 1,056,000) to pay for longer. Nothing renews it automatically. |
| `repoauth` | `""` | Required string on every version 8 component. Empty because the image is public; a value is only accepted on enterprise apps. |
| `nodes` | `[]` | Required array on every version 8 spec. Empty means any node may run the app; pinning to nodes is an enterprise feature. |

There is deliberately no `tiered` field. FluxOS rejects it in a version 8 component ("Unsupported parameter for
v8 app specifications"); it only exists in versions 1 to 7, where it selected per-tier resources. The field list
above was checked against `ZelBack/src/services/appRequirements/appValidator.js` in RunOnFlux/flux and against
the live specs returned by `https://api.runonflux.io/apps/globalappsspecifications`.

## Environment variables

All optional, and the spec sets none of them. Defaults are shown; the image bakes in the ones marked with an asterisk.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` * | `42069` | Listen port. |
| `HOST` * | `0.0.0.0` | Listen address. |
| `WEB_DIST` * | `/app/web` in the image, `../web/dist` in the repo | Directory of the built web app. Missing directory means API-only mode (pages return 503, the API still works). |
| `LOG_LEVEL` * | `info` | `debug`, `info`, `warn`, `error` or `silent`. JSON lines on stdout. |
| `TRUST_PROXY` | `fdm` | Who may name the visitor in `X-Forwarded-For`. The default trusts only the Flux domain manager balancers that front `*.app.runonflux.io`, which is right on Flux with nothing to configure; a request that reaches the node directly is attributed to its own socket address whatever headers it carries. `false` trusts nobody (every visitor behind a proxy then shares that proxy's rate-limit bucket). `1` to `9` (or `true`, which is `1`) trusts every peer and reads that many hops from the right of the header: for a reverse proxy you run yourself, never for a port that is reachable directly. A comma-separated list of addresses and CIDR blocks (for example `10.0.0.0/8,fdm`) trusts only those peers; `fdm` stands for the balancers. |
| `CORS_ORIGINS` | none | Comma separated origins allowed to call the API from a browser (`https://example.com`), or `*`. Unset sends no CORS headers. |
| `FIXTURES` | off | `1` runs fully offline with simulated data labelled `fallback` and a simulated block every 30 s. Dev and CI only. |
| `CSP_WORKER_BLOB` | off | Adds `worker-src 'self' blob:` to the CSP. Only needed if the web app ever starts blob workers. |
| `FLUX_API_URLS` | `https://api.runonflux.io` | Comma separated daemon API bases, tried in order. |
| `FLUX_STATS_URL` | `https://stats.runonflux.io` | Stats service base. |
| `COINGECKO_URL` | `https://api.coingecko.com` | Price API base. |
| `UPSTREAM_TIMEOUT_MS` | `10000` | Per upstream call timeout. |
| `BLOCK_POLL_FAST_MS` / `BLOCK_POLL_SLOW_MS` | `1000` / `3000` | Block detection poll gap when a block is due / just arrived. |
| `NETWORK_REFRESH_MS` | `10000` | Node count refresh. |
| `FLEET_REFRESH_MS` | `300000` | Capacity, versions and geography (one stats request). |
| `PRICE_REFRESH_MS` | `60000` | FLUX price. |
| `APPS_RUNNING_REFRESH_MS` / `APPS_REGISTERED_REFRESH_MS` | `600000` / `1800000` | App counts (large downloads, see server/README.md). |
| `HEALTH_INTERVAL_MS` | `90000` | Community app probe round. |
| `HEALTH_CONCURRENCY` | `4` | Parallel probes. |
| `HEALTH_TIMEOUT_MS` | `8000` | Probe timeout. |
| `RATE_LIMIT_BURST` / `RATE_LIMIT_RPS` | `150` / `30` | Per client token bucket. `/healthz` is exempt. |
| `SSE_MAX_CLIENTS` / `SSE_MAX_PER_IP` | `2000` / `8` | Stream connection caps. |

The full list with descriptions is in `server/.env.example`; behaviour is documented in `server/README.md`.

## Operations

- Health: `GET /healthz` returns `ok`. The image has a Docker `HEALTHCHECK` on it.
- Info: `GET /api/v1/info` shows uptime, mode and the status of each upstream.
- Logs: structured JSON on stdout, one object per line. Health state changes and circuit breaker trips are
  logged at `info`/`warn`; `/healthz` and static assets are only logged at `debug`.
- Shutdown: SIGTERM stops listening, ends streams (browsers reconnect on their own) and exits within seconds.
- Runs as the unprivileged `node` user (uid 1000). The container filesystem can be read-only.
