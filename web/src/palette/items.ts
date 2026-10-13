/**
 * The deck's catalog of things you can run: sections, apps, node hosts, gateways, community
 * links and actions. Pure. Everything about an app, host or gateway comes from `shared/catalog`;
 * nothing is typed in twice. Each item carries its prepared search fields so ranking a
 * keystroke never repeats string work.
 */

import { CATEGORIES, COMMUNITY_APPS, GATEWAYS, NODE_HOSTS, SOCIALS } from '@shared/catalog';
import { ACCENT_LIST } from '@/content/accents';
import { SECTION_META } from '@/content/sections';
import { formatDateShort } from '@/lib/format';
import { type Accent, SECTION_ORDER } from '@/stage/bus';
import type { GlyphName } from '@/ui/Glyph/glyphs';
import { prepare, type ScoredField } from './fuzzy';
import { CHORD_PREFIX, chordFor } from './shortcuts';

export type DeckKind = 'section' | 'app' | 'host' | 'gateway' | 'social' | 'action';
export type DeckGroupId = 'recent' | DeckKind;

export const GROUP_ORDER: readonly DeckGroupId[] = [
  'recent',
  'section',
  'app',
  'host',
  'gateway',
  'social',
  'action',
];

export const GROUP_LABEL: Record<DeckGroupId, string> = {
  recent: 'Recent',
  section: 'Sections',
  app: 'Apps',
  host: 'Hosts',
  gateway: 'Gateways',
  social: 'Community',
  action: 'Actions',
};

export type DeckTile = { glyph: GlyphName } | { text: string } | { swatch: string };

export interface DeckItem {
  /** Unique and stable: `app:atlas`, `section:builds`, `action:sound`. Used for recents. */
  id: string;
  kind: DeckKind;
  /** The catalog id, section id or action id this item stands for. */
  ref: string;
  title: string;
  /** One line under the title. */
  subtitle: string;
  /** Right-hand muted text: the builder, the host. */
  meta?: string;
  /** The longer text of the preview card. */
  description: string;
  tile: DeckTile;
  /** A short mono tag: "You are here", "New", "Retiring Nov 1". */
  badge?: string;
  /** For settings: the current state, shown as a chip. */
  state?: 'on' | 'off' | 'current';
  /** Keys that do the same thing from the page: ['g', 'b']. */
  chord?: readonly string[];
  /** Enter opens something in a new tab. */
  external: boolean;
  /** The deck stays open after this runs (settings that are nice to flip and watch). */
  keepOpen?: boolean;
  /** Not worth remembering in Recent (mode switches and toggles). */
  transient?: boolean;
  fields: ScoredField[];
  /** Prepared title and subtitle for highlighting. */
  titleP: ReturnType<typeof prepare>;
  subtitleP: ReturnType<typeof prepare>;
}

const W = { title: 1, alias: 0.85, secondary: 0.7, sub: 0.45, host: 0.5, long: 0.22 } as const;

function field(text: string | null | undefined, weight: number, loose = true): ScoredField[] {
  return text ? [{ field: prepare(text), weight, loose }] : [];
}

