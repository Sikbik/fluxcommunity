/**
 * The Flux Community glyph set. 24 px grid, 1.5 px stroke, square caps, mitred joins,
 * hex-derived geometry (pointy-top hexagons: the Flux symbol's own angle). Original
 * artwork; no emoji, no third-party icon paths.
 *
 * A shape is one of:
 *   string          a stroked path (`d`)
 *   { dot }         a filled circle [cx, cy, r]
 *   { fill }        a filled path (`d`), for play triangles and similar
 */
import { hexPath } from '@/lib/hex';

export type GlyphShape = string | { dot: [number, number, number] } | { fill: string };

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Hexagon outline, radius 9.5 at the centre: the family silhouette. */
const H = hexPath(12, 12, 9.5);
/** A smaller inner hexagon. */
const h = (r: number, cx = 12, cy = 12) => hexPath(cx, cy, r);

export const GLYPHS = {
  // ---- Gateway kinds -------------------------------------------------------------
  /** A cube: containers deploying. */
  cloud: [H, 'M12 12L20.2 7.25', 'M12 12L3.8 7.25', 'M12 12V21.5'],
  /** A hex die with traces out of every vertex: GPU compute. */
  compute: [
    h(6.4),
    'M12 5.6V2.5',
    'M17.5 8.8L20.7 7',
    'M17.5 15.2L20.7 17',
    'M12 18.4V21.5',
    'M6.5 15.2L3.3 17',
    'M6.5 8.8L3.3 7',
    { dot: [12, 12, 1.4] },
  ],
  /** A spark inside a hexagon: the assistant. */
  ai: [H, 'M12 6.6L13.5 10.5L17.4 12L13.5 13.5L12 17.4L10.5 13.5L6.6 12L10.5 10.5Z'],
  /** A hex controller. */
  games: [
    'M6.5 7.5H17.5L21 12.5L18.5 17H15.5L13.5 14.5H10.5L8.5 17H5.5L3 12.5Z',
    'M8 10V13',
    'M6.5 11.5H9.5',
    { dot: [15.5, 10.8, 1] },
    { dot: [17.6, 12.6, 1] },
  ],
  /** Pages with code light. */
  docs: ['M6 3H14L18 7V21H6Z', 'M14 3V7H18', 'M9.8 12.3L8.2 14L9.8 15.7', 'M14.2 12.3L15.8 14L14.2 15.7'],
  /** Linked blocks. */
  explorer: [h(4.4, 8.2, 8.2), h(4.4, 15.8, 15.8), 'M11.4 10.4L12.6 13.6'],
  /** An academy cap. */
  learn: ['M12 4L22 9L12 14L2 9Z', 'M6 11.4V16C6 16 8.4 19 12 19S18 16 18 16V11.4', 'M22 9V15'],
  /** A hex-headed key. */
  wallet: [h(3.6, 7, 12), 'M10.6 12H20.5', 'M17.5 12V15', 'M14.5 12V14'],
  /** A globe. */
  site: [
    circle(12, 12, 9.5),
    'M2.5 12H21.5',
    'M12 2.5C15.3 6 15.3 18 12 21.5',
    'M12 2.5C8.7 6 8.7 18 12 21.5',
  ],
  /** A hexagon with rack lines: a node. */
  nodes: [H, 'M8.4 9.4H15.6', 'M8.4 12H15.6', 'M8.4 14.6H15.6'],

  // ---- Tiers: one, two and three layers (shape, not only colour) -----------------------
  'tier-cumulus': ['M4 12L12 7.5L20 12L12 16.5Z'],
  'tier-nimbus': ['M4 9.5L12 5L20 9.5L12 14Z', 'M4 14L12 18.5L20 14'],
  'tier-stratus': ['M4 7.5L12 3L20 7.5L12 12Z', 'M4 12L12 16.5L20 12', 'M4 16.5L12 21L20 16.5'],

  // ---- App categories -------------------------------------------------------------------
  network: [
    'M12 12L5 6.5',
    'M12 12L19 6.5',
    'M12 12V20',
    { dot: [12, 12, 2] },
    { dot: [5, 6.5, 1.6] },
    { dot: [19, 6.5, 1.6] },
    { dot: [12, 20, 1.6] },
  ],
  rewards: [H, h(5.2)],
  onboarding: [circle(12, 12, 9.5), 'M15.8 8.2L13.6 13.6L8.2 15.8L10.4 10.4Z'],
  education: [
    'M3 5.5C6 4.5 9 4.7 12 6.7C15 4.7 18 4.5 21 5.5V18.5C18 17.5 15 17.7 12 19.7C9 17.7 6 17.5 3 18.5Z',
    'M12 6.7V19.7',
  ],
  hosting: [
    'M4 4.5H20V10.5H4Z',
    'M4 13.5H20V19.5H4Z',
    { dot: [7.5, 7.5, 1] },
    { dot: [7.5, 16.5, 1] },
    'M12 7.5H16.5',
    'M12 16.5H16.5',
  ],

  // ---- Status (a hexagon plus a mark, always paired with a word) -----------------------
  'status-ok': [H, 'M8.4 12.4L11 15L15.8 9.4'],
  'status-warn': [H, 'M12 7.4V13', { dot: [12, 16.2, 1.1] }],
  'status-crit': [H, 'M9 9L15 15', 'M15 9L9 15'],
  'status-off': [H, 'M8.8 12H15.2'],
  'status-pending': [H, 'M12 7.6V12L15.2 14'],
  'status-live': [H, 'M6.8 12H9.4L10.8 8.6L13.2 15.4L14.6 12H17.2'],

  // ---- Actions and controls ----------------------------------------------------------------
  'arrow-up-right': ['M7 17L17 7', 'M9 7H17V15'],
  'arrow-right': ['M4 12H20', 'M14 6L20 12L14 18'],
  'arrow-left': ['M20 12H4', 'M10 6L4 12L10 18'],
  'arrow-up': ['M12 20V4', 'M6 10L12 4L18 10'],
  'arrow-down': ['M12 4V20', 'M6 14L12 20L18 14'],
  'chevron-down': ['M6 9L12 15L18 9'],
  'chevron-up': ['M6 15L12 9L18 15'],
  'chevron-left': ['M15 6L9 12L15 18'],
  'chevron-right': ['M9 6L15 12L9 18'],
  check: ['M5 12.5L10 17.5L19 7'],
  close: ['M6 6L18 18', 'M18 6L6 18'],
  plus: ['M12 5V19', 'M5 12H19'],
  minus: ['M5 12H19'],
  search: [h(6.2, 10.5, 10.5), 'M15.2 15.2L20.5 20.5'],
  menu: ['M4.5 7.5H19.5', 'M4.5 12H19.5', 'M4.5 16.5H19.5'],
  command: [
    'M9 9V6.5A2.5 2.5 0 1 0 6.5 9H17.5A2.5 2.5 0 1 0 15 6.5V17.5A2.5 2.5 0 1 0 17.5 15H6.5A2.5 2.5 0 1 0 9 17.5Z',
  ],
  terminal: ['M5 8L10 12L5 16', 'M12.5 17H19'],
  'sound-on': [
    'M4 9.5H8L13 5.5V18.5L8 14.5H4Z',
    'M16.2 9.2C17.4 10.5 17.4 13.5 16.2 14.8',
    'M18.8 6.6C21.4 9.4 21.4 14.6 18.8 17.4',
  ],
  'sound-off': ['M4 9.5H8L13 5.5V18.5L8 14.5H4Z', 'M16.5 9.5L21 14.5', 'M21 9.5L16.5 14.5'],
  motion: ['M3 12C5 5.5 7 5.5 9 12S13 18.5 15 12S19 5.5 21 12'],
  /**
   * The wave struck through, with the wave broken where the stroke crosses it so it stays
   * legible at 16 px. (A bare flat line read as a minus sign.)
   */
  'motion-off': [
    'M3 12C5 5.5 7 5.5 9 12',
    'M10.9 16.2C12.2 17.9 13.6 16.5 15 12C17 5.5 19 5.5 21 12',
    'M4.5 20L19.5 4',
  ],
  /** A right-pointing triangle: start, play. */
  play: ['M8 5L19 12L8 19Z'],
  /** Two bars: pause. */
  pause: ['M7 5H10.5V19H7Z', 'M13.5 5H17V19H13.5Z'],
  /** A counter-clockwise arrow around a play triangle: run it again. */
  replay: ['M4 12A8 8 0 1 0 6.4 6.3', 'M4 4V8.5H8.5', 'M10 9V15L15 12Z'],
  /** A hex tunnel: nested hexagons, for ambient mode. */
  ambient: [H, h(5.8), h(2.2)],
  copy: ['M9 9H19.5V19.5H9Z', 'M5 15V4.5H15.5'],
  link: [
    'M10 14L14 10',
    'M8.2 11.8L6.4 13.6A3.4 3.4 0 0 0 11.2 18.4L13 16.6',
    'M15.8 12.2L17.6 10.4A3.4 3.4 0 0 0 12.8 5.6L11 7.4',
  ],
  share: ['M12 15V4', 'M8 8L12 4L16 8', 'M5 13V20H19V13'],
  launch: ['M14 4H20V10', 'M20 4L11 13', 'M18 14V20H4V6H10'],
  filter: ['M4 5H20L14 12.5V19L10 17V12.5Z'],
  sort: ['M7 4V20', 'M3.5 16.5L7 20L10.5 16.5', 'M17 20V4', 'M13.5 7.5L17 4L20.5 7.5'],
  /** Hex cells: the Cells view. */
  cells: [h(3.9, 8, 8.2), h(3.9, 16, 8.2), h(3.9, 12, 15.1)],
  constellation: [
    'M5 16.5L10 9L16 12.5L19 5.5',
    'M16 12.5L14 19',
    { dot: [5, 16.5, 1.7] },
    { dot: [10, 9, 1.7] },
    { dot: [16, 12.5, 1.7] },
    { dot: [19, 5.5, 1.7] },
    { dot: [14, 19, 1.7] },
  ],
  info: [H, 'M12 11V16.2', { dot: [12, 8, 1.1] }],
  help: [H, 'M9.6 9.6A2.4 2.4 0 1 1 12 12.2V13.4', { dot: [12, 16.4, 1.1] }],
  keyboard: [
    'M3 6.5H21V17.5H3Z',
    'M6.5 10.2H7.5',
    'M10.5 10.2H11.5',
    'M14.5 10.2H15.5',
    'M17.5 10.2H18',
    'M8 14H16',
  ],
  spark: ['M12 3L14.2 9.8L21 12L14.2 14.2L12 21L9.8 14.2L3 12L9.8 9.8Z'],
  bolt: ['M13.5 2.5L5.5 13H11.5L10.5 21.5L18.5 10.5H12.5Z'],
  refresh: ['M20 12A8 8 0 1 1 17.6 6.3', 'M20 4V8.5H15.5'],
  clock: [circle(12, 12, 9.5), 'M12 6.8V12L15.4 14'],
  eye: ['M2.5 12C5 7.5 8.5 5.5 12 5.5S19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5S5 16.5 2.5 12Z', h(2.8)],
  expand: ['M4 9V4H9', 'M20 9V4H15', 'M4 15V20H9', 'M20 15V20H15'],
  upload: ['M12 15V4', 'M7 9L12 4L17 9', 'M4 20H20'],
  download: ['M12 4V15', 'M7 10L12 15L17 10', 'M4 20H20'],
  calendar: ['M4 6H20V20H4Z', 'M4 10.5H20', 'M8.5 3.5V8', 'M15.5 3.5V8'],
  layers: ['M12 3L21 8L12 13L3 8Z', 'M3 12L12 17L21 12', 'M3 16L12 21L21 16'],
  user: [circle(12, 8, 3.5), 'M4.5 20C4.5 15.5 8 14 12 14S19.5 15.5 19.5 20'],
  heart: ['M12 20.5L4.2 12.7A4.7 4.7 0 0 1 12 6.5A4.7 4.7 0 0 1 19.8 12.7Z'],
  sliders: ['M4 7H20', 'M4 17H20', 'M9 4.5V9.5', 'M15 14.5V19.5'],

  // ---- Socials (stylised, in the same stroke) ---------------------------------------------------
  discord: [
    'M7 7.2C9.4 6 14.6 6 17 7.2L19.4 15.4C17.8 17 16.2 17.7 15.2 18L14 16.2H10L8.8 18C7.8 17.7 6.2 17 4.6 15.4Z',
    { dot: [9.4, 12, 1.15] },
    { dot: [14.6, 12, 1.15] },
  ],
  x: ['M5 4L19 20', 'M19 4L5 20'],
  'x-community': [
    circle(9, 8, 3),
    'M3.5 19.5C3.5 15.8 6 14.2 9 14.2S14.5 15.8 14.5 19.5',
    'M15.5 5.2A2.8 2.8 0 0 1 15.5 10.8',
    'M17.2 14.4C19.4 14.9 20.8 16.5 20.8 19.5',
  ],
  telegram: ['M21 4.5L3.5 11.5L9.5 13.5L11.5 19.5L14.5 15.5L19.5 19Z', 'M9.5 13.5L21 4.5'],
  youtube: ['M5 6H19L21 8V16L19 18H5L3 16V8Z', 'M10 9V15L15.5 12Z'],
  github: [
    circle(6, 5.5, 2),
    circle(6, 18.5, 2),
    circle(18, 9, 2),
    'M6 7.5V16.5',
    'M18 11C18 14 15.5 15 12.5 15H10.5C8 15 6.5 15.6 6 16.5',
  ],
  blog: ['M4 20L5 15L16 4L20 8L9 19Z', 'M13.5 6.5L17.5 10.5'],
} satisfies Record<string, readonly GlyphShape[]>;

