# Flux Community v2: architecture

This is the contract every contributor and agent builds against. Read it fully, then read
[DESIGN.md](./DESIGN.md). Where this file and your instincts disagree, this file wins; where it is
silent, use judgement and say what you decided in your report.

The site is the community front door to Flux (runonflux.com): live network telemetry, the official
gateways, community-built apps, node hosting services, games and guides. It is a ground-up rewrite
of the old React/Tailwind page and has nothing in common with it except the URL and the deploy slot.

## 1. Shape of the system

```
browser                                         one container (Node, port 42069)
 web/  (Vite + React 19 + TS + three.js)  <-->   server/  (Node 24+, TypeScript, near-zero deps)
   static bundle served by server                  /api/v1/*   JSON + SSE, cached, rate limited
   same-origin API only, no third parties          static files from web/dist
                                                   upstream: api.runonflux.io, stats.runonflux.io, CoinGecko
```

- One container, one port (42069, the port the existing Flux deployment already maps).
- The browser only ever talks to its own origin. All upstream aggregation, caching, health probing and
  fan-out lives in `server/`. This keeps the CSP at `connect-src 'self'`, keeps payloads tiny, and
  keeps the site up when an upstream is down.
- No analytics, no trackers, no third-party fonts or scripts. Fonts are self-hosted via @fontsource.
- If the API is unreachable the web app still works: it renders the catalog (which is static) and shows
  clearly-labelled fallback numbers. It must never present fallback numbers as live.

## 2. Repository map

```
fluxcommunity/
  package.json            root scripts only (no dependencies)
  biome.json              lint/format for shared/, scripts/, server/, deploy/
  Dockerfile              multi-stage: build web, ship server + web/dist
  .github/workflows/      test, build, publish littlestache/community
  deploy/                 Flux app spec (flux_app_spec.json) and deploy notes
  docs/                   ARCHITECTURE.md, DESIGN.md, and any design notes
  scripts/dev.mjs         runs server and web dev servers together
  shared/                 TYPE-ONLY contracts + static data used by BOTH sides
    api.ts                the API contract (endpoint paths, payload types)
    catalog.ts            apps, node hosts, gateways, socials (single source of truth)
  server/                 the API + static server
  web/                    the web app
    index.html
    public/brand/         official Flux marks, lockups, badges (curated, read-only)
    public/art/           generated art (webp/avif), see docs/DESIGN.md section 9
    public/previews/      app screenshots, one per catalog app
    public/og/            social card
    scripts/              build-time asset scripts (previews, og, land mask)
    src/
      main.tsx            entry
      app/                App shell: header, nav, section frame, routing by hash, providers
      styles/             tokens.css, fonts.css, base.css, utilities
      ui/                 design-system primitives (see ui/README.md)
      lib/                small framework-free helpers (format, math, easing, storage)
      data/               API client, SSE stream, zustand stores, fixtures, derivations
      content/            presentation extras keyed by catalog id (glyphs, art, accents, copy)
      stage/              the WebGL stage (bus.ts is the page/stage contract)
      sections/           one folder per page section, registry.ts lists them in order
      ambient/            ambient (screensaver) overlay
      palette/            command deck
```

## 3. Commands and ports

