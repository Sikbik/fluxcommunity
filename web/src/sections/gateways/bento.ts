/**
 * The bento: where each gateway sits on the grid at each breakpoint. Pure data plus
 * validators, so a test can prove every layout is a perfect tiling (no overlap, no hole, no
 * orphan) and that the DOM order is also the visual reading order (keyboard order).
 *
 * Grid units: columns are the layout's `cols`; rows are SUB-ROWS, a fixed height each. A
 * "unit" tile on desktop is 3 columns by 2 sub-rows; wallets are slim strips of 1 sub-row.
 */

/** How a tile composes itself, which depends on its shape at the current breakpoint. */
export type TileForm = 'hero' | 'wide' | 'tall' | 'compact' | 'strip';

export interface Placement {
  /** Catalog gateway id. */
  id: string;
  /** 1-based grid line the tile starts at. */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  form: TileForm;
}

export type LayoutName = 'desktop' | 'tablet' | 'phone';

export interface BentoLayout {
  name: LayoutName;
  cols: number;
  rows: number;
  placements: readonly Placement[];
}

/**
 * DOM order of the tiles. It is the visual reading order (row by row, left to right) in
 * EVERY layout below, which a test enforces, so tabbing never jumps around.
 */
export const DOM_ORDER = [
  'cloud',
  'games',
  'docs',
  'edge',
  'ai',
  'explorer',
  'run-a-node',
  'flux',
  'zelcore',
  'ssp',
] as const;

const p = (
  id: string,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  form: TileForm,
): Placement => ({ id, col, row, colSpan, rowSpan, form });

/**
 * Desktop, 12 columns by 8 sub-rows:
 *
 *      1 2 3 | 4 5 6 | 7 8 9 | 10 11 12
 *   1  C C C   C C C   G G G    G  G  G      C cloud 6x4 (the hero)   G games 6x2
 *   2  C C C   C C C   G G G    G  G  G
 *   3  C C C   C C C   D D D    E  E  E      D docs 3x2   E edge 3x2
 *   4  C C C   C C C   D D D    E  E  E
 *   5  A A A   X X X   X X X    N  N  N      A ai 3x4 (tall)  X explorer 6x2  N node 3x4 (tall)
 *   6  A A A   X X X   X X X    N  N  N
 *   7  A A A   S S S   Z Z Z    N  N  N      S site 3x2   Z zelcore  P ssp (slim strips)
 *   8  A A A   S S S   P P P    N  N  N
 */
const DESKTOP: BentoLayout = {
  name: 'desktop',
  cols: 12,
  rows: 8,
  placements: [
    p('cloud', 1, 1, 6, 4, 'hero'),
    p('games', 7, 1, 6, 2, 'wide'),
    p('docs', 7, 3, 3, 2, 'compact'),
    p('edge', 10, 3, 3, 2, 'compact'),
    p('ai', 1, 5, 3, 4, 'tall'),
    p('explorer', 4, 5, 6, 2, 'wide'),
    p('run-a-node', 10, 5, 3, 4, 'tall'),
    p('flux', 4, 7, 3, 2, 'compact'),
    p('zelcore', 7, 7, 3, 1, 'strip'),
    p('ssp', 7, 8, 3, 1, 'strip'),
  ],
};

/** Tablet, 2 columns by 15 sub-rows: a hero, a banner, pairs, one tall tile beside a stack. */
const TABLET: BentoLayout = {
  name: 'tablet',
  cols: 2,
  rows: 15,
  placements: [
    p('cloud', 1, 1, 2, 4, 'hero'),
    p('games', 1, 5, 2, 2, 'wide'),
    p('docs', 1, 7, 1, 2, 'compact'),
    p('edge', 2, 7, 1, 2, 'compact'),
    p('ai', 1, 9, 1, 4, 'tall'),
    p('explorer', 2, 9, 1, 2, 'compact'),
    p('run-a-node', 2, 11, 1, 2, 'compact'),
    p('flux', 1, 13, 2, 2, 'wide'),
    p('zelcore', 1, 15, 1, 1, 'strip'),
    p('ssp', 2, 15, 1, 1, 'strip'),
  ],
};

