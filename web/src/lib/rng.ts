/** Seeded pseudo-random numbers, so generated patterns are identical on every load. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDE = 32;
const TILE_W = 55.43;
const TILE_ROW = 48;

export interface LatticeCellsOptions {
  /** Tile columns (each 55.43 px wide). */
  cols: number;
  /** Tile rows (each 96 px tall, two hexagon rows). */
  rows: number;
  /** How many hexagons to fill. */
  count: number;
  seed: number;
  /** Inset from the full cell, px. */
  inset?: number;
}

/**
 * An SVG (as a string) of filled pointy-top hexagons placed on the same grid as the
 * brand hex pattern, at seeded random cells. Used as a mask so the lit cells line up
 * with the hairline lattice drawn by `--pattern-hex-mask`.
 */
export function latticeCellsSvg({ cols, rows, count, seed, inset = 2 }: LatticeCellsOptions): string {
  const rand = mulberry32(seed);
  const hexRows = rows * 2;
  const taken = new Set<string>();
  const w = f2(cols * TILE_W);
  const h = f2(rows * TILE_ROW * 2);
  const r = SIDE - inset;
  let shapes = '';
  let guard = 0;
  while (taken.size < count && guard++ < count * 20) {
    // The last row and the first column of odd rows would be clipped by the tile edge, which
    // shows as a seam when the tile repeats, so they stay empty.
    const row = Math.floor(rand() * Math.max(1, hexRows - 1));
    const firstCol = row % 2 === 0 ? 0 : 1;
    const col = firstCol + Math.floor(rand() * Math.max(1, cols - firstCol));
    const key = `${row}:${col}`;
    if (taken.has(key)) continue;
    taken.add(key);
    const cx = col * TILE_W + (row % 2 === 0 ? TILE_W / 2 : 0);
    const cy = SIDE + TILE_ROW * row;
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (-90 + i * 60) * (Math.PI / 180);
      pts.push(`${f2(cx + r * Math.cos(a))},${f2(cy + r * Math.sin(a))}`);
    }
    shapes += `<polygon points='${pts.join(' ')}'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><g fill='%23fff'>${shapes}</g></svg>`;
}

function f2(n: number): number {
  return Number(n.toFixed(2));
}

/** Wraps an SVG string as a CSS `url("data:...")` value. */
export function svgToCssUrl(svg: string): string {
  const encoded = svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'").replace(/#/g, '%23');
  return `url("data:image/svg+xml,${encoded}")`;
}
