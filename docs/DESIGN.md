# Flux Community v2: design direction

Status: v1.0, the brief for the rewrite. Read [ARCHITECTURE.md](./ARCHITECTURE.md) first for contracts and
ownership. This document is the art direction: what it should look, move and feel like, section by
section, with the numbers to hit.

Visual references live in `docs/design/refs/` (open them before you design anything):

| File | What it is | Use it for |
| --- | --- | --- |
| `ref-hero.webp` | Concept frame: the Flux symbol as frosted glass over a lit hex lattice | The target look of the hero and the stage |
| `ref-ambient.webp` | Concept frame: a hexagonal glass tunnel with racing light | The target look of ambient (screensaver) mode |
| `ref-ui-material.webp` | Concept frame: chamfered glass panels, corner ticks, cursor spotlight | The target material of every panel and card |
| `ref-atlas-shell.webp`, `ref-atlas-ambient.webp` | Flux Atlas, the owner's other project | Family resemblance: dark, dense, luminous, precise |

Generated frames are **look targets, not shippable assets**. Never trace or ship them.

Other places to look (read only, do not copy code verbatim; reimplement):

- Flux Atlas (the owner's other repository): `docs/design/tokens.css`, `design-direction.md` and
  `motion-language.md` hold the sibling product's tokens, type, motion and glyph rules. We share DNA, not
  layouts.
- Flux Atlas `web/src/globe/engine/` (three.js engine: governor, post, shaders) and `ambient/director.ts`:
  how the owner builds a quality governor and an ambient mode.
- The owner's personal site (`src/`: a screensaver, a black-hole WebGL scene, a wallpaper, a boot screen, a
  command palette, portal transitions and achievements): raw WebGL scenes with a 2D fallback, an
  idle-triggered screensaver, a boot sequence, a command palette, portal transitions.
- The Flux brand book (`Flux_Brand_Book.pdf` in the official media kit; read pages with a PDF reader when
  you need a rule). Brand logos are already curated in `web/public/brand/`.

---

## 1. The idea: the Lattice

The Flux symbol is built from hexagons. The site's world is a **hexagonal lattice**: an endless field of
dark glass cells on a black void, lit from beneath in Flux Blue. The lattice is the network and every cell
is a node. The apps and hosts the community has built are cells that glow brighter. It reacts to
everything: the cursor lifts cells like a hand over a bed of keys, a click sends a ring outward, and every
30 seconds a **real block** sweeps a wave through it. Above it the Flux symbol floats, extruded from its
four official shards, assembled out of light.

Why this idea:

- It is native to the brand (the mark is four hexagonal shards) and instantly says "network".
- It is distinct from Atlas (a globe) and stachetech (an OS desktop) while sharing their care.
- One motif scales from the full-screen hero, to the material of every panel, to the glyph set, to the map.
- It is genuinely live: the lattice pulses with the actual chain, so the site breathes with Flux.

Three feelings to hit, in this order: **awe** in the first three seconds, **orientation** in the next
ten (what is Flux, what is here, where do I click), then **delight** that keeps rewarding exploration
(things respond, nothing is dead, details reveal themselves).

## 2. Principles

1. **Alive, not busy.** Constant subtle motion, rare big motion. Never more than two things competing for
   attention. The lattice is the ambient layer; the content is the foreground.
2. **Light is the material.** Surfaces are dark glass; information and affordance are emissive. White-hot
   marks "this matters now". Blue is structure. Colour beyond that is data.
3. **Precision.** Hairlines, tick marks, tabular mono numerals, exact alignment, consistent chamfers.
   Next-gen is mostly restraint plus craft.
4. **Everything responds.** Every interactive element has hover, focus, press and disabled states with
   physical feedback, and a keyboard path.
5. **Honest.** Live data says it is live, stale data says so, and nothing fake is dressed as real.
6. **Fast and kind.** Content paints immediately; the 3D arrives when ready; low-end devices and
   reduced-motion visitors get a calm, complete experience, not a broken one.

## 3. Visual language

### 3.1 Colour

