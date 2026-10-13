# Flux Community

The community front door to [Flux](https://runonflux.com), the decentralized cloud: live network telemetry, the
official gateways, community-built apps with live health checks, node hosting services, games and guides.
It is served from community.app.runonflux.io and runs on the Flux network itself.

The page is one long scroll over a persistent WebGL scene, the Lattice: a field of hexagonal glass cells lit
from beneath in Flux Blue, with the extruded Flux symbol above it. The scene pulses with every real block of
the Flux chain, so the site is visibly alive. A command deck (`Ctrl+K` or `Cmd+K`), an ambient screensaver
mode and keyboard shortcuts (press `?`) sit on top of that.

Two rules shape the whole build:

- **Honest data.** Every live number says where it came from: live, cached or offline. Fallback numbers are
  never shown as live, and nothing pretends a block arrived when the chain is unreachable.
- **One container, one origin.** The browser only talks to its own server. The server aggregates the Flux
  and price APIs, caches them, probes community apps and fans out updates over a stream, so the site stays up
  when an upstream is down.

## Quick start

Needs Node 24 or newer (the server runs TypeScript directly through Node's type stripping).

```bash
npm run install:all   # installs web/ and server/
npm run dev           # API on :42069, web on :5173, /api proxied
```

Open http://localhost:5173. Set `PORT` and `WEB_PORT` to move the servers. With no network access, start the
API with `FIXTURES=1` (simulated data, labelled as fallback), or add `?demo=1` to the page URL in dev to see
the live look without a server.

Useful dev URL flags: `?intro=0` skips the intro, `?q=low|medium|high` pins the render quality,
`?ambient=1` starts ambient mode, `?stage=debug` turns on the stage's debug mode, `?kit=1` opens the design-system kit.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `npm run typecheck` |
| Lint and format check (Biome) | `npm run lint` |
| Tests (Vitest for web, node:test for server) | `npm test` |
| Production build of the web app | `npm run build` |
| Serve the built app and the API | `npm start` |
| Screenshot or console audit a page | `npm --prefix web run shot -- --url http://localhost:5173/` |

## Docker

```bash
docker build -t littlestache/community:latest .
docker run -d -p 42069:42069 littlestache/community:latest
```

Then open http://localhost:42069. Add `-e FIXTURES=1` to run fully offline with simulated data. The image
has no runtime dependencies beyond Node, runs as an unprivileged user and has a `/healthz` check.

## Layout

| Path | What lives there |
| --- | --- |
| `web/` | The web app: Vite, React 19, TypeScript, three.js, CSS Modules. One folder per page section under `web/src/sections/`. |
| `server/` | The API, event stream and static server. Node 24+, TypeScript, zero runtime dependencies. |
| `shared/` | The API contract (`api.ts`) and the content catalog (`catalog.ts`), imported by both sides. |
| `deploy/` | The Flux app specification and deployment notes. |
| `assets-src/` | Sources and prompts for the generated art, and the generated-art manifest. |
| `docs/` | Architecture and design documents. |

## Adding or changing a community app

Everything about what the site showcases lives in `shared/catalog.ts`: apps, node hosts, gateways and social
channels. Edit it there and both the page and the health prober pick it up.

To give a new app a preview image, capture one from the live app (needs Chromium and ImageMagick) and let the
art manifest regenerate:

```bash
node web/scripts/capture-previews.mjs --only <app-id>
```

To remove an app, delete its entry in `shared/catalog.ts` and its file in `web/public/previews/`, then run
`node web/scripts/art-manifest.mjs`.

## Deploying on Flux

CI (`.github/workflows/ci.yml`) typechecks, lints, tests and builds on every pull request and push to
`main`, and smoke tests the container. Publishing is deliberate: run the workflow by hand from `main` with
`publish` ticked (`gh workflow run ci.yml --ref main -f publish=true`) to push
`littlestache/community:latest` and `:sha-<short>` to Docker Hub. The Flux app
specification is `deploy/flux_app_spec.json`; the owner field is a placeholder you replace at deploy time.
See [deploy/README.md](deploy/README.md) for the steps, resources and environment variables.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the system shape, contracts, conventions and quality gates.
- [docs/DESIGN.md](docs/DESIGN.md): art direction, section specs, motion, budgets and the copy deck.
- [server/README.md](server/README.md): the API, upstream sources, caching and operations.
- [web/src/ui/README.md](web/src/ui/README.md): the design-system primitives and how to build a section.

## License

MIT, see [LICENSE](LICENSE). Flux and the Flux logo belong to their owners. The official marks in
`web/public/brand/` come from the Flux media kit and stay under its terms.
