/**
 * The lit-cell masks for Lattice2D: seeded, so they are identical on every load, and
 * built once at module load. Each is an SVG tile of filled hexagons laid on the same
 * grid as the brand hex pattern, so the lit cells line up with the hairlines.
 */
import { latticeCellsSvg, svgToCssUrl } from '@/lib/rng';

export interface CellTile {
  url: string;
  /** Tile size in px at scale 1. */
  w: number;
  h: number;
}

function tile(cols: number, rows: number, count: number, seed: number): CellTile {
  return {
    url: svgToCssUrl(latticeCellsSvg({ cols, rows, count, seed })),
    w: Number((cols * 55.43).toFixed(2)),
    h: rows * 96,
  };
}

export const CELLS_A: CellTile = tile(9, 6, 9, 11);
export const CELLS_B: CellTile = tile(7, 5, 6, 29);
export const CELLS_C: CellTile = tile(11, 7, 7, 47);