Start from the Atlas tokens (`docs/design/tokens.css` there): Flux Blue Wave `#2B61D1` is the one brand
colour with book shades `#4F7AD4` and `#86A1DA`; black `#000`, graphite `#2D2D2D`, gray `#717171`, white.
Dark only. Elevation is lightness (`--ink-0` to `--ink-5`), not drop shadow.

| Role | Rule |
| --- | --- |
| Void | `#000` behind everything; the lattice floats in it |
| Surfaces | `--ink-0..5`, with a 4 to 6 percent Blue Wave cast so panels share a colour space with the accent |
| Structure | Flux Blue scale `--accent-300..700`; hairlines at `--line-1..3` |
| Attention | White-hot `#fff` and `--hot-2`: focus rims, active edge, beam heads, block flares |
| Data | Tier colours only for tiers: Cumulus `#36D3FF`, Nimbus `#C77DFF`, Stratus `#FFC857` |
| Status | `--status-ok #3FDC95`, `--status-warn #FF9A3D`, `--status-crit #FF5470`, `--status-off #717171`; always with an icon and a word |

**Accent switching.** `html[data-accent="flux|cumulus|nimbus|stratus"]` re-points the `--accent-*` scale
and the lattice glow. The Flux symbol and logo **never** change colour (blue, white, black, gray only).
Default is `flux`. Contrast must stay AA on every accent.

### 3.2 Type

Montserrat (variable) leads: display and headings, 300 to 800. Open Sans (variable) carries text. IBM
Plex Mono carries data, labels, kbd, hashes and the "instrument" voice. Lora (variable, italic) is the
accent: at most one editorial line per section. All self-hosted through `@fontsource*`, latin subset.

- Display: `clamp(2.75rem, 8vw, 8rem)`, weight 700 for key words and 300 for the rest, tracking
  `-0.04em`, line-height 0.95. Mixed weights in one headline are the signature.
- H2: `clamp(1.875rem, 4.2vw, 3.75rem)`, 600, tracking `-0.03em`.
- Body: 1rem to 1.0625rem, 1.6, `--text-2`. Max 62ch.
- Labels: mono 11 to 12 px, uppercase, tracking `0.12em`, `--text-3`. Section eyebrows are
  `01 / NETWORK PULSE` with a hex bullet.
- Numbers: always `font-variant-numeric: tabular-nums`; big stats are Montserrat 300 to 600.

### 3.3 Shape and material

- **Chamfer, not radius.** Panels have two diagonal cuts (top-right and bottom-left, `--chamfer` 14 px,
  large panels 22 px). Inputs and small chips use 8 px. No pill shapes except the nav and toggles.
- **Glass slab** (see `ref-ui-material.webp`): `--ink-0` at about 62 percent, `backdrop-filter: blur(18px)
  saturate(1.4)`, a 1 px gradient edge (brighter on one cut corner), a faint hex pattern and grain inside,
  tiny corner ticks and crosshairs, an inner top highlight. Hover adds a cursor-following spotlight and
  raises edge luminance; press compresses 2 percent.
- **Hexagon bullets, rings and gauges** instead of dots and circles wherever it reads well.
- **Hairline grid** and tick rulers as structural decoration, at 4 to 8 percent opacity. Decoration
  never carries information and never fights text.
- Depth by layering and parallax (up to about 8 percent translate), not by blur soup.

### 3.4 Iconography

A custom glyph set (SVG, 1.5 px stroke at 24 px, square caps, hex-derived geometry) for gateways, tiers,
categories, status and actions. Lucide is allowed for generic UI controls only (close, chevrons, search).
No emoji anywhere. The Flux symbol is only ever the official asset.

### 3.5 Imagery

- The real Flux marks from `web/public/brand/`.
- Generated art (section 9): emissive objects on pure black, composited with `mix-blend-mode: screen`
  or in WebGL, so they sit inside the dark UI with no boxes.
- Real app screenshots as thumbnails (captured at build time by a script, never hot-linked).
- Procedural: the lattice, the dot map, gauges, sparklines, the constellation.

### 3.6 Light and post-processing