| Task | Command (from repo root) |
| --- | --- |
| Install | `npm run install:all` (or `npm --prefix web ci`, `npm --prefix server ci`) |
| Run everything | `npm run dev` (API on 42069, web on 5173, `/api` proxied) |
| Web only | `npm --prefix web run dev` (set `WEB_PORT`, `API_ORIGIN`) |
| Server only | `npm --prefix server run dev` (set `PORT`) |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` (Biome) |
| Test | `npm test` |
| Production build | `npm run build`, then `npm start` serves `web/dist` and the API |
| Screenshots | `npm --prefix web run shot` (Playwright driving the system Chromium) |

Parallel agents share one machine: **always pick your own ports** via `WEB_PORT` and `PORT`, and kill
anything you start before you finish.

## 4. Contracts

### 4.1 `shared/api.ts`: the API

Endpoint paths and every payload type are defined there and imported by both sides. Rules:

- Changes are additive (new optional fields, new endpoints). Never rename or remove a field.
- Erasable TypeScript only: no enums, no namespaces, no parameter properties, no runtime imports.
  Node runs the file with type stripping and Vite bundles it unchanged.
- Every response is `Envelope<T> = { data, meta }`; `meta.source` is `live | cache | fallback` and the UI
  must reflect it.

### 4.2 `shared/catalog.ts`: the data

Every app, node host, gateway and social link, plus `withUtm()` and `probeUrl()`. The server probes the
URLs in it; the web app renders it. Presentation-only extras (glyph choice, art, accent, long copy) go
in `web/src/content/`, keyed by `id`. Do not duplicate catalog facts anywhere else.

### 4.3 `web/src/stage/bus.ts`: the page/stage contract

A zustand store that is the **only** coupling between DOM sections and the WebGL stage:

- The page writes: `section`, `sectionProgress`, `pageProgress`, `scrollVelocity`, `accent`, `ambient`,
  `reducedMotion`, `paused`, `chain`, `focus` regions, one-shot `pulses`.
- The stage reads every frame via `useStageBus.getState()` and writes only the `stage` slice.
- Sections never import three.js; the stage never imports section code.
- Anchors: an element with `data-stage-anchor="symbol"` defines where the 3D Flux symbol lives (the
  stage reads its rect on resize and scroll). The hero places it; the stage matches it.
- `web/src/stage/index.tsx` default-exports `Stage`, the React component mounted once by the shell.

### 4.4 `web/src/sections/registry.ts`: the page

Ordered list of sections. Each `sections/<id>/index.tsx` default-exports a component that renders its
own `<section id="<id>" data-section="<id>">`. The shell does scroll-spying and writes the bus; a
section does not need to.

### 4.5 URL state (hash based, no router)

`#<section>` scrolls to a section. `#builds/<appId>` opens that app's detail. `#palette` is not a route.
Query flags (dev and QA): `?kit=1` design-system gallery, `?stage=debug` stage stats overlay,
`?q=low|medium|high` force quality tier, `?ambient=1` start in ambient mode, `?intro=0` skip the intro.

Jumps go through `web/src/lib/scroll.ts` (`scrollToSection`): a **glide** (`lib/glide.ts`, re-aimed every
frame) followed by a **pin** (`lib/pin.ts`, re-aligned while the layout settles). Both stand down on the
first wheel, touch, key or pointer input. See section 11 for why a plain `scrollIntoView` is not enough.

## 5. Ownership and coordination (parallel work)

Several agents work at once in one working tree. To keep that safe:

1. **Stay inside your owned paths** (listed in your brief). Read anything; write only what you own.
2. **Do not run git commands that change state** (no commit, checkout, stash, reset, rebase, add).
   The orchestrator commits. `git status`, `git diff` and `git log` are fine.
3. **Dependencies.** `web/package.json` and `server/package.json` are pinned by the orchestrator.
   Only add a dependency if the work is impossible without it, justify it in your report, and never
   run `npm install` in a directory another agent is also working in at the same time unless your brief
   says you own installs there.
4. **Type errors in files you do not own are not yours to fix** while others are mid-edit. Filter your
   typecheck output to your paths, for example `npx tsc --noEmit -p tsconfig.json | grep '^src/stage'`.
5. **Shared files** (`shared/*`, `web/src/stage/bus.ts`, `web/src/sections/registry.ts`) are additive
   only, and any change is called out in your final report.
6. **Scratch work** goes in your scratchpad directory, not in `/tmp` or the repo.
7. **Finish clean:** stop every dev server you started, delete temp files, and report what you built,
   what you verified (with the commands you ran), what is rough, and anything the next person needs.

## 6. Conventions

**TypeScript.** Strict. `verbatimModuleSyntax` is on, so use `import type`. Path aliases: `@/` is
`web/src/`, `@shared/` is `shared/`. Prefer small modules with a clear name over big files. No `any`;
use `unknown` and narrow. Pure logic goes in framework-free modules with Vitest tests next to them
(`*.test.ts`).

**Formatting and lint.** Biome (`npm run lint`, `npm --prefix web run format`): 2 spaces, single quotes,
semicolons, trailing commas, 110 columns.

