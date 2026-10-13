/**
 * The shortcut registry: ONE table that the shortcuts sheet, the command deck's hints and the `g`
 * chord handler all read, so what the sheet says is what the keys do.
 *
 * Ownership
 * - `owner: 'shell'` bindings are registered by the app shell (`app/shell.ts`, `useGlobalHotkeys`).
 *   They are documented here and a test compares this table with the shell's source, so a change
 *   on either side fails loudly instead of drifting.
 * - Everything else is registered by this folder (the chords in `useChords`, the deck's own keys).
 */
import { SECTION_META } from '@/content/sections';
import type { SectionId } from '@/stage/bus';

export type ShortcutGroup = 'Global' | 'Navigation' | 'Command deck' | 'Ambient';

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Global', 'Navigation', 'Command deck', 'Ambient'];

export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  /** What it does, sentence case. */
  label: string;
  /**
   * Alternatives, each a sequence of combos (the `mod+k` grammar of `lib/hotkeys`): [['mod+k'], ['/']]
   * reads "Ctrl K or /", [['g', 'b']] reads "g then b". Empty when `note` says it all.
   */
  keys: ReadonlyArray<readonly string[]>;
  /** Shown instead of keycaps when there is no single key (for example "Any key"). */
  note?: string;
  /** Registered by the app shell rather than by this folder. */
  owner?: 'shell';
}

/** The first key of a section jump: press it, then one of the letters below. */
export const CHORD_PREFIX = 'g';

/** How long a half-typed chord stays armed. */
export const CHORD_TIMEOUT_MS = 1400;

/** The letter after `g` for each section, in page order. */
export const SECTION_CHORDS: ReadonlyArray<{ key: string; section: SectionId }> = [
  { key: 'h', section: 'hero' },
  { key: 'n', section: 'pulse' },
  { key: 's', section: 'gateways' },
  { key: 'b', section: 'builds' },
  { key: 'r', section: 'hosting' },
  { key: 'p', section: 'play' },
  { key: 'l', section: 'learn' },
  { key: 'c', section: 'community' },
];

/** The chord letter for a section, or null. */
export function chordFor(section: SectionId): string | null {
  return SECTION_CHORDS.find((c) => c.section === section)?.key ?? null;
}

/** The section a chord letter jumps to, or null. */
export function sectionForChord(key: string): SectionId | null {
  const k = key.toLowerCase();
  return SECTION_CHORDS.find((c) => c.key === k)?.section ?? null;
}

const NAVIGATION: Shortcut[] = SECTION_CHORDS.map(({ key, section }) => ({
  id: `go-${section}`,
  group: 'Navigation' as const,
  label: `Go to ${SECTION_META[section].label}`,
  keys: [[CHORD_PREFIX, key]],
}));

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'deck-toggle',
    group: 'Global',
    label: 'Open or close the command deck',
    keys: [['mod+k']],
    owner: 'shell',
  },
  { id: 'deck-slash', group: 'Global', label: 'Open the command deck', keys: [['/']], owner: 'shell' },
  { id: 'shortcuts', group: 'Global', label: 'Show or hide this sheet', keys: [['?']], owner: 'shell' },
  { id: 'close', group: 'Global', label: 'Close the open overlay', keys: [['escape']] },

  ...NAVIGATION,

  { id: 'deck-move', group: 'Command deck', label: 'Move through the results', keys: [['up'], ['down']] },
  { id: 'deck-run', group: 'Command deck', label: 'Run the selected result', keys: [['enter']] },
  {
    id: 'deck-alt',
    group: 'Command deck',
    label: 'Launch an app, or show a result in the page',
    keys: [['shift+enter']],
  },
  { id: 'deck-preview', group: 'Command deck', label: 'Preview the selected result', keys: [['tab']] },
  {
    id: 'deck-terminal',
    group: 'Command deck',
    label: 'Ask the network: block, nodes, price, reduction',
    keys: [['>']],
  },

  { id: 'ambient', group: 'Ambient', label: 'Start or leave ambient mode', keys: [['a']], owner: 'shell' },
  {
    id: 'ambient-wake',
    group: 'Ambient',
    label: 'Wake the page',
    keys: [],
    note: 'Any key, click, scroll or movement',
  },
];

export function shortcutsIn(group: ShortcutGroup): Shortcut[] {
  return SHORTCUTS.filter((s) => s.group === group);
}

/**
 * The groups spread over `count` columns, in order, each into the shortest column so far, so the
 * sheet's columns end up about the same height rather than one long and one short.
 */
export function columnsFor(count = 2): ShortcutGroup[][] {
  const columns = Array.from({ length: Math.max(1, count) }, () => ({
    rows: 0,
    groups: [] as ShortcutGroup[],
  }));
  for (const group of SHORTCUT_GROUPS) {
    const target = columns.reduce((a, b) => (b.rows < a.rows ? b : a));
    target.groups.push(group);
    target.rows += shortcutsIn(group).length + 1; // the heading counts as a row
  }
  return columns.map((c) => c.groups);
}

/** The first alternative of a shortcut as one string for hints and labels: "g then b". */
export function describeKeys(keys: ReadonlyArray<readonly string[]>): string {
  return keys.map((seq) => seq.join(' then ')).join(' or ');
}