Bloom (soft, threshold high), a restrained chromatic aberration toward the edges, fine film grain, a
vignette that keeps the corners dark, and depth fog on the lattice toward the horizon. Glows are
accent-tinted and low alpha; avoid grey, muddy halos. The lattice must dim itself behind dense content so
text always has contrast (the stage owns that: per-section "look presets").

## 4. Motion language

Native scrolling, always (no scroll hijacking). Everything is interruptible. Everything has a
reduced-motion twin that is calm but complete (opacity fades, no parallax, no camera moves).

| Token | Value | Use |
| --- | --- | --- |
| `--dur-1` | 120 ms | hover colour, focus rings |
| `--dur-2` | 220 ms | small UI transitions |
| `--dur-3` | 380 ms | panels, drawers, tooltips |
| `--dur-4` | 700 ms | section reveals, count-ups |
| `--dur-5` | 1200 ms | camera moves, hero intro beats |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | default entrance |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | movement across the screen |
| `--ease-snap` | `cubic-bezier(.2, .9, .2, 1.15)` | small overshoot on press release |

Patterns (build each once as a primitive and reuse):

- **Reveal:** opacity 0 to 1, translateY 24 px to 0, blur 8 px to 0, staggered 60 ms, triggered once on
  entering the viewport (threshold 0.2). Headlines reveal by word or line.
- **Count and odometer:** numbers roll digit by digit (odometer) when they change, and count up from 0
  the first time they appear. Big block heights use the odometer; stats count up.
- **Draw:** hex outlines and rules draw themselves with `stroke-dashoffset` or `scaleX`.
- **Magnetic:** primary buttons and glyph buttons drift up to 6 px toward the pointer within an 80 px
  field (fine pointers only).
- **Tilt and spotlight:** cards tilt up to 5 degrees toward the pointer with a moving specular highlight
  and a radial spotlight under the cursor; the card's art parallaxes opposite.
- **Focus beam:** keyboard focus draws a white-hot rim that sweeps around the chamfer.
- **The Beat:** every real block (about 30 s) fires one soft global pulse: tick marks flare, accent hairlines
  brighten, the block counter rolls, and the stage sends a wave. It is the site's heartbeat. If the API
  is offline there is **no** simulated beat; the UI shows an "offline" state instead.
- **Launch:** leaving to an external app flashes the lattice, plays a 240 ms warp of the card toward the
  viewer, and opens the link in a new tab. Never block navigation on animation.

Sound is optional and **off by default**: a tiny WebAudio synth (no assets) for hover ticks, a block chime
and confirm blips, behind a header toggle and a command deck action. It never autoplays and respects the
OS reduced-motion preference as "off".

## 5. Page and sections

One long page, native scroll, hash deep links. Sections in order (ids match `sections/registry.ts`):

| # | id | Nav | Job |
| --- | --- | --- | --- |
| 00 | `hero` | Home | Awe and orientation. What this is, live pulse, two clear paths |
| 01 | `pulse` | Network | Prove it is alive: the network right now |
| 02 | `gateways` | Start here | The official doors into Flux |
| 03 | `builds` | Builds | **The flagship.** What the community built, with live status |
| 04 | `hosting` | Run a node | Community node hosting services and the tier explainer |
| 05 | `play` | Games | Game servers on Flux |
| 06 | `learn` | Learn | How an app runs on Flux, plus guides |
| 07 | `community` | Community | Channels, credits, submit your app or host, footer |

The header is a glass bar: lockup left (round symbol plus "Flux Community"), a pill nav with a sliding
active indicator in the middle, and on the right the command deck button (shows `Ctrl K` or the Mac
equivalent), the accent switcher (four hex swatches) and the sound toggle. It condenses after the hero.
On phones the nav becomes a bottom sheet opened from a hex menu button.

### 5.0 Intro (first visit of a session only)

About 1.8 s: black, then lattice cells ignite from the centre outward, the four shards fly in and lock
into the symbol, a single white flash, the headline reveals. Any key, click or scroll skips it. It is
never blocking: the headline and CTAs are in the DOM and readable from the first frame. Skipped entirely
for reduced motion, `?intro=0`, and repeat visits in the same session.

### 5.1 Hero