/** Phone, 1 column by 21 sub-rows: a tall hero, then compact banners, then two slim strips. */
const PHONE: BentoLayout = {
  name: 'phone',
  cols: 1,
  rows: 21,
  placements: [
    p('cloud', 1, 1, 1, 5, 'hero'),
    p('games', 1, 6, 1, 2, 'wide'),
    p('docs', 1, 8, 1, 2, 'wide'),
    p('edge', 1, 10, 1, 2, 'wide'),
    p('ai', 1, 12, 1, 2, 'wide'),
    p('explorer', 1, 14, 1, 2, 'wide'),
    p('run-a-node', 1, 16, 1, 2, 'wide'),
    p('flux', 1, 18, 1, 2, 'wide'),
    p('zelcore', 1, 20, 1, 1, 'strip'),
    p('ssp', 1, 21, 1, 1, 'strip'),
  ],
};

export const LAYOUTS: Record<LayoutName, BentoLayout> = {
  desktop: DESKTOP,
  tablet: TABLET,
  phone: PHONE,
};

/**
 * Breakpoints (px). The phone edge is the design token (720). The desktop edge is the bento's
 * own: 12 columns only work when a 3 column tile is at least about 300 px wide, which is a
 * 1360 px viewport with the section gutters, so 720 to 1359 uses the 2 column layout (whose
 * tiles are 320 to 620 px wide, the most generous this grid ever gets).
 */
export const BENTO_PHONE_MAX = 720;
export const BENTO_DESKTOP_MIN = 1360;

/** Which layout applies for a viewport width (px). */
export function layoutNameFor(viewportWidth: number): LayoutName {
  if (viewportWidth >= BENTO_DESKTOP_MIN) return 'desktop';
  if (viewportWidth >= BENTO_PHONE_MAX) return 'tablet';
  return 'phone';
}

export function placementFor(layout: BentoLayout, id: string): Placement | undefined {
  return layout.placements.find((x) => x.id === id);
}

/** Ids in reading order: by top edge, then by left edge. */
export function readingOrder(layout: BentoLayout): string[] {
  return [...layout.placements].sort((a, b) => a.row - b.row || a.col - b.col).map((x) => x.id);
}

/**
 * Everything wrong with a layout, as human sentences. Empty means it is a clean tiling:
 * every id placed exactly once, every cell covered exactly once, nothing out of bounds.
 */
export function validateLayout(layout: BentoLayout, ids: readonly string[]): string[] {
  const problems: string[] = [];
  const { cols, rows } = layout;
  const owner: (string | null)[] = new Array(cols * rows).fill(null);

  const seen = new Set<string>();
  for (const pl of layout.placements) {
    if (seen.has(pl.id)) problems.push(`${pl.id} is placed twice`);
    seen.add(pl.id);
    if (pl.col < 1 || pl.row < 1 || pl.colSpan < 1 || pl.rowSpan < 1) {
      problems.push(`${pl.id} has a non-positive position or span`);
      continue;
    }
    if (pl.col + pl.colSpan - 1 > cols) problems.push(`${pl.id} runs past the last column`);
    if (pl.row + pl.rowSpan - 1 > rows) problems.push(`${pl.id} runs past the last row`);
    for (let r = pl.row; r < pl.row + pl.rowSpan; r++) {
      for (let c = pl.col; c < pl.col + pl.colSpan; c++) {
        if (c > cols || r > rows) continue;
        const i = (r - 1) * cols + (c - 1);
        const prev = owner[i];
        if (prev !== null && prev !== undefined) {
          problems.push(`${pl.id} overlaps ${prev} at column ${c}, row ${r}`);
        } else {
          owner[i] = pl.id;
        }
      }
    }
  }

  for (const id of ids) if (!seen.has(id)) problems.push(`${id} is missing`);
  for (const id of seen) if (!ids.includes(id)) problems.push(`${id} is not a known gateway`);

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (owner[(r - 1) * cols + (c - 1)] === null) problems.push(`hole at column ${c}, row ${r}`);
    }
  }
  return problems;
}