function item(
  base: Omit<DeckItem, 'fields' | 'titleP' | 'subtitleP'> & {
    aliases?: readonly string[];
    secondary?: ReadonlyArray<string | null | undefined>;
    hosts?: ReadonlyArray<string | null | undefined>;
    long?: string;
  },
): DeckItem {
  const { aliases = [], secondary = [], hosts = [], long, ...rest } = base;
  const fields: ScoredField[] = [
    ...field(rest.title, W.title),
    ...aliases.flatMap((a) => field(a, W.alias)),
    ...secondary.flatMap((s) => field(s, W.secondary)),
    ...field(rest.subtitle, W.sub, false),
    ...hosts.flatMap((h) => field(h, W.host, false)),
    ...field(long ?? rest.description, W.long, false),
  ];
  return { ...rest, fields, titleP: prepare(rest.title), subtitleP: prepare(rest.subtitle) };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** What each section is for, one line (DESIGN 5). Also the preview text. */
const SECTION_BLURB: Record<(typeof SECTION_ORDER)[number], string> = {
  hero: 'The top of the page: what Flux Community is, and the two ways in.',
  pulse: 'The network right now: blocks, nodes, capacity, price and the next reward reduction.',
  gateways: 'The official doors into Flux: cloud, GPU compute, docs, explorer and wallets.',
  builds: 'Apps and tools from Flux community members, with the status of each checked live.',
  hosting: 'Community node hosting services, and the three node tiers explained.',
  play: 'Game servers on the decentralized cloud, each on its own independent node.',
  learn: 'How an app runs on Flux, plus the guides and docs to go further.',
  community: 'Channels, credits, and how to submit your app or host.',
};

const SECTION_ALIASES: Record<(typeof SECTION_ORDER)[number], readonly string[]> = {
  hero: ['home', 'top', 'start', 'overview'],
  pulse: ['network', 'pulse', 'stats', 'live', 'chain', 'nodes', 'map'],
  gateways: ['start here', 'gateways', 'official', 'links'],
  builds: ['builds', 'apps', 'community builds', 'tools', 'flagship'],
  hosting: ['run a node', 'node hosting', 'hosts', 'tiers', 'cumulus', 'nimbus', 'stratus'],
  play: ['games', 'play', 'game servers'],
  learn: ['learn', 'docs', 'guides', 'how it works', 'deploy'],
  community: ['community', 'discord', 'join', 'credits', 'social'],
};

function sectionItems(): DeckItem[] {
  return SECTION_ORDER.map((id) => {
    const meta = SECTION_META[id];
    const key = chordFor(id);
    return item({
      id: `section:${id}`,
      kind: 'section',
      ref: id,
      title: meta.label,
      subtitle: meta.eyebrow,
      description: SECTION_BLURB[id],
      tile: { text: meta.index },
      chord: key ? [CHORD_PREFIX, key] : undefined,
      external: false,
      aliases: SECTION_ALIASES[id],
      secondary: [meta.eyebrow],
    });
  });
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

function appItems(): DeckItem[] {
  return COMMUNITY_APPS.map((app) => {
    let badge: string | undefined;
    if (app.self) badge = 'You are here';
    else if (app.lifecycle === 'retiring' && app.retiresOn)
      badge = `Retiring ${formatDateShort(app.retiresOn)}`;
    else if (app.lifecycle === 'new') badge = 'New';
    const category = CATEGORY_LABEL[app.category] ?? app.category;
    return item({
      id: `app:${app.id}`,
      kind: 'app',
      ref: app.id,
      title: app.name,
      subtitle: app.tagline,
      meta: app.builder ? `by ${app.builder}` : undefined,
      description: app.description,
      tile: { glyph: app.category },
      badge,
      external: !app.self,
      aliases: [app.id.replace(/-/g, ' '), category],
      secondary: [app.builder],
      hosts: [app.host],
    });
  });
}

const HOST_GLYPH: GlyphName = 'hosting';

function hostItems(): DeckItem[] {
  return NODE_HOSTS.map((host) =>
    item({
      id: `host:${host.id}`,
      kind: 'host',
      ref: host.id,
      title: host.name,
      subtitle: host.blurb,
      meta: host.host ?? 'Discord',
      description: host.blurb,
      tile: { glyph: HOST_GLYPH },
      external: true,
      aliases: [host.id, 'node host', 'node hosting', 'host'],
      secondary: [host.operator],
      hosts: [host.host],
    }),
  );
}

const KIND_WORDS: Record<string, string> = {
  cloud: 'deploy containers apps',
  compute: 'gpu compute',
  ai: 'assistant',
  games: 'game servers',
  docs: 'documentation guides',
  explorer: 'blocks transactions',
  learn: 'academy',
  wallet: 'wallet sign in',
  site: 'home website',
  nodes: 'run a node fluxnode',
};

function gatewayItems(): DeckItem[] {
  return GATEWAYS.map((g) =>
    item({
      id: `gateway:${g.id}`,
      kind: 'gateway',
      ref: g.id,
      title: g.name,
      subtitle: g.tagline,
      meta: g.host,
      description: g.description,
      tile: { glyph: g.kind },
      external: true,
      aliases: [g.id.replace(/-/g, ' '), KIND_WORDS[g.kind] ?? g.kind],
      secondary: [g.kind],
      hosts: [g.host],
    }),
  );
}

/** The host of a link without `www.`: "discord.com". Empty when the URL is not parseable. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The second line of a community link: its handle when it has one, otherwise the host of its
 * address (a channel with no handle line, like Discord), otherwise nothing. Never "Name: ".
 */
export function socialLine(s: { handle: string; url: string }): string {
  const handle = s.handle.trim();
  return handle !== '' ? handle : hostOf(s.url);
}

function socialItems(): DeckItem[] {
  return SOCIALS.map((s) => {
    const line = socialLine(s);
    return item({
      id: `social:${s.id}`,
      kind: 'social',
      ref: s.id,
      title: s.name,
      subtitle: line,
      description: line ? `${s.name}, ${s.handle.trim() !== '' ? line : `at ${line}`}` : s.name,
      tile: { glyph: s.id as GlyphName },
      external: true,
      aliases: [s.id.replace(/-/g, ' '), 'community channel'],
      secondary: [s.handle.trim() || null],
      hosts: [hostOf(s.url) || null],
    });
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** What the actions need to know to label themselves. Read from the prefs and the motion state. */
export interface ActionState {
  accent: Accent;
  sound: boolean;
  autoAmbient: boolean;
  /** The effective value: the visitor's override, else the OS. */
  reducedMotion: boolean;
  /** The visitor's explicit choice, or null while following the system. */
  motionOverride: boolean | null;
}

export const ACTION_IDS = {
  ambient: 'ambient',
  sound: 'sound',
  motion: 'motion',
  motionSystem: 'motion-system',
  autoAmbient: 'auto-ambient',
  copyLink: 'copy-link',
  submit: 'submit',
  shortcuts: 'shortcuts',
  top: 'top',
  terminal: 'terminal',
} as const;

export function accentActionId(accent: Accent): string {
  return `accent:${accent}`;
}

function actionItems(state: ActionState): DeckItem[] {
  const out: DeckItem[] = [];
  out.push(
    item({
      id: `action:${ACTION_IDS.ambient}`,
      kind: 'action',
      ref: ACTION_IDS.ambient,
      title: 'Enter ambient mode',
      subtitle: 'A slow tour of the community builds over the lattice',
      description:
        'The page fades away and the lattice runs on its own, with a caption for each community build. Any key or movement wakes it.',
      tile: { glyph: 'ambient' },
      chord: ['a'],
      external: false,
      aliases: ['ambient', 'screensaver', 'screen saver', 'idle', 'tour', 'cinematic'],
    }),
  );
  for (const a of ACCENT_LIST) {
    out.push(
      item({
        id: `action:${accentActionId(a.id)}`,
        kind: 'action',
        ref: accentActionId(a.id),
        title: `Accent: ${a.name}`,
        subtitle: a.note,
        description: `${a.note}. Re-colours the interface and the lattice glow. The Flux symbol never changes.`,
        tile: { swatch: a.swatch },
        state: state.accent === a.id ? 'current' : undefined,
        external: false,
        keepOpen: true,
        transient: true,
        aliases: ['switch accent', 'accent', 'colour', 'color', 'theme', a.id],
      }),
    );
  }
  out.push(
    item({
      id: `action:${ACTION_IDS.sound}`,
      kind: 'action',
      ref: ACTION_IDS.sound,
      title: 'Toggle sound effects',
      subtitle: 'Hover ticks, clicks and a calm chime for each block',
      description:
        'A tiny synthesiser, no audio files. Off by default and it never plays on its own until you turn it on.',
      tile: { glyph: state.sound ? 'sound-on' : 'sound-off' },
      state: state.sound ? 'on' : 'off',
      external: false,
      keepOpen: true,
      transient: true,
      aliases: ['sound', 'audio', 'mute', 'unmute', 'toggle sound', 'volume'],
    }),
  );
  out.push(
    item({
      id: `action:${ACTION_IDS.motion}`,
      kind: 'action',
      ref: ACTION_IDS.motion,
      title: 'Toggle reduced motion',
      subtitle:
        state.motionOverride === null ? 'Following your system setting' : 'Set here, overriding the system',
      description:
        'Turns off parallax, camera moves and the marquee, and keeps fades. Your choice is remembered on this device.',
      tile: { glyph: state.reducedMotion ? 'motion-off' : 'motion' },
      state: state.reducedMotion ? 'on' : 'off',
      external: false,
      keepOpen: true,
      transient: true,
      aliases: ['reduce motion', 'reduced motion', 'motion', 'animation', 'calm', 'toggle motion'],
    }),
  );
  if (state.motionOverride !== null) {
    out.push(
      item({
        id: `action:${ACTION_IDS.motionSystem}`,
        kind: 'action',
        ref: ACTION_IDS.motionSystem,
        title: 'Follow the system motion setting',
        subtitle: 'Stop overriding reduced motion',
        description: 'Go back to whatever your operating system says about motion.',
        tile: { glyph: 'refresh' },
        external: false,
        keepOpen: true,
        transient: true,
        aliases: ['motion', 'system', 'reset motion'],
      }),
    );
  }
  out.push(
    item({
      id: `action:${ACTION_IDS.autoAmbient}`,
      kind: 'action',
      ref: ACTION_IDS.autoAmbient,
      title: 'Toggle ambient after idle',
      subtitle: 'Start ambient mode after 90 seconds without input',
      description:
        'When on, the page drifts into ambient mode if you stop touching it. Off keeps the page as is.',
      tile: { glyph: 'clock' },
      state: state.autoAmbient ? 'on' : 'off',
      external: false,
      keepOpen: true,
      transient: true,
      aliases: ['auto ambient', 'auto-ambient', 'idle', 'screensaver', 'timeout'],
    }),
  );
  out.push(
    item({
      id: `action:${ACTION_IDS.copyLink}`,
      kind: 'action',
      ref: ACTION_IDS.copyLink,
      title: 'Copy page link',
      subtitle: 'The address of this page, including the section',
      description: 'Copies the link to what you are looking at, so you can paste it anywhere.',
      tile: { glyph: 'link' },
      external: false,
      aliases: ['share', 'url', 'copy link', 'copy url', 'address'],
    }),
  );
  out.push(
    item({
      id: `action:${ACTION_IDS.submit}`,
      kind: 'action',
      ref: ACTION_IDS.submit,
      title: 'Add your app or host',
      subtitle: 'Compose a message for the Flux Discord',
      description:
        'Fill in a few fields and get a ready-to-paste message. Nothing is stored and nothing leaves your browser.',
      tile: { glyph: 'plus' },
      external: false,
      aliases: ['submit', 'open submit dialog', 'submit your app', 'list your app', 'add app', 'contribute'],
    }),
  );
  out.push(
    item({
      id: `action:${ACTION_IDS.shortcuts}`,
      kind: 'action',
      ref: ACTION_IDS.shortcuts,
      title: 'Show keyboard shortcuts',
      subtitle: 'Every key binding on one sheet',
      description: 'Opens the shortcuts sheet: global keys, section jumps, the deck and ambient mode.',
      tile: { glyph: 'keyboard' },
      chord: ['?'],
      external: false,
      aliases: ['shortcuts', 'keys', 'hotkeys', 'keybindings', 'help', 'keyboard'],
    }),
  );
  out.push(
    item({
      id: `action:${ACTION_IDS.top}`,
      kind: 'action',
      ref: ACTION_IDS.top,
      title: 'Go to top',
      subtitle: 'Back to the start of the page',
      description: 'Scrolls to the very top.',
      tile: { glyph: 'arrow-up' },
      external: false,
      aliases: ['top', 'home', 'scroll to top', 'start'],
    }),
  );
  out.push(
    item({
      id: `action:${ACTION_IDS.terminal}`,
      kind: 'action',
      ref: ACTION_IDS.terminal,
      title: 'Ask the network',
      subtitle: 'Live answers: block, nodes, price, reduction, apps',
      description:
        'A one-line terminal. Type > then a command: block, nodes, price, reduction, apps, app <name>, host <name> or help.',
      tile: { glyph: 'terminal' },
      chord: ['>'],
      external: false,
      keepOpen: true,
      transient: true,
      aliases: ['terminal', 'query', 'command', 'live data', 'block', 'price', 'nodes', 'reduction', 'apps'],
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// The whole catalog
// ---------------------------------------------------------------------------

let staticItems: DeckItem[] | null = null;

/** Sections, apps, hosts, gateways and community links. Built once. */
export function catalogItems(): readonly DeckItem[] {
  if (!staticItems) {
    staticItems = [...sectionItems(), ...appItems(), ...hostItems(), ...gatewayItems(), ...socialItems()];
  }
  return staticItems;
}

/** Every item, with the actions labelled for the current state. */
export function buildItems(state: ActionState): DeckItem[] {
  return [...catalogItems(), ...actionItems(state)];
}