- Eyebrow (mono): `FLUX  /  THE DECENTRALIZED CLOUD` and a live `BLOCK 3,031,112` chip with a status dot.
- H1: **Built by the community / Ran by the network** (four stacked lines, no end punctuation). Mixed
  weights: "community" and "network" in 700 with a subtle accent gradient, the rest 300.
- Subhead: "Apps, tools, node hosts and guides from the people who build on Flux, plus the live pulse of
  the network they run on."
- CTAs: primary **Explore community builds** (scrolls to `#builds`, magnetic, glow), secondary
  **Open the command deck** with a kbd chip.
- Right side: an empty element with `data-stage-anchor="symbol"`, about 520 px square on desktop. The
  stage draws the 3D symbol there. Hovering it separates the shards slightly and brightens the lattice
  beneath; dragging rotates it with inertia; a click fires a shockwave. On touch, a gentle idle tilt
  plus optional gyro parallax.
- Live strip along the bottom: block height (odometer) with a 30 s progress ring labelled "next block",
  nodes online, FLUX price with 24 h change. Each has a tiny freshness indicator.
- Scroll cue: a hex with a down chevron that nudges every 4 s.

### 5.2 Pulse (network, right now)

A bento grid of live tiles, each a glass slab with a mono label and a freshness chip
(`LIVE 3 s`, `CACHED 2 min`, `OFFLINE last known`):