**CSS.** Plain modern CSS with custom properties, no Tailwind, no CSS-in-JS. Global CSS is only
`styles/` (tokens, fonts, base, utilities). Components and sections use CSS Modules
(`Thing.module.css`) so parallel work cannot collide. Use `@layer` (`reset, tokens, base, ui, section,
utility`) and the tokens in `styles/tokens.css`; never hard-code a colour, spacing or duration that a
token covers. Use logical properties where it helps, container queries for components, and `clamp()`
for fluid type and spacing. Support `prefers-reduced-motion`, `prefers-contrast` and `forced-colors`.

**React.** Function components and hooks only. React 19 (use `use`, `useOptimistic`, `ref` as a prop
where they fit). Keep render pure; do imperative work (canvas, observers, rAF) in effects with proper
cleanup. Never run a requestAnimationFrame loop without a way to stop it and without checking `paused`
and `reducedMotion`. Heavy modules (the stage, the constellation, the dot map) load lazily.

**Motion.** Use the `motion` package (import from `motion/react`, `motion/mini` or `motion`) for springs
and orchestration, and CSS for simple transitions. Animate `transform` and `opacity` first. Everything
must be interruptible, and everything must have a reduced-motion variant that is calm but complete.

**State.** zustand for cross-component state; local state otherwise. Server data lives in
`web/src/data/` and is read through hooks; sections never call `fetch`.

**Accessibility.** Semantic landmarks and headings (one `h1`), visible focus, keyboard parity for every
pointer interaction, real `button`/`a` elements, labelled controls, 4.5:1 text contrast, no information
by colour alone, `aria-live="off"` for per-block counters, `inert` or a focus trap behind modal UI.

**Copy.** Plain, concrete, confident. Sentence case. No emoji. **No em dashes** anywhere (use commas,
periods, parentheses or colons). No marketing superlatives and no claims we cannot back with the data.

**Assets.** Original generated art lives in `assets-src/` (git-tracked only if small) and ships as
optimised `webp`/`avif` in `web/public/art/`. Official Flux marks come from `web/public/brand/` and are
never redrawn, recoloured outside the brand's blue/white/black/gray, or distorted. Respect clear space.

## 7. Data flow

```
server  ── upstream pollers (blocks 3-5 s, network ~10 s, geo ~5 min, price ~60 s, health ~90 s)
   │            │ single-flight, TTL + stale-while-revalidate, timeouts, backoff
   │            ▼
   │      in-memory snapshots ── GET /api/v1/{network,geo,blocks,health}
   │            │
   └──────── SSE hub ───────────── GET /api/v1/stream  (hello, block, network, health)
                                          │
web  data/stream.ts ── EventSource (auto-reconnect) with polling fallback
        │                                   │
        ▼                                   ▼
  data/store.ts (zustand)             stage bus: chain clock + block pulses
        │
        ▼
  sections read hooks: useNetwork(), useGeo(), useBlocks(), useAppHealth(id)
```

Connection states exposed to the UI: `connecting`, `live` (SSE open), `polling` (SSE failed, interval
fetch working), `offline` (nothing works; showing fallback). Each number that can be stale carries its
`meta` (source, ageMs) so a tooltip or label can say how fresh it is.

## 8. Quality gates

A piece of work is done when all of these hold for the paths you own:

- `npm run build`, `npm run typecheck`, `npm run lint` and `npm test` pass (for your paths).
- No console errors or warnings at runtime in Chromium (WebGL on, and with `?q=low`).
- Looks right at 1440x900, 1920x1080 and 390x844, verified from real screenshots you looked at.
- Keyboard-only use works; `prefers-reduced-motion` is calm; with the API server stopped the page still
  renders and labels its data honestly.
- Budgets in DESIGN.md section 10 are met or the miss is stated in your report.

## 9. Security and privacy posture

- Strict CSP set by the server: `default-src 'self'`; `connect-src 'self'`; `img-src 'self' data:
  blob:`; `font-src 'self'`; `style-src 'self' 'unsafe-inline'`; `script-src 'self'`; `frame-ancestors
  'self'`; `base-uri 'none'`; `form-action 'none'`.
- Outbound links use `rel="noopener noreferrer"`; `withUtm()` adds `utm_source=community`.
- The submit helpers generate text for the visitor to copy. Nothing is stored server side and no
  visitor data leaves the browser.
