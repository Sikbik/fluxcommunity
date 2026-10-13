# Flux Community design system

Everything a section needs to look and behave like the rest of the site. Import from
`@/ui`. Read this file; you should not need to read the primitives' source.

```tsx
import { Section, Reveal, Panel, Button, Chip, Stat, Odometer, FreshnessChip, Glyph } from '@/ui';
```

Other import paths you will use: `@/lib` (formatters, hash route, overlays and prefs
stores, `cn`), `@/content/copy` (the copy deck), `@/data` (data hooks, owned by the data
agent), `@shared/catalog` (apps, gateways, links; never hard-code those facts).

- [The idea in one minute](#the-idea-in-one-minute)
- [Building a section: checklist](#building-a-section-checklist)
- [CSS rules, tokens, type](#css-rules-tokens-and-type)
- [Primitives](#primitives)
- [Hooks](#hooks)
- [The shell contract](#the-shell-contract): stage bus, hash routes, overlays, prefs, hotkeys, layers
- [Overlay convention](#overlay-convention)
- [Accessibility and performance rules](#accessibility-and-performance-rules)
- [Cost and layout rules (measured)](#cost-and-layout-rules-measured)
- [Kit gallery](#kit-gallery)

---

## The idea in one minute

The page is a dark glass interface over a living hex lattice (the "stage", WebGL, owned
by another agent). Surfaces are chamfered glass slabs (`Panel`); light is accent blue
with white-hot corners; data is mono, tabular and always honest about how fresh it is
(`FreshnessChip`). Motion is calm, once, and has a reduced-motion twin. You never touch
three.js: you describe intent to the stage (`<Panel stageFocus>`, `useStageFocus`,
`useStageBus.getState().firePulse('success')`) and it responds.

The flux **symbol** is the official artwork only (`FluxMark`): blue, white, black or gray.
Never recolour it, never put it on a gradient.

## Building a section: checklist

A section lives in `src/sections/<id>/index.tsx`, default-exports one component, and is
loaded lazily by the shell (the hero is eager). Do not edit `App.tsx` or the registry.

1. **Wrapper.** Render `<Section id="pulse" title=... lead=...>`. It emits
   `<section id data-section aria-labelledby>`, the rhythm (`--section-y`), the container,
   and the header with its reveal. The `id` is the hash target and the scroll-spy key.
   Only the hero renders an `h1`; sections use `h2`, cards inside use `h3`.
2. **Header.** `title` is a sentence with at most one or two emphasised words:
   `title={<>What the <b>community</b> built.</>}`. `lead` is one or two sentences, 66ch.
   The eyebrow (`02 / GATEWAYS`) comes from the registry; do not write it.
3. **Reveal.** Wrap blocks in `<Reveal index={i}>` (staggered 60 ms per index) so content
   arrives once, as it scrolls into view. Above-the-fold content: `immediate`. Do not
   nest reveals; do not reveal more than ~12 items individually (reveal the grid instead).
4. **Surfaces.** Cards are `<Panel>`. Long lists and anything repeated more than ~8 times:
   `variant="slab"` (no backdrop blur) and `halo={false}`. Interactive cards:
   `<Panel as="a" href interactive stageFocus>`.
5. **Stage focus.** Anything the visitor can hover or focus that has meaning gets
   `stageFocus` (Panel) or `useStageFocus(ref)`: the lattice lights beneath it. Do not
   add it to every small chip; use it on cards, tiles and rows.
6. **Data honesty.** Every number from the network shows its freshness: put a
   `<FreshnessChip value={sourced} />` (pass the `Sourced<T>` from the data hooks) next to
   the figure or in the section header actions. Never show fixtures as live. If `data`
   is null, render `<Skeleton />`, not zero.
7. **Numbers.** Use `Odometer` for values that change, `CountUp` for one-time counts,
   `Stat` for the label + number + sub-line + chip pattern. Format with `@/lib/format`
   (`formatInt`, `formatCompact`, `formatUsd`, `formatAge`, ...). They return `--` for
   missing data; do not invent your own placeholder.
8. **Copy.** Plain, concrete, sentence case. No em dashes. No emoji. No "revolutionary".
   Reuse `@/content/copy` strings. Every outbound link: `ExtLink` or `LinkButton`
   with `withUtm`; they add `rel`, `target`, the hidden "opens in a new tab" text and the
   arrow glyph.
9. **Reduced motion.** Everything in `@/ui` already has its calm twin. For your own
   CSS: write the animation, then add
   `:global(html[data-motion="reduced"]) .thing { animation: none; transition: none; }`.
   In JS use `useReducedMotion()`. Never rely on motion to communicate state.
10. **Loading.** Your module is lazy-loaded; keep section code lean. Heavy things
    (charts, maps) go behind `lazy(() => import(...))` inside the section. Do not import
    three.js, ever. Images: `loading="lazy"`, explicit `width`/`height`, AVIF/WebP from
    `public/art`.
11. **Layout shift.** Reserve space. Skeletons match the final height; images carry
    `aspect-ratio`.
12. **Verify.** `?kit=1` shows every primitive; your section at `/#<id>`; run with
    `?q=low` and `--reduced-motion` (see `scripts/shot.mjs`).

### Skeleton

```tsx
import { Section, Reveal, Panel, Stat, Odometer, FreshnessChip } from '@/ui';
import { useNetwork } from '@/data';
import { formatCompact } from '@/lib';
import styles from './pulse.module.css';

export default function Pulse() {
  const network = useNetwork();
  const nodes = network.data?.nodes.total ?? null;
  return (
    <Section
      id="pulse"
      title={<>The network, <b>right now</b>.</>}
      lead="Every figure is read from the chain. The chip says how fresh it is."
      actions={<FreshnessChip value={network} />}
    >
      <div className={styles.grid}>
        <Reveal index={0}>
          <Panel stageFocus>
            <Stat label="Nodes online" value={nodes === null ? '--' : <Odometer value={nodes} />} />
          </Panel>
        </Reveal>
      </div>
    </Section>
  );
}
```

```css
/* pulse.module.css */
@layer section {
  .grid {
    display: grid;
    gap: var(--grid-gap);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  }
}
```

---

## CSS rules, tokens and type

- **Plain CSS + CSS Modules.** No Tailwind, no CSS-in-JS, no inline `style` for anything
  that is not a dynamic value.
- **Layers.** Order is `reset, tokens, base, ui, section, utility`. Wrap every section
  module in `@layer section { ... }`. Primitives live in `ui`, so your section styles
  win without specificity fights. Never use `!important`.
- **Logical properties** (`margin-inline`, `inset-block-start`, `padding-block`). No `left`/`right`
  unless it is a physical effect (a sheen that always goes left to right).
- **Container queries over media queries** for components: put `container` on the
  `Panel` (`<Panel container>`) and use `@container (min-width: 30rem)`. Media queries are for
  page-level layout: `--bp-phone: 720px`, `--bp-desktop: 1100px`, `--bp-wide: 1680px`
  (custom properties cannot be used inside `@media`; write the number).
- **Animate transform and opacity only.** Set `translate`, `scale`, `rotate` (the
  individual properties) rather than `transform` where the primitive already uses
  `transform` (tilt). No animating `width`, `height`, `top`, `box-shadow`, `filter`.
  And animate an HTML element, never an `<svg>` or a node inside one
  ([why](#animate-an-html-wrapper-not-the-svg)).
- **No `filter`, `opacity < 1`, `clip-path` or `mask` on an ancestor of a Panel or
  anything with `backdrop-filter`**: it makes the blur sample nothing. Fade a wrapper's
  children, not the wrapper, or use `Reveal` (it only animates the element it wraps).
  This includes an *animated* opacity: a modal that fades its root in or out blanks the
  glass for the whole fade. See [modals](#modals-fade-the-layers-not-the-ancestor).
- **Do not leave a stacking context where blended art lives.** `isolation`, a `translate`
  or `scale` that is not `none` (even `0 0` and `1`), `opacity < 1`, `filter`, `will-change`
  and `contain: paint` each make one, and `mix-blend-mode` art inside then blends with that
  group instead of the page. At rest, set these back to `none`, not to an identity value
  (`Reveal` does). See [blended art](#blended-art-inside-a-panel).
- **No hard-coded colours.** Everything is a token. If you need a colour that is not a
  token, the answer is the nearest token.

### Tokens

Colour (dark only; elevation is lightness):

| Token | Meaning |
|---|---|
| `--void`, `--ink-0 .. --ink-5` | Surfaces, `#000` up to `#3f4249` |
| `--text-1 .. --text-4` | Primary, secondary (body), tertiary (captions), disabled |
| `--line-1 .. --line-3`, `--line-blue` | Hairlines |
| `--accent`, `--accent-text`, `--accent-strong`, `--accent-soft`, `--accent-line`, `--accent-glow` | The page accent (re-pointed by the accent switcher and `[data-tier]`) |
| `--accent-solid`, `--accent-solid-hover`, `--accent-solid-active`, `--on-accent` | Filled controls and their text |
| `--accent-rgb`, `--accent-hot-rgb`, `--accent-deep-rgb` | For `rgb(var(--accent-rgb) / 0.4)` |
| `--white-rgb`, `--void-rgb` | The neutral triples (`255 255 255`, `0 0 0`) for translucent whites and blacks that follow no accent: `rgb(var(--white-rgb) / 0.1)` hairlines and sheens, `rgb(var(--void-rgb) / 0.6)` scrims and vignettes. Do not type the numbers into a rule |
| `--tier-cumulus`, `--tier-nimbus`, `--tier-stratus` (+ `-rgb`, `-ink`) | Node tiers. For tiers only |
| `--status-ok`, `-pending`, `-warn`, `-crit`, `-off` (+ `-soft`) | Reserved meanings. Always with a word or icon, never a chart series |

Scale: spacing `--space-1 .. --space-14` (2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64,
80, 96 px); radii `--r-xs .. --r-lg` (4, 6, 10, 14; `--r-pill` for toggles only);
chamfers `--chamfer-xs/sm/-/lg` (5, 8, 14, 22 px). Layout: `--gutter`, `--container`
(1280), `--container-wide` (1520), `--container-narrow` (760), `--section-y`,
`--section-gap`, `--grid-gap`, `--header-offset`.
Motion: `--dur-1` 120, `--dur-2` 220, `--dur-3` 380, `--dur-4` 700, `--dur-5` 1200 ms;
`--ease-out` (default entrance), `--ease-standard`, `--ease-in-out`, `--ease-snap`
(press release), `--stagger` 60 ms. All durations collapse under reduced motion; use the tokens
and you get the twin for free.

**`--ease-out` is front-loaded.** Half of the distance is covered in the first 10 percent of
the time, 83 percent in the first 25, and it is visually finished by the halfway point. That
is right for a response to input (hover, press, open, a tooltip) up to about 400 ms: it feels
instant and then settles. Over a longer time the first beat does all the work and the rest is a
dead crawl. For a sweep, a beam, a travelling highlight, a rule that draws itself, or any move
longer than 400 ms use **`--ease-in-out`** (symmetric: half the distance at half the time).
`--ease-standard` sits between the two (fast start, soft landing) for panels that slide.

### Type roles (utility classes)

| Class | Use |
|---|---|
| `.t-display` | Hero line only. Weight 300, wrap key words in `<b>` for 700 |
| `.t-h2`, `.t-h3`, `.t-h4` | Headings (already applied by `SectionHeader`) |
| `.t-lead` | One or two sentences under a heading. The measure is a default: `--lead-max` (58ch) on the element or an ancestor changes it from a section's CSS |
| `.t-body`, `.t-small` | Text, captions |
| `.t-label` | Mono, uppercase, tracked: eyebrows, axis labels |
| `.t-mono`, `.t-num` | Mono data; tabular figures |
| `.t-stat` | Big numbers (Montserrat 300, tabular) |
| `.t-accent` | Lora italic editorial line. At most one per section |
| `.t-grad` | White to accent gradient for key words in headlines (works inside `SplitReveal`) |
| `.t-1`, `.t-2`, `.t-3` | Text colour steps |
| `.sr-only`, `.sr-only-focusable` | Visually hidden but announced |
| `.chamfer` | Gives an element `--clip-outer` / `--clip-inner` for chamfered silhouettes (set `--c`, `--cm`, `--bw`) |
| `.parallax` | Child drifts opposite the pointer inside a Panel or Tilt (`style={{ '--depth': '18px' }}`); `--parallax-dur` and `--parallax-ease` retime it |
| `.bleed`, `.bleed-pad` | Full bleed to the page edges from inside a Container ([how](#full-bleed)) |
| `.svg-free` | Opts an `svg`, `img`, `video` or `canvas` out of the reset's `max-inline-size: 100%` ([how](#the-reset-caps-svg-and-media-at-100)) |

The utility layer is the last one, so it beats your section CSS. That is why a utility never
hard-codes anything a section might want to change: the knobs are custom properties with
defaults (`--lead-max`, `--t-wrap` for the headline roles' `text-wrap`, `--parallax-dur`,
`--parallax-ease`, `--bleed-w`). Set the property in your module; do not fight the class.

Fonts: Montserrat (display, headings), Open Sans (text), IBM Plex Mono (data, labels),
Lora italic (the accent line). Self-hosted, latin only. Do not add fonts.

### Data attributes the shell maintains on `<html>`

`data-accent="flux|cumulus|nimbus|stratus"`, `data-motion="reduced|full"` (the effective
value, OS or override), `data-glass="full|lite"` (lite removes backdrop blur on
Save-Data), `data-beat="a|b"` (restarts on each real block; drives `--flash` under a `.beat`),
`data-intro` (`off|pending|playing|skip|done`), `data-ambient="true"` while ambient mode
is on, `data-scroll-locked`. Style off these; do not read them in JS (use the hooks).

---

## Primitives

Sizes are a contract: touch targets are at least 44 px (the Button `sm` is 36 px on fine
pointers and grows to 44 px on touch). Every primitive is keyboard complete and has a
visible focus state (a white-hot beam sweeping the chamfer).

### Layout and structure

**`Container`** `size?: 'default' | 'wide' | 'narrow' | 'full'` (1280, 1520, 760, edge to
edge), `as`, `className`, `id`. Centres content with the fluid gutter. `Section` already
uses one.

**`Section`** `id` (SectionId, required), `title?`, `lead?`, `actions?`, `align?:
'start' | 'center'`, `width?` (Container size), `tight?` (less vertical padding), `label?`
(name when there is no title), `className`, `bodyClassName`. The only thing a section
returns at its root. Do not wrap it in anything.

**`SectionHeader`** Used by `Section`; use directly only for sub-headers inside a
section. `title` (ReactNode, required), `section?` (pull eyebrow and index from the
registry), `index?`, `eyebrow?`, `lead?`, `align?`, `level?: 2 | 3`, `titleId?`, `actions?`,
`immediate?`. Words in `<b>` or `<strong>` are emphasised: bold weight and the white to accent
gradient of `.t-grad`, also while `SplitReveal` has them in per-word spans (each word carries
the gradient). The gradient never drops below 5:1 on the ink behind it; under
`prefers-contrast: more` and `forced-colors` the emphasis is plain bold text in the text colour.

**`Panel`** The glass slab. Props: `variant?: 'glass' | 'slab' | 'ghost'` (blurred
glass; opaque, no blur, for lists; edge and ticks only), `size?: 'sm' | 'md' | 'lg'`
(chamfer 8 / 14 / 22 px), `padding?: 'none' | 'sm' | 'md' | 'lg'` (default `md`),
`interactive?` (spotlight, edge catch, press compression; default false), `tilt?: boolean
| number` (needs `interactive`; max degrees, default 5), `stageFocus?: boolean | number`
(strength 0..1, default 0.6 when true), `hot?: 'tl' | 'tr' | 'bl' | 'br' | 'none'`
(default `tr`), `pattern?` (same corners, default `br`), `ticks?` (default true),
`halo?` (the bloom, default true), `clip?` (clip children to the chamfer, for media),
`container?` (makes it a size container), `tier?` (re-points accent roles to a tier),
`blendArt?` (let `mix-blend-mode` art inside blend with the page; see
[blended art](#blended-art-inside-a-panel)), `className`, `contentClassName` (use this for
flex/grid/scroll inside), `as` (any element: `a`, `button`, `li`, `article`), plus the
element's own props. For a link that opens a new tab spread
[`outboundLink`](#outbound-links) onto `as="a"`.

- Do vary `hot` and `pattern` between neighbours so a grid does not look stamped.
- Do use `as="a"` for whole-card links and put one real link inside; do not nest
  interactive elements inside a clickable Panel.
- Do not stack more than ~3 `glass` panels over each other (blur is expensive); use `slab`.
- Do not put `overflow: hidden` on a Panel; use `clip` for media bleed.
- `tilt` writes the panel's inline `transform` while the pointer is over it and clears it (and
  `will-change`) once it is flat again, so a grid of tilting panels costs nothing at rest.

```tsx
<Panel as="a" href={app.url} interactive tilt stageFocus hot="bl" pattern="tr" padding="lg">
```

### Controls

**`Button`** `variant?: 'primary' | 'secondary' | 'ghost' | 'icon'` (default
`secondary`), `size?: 'sm' | 'md' | 'lg'` (36 / 44 / 52 px, default `md`), `icon?`,
`iconEnd?` (Glyph names), `magnetic?: boolean | number` (default true for primary and
icon; fine pointers; max 6 px), `loading?` (spinner, keeps width, ignores presses, not
dimmed), `fullWidth?`, `shape?: 'chamfer' | 'hex'` (hex for icon buttons), `label?`
(**required for `variant="icon"`**: the accessible name), `hiddenUntilFocus?` (not seen until
it has focus: a skip link or keyboard-only action; it is out of the flow in both states, so
showing it moves nothing; position it with a `className`). Plus button attributes.

Children: plain text and inline markup lay out as text. Children that are a picture or a key
cap next to text (an inline `svg`, a `Kbd`, an `img`) are laid out as a centred row with the
same gap as the `icon` slot, so `<Button>Search <Kbd size="sm">K</Kbd></Button>` and
`<Button><svg .../> Pause motion</Button>` need no wrapper of your own. Prefer the `icon` and
`iconEnd` props for a glyph from the set; a custom svg is for a shape the set does not have.
An icon-only button (`variant="icon"`) ignores children.

**`LinkButton`** Same visuals, renders an `<a>`. `href` (required), `withUtm?`, `newTab?`
(default true for external). External links get `rel="noopener noreferrer"`, a
trailing arrow, and hidden "(Opens in a new tab)" text (the same attributes
[`outboundLink`](#outbound-links) gives any other element).

- One `primary` per view region. Secondary for the rest; ghost for tertiary.
- Do not use a Button to navigate to a section: use `<a href="#builds">` (the shell
  scrolls smoothly and updates the URL).

**`ExtLink`** Inline external link. `href`, `withUtm?` (use for every outbound link),
`utmSource?`, `icon?` (trailing arrow, default true), `tone?: 'accent' | 'plain' | 'bare'`.

#### Outbound links

When the link is not inline text (a whole `Panel as="a"`, a tile, a row), do not re-implement
`ExtLink`. Spread the attributes from `outboundLink` and render the hint inside the link:

```tsx
import { NewTabHint, outboundLink, Panel } from '@/ui';

const link = outboundLink(gateway.url, { withUtm: true });
const hintId = `${uid}-hint`;
<Panel as="a" {...link.props} aria-labelledby={`${nameId} ${hintId}`} interactive>
  <h3 id={nameId}>{gateway.name}</h3>
  {link.newTab ? <NewTabHint id={hintId} /> : null}
</Panel>
```

`outboundLink(href, { withUtm?, utmSource?, newTab? })` returns `{ external, newTab, props }`.
`props` is `{ href, target?, rel? }`: `href` carries `?utm_source=community` for external
URLs when `withUtm`; `target="_blank"` and `rel="noopener noreferrer"` are present only when
the link opens a new tab (default: external URLs), so a later explicit prop still wins.
`NewTabHint` renders the visually hidden "(Opens in a new tab)" (give it an `id` when the
link's accessible name is composed with `aria-labelledby`; never put the hint in `aria-label`,
which would replace the visible text). `NEW_TAB_HINT` and `isExternalHref` are exported for
the rare case that needs the string or the check alone.

**`Chip`** `kind?: 'label' | 'filter'` (mono uppercase tag; sentence-case selectable
filter), `tone?: 'neutral' | 'accent'`, `status?` (ok, pending, warn, crit, off),
`tier?`, `selected?` (filter chips become `aria-pressed` toggles), `icon?`, `count?`,
`size?: 'sm' | 'md'`, `onClick`. A Chip without `onClick` renders a `span` (it keeps your
`aria-*`, `data-*`, `id`, `title` and handlers). Children are laid out in the chip's own flex
row with the icon and count, so `<Chip><Glyph name="spark" size={12} /> Label</Chip>` just
works; do not add a body wrapper of your own.

Contrast is a property of the chip, not of where it sits: every tone paints its soft wash over
an opaque dark base, so a label is at least 5.4:1 against its own body on a Panel, on the
bare lattice, in `prefers-contrast: more` and in forced colours (measured on rendered pixels).
Restyle with the custom properties (`--chip-fill`, `--chip-edge`, `--chip-fg`), not with a
translucent `background` on the chip or a parent: that is what used to wash the text out.

**`Kbd`** `combo?: 'mod+k'` (renders keycaps; Command on Apple, Ctrl elsewhere) or
`children` for a single key. `size?`.

**`SearchField`** `value`, `onValueChange`, `aria-label` (**required**), `placeholder?`,
`prompt?` (default `>`), `shortcut?` (hint shown while empty), `onSubmit?`, `inputRef?`,
`autoFocus?`, `controls?` (id of the filtered list).

**`Select`** `value`, `onValueChange`, `options: {value,label}[]`, `label` (**required**;
shown as a mono caption unless `showLabel={false}`). Native `<select>` underneath.

**`Switch`** `checked`, `onCheckedChange`, `children` (label) or `aria-label`, `disabled?`.

**`SegmentedControl`** `value`, `onValueChange`, `options: {value,label,icon?,count?,ariaLabel?}[]`,
`aria-label` (**required**), `size?`, `fullWidth?`. One tab stop; arrows move and select.

**`Tabs` + `TabPanel`** `value`, `onValueChange`, `items`, `idBase`, `aria-label`
(**required**). Render `<TabPanel idBase value active>` per panel (`tabIds(idBase, value)`
gives ids for custom wiring). Inactive panels are not rendered.

### Status and data

**`StatusDot`** `status: 'ok' | 'pending' | 'warn' | 'crit' | 'off'`, `pulse?` (live
things only), `size?` (9). Decorative: always put the word next to it.

**`FreshnessChip`** `value?: { freshness, ageMs }` (pass a `Sourced<T>` straight from a
data hook) or `freshness?` + `ageMs?`, `polling?` (the stream failed, polling works),
`hideAge?`. Renders LIVE / CACHED / OFFLINE / UNCHECKED with the age ("4 s", "2 min").
It is the honesty mechanism: put one by every figure that comes from the API.

**`HexBullet`** `size?` (9), `filled?`, `pulse?`. A list marker.

**`HexRing`** A segmented hexagonal gauge. `value` (0..1), `segments?` (12), `size?`
(120), `stroke?` (5), `tier?`, `dim?`, `label?` (accessible description), `children`
(centre content). `size` is the default of the custom property `--hex-ring-size`: set that
(any length, on the ring or on an ancestor, for example in a media or container query) to
resize it from CSS. The stroke and cells scale with it, so the ring keeps its proportions.

**`Sparkline`** `values` (newest last), `height?` (48), `min?`, `max?`, `target?`
(dashed reference, e.g. 30), `targetLabel?`, `area?`, `live?` (slide on append),
`showLast?`, `interactive?` (hover read-out), `formatValue?`, `label?` (names the
chart for screen readers, with a generated summary). Width is the container's. The
`targetLabel` sits at the start of the target line, above it, and moves to the other end or
below the line when the series runs through that spot (it also keeps off the live marker and
inside the plot box). The slide-in on append moves an HTML clip box, not the svg.

**`Odometer`** `value`, `decimals?`, `grouping?` (true), `minDigits?`, `prefix?`,
`suffix?`, `flash?` (light wash on change), `duration?` (520 ms), `label?`. Rolls digit by
digit; announces nothing on each tick (put an `aria-live="polite"` region elsewhere if a
change is news).

**`CountUp`** `value`, `decimals?`, `grouping?`, `prefix?`, `suffix?`, `from?`,
`duration?` (700), `immediate?`. Counts once when it scrolls into view.

**`Meter`** `value` (0..1), `label` (**required**), `valueText?`, `size?`, `tier?`. A
slim segmented bar.

**`Stat`** `label`, `value` (ReactNode: an Odometer, CountUp or text), `unit?`, `sub?`,
`freshness?` (props for a FreshnessChip beside the label), `size?: 'sm' | 'md' | 'lg'`.
The standard number block.

**`Skeleton`** `width?`, `height?`. A shimmer block; match the final size.

### Motion and interaction

**`Reveal`** `as?`, `delay?` (ms), `index?` (adds 60 ms each), `direction?: 'up' | 'down'
| 'left' | 'right' | 'none'`, `blur?` (true), `immediate?`, `repeat?`, `hold?` (hold
until the intro is done). Opacity, 24 px rise, 8 px un-blur, once. Under reduced motion it
is a plain fade. It renders `as` (default `div`) and takes that element's props with their
types (`id`, `aria-*`, `data-*`, `role`, handlers, `href` for `as="a"`). At rest it leaves no
`translate`, `opacity` or `filter` behind (all `none`), so it never makes a stacking context.

**`SplitReveal`** `as?` (`h2`, `p`), `by?: 'word' | 'line'`, `delay?`, `stagger?`,
`immediate?`, `hold?`. Children are text with inline emphasis (`<b>` keeps its weight and
the `.t-grad` gradient). Words are plain spans, so assistive tech reads the sentence
normally; under reduced motion the words simply fade in together. A word is an inline-block
one line-height tall: `background-clip: text` (the gradient emphasis) paints only inside that
box, so a gradient word needs `padding-block: 0.12em; margin-block: -0.12em` or the tails of
g, y, p and q are cut flat (`SectionHeader` and `.t-grad` already do this, and lower
`--split-travel`, default 110%, so the entrance keeps its distance).

**`Marquee`** A seamless, pausable ticker. Two ways to feed it:

```tsx
<Marquee label="Games on Flux">{games.map((g) => <span key={g}>{g}</span>)}</Marquee>

<Marquee label="Games" items={games} getKey={(g) => g.id}
  renderItem={(g, s) => <a data-lit={s.hovered || s.focused || undefined} href={g.url}>{g.name}</a>}
  onItemEnter={(g, { element }) => ripple(element.getBoundingClientRect())} />
```

Props: `speed?` (36 px/s), `direction?: 'left' | 'right'`, `gap?` (32), `label?`,
`decorative?` (hide it from assistive tech), `control?` (the pause button, default true;
WCAG 2.2.2 asks for one on anything that moves over 5 s), `paused?` and `onPausedChange?`
(controlled: with `control={false}` your own button just sets `paused`). Data mode adds
`items`, `renderItem(item, { index, copy, hovered, focused })`, `getKey?`, `hoverCopies?`
(let the pointer reach the duplicated copies, so hover works wherever a name is on its way
past; the copies are `aria-hidden` and must hold nothing focusable) and
`onItemEnter/Leave/Focus/Blur(item, { index, copy, element })`. The copies of one item light
together (`hovered` is true for every copy).

The pause button sits in its own cell after the viewport, so a name can fade out beside it but
is never under it or cut by it. Hover, focus within, being off screen and the button all pause.
Under reduced motion it is a wrapped, static list. Only one copy is exposed to assistive tech.

**`Tilt`**, **`Magnetic`**, **`Spotlight`** Wrappers that give any element the effect:
`<Tilt max={5}>`, `<Magnetic strength={6} field={80}>`, `<Spotlight radius={260}>`. Fine
pointers only; inert under reduced motion.

### Overlays

**`Drawer`** `open`, `onClose`, `title` (**required**; name and heading), `description?`,
`side?: 'auto' | 'right' | 'bottom'` (auto: right panel from 720 px, bottom sheet below),
`width?: 'md' | 'lg'` (560 / 720), `actions?` (beside the close button), `footer?`
(sticky), `dismissOnScrim?` (true), `onExited?` (once, after a real open and close; never at
mount while `open` is still false, so it is safe to restore focus or reset state there).
Focus is trapped, the page is `inert` and
scroll-locked, Escape closes, focus returns to the trigger. Put `data-autofocus` on the
element that should take focus first.

**`Dialog`** `open`, `onClose`, `title`, `description?`, `size?: 'sm' | 'md' | 'lg'`
(420 / 560 / 760), `footer?`, `dismissOnScrim?`, `hideClose?`, `onExited?` (as `Drawer`).

#### Modals: fade the layers, not the ancestor

A modal's surface is a glass `Panel` (it has `backdrop-filter`). An ancestor with
`opacity < 1` makes a group, and the backdrop filter inside a group samples nothing: the glass
goes blank for the whole fade and pops when it ends. So `Dialog` and `Drawer` never animate
`opacity` on the root or the surface. The surface rises with `scale` and `translate`; the scrim
(a sibling) fades by itself; and every layer inside the surface fades through an `animation`
whose only keyframe is the transparent end. Copy this for any custom overlay (the command
deck included):

```css
.surface { scale: 0.965; translate: 0 10px; transition: scale var(--dur-3) var(--ease-out), translate var(--dur-3) var(--ease-out); }
.root[data-state="open"] .surface { scale: 1; translate: 0 0; }
.surface > * { animation: layer-in var(--dur-3) var(--ease-out) backwards; }
.root[data-state="exit"] .surface > * { animation: layer-out var(--dur-3) var(--ease-in) forwards; }
@keyframes layer-in { from { opacity: 0; } }
@keyframes layer-out { to { opacity: 0; } }
```

The `Panel` inside keeps its own `opacity` at rest (each layer fades to the value it already
has), so nothing is left behind when the animation ends.

**`Tooltip`** `content`, `children` (one element that forwards props to a DOM node),
`placement?`, `delay?` (260), `shortcut?`, `disabled?`. Shows on hover and instantly on
keyboard focus; Escape dismisses. Never put the only copy of important information in a
tooltip.

**`toast(message, options?)`** Global, callable anywhere (no hook). `options`:
`kind?: 'info' | 'success' | 'warn' | 'error'`, `duration?` (2400; 6000 with an action;
0 until dismissed), `action?: {label,onClick}`, `id?` (same id replaces, so repeats do
not stack), `icon?`. The `ToastHost` is mounted once by the shell, in a polite live
region. Use for confirmations ("Link copied"), not for errors the visitor must act on
(render those inline). `useToastStore` and the `ToastItem`, `ToastKind`, `ToastAction` types
are exported for a host that renders toasts itself.

### Marks, glyphs, decoration

**`Glyph`** `name` (a `GlyphName`), `size?` (20; drawn on a 24 px grid, 1.5 px stroke,
square caps), `title?` (omit when decorative), `strokeWidth?`. Names are grouped in
`GLYPH_GROUPS`: gateway kinds (`cloud compute ai games docs explorer learn wallet site nodes`,
also `GATEWAY_GLYPH[kind]`), tiers (`tier-cumulus`, `tier-nimbus`, `tier-stratus`), app
categories, status (`status-ok`, `status-warn`, ...), actions and socials. See `?kit=1`.
Transport: `play`, `pause`, `replay` (use these for a motion control; `motion` and
`motion-off` are the wave and the struck wave, for a setting). The drawing data is exported
for custom renderers: `GLYPHS` (name to shapes), `glyphShapes(name)`, `isGlyphName(x)` and the
`GlyphShape` type (a stroked path string, `{ dot: [cx, cy, r] }` or `{ fill: d }`).
Do not import icon libraries.

**`FluxMark`** `tone?: 'blue' | 'white' | 'black' | 'gray'`, `variant?: 'mark' |
'round'`, `size?` (height, 32), `title?`. The official symbol only.

**`Lattice2D`** The CSS lattice: the page backdrop until the stage is ready and the
no-WebGL texture. `variant?: 'field' | 'floor'`, `intensity?` (0.6), `scale?`, `animate?`,
`speed?`, `glow?: 'top' | 'center' | 'bottom'`, `vignette?`, `interactive?`, `fixed?`.
Use inside your own region (a hero card, a dialog header) when you want local lattice
texture, never as a page background (the stage owns that).

---

## Hooks

All exported from `@/ui`.

| Hook | Purpose |
|---|---|
| `useReducedMotion()` | `true` when motion should be calm (visitor override, else OS). Prefer CSS `html[data-motion]`; use this for JS animation |
| `useMedia(query, fallback?)`, `usePointerFine()`, `useIsDesktop()`, `useIsPhone()` | Media queries without layout flashes; `usePointerFine` gates hover-only effects |
| `useInView(ref, { once, rootMargin, threshold })` | IntersectionObserver (shared observer) |
| `useNow(ms = 1000)` | Epoch ms on a shared interval, paused while the tab is hidden. For "updated 12 s ago" |
| `useHotkeys(bindings, { priority, enabled, allowInInputs, allowRepeat })` | Keyboard shortcuts; one global listener; return `false` from a handler to decline |
| `useStageFocus(ref, strength = 0.6, { enabled })` | Lights the lattice under the element while hovered or focused |
| `usePointerGlow(ref, { enabled })` | Writes `--px --py --pxp --pyp` and `data-hover` for CSS spotlights; removes them on leave or blur ([cost](#pointer-and-tilt-cost)) |
| `useTilt(ref, { max, enabled })`, `useMagnetic(ref, opts)` | The effects behind `Panel` and `Button`; use for custom elements. The tilt writes the element's inline transform |
| `usePresence(open, exitMs, { onExited })` | Keeps a surface mounted while its exit animation plays; `onExited` fires once after a real open and close, never at mount |
| `useResizeObserver(ref \| refs, callback, { immediate, enabled, box })`, `observeResize(elements, callback, opts)` | Size observation that never raises the ResizeObserver loop error ([why](#observing-size-useresizeobserver)) |
| `useFocusTrap(ref, { active, onEscape, restoreFocus })` | Modal behaviour (inert page, scroll lock, trap, Escape, restore focus) for a custom surface; Drawer and Dialog use it |
| `useIsoLayoutEffect` | `useLayoutEffect` that does not warn in SSR |

From `@/lib`: `cn`, `copyText(text)` (resolves false on failure; toast either way),
`formatInt/Decimal/Compact/Pct/Share/Usd/Flux/Age/Duration/DateShort/DateLong/TimeUtc`,
`truncateMiddle`, `plural`, `usePrefs`, `useOverlays`, `useHashRoute`, `goToSection`,
`scrollToSection`, `pushStageAccent`, `fireClickPulse`.

---

## The shell contract

### What the shell does for you

- Mounts the stage once (`<Stage/>`, lazy) behind everything; mounts the CSS backdrop
  until the stage reports ready.
- Renders `SECTIONS` in order inside `<main id="main">`; lazy chunks load when idle or
  when the visitor scrolls within 1.5 viewports; each section has its own error
  boundary and a placeholder with the real id (so `#hash` works before load).
- Scroll-spy: writes `section`, `sectionProgress`, `pageProgress`, `scrollVelocity` to
  the stage bus; drives the header's sliding nav indicator.
- Pauses the stage when the tab is hidden (`paused`).
- Mirrors reduced motion (override or OS) to the bus and `html[data-motion]`.
- Syncs the accent (`prefs.accent`) to `html[data-accent]` and the bus.
- Starts the data layer (`startDataLayer()`) once.
- Owns the header, skip link, mobile bottom-sheet nav, command deck button, accent
  switcher, sound toggle, grain, and the global `ToastHost`.
- **Intro** (first visit of a session, full motion, no `?intro=0`): writes
  `intro: 'pending'`; the stage plays about 1.8 s and writes `playing` then `done`. Any
  key, press, wheel or scroll skips (`skip`). It never blocks: the header and your content
  are in the DOM from the first frame. To stage your own reveal against the flash, read
  `useStageBus((s) => s.intro)` and pass `hold={intro === 'pending' || intro === 'playing'}`
  to `Reveal` / `SplitReveal`. Without WebGL the intro is `off` at once.
- **Ambient mode** (the lattice alone; toggled with `a`, `?ambient=1`, or 90 s of
  stillness on a fine pointer when `prefs.autoAmbient`): sets `html[data-ambient]`, fades the
  header and page out and makes them `inert`. Any key, press, wheel, touch or 80 px of
  pointer travel wakes it (after a 0.7 s grace). Overlay modules render the HUD and
  may call `useOverlays.getState().exitAmbient()` themselves.

### Stage bus (`@/stage/bus`)

Write only what is true. From sections you will use exactly these:

```ts
import { useStageBus } from '@/stage/bus';
useStageBus.getState().firePulse('success', x, y, 0.8); // copied, submitted
useStageBus.getState().firePulse('warn');               // rare
```

Prefer `Panel stageFocus` / `useStageFocus` over `setFocus` by hand. To tint the
stage with a tier while a region is in view: `const restore = pushStageAccent('cumulus')`
and call `restore()` on leave (the DOM accent is unchanged).

Anchors: `data-stage-anchor="symbol"` on an element tells the stage where the Flux
symbol lives (hero only).

### Hash routes: `useHashRoute()`

```ts
const { section, appId, openApp, closeApp, goToSection } = useHashRoute();
```

- URL forms: `#<section>` (any `SectionId`) and `#builds/<appId>`. Home is no hash.
- `section` is the section **named by the URL** (null at home); for "what is in view"
  read `useStageBus((s) => s.section)`.
- `openApp(id)` pushes a history entry (Back closes the detail) and does not scroll.
  `closeApp()` goes back when the entry is ours, otherwise rewrites to `#builds`.
- `goToSection(id)` smooth-scrolls (instant under reduced motion) and records the URL.
- Plain `<a href="#builds">` and `<a href="#builds/fluxcloud">` work from anywhere;
  the shell delegates the click. Do not call `history.pushState` yourself.
- Use `closeApp` as the Drawer's `onClose`; render the Drawer `open={appId !== null}`.

### Overlays store: `useOverlays`

```ts
const palette = useOverlays((s) => s.palette);
useOverlays.getState().openSubmit();
```

Flags: `palette`, `shortcuts`, `submit`, `ambient`. Actions: `openPalette/closePalette/
togglePalette`, `openShortcuts/closeShortcuts/toggleShortcuts`, `openSubmit/closeSubmit`,
`enterAmbient/exitAmbient/toggleAmbient`, `open(name)/close(name)/toggle(name)/closeAll()`.
Palette, shortcuts and submit are exclusive; ambient on closes the others and mirrors
to the bus.

### Prefs: `usePrefs`

`accent`, `sound` (default off, never autoplays), `autoAmbient` (default on, after 90 s
idle), `reducedMotionOverride` (`true | false | null`), `introSeen`. Persisted under
`fc:prefs:v1` with every storage access guarded. `usePrefs.getState().set({ accent })`.
Sections do not need prefs; do not add keys.

### Global hotkeys (owned by the shell, priority 0)

`mod+k` toggle the command deck, `/` open the command deck, `?` toggle the shortcuts
sheet, `a` toggle ambient mode. Sections may add their own with `useHotkeys` (priority 10
to win). Plain keys are ignored while typing in a field. Never claim `mod+k`, `/`, `?`,
`a`, `Escape` (modals own it), `Tab`, or arrows outside a composite widget.

### Z layers (tokens)

`--z-stage -1`, `--z-backdrop 0`, `--z-page 1`, `--z-raised 10`, `--z-header 60`,
`--z-sheet 70`, `--z-overlay 100`, `--z-ambient 110`, `--z-modal 120` (Drawer, Dialog),
`--z-palette 130`, `--z-toast 140`, `--z-tooltip 150`, `--z-grain 180`. The portal layers
(`getLayer(name)`: `overlay`, `modal`, `palette`, `toast`, `tooltip`) map to the same tokens, so
the command deck (`palette`) opens above an open Drawer or Dialog.
Inside a section, stay below `--z-raised`. Modal UI is portalled to `#overlay-root`
(outside `#root`) so making the page `inert` never takes it with it.

---

## Overlay convention

Features that sit above the page (the command deck, ambient mode, the builds detail and
submit flow) are **overlay modules** discovered by convention, so nobody edits `App.tsx`.

1. Create a file named `overlay.tsx` anywhere under `web/src/` (for example
   `src/sections/builds/overlay.tsx`, `src/palette/overlay.tsx`).
2. **Default-export** a React component. It takes no props.
3. The shell loads it lazily once the page is idle (or immediately if an overlay flag
   is already open), inside its own `Suspense` and error boundary. A crash in one
   overlay never takes the page down. Zero overlays is fine.
4. Read the `useOverlays` flags and `useHashRoute()` to decide whether to show. Render
   with `Drawer`, `Dialog`, `toast` (they portal into their own layers) or portal your own
   surface into `getLayer('overlay')`.
5. The host layer is `position: fixed; inset: 0; pointer-events: none`, above the page
   and header (`--z-overlay`). If you render inline there, **opt in** with
   `pointer-events: auto` on your interactive elements.
6. Do not import your section's heavy code at module top level unless the overlay
   needs it immediately; use `lazy()` inside.

```tsx
// src/sections/builds/overlay.tsx
import { Drawer } from '@/ui';
import { useHashRoute } from '@/lib';
import { appById } from '@shared/catalog';

export default function BuildsOverlay() {
  const { appId, closeApp } = useHashRoute();
  const app = appId ? appById(appId) : undefined;
  return (
    <Drawer open={app !== undefined} onClose={closeApp} title={app?.name ?? ''}>
      {app ? <AppDetail app={app} /> : null}
    </Drawer>
  );
}
```

---

## Accessibility and performance rules

**Accessibility**

- Landmarks: header (banner), `main#main`, sections (`aria-labelledby` its h2), footer.
  The skip link targets `#main`. One `h1` on the page, owned by the hero.
- Visible focus on everything (the beam). Never `outline: none` without a replacement.
- Targets 44 px (24 px minimum with spacing). `Button` handles it; do the same for
  bespoke controls.
- Colour is never the only carrier: status = icon + word; tiers = glyph + name.
- Live regions: only one polite region for toasts and one for block announcements
  (owned by the data section). Do not add `aria-live` to anything that updates every
  second.
- Modals: use Drawer / Dialog (trap, `inert` page, Escape, restore focus).
- Motion: no autoplay beyond the stage; anything moving for more than 5 s has a pause.
- Contrast: text on glass is `--text-2` or brighter (AA at 4.5:1); `--text-3` is for
  captions at 14px+ only; `--text-4` is disabled only.

**Performance**

- Page JS gz: critical path 90 KB, before first interaction 160 KB. Sections are
  lazy chunks; keep each under ~40 KB gz and lazy-load charts.
- Fonts: do not add weights or families. Do not use `font-weight` values other than
  the tokens.
- Animate transform and opacity. One `will-change` at most per section and only
  during the animation.
- Images: `public/art/*.avif` with a `.webp` fallback in `<picture>`, `loading="lazy"`,
  `decoding="async"`, `width`/`height` set. The LCP image of the hero is eager.
- `backdrop-filter` is expensive: `Panel variant="slab"` for repeated items,
  `glass` only for a handful in view.
- Timers: use `useNow` or the data hooks; never `setInterval` per component.

---

## Cost and layout rules (measured)

Rules that have numbers behind them. Measured in Chromium (headless, software rendering, so
read the ratios, not the milliseconds) on `/?kit=1` and on the home page with every section
mounted (about 6,400 elements, `?q=low`).

### Animate an HTML wrapper, not the svg

A CSS animation or transition of `transform`, `rotate`, `scale` or `translate` on an `<svg>`, or
on a node inside one, is not composited: it runs on the main thread, and restyles and lays out
the svg every frame. Measured on the kit: two `Button` spinners rotating their `<svg>` cost 60
style recalcs and about 215 ms of main thread per second; rotating an HTML `<span>` around the
same svg (what `Button` does now) cost 17 recalcs and 44 ms, the same as no spinner at all. The
`Sparkline` slide-in, which translated an svg `<g>`, forced 13.6 layouts per second while the
series arrived; moving the series into an HTML clip box and sliding that took it to 1.2.

- Put the motion on an HTML element (`span`, `div`) that wraps the svg and keep the svg a
  still picture: `<span className={styles.spin}><svg .../></span>`.
- A one-shot transition of a paint attribute (`stroke-dasharray` in `HexRing`, `opacity`,
  `fill`) is fine: it repaints, it does not re-lay-out. Do not loop it, and do not animate an
  svg's `filter` or text.
- Pulse rings and halos are HTML boxes with `clip-path: var(--hex-clip)` (`HexBullet`,
  `StatusDot`, the `Sparkline` marker), never svg nodes.

### Pointer and tilt cost

Custom properties inherit, so writing one on an element restyles its whole subtree. A bento
tile of about 50 nodes cost about 130 ms of style recalc per second of hovering when the tilt
wrote `--rx` and `--ry` 60 times a second.

- `useTilt` writes the element's inline `transform` (one element) and sets `will-change:
  transform` only while the pointer is over it and until it has eased back flat; at rest
  nothing is promoted. `--tilt-on` (0 or 1) flips on enter and leave only. A Panel needs no CSS
  for it. Measured over the Gateways bento with the pointer swept across it: style recalc
  about 295 to 175 ms per second, main thread about 700 to 530 ms per second (idle is about
  48 and 300).
- `usePointerGlow` writes `--px --py --pxp --pyp` once per frame while the pointer moves.
  Read them in leaf elements (a spotlight layer), keep the subtree under the element small,
  and do not use it on a wrapper that contains a large card body. When the pointer leaves (or
  focus leaves with no pointer over it) the properties are removed, so every
  `var(--pxp, 0.5)` returns to the neutral position and anything that transitions from the
  old value (the `.parallax` utility, `--dur-2`) eases back instead of staying stranded. The
  spotlight keeps its pixel position for `--dur-3` so it fades where it was.
- Under reduced motion neither hook moves anything.

### The Beat (`--flash`) and why it is scoped

`html[data-beat]` flips between `a` and `b` on every real block. That restarts a 1.4 s pulse of
`--flash` from 1 to 0 on every element that carries `class="beat"` (the tick marks and hairlines
brighten). `--flash` is a registered, **inherited** property, so wherever it is animated every
descendant is restyled on every frame. Animated on `<html>` that was 7,300 elements restyled per
frame, 20 to 25 ms a frame, 1.1 s of main thread over one beat on the home page, growing with the
DOM. An inherited property cannot be made cheaper, only given a smaller scope, and the page now has
none above its consumers: `base.css` has no Beat rule any more (and no `data-beat-scope` switch).

1. **ui primitives do not read `--flash`.** `Panel` brightens its halo, edge and ticks with
   opacity animations keyed off `html[data-beat]` (compositor, no restyle, and a hovered panel
   does not pulse because it is already at full).
2. **CSS that reads `var(--flash)` puts `class="beat"` on the smallest element that holds its
   consumers** (a dial's tick group, a HUD, one cell's halo and edge; not a section). In a CSS
   module, `composes: beat from global;` in the rule that reads `--flash` says it next to the
   code that needs it. A custom property computed from `--flash` (`--tick: rgb(... / calc(...
   var(--flash) ...))`) has to be declared on that element or below it, not above: it is resolved
   where it is declared. Your `calc(... var(--flash) ...)` rules do not change.
3. **A consumer that is only a colour alpha or an opacity can skip `--flash` entirely.** Draw it
   at its brightest, hold it at the resting fraction with `opacity`, and restart a keyframe with
   only `from { opacity: 1 }` (fill `backwards`) off `html[data-beat="a"]` and `"b"`. That is what
   Panel does, and the nodes tile's ruler and the footer's bloom and sign-off. Opacity runs on
   the compositor: nothing is restyled per frame. Use it where the container would be big
   (a ruler on a list of rings, a bloom behind a whole footer); a gradient to `transparent` and a
   single-colour stroke scale exactly.
4. Under reduced motion `.beat` and those keyframes are off: `--flash` stays at 0, the resting look.

Measured on the home page with every section mounted (`q=low`, extra style recalc over idle in a
1.7 s window around a beat, 6,455 elements): the global animation 1,104 to 1,131 ms; a `.beat`
on each consumer's container, 23 containers holding 1,182 elements, 591 to 608 ms; with the two
big containers (619 and 397 elements) turned into opacity animations, 21 containers holding 166
elements, 383 to 388 ms. With every `.beat` switched off the same page costs 162 ms (the
Panels' opacity animations restarting and the attribute change itself), which is the floor.
Every consumer reads the same values as it did under the global animation (checked at five times
into a beat: worst difference one step of 8 bit alpha).

One leftover: `GatewayTile.module.css` and `play.module.css` animate `--flash` on their tile for
the launch warp (the `launch` keyframes). Nothing under those tiles reads it, so those two
`--flash` lines do nothing and only make the tile's subtree restyle for 260 ms; the `scale` in
the same keyframes is the live part.

### Observing size: `useResizeObserver`

A ResizeObserver callback that changes the size of what it observes (or measures and writes
layout) raises the "ResizeObserver loop completed with undelivered notifications" window
error, which Vite logs as an unhandled error. `useResizeObserver` and `observeResize` run your
callback from an animation frame, outside the observer's delivery step, coalescing bursts:

```ts
const ref = useRef<HTMLDivElement>(null);
useResizeObserver(ref, () => setWidth(ref.current?.clientWidth ?? 0), { immediate: true });
// outside React: const stop = observeResize([a, b], measure, { immediate: true });
```

`target` is one ref or an array of refs; `immediate` also calls back once synchronously at the
start (first measurement without a frame of delay); `enabled` pauses observation; `box` picks
the box. The callback may change every render without resubscribing. `Marquee`, `Sparkline`,
`SplitReveal` and the slider hook use it; any new observer should too.

### Full bleed

`.bleed` spans the page edge to edge from inside a centred `Container`:

```tsx
<Container>
  <h2 className="t-h2">Games</h2>
  <div className="bleed"><Marquee ... /></div>
</Container>
```

It is `100vw` wide and pulled back by `50% - 50vw`, so it lines up only inside a parent that is
centred in the page. `100vw` includes the scrollbar gutter, so the box is wider than the visible
page by the gutter (5 px each side beside a 10 px scrollbar); `#root` has `overflow-x: clip`
(`base.css`) which cuts it exactly at the visible edge, so there is no horizontal scrollbar. Do
not remove that clip, and do not put anything between a `.bleed` and `#root` that clips or
scrolls horizontally (`overflow: hidden | auto`, `clip-path`, `contain: paint`): the band would be
cut at that ancestor. Add `.bleed-pad` to put the content back on the Container's edges (a
full-bleed rail whose first card lines up with the heading). Prefer structure when you can:
an element that is a direct child of the `Section`, outside the `Container`, is already full
width and needs no class. To bleed to something other than the viewport, set `--bleed-w`
(for example `100cqw` inside a `Panel container`).

### The reset caps svg and media at 100%

The reset gives every `svg`, `img`, `picture`, `video` and `canvas` `display: block` and
`max-inline-size: 100%`, so media never overflows its column. That silently shrinks an element
that is meant to be wider than its box (a ring that overhangs its slot, a glow, a canvas that
bleeds). Opt out with `class="svg-free"` on the element. The reset is in the lowest layer, so
a `max-inline-size` in your own module also wins; the class makes the intent visible. An inline
svg that must flow with text needs `display: inline-block` for the same reason.

### Blended art inside a Panel

Art that uses `mix-blend-mode: screen` (emissive pieces on black) only blends with what is
painted behind it **inside the same stacking context**. A `Panel` is a stacking context
(`isolation: isolate`, the press scale, the tilt), so art in a panel blended with the panel's
own black group and showed as a black box. `<Panel blendArt>` drops those: the panel gets no
stacking context of its own, every layer is `z-index: auto`, and the art blends with the
panel's glass and whatever is under it. Costs and limits:

- `blendArt` turns off the tilt, the press compression and `clip` for that panel.
- It only works when **no ancestor** of the panel is a stacking context either. Each of these
  makes one: `isolation`, `z-index` on a positioned box, a `translate`, `scale` or `transform`
  that is not `none` (even `0 0` or `1`), `opacity < 1`, `filter`, `backdrop-filter`, `mask`,
  `clip-path`, `contain: layout | paint`, `will-change`, `content-visibility`. `Reveal` is
  safe at rest (everything is `none`). Plain `position: relative`, `overflow`, an opacity of
  exactly 1 and `container-type` are fine.
- The page wrapper in `App.module.css` has `z-index: var(--z-page)`, which is a stacking
  context: art inside it blends with the page (the panel glass, other sections) but never with
  the WebGL stage behind the page. To blend with the stage the wrapper would have to lose that
  `z-index`.
- Without `blendArt`, the working alternative is art with a real alpha channel (PNG or WebP
  with transparency): no blend mode needed.

---

## Kit gallery

`/?kit=1` renders every token and primitive on one page (lazy; zero cost to the
site). Use it to see a primitive's states, to check your changes in `ui/`, and as the
reference when an issue says "use the standard X". Flags: `?intro=0` skip the intro,
`?q=low|medium|high` force a stage quality, `?ambient=1` start in ambient mode,
`?stage=debug` stage stats.
