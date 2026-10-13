/**
 * The land mask for the world map: decode the run-length data once, then answer "how much of this
 * patch of the world is land". Framework-free; the generated data lives in `land-mask.data.ts`
 * (see `web/scripts/build-land-mask.mjs` for how it is made and what the encoding is).
 */
import { LAND_MASK_HEIGHT, LAND_MASK_RUNS, LAND_MASK_WIDTH } from './land-mask.data';

export interface LandMask {
  width: number;
  height: number;
  /** 1 where the 1 degree cell is land. Row-major, row 0 is the northernmost, column 0 is 180W. */
  cells: Uint8Array;
}

/**
 * Decodes base64 LEB128 run lengths (water first, then alternating) into a bitmap. Throws when the
 * data does not describe exactly `width * height` cells, so a corrupt module fails loudly in tests.
 */
export function decodeRuns(base64: string, width: number, height: number): Uint8Array {
  const text = atob(base64);
  const total = width * height;
  const out = new Uint8Array(total);
  let pos = 0;
  let value = 0;
  let shift = 0;
  let bit = 0;
  for (let i = 0; i < text.length; i++) {
    const byte = text.charCodeAt(i);
    value += (byte & 0x7f) * 2 ** shift;
    if (byte & 0x80) {
      shift += 7;
      continue;
    }
    if (pos + value > total) throw new Error('land mask has more cells than its size');
    if (bit === 1) out.fill(1, pos, pos + value);
    pos += value;
    value = 0;
    shift = 0;
    bit ^= 1;
  }
  if (pos !== total) throw new Error(`land mask has ${pos} cells, expected ${total}`);
  return out;
}

let shared: LandMask | null = null;

/** The decoded world mask. Decoded on first use and then shared. */
export function getLandMask(): LandMask {
  if (!shared) {
    shared = {
      width: LAND_MASK_WIDTH,
      height: LAND_MASK_HEIGHT,
      cells: decodeRuns(LAND_MASK_RUNS, LAND_MASK_WIDTH, LAND_MASK_HEIGHT),
    };
  }
  return shared;
}

function cellAt(mask: LandMask, col: number, row: number): number {
  const c = ((Math.floor(col) % mask.width) + mask.width) % mask.width;
  const r = Math.min(mask.height - 1, Math.max(0, Math.floor(row)));
  return mask.cells[r * mask.width + c] ?? 0;
}

/** Whether the cell containing this longitude and latitude is land. Longitude wraps, latitude clamps. */
export function isLand(mask: LandMask, lon: number, lat: number): boolean {
  const col = ((lon + 180) / 360) * mask.width;
  const row = ((90 - lat) / 180) * mask.height;
  return cellAt(mask, col, row) === 1;
}

/**
 * The share (0..1) of a patch of the world that is land, centred on a point, by sampling the mask on
 * an `n` by `n` grid across the patch. Sampling a patch rather than a point is what lets a dot
 * matrix keep a coastline, a peninsula or a small island instead of aliasing it away.
 */
export function landCoverage(
  mask: LandMask,
  lon: number,
  lat: number,
  halfLon: number,
  halfLat: number,
  n = 3,
): number {
  let hits = 0;
  for (let j = 0; j < n; j++) {
    const y = lat + ((j + 0.5) / n - 0.5) * 2 * halfLat;
    for (let i = 0; i < n; i++) {
      const x = lon + ((i + 0.5) / n - 0.5) * 2 * halfLon;
      if (isLand(mask, x, y)) hits++;
    }
  }
  return hits / (n * n);
}