- localStorage is used only for per-visitor preferences (accent, sound, intro seen, auto-ambient) and
  every access is wrapped in try/catch.

## 10. Deployment

Docker image `littlestache/community:latest` is built and smoke tested by GitHub Actions on every pull
request and push to `main`, and pushed to Docker Hub only when the workflow is run by hand from `main` with
`publish` ticked (so a merge never changes what Flux nodes pull). It runs the Node server as an unprivileged user on 42069 with a `/healthz` check, and is deployed to Flux with
`deploy/flux_app_spec.json` (multiple instances, so every in-process cache and prober exists once per
instance; the design tolerates that). `owner` in the spec is a placeholder: the real ZelID is supplied by
the operator at deploy time and is never committed.

## 11. Decisions made on purpose

Short records of choices a newcomer might otherwise reopen.

- **The `shaders` effects library (shaders.com) is not used.** It was evaluated in a spike on 2026-10-12.
  It is WebGPU-only (version 4.0.4, built on typegpu), so it would run beside the three.js stage as a
  second GPU context and only for visitors whose browser exposes WebGPU. Its engine chunk is about 690 KB
  gzip, and its telemetry is on by default. Rendered side by side with a plain CSS highlight on the
  generated gateway art, the gain was small and it painted flat grey into the transparent parts of some
  pieces (the inside of the key's bow in the wallets tile). The "pop" comes instead from the stage's own
  post chain, emissive art composited with `mix-blend-mode: screen`, and cheap CSS light on hover. Revisit
  if WebGPU becomes universal and a WebGL2 path exists.
- **The catalog's lifecycle model stays generic.** `lifecycle: 'retiring'`, `retiresOn`, `replacedBy` and
  `replaces` in `shared/catalog.ts` drive the ribbons, the countdown, the handover edge in the
  constellation and the successor promotion. No catalog entry uses them at the moment, so their tests use
  synthetic fixtures. Deprecations recur, and the model costs almost nothing to keep.
- **No custom cursor chrome.** Pointer-reactive light on panels, the lattice and the symbol is welcome; an
  element that trails the operating system cursor is not (the project owner asked for it to be removed).
- **A jump is a glide plus a pin, not `scrollIntoView`.** Sections below the hero mount lazily and a
  mounted section is far taller than its placeholder (hosting is about 2,600 px against a 700 px shell at
  1440x900). A browser smooth scroll is aimed once, at the layout of the moment, so it landed a screen or
  more short, and the sections that mounted afterwards kept pushing the target away. `glide` re-measures
  the destination on every frame and spends the remaining distance by the easing's remaining progress, so
  the motion stays continuous when the target moves and ends exactly on it. `pin` then re-aligns the target
  on every layout change until the page has been quiet for 900 ms or 4.5 s have passed. The same pin serves
  deep links (`/#learn`), reduced motion (an instant jump, then the pin) and Back/Forward.
- **Nothing lazy mounts while a glide is in flight.** `useGlideStore` (in `lib/scroll.ts`) tells
  `SectionSlot` to ignore intersections until the glide ends, then to look again (`settled` bumps). The
  glide flies over cheap placeholders instead of mounting five sections mid-flight. Under a 4x CPU
  throttle the worst frame of a jump to hosting went from 467 ms to 233 ms and to community from 713 ms to
  215 ms; what remains is the target mounting at once (`routed`) and the sections around the landing.
- **Header clearance is declared once.** `html { scroll-padding-block-start: var(--header-offset) }` is
  the only place. Sections and `:target` must not add a `scroll-margin` of their own: the two stack, and
  sections used to land at twice the offset (140 px instead of 70 px).
- **Known limit: browsers without scroll anchoring.** Chrome and Firefox keep the view still when a
  placeholder above it grows into a real section. Safari (as far as we know; untested here) does not, so
  scrolling up through not-yet-mounted sections after a deep link can shift the content by up to a section
  height. The pin covers jumps, not manual scrolling. Emulate with `html { overflow-anchor: none }`.
  A fix would be per-section height estimates on the placeholders, or compensating in `SectionSlot` when a
  section lands above the viewport; neither has been built because it cannot be verified on real Safari.