export type GlyphName = keyof typeof GLYPHS;

export const GLYPH_NAMES = Object.keys(GLYPHS) as GlyphName[];

/**
 * The parts a glyph is drawn from, typed as the plain union (the literal in `GLYPHS` is narrower
 * per entry). For rendering a glyph in your own `<svg>` (to animate its parts) or on a canvas.
 */
export function glyphShapes(name: GlyphName): readonly GlyphShape[] {
  return GLYPHS[name];
}

/** True when `id` is the name of a glyph (an own key: `"toString"` is not one). */
export function isGlyphName(id: string): id is GlyphName {
  return Object.hasOwn(GLYPHS, id);
}

/** Glyph groups, for the kit gallery and for authors looking for a name. */
export const GLYPH_GROUPS: Record<string, readonly GlyphName[]> = {
  'Gateway kinds': [
    'cloud',
    'compute',
    'ai',
    'games',
    'docs',
    'explorer',
    'learn',
    'wallet',
    'site',
    'nodes',
  ],
  Tiers: ['tier-cumulus', 'tier-nimbus', 'tier-stratus'],
  'App categories': ['network', 'nodes', 'rewards', 'onboarding', 'education', 'hosting'],
  Status: ['status-ok', 'status-warn', 'status-crit', 'status-off', 'status-pending', 'status-live'],
  Actions: [
    'arrow-up-right',
    'arrow-right',
    'arrow-left',
    'arrow-up',
    'arrow-down',
    'chevron-down',
    'chevron-up',
    'chevron-left',
    'chevron-right',
    'check',
    'close',
    'plus',
    'minus',
    'search',
    'menu',
    'command',
    'terminal',
    'sound-on',
    'sound-off',
    'motion',
    'motion-off',
    'play',
    'pause',
    'replay',
    'ambient',
    'copy',
    'link',
    'share',
    'launch',
    'filter',
    'sort',
    'cells',
    'constellation',
    'info',
    'help',
    'keyboard',
    'spark',
    'bolt',
    'refresh',
    'clock',
    'eye',
    'expand',
    'upload',
    'download',
    'calendar',
    'layers',
    'user',
    'heart',
    'sliders',
  ],
  Socials: ['discord', 'x', 'x-community', 'telegram', 'youtube', 'github', 'blog'],
};

/** Looks a gateway kind (shared/catalog GatewayKind) up as a glyph. Every kind has one. */
export const GATEWAY_GLYPH = {
  cloud: 'cloud',
  compute: 'compute',
  ai: 'ai',
  games: 'games',
  docs: 'docs',
  explorer: 'explorer',
  learn: 'learn',
  wallet: 'wallet',
  site: 'site',
  nodes: 'nodes',
} as const satisfies Record<string, GlyphName>;