1. **Nodes** (large): total with odometer; three stacked hex-ring gauges for Cumulus, Nimbus, Stratus
   showing count, share, collateral (1,000 / 12,500 / 40,000 FLUX) and FLUX per block per node tier
   (1 / 3.5 / 9 at today's schedule, read from the API). Hovering a ring sets the stage accent to that tier
   and dims the others. Line: "One node of each tier is paid in every block."
2. **Block cadence:** a dial synced to chain time (30 s), a sparkline of the last 60 block intervals with a
   30 s target line, the measured average. At zero the ring flares.
3. **Next reward reduction:** a live countdown (days, hours, minutes, seconds) to the next subsidy step,
   the block height, the size of the cut and the estimated date, computed from the API's `nextReduction`.
4. **World map** (large): a dot-matrix world with node density glowing by tier; hover a country for a
   tooltip with counts per tier; tier filter chips; a top-5 countries list with bars; a link to the
   full 3D globe on Flux Atlas. Canvas 2D is fine; it must be crisp at DPR 2 and keyboard reachable
   through the list.
5. **Capacity and apps:** cores, RAM, SSD as big numbers with animated bars, plus apps running.

Never fake geography or traffic. Arcs, if used, are decorative and unlabelled as data.

### 5.3 Gateways (start here)

H2 "Start anywhere." A bento of 9 to 10 tiles from `GATEWAYS`: FluxCloud is the large tile; Docs,
Games, FluxEdge, FluxAI, Explorer, Run a FluxNode, runonflux.com, and the two wallets. Each tile has:
generated art on black blended with `screen` that parallaxes opposite the pointer, a mono kind label, the
name, one line, the host, and an arrow glyph that slides on hover. Hover: spotlight, tilt, art zoom, and
the stage lights the lattice beneath the tile (`setFocus`). Click opens the URL (with utm) in a new tab.
No tile is purely decorative; every one links somewhere real.

### 5.4 Builds (the flagship)

H2 "What the community built." Sub: "Apps and tools from Flux community members, spotlighted by the Flux
team. Every status is checked live."

Controls row: a search field (mono prompt, `/` focuses it), category chips with counts, a sort select
(Spotlight, A to Z, Status), and a view switch **Cells | Constellation**.

- **Cells view (default, accessible):** a responsive grid of `AppCell`: screenshot thumbnail (or art
  fallback), name, tagline, builder credit ("by 2ndTL Mining"), a health pill (`Live`, `142 ms`), a
  lifecycle ribbon (`New`, or `Retiring <date>` when an app is being phased out), and a spotlight mark
  for team-spotlighted apps. Hover reveals a Launch button and parallaxes the thumbnail. Click opens
  the detail drawer.
- **Constellation view (visual alternative):** an interactive 2D/3D graph: a centre node, category hubs,
  app nodes orbiting, builder links; hover highlights a neighbourhood, click selects, drag to pan and
  rotate, slow auto-drift. It is `aria-hidden` and always paired with the keyboard list. Lazy loaded.
- **Detail drawer** (right side on desktop, bottom sheet on mobile; focus trapped; Esc closes; deep link
  `#builds/<id>`): large preview, name, tagline, description, builder, host, live health (state, latency,
  since), lifecycle info (a countdown for retiring apps with a "Replaced by <name>" button; "Takes over
  from <name>" on the successor), tags, **Launch app** (primary), copy link, and related apps.
- **Special cells:** "Flux Community" is marked "You are here" and is not launchable; an **Add your app**
  cell opens the submit dialog (name, URL, one liner, builder handle) that composes a ready-to-paste
  message for the Flux Discord and copies it. Nothing is stored.
- Empty search state is friendly and useful ("No match. Try a category, or add your own.").
- A down app is shown dimmed with "Offline right now" and remains openable. A retired app (after its
  `retiresOn` date) shows "Retired" and links to its replacement.

### 5.5 Hosting (run a node without the rack)

H2 "Run a node without the rack." Intro adapted from the Flux team's own words: community members built
node hosting services that let people around the world take part in keeping Flux healthy and earn FLUX
while doing so. Then:

- **Tier explainer:** three concentric orbits (Cumulus, Nimbus, Stratus) with live node counts, the
  collateral, FLUX per block per tier and "paid about every N hours" (derived: tier nodes times block
  time). Hover or focus a tier to isolate it; tier colours here only. Note: "One node of each tier is paid
  in every block."
- **Provider bays:** six cards from `NODE_HOSTS` as lit docking bays: name, operator handle, blurb, host,
  Visit button. MCB shows "Message on Discord" instead of a link (copy handle plus open Discord).
- **Do it yourself:** a link to the official FluxNode guide.
- Small print: "Community services. Fees and returns vary by provider. Do your own research." Not
  financial advice, stated once and quietly.

### 5.6 Play

H2 "Game servers on the decentralized cloud." Each server runs on its own independent node; pick a
game, pick a region, play; pay by card or with FLUX; flat monthly plans, no contract. A kinetic wall of
game names in mono (Minecraft, Valheim, Rust, Palworld, Project Zomboid, FiveM, ARK: Survival Ascended,
Terraria, Factorio, Don't Starve Together, and more) in two counter-scrolling rows that pause on hover;
text only, no third-party logos. Art: a glass tunnel or arcade scene. CTA **Browse games** opens
runonflux.com/games. Higher-energy lattice (faster ripples) behind it.

### 5.7 Learn

H2 "How an app runs on Flux." An autoplaying, scrubbable three-step explainer (click a step to jump;
pauses off-screen and under reduced motion):

1. **Describe:** a small spec panel types itself (name, image, cpu, ram, storage, instances).
2. **Place:** the network picks independent nodes in different regions; cells light on a mini map.
3. **Run:** instances come online; one node drops; traffic reroutes along a new path; "still up".

Beside it, resource links: Docs, Deployment Academy, Run a FluxNode, Flux API docs, Blog, YouTube,
GitHub. Concept only: no prices or SLAs.

### 5.8 Community and footer

H2 "Join in." A hex cluster of channel cells (Discord largest; X, X Community, Telegram, YouTube, GitHub,
Blog), each with handle and an animated glyph. A credits strip lists every builder named in the catalog
in a slow ticker ("Built by 2ndTL Mining, Physalis, Little Stache, Method, CarRamRodB16_228, Goldie,
..."). The **Submit your app or host** band repeats the Discord route. Footer: the
"Running on Flux" badge (this site does), nav links, data attributions ("Network data from the Flux
public API, price from CoinGecko"), "Built by the Flux community. Flux and the Flux logo belong to
their owners.", and a back-to-top hex.

## 6. System overlays and features

- **Command deck** (`Ctrl/Cmd+K` or `/` outside inputs): glass modal with a mono prompt, grouped fuzzy
  results (Sections, Apps, Hosts, Gateways, Social, Actions), highlighted matches, arrow keys, Enter to
  run, Esc to close, recent items. Actions: enter ambient mode, switch accent, toggle sound, reduce
  motion, copy page link, open submit dialog, show shortcuts. A `>` prefix runs "terminal" queries that
  answer inline from live data: `> block`, `> nodes`, `> price`, `> reduction`, `> apps`.
- **Ambient mode** (section 7).
- **Shortcuts help** (`?`): a small glass overlay listing keys.
- **Toasts:** one-line confirmations ("Link copied"), glass, 2.4 s, polite live region.
- **Easter egg (stretch):** the Konami code overclocks the lattice (intensity up, Stratus gold accent
  for 20 s) and fires a banner "Overclocked".
- **Preferences** persisted in localStorage (accent, sound, auto-ambient, intro seen), try/catch always.

## 7. Ambient mode (the screensaver)

Triggered after 90 s without input (toggle in the command deck, on by default), by `A`, or from the
command deck. It is a cinematic **tour of the community**, distinct from the stachetech black hole and
the Atlas globe:

- The stage switches to its ambient preset: the camera glides forward through the lattice (see
  `ref-ambient.webp` for the tunnel mood), bloom up, chromatic aberration up, with the Flux symbol small
  and steady at the vanishing point. Every real block sends a bright wave down the corridor.
- A caption layer cycles through the community builds ("Flux Atlas, by Little Stache. Entire Flux
  network tracking.") with a slow crossfade, 8 s each, one app at a time, then the node hosts, then the
  gateways. Uses catalog copy only.
- A quiet HUD: large clock, date, block height with "next block in N s", connection status.
- Any input wakes it: the HUD fades, the camera eases back to the section the visitor was on, the
  captions disappear. `prefers-reduced-motion` gets a static dim variant (no camera travel).

## 8. States, data honesty, and offline

| Situation | Behaviour |
| --- | --- |
| API live, SSE open | Numbers live; chips `LIVE`; the Beat runs from real blocks |
| SSE failed, polling works | Chips `LIVE` with a small `polling` hint; the Beat runs from polled height changes |
| Data older than its window | Chips `CACHED` (amber) with age; numbers keep showing |
| API unreachable | Chips `OFFLINE`; show the last known value or the baked fallback labelled "as of <date>"; no Beat; catalog still fully usable |
| Health unknown | Pill shows `Unchecked`, never "Live" |
| WebGL missing, blocked or context lost | CSS lattice fallback (an animated SVG/CSS hex pattern) plus a static symbol; everything else unchanged |
| Reduced motion | No intro, no parallax, no camera moves, no marquee; opacity-only reveals; the stage renders one still frame with slow low-amplitude breathing at most |

## 9. Generated and captured assets (spec for the asset pipeline)

All generated through `scripts/imagegen.mjs` (Codex image generation). Rules:

- **Brand-safe:** never ask for logos, wordmarks, text, UI or people. Composite real marks and real text
  in code. (Generated images do not reproduce the Flux symbol faithfully enough to ship.)
- **Style prefix** for every prompt: "Dark glass and frosted crystal hexagonal forms with electric royal
  blue (#2B61D1) edge light and white-hot highlights, volumetric haze, soft bloom, photoreal 3D render,
  premium minimal, pure black (#000000) background, no text, no logos, no UI, no people, no scenery".
- **Subject on pure black** with generous margin so edges fade to true black; composite with
  `mix-blend-mode: screen` (CSS) or additive blending (WebGL). Verify the corners are really black.
- **One accent colour per piece** (blue by default; tier pieces use the tier colour).
- Ship as WebP (and AVIF when smaller) at the display size x 2 maximum; each file under 120 KB; keep
  originals out of `web/public`.
- Name by use: `web/public/art/gateway-cloud.webp`, `tier-cumulus.webp`, `play-tunnel.webp`, and a
  typed manifest `web/src/content/art.ts` with dimensions and an average colour for placeholders.

Set to produce:

| Group | Pieces |
| --- | --- |
| Gateways (9) | cloud (stacked glowing container cubes deploying), edge (a glass GPU die with lit traces), ai (a faceted neural orb), games (a controller built of hex tiles), docs (floating glass pages with code light), explorer (a chain of linked glass blocks receding), node (a single hex pillar with rings), site (the lattice horizon), wallet (a glass key and vault form) |
| Tiers (3) | Cumulus (one small hex crystal, cyan), Nimbus (a double-hex cluster, violet), Stratus (a tall faceted tower, amber) |
| Play (2) | glass tunnel with game-cartridge tiles, a hex controller |
| Sprites (3) | soft hexagonal bokeh disc (alpha), light streak, lens dirt (for the stage) |
| Social (1) | backdrop for the 1200x630 Open Graph card, composited with the real lockup and real text |

Captured at build time by `web/scripts/capture-previews.mjs` (Playwright driving the system Chromium):
`web/public/previews/<appId>.webp` at 960x600, under 70 KB, for every catalog app and host with a URL; if a
capture fails the UI falls back to generated art. Also favicons, `apple-touch-icon`, `site.webmanifest`.

## 10. Budgets and quality tiers

| Budget | Target |
| --- | --- |
| Critical JS (HTML + app shell, gzipped) | 90 KB |
| JS before first interaction, excluding the stage chunk | 160 KB |
| Stage chunk (three.js subset + stage code), lazy | 220 KB |
| Fonts (latin subsets, preloaded where it helps) | 150 KB |
| Each generated art file | 120 KB; total art 1.2 MB, lazy |
| Each preview | 70 KB |
| LCP / CLS / INP (fast 4G, mid laptop) | 2.0 s / 0.02 / 150 ms |
| Frame rate | 60 fps at tier 2 on an integrated GPU, never below 30 fps on tier 1 |

Quality tiers (written by the stage governor into the bus): **3 high** (DPR up to 2, about 6 k lattice
cells, bloom and aberration and grain, 4 k dust), **2 medium** (DPR up to 1.5, about 3.5 k cells, half-res
bloom, 2 k dust), **1 low** (DPR 1, about 1.5 k cells, no post, 800 dust), **0 none** (CSS fallback).
Start low on phones, `Save-Data`, or `deviceMemory <= 4`; adapt up and down with hysteresis; `?q=` forces
a tier. Pause rendering when the tab is hidden, `paused` is set, or the canvas is not visible.

## 11. Accessibility

WCAG 2.2 AA is the floor. One `h1`, ordered headings, landmarks (`header`, `nav`, `main`, `footer`), a
skip link, visible focus on every control, 44 px touch targets, no information by colour alone,
descriptive link text, `lang`, `aria-live="off"` for per-block counters (announce only on demand),
focus trap and `inert` for modal UI, canvas and decorative layers `aria-hidden`, text and controls
operable at 200 percent zoom and 320 px width, and `prefers-contrast` and `forced-colors` honoured.

## 12. Copy deck (use these voices; do not invent claims)

- Voice: plain, confident, a little dry. Sentences, not slogans. Concrete over abstract.
- Never: em dashes, emoji, "revolutionary", "next-generation" (the design is the proof), "web3 magic".
- Loading: "Syncing with the chain". Offline: "Showing the last known numbers". Unchecked: "Not checked yet".
- Empty search: "No match. Try a category, or add your own."
- External link hint (visually hidden): "Opens in a new tab".
- Credit format: "Built by <handle>". Spotlight mark: "Spotlighted by the Flux team".
- Retiring: "Retiring <date>. <Successor> takes over." New successor: "New. Takes over from <name> on <date>."
- Submission message template: "Hi @bigstache, please add my Flux app to the community portal.\nName:
  <name>\nURL: <url>\nWhat it does: <one line>\nBuilt by: <handle>"

## 13. Definition of done (design)

A section is done when it matches this document and the references, has all its states (loading,
live, stale, offline, empty, error, reduced motion, no WebGL), is verified from screenshots at 1440x900,
1920x1080 and 390x844 that you actually looked at, passes keyboard-only use, stays within budget,
and survives a 30 second interaction soak with no console errors and no runaway CPU.
