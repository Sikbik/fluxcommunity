/**
 * A tiny dot-matrix world for the "how an app runs" explainer. Local to this section on purpose:
 * it shares nothing with the network pulse map.
 *
 * The land mask is derived from Natural Earth 1:50m land (public domain), rasterised to a 3 degree
 * grid (120 columns by 44 rows, 76 N to 56 S; odd rows are offset by half a column, so the dots sit
 * on the same hexagonal lattice as the rest of the site). One bit per dot, four dots per hex digit,
 * left to right, west to east. 1,806 land dots.
 */

const LAND_ROWS: readonly string[] = [
  '00001fbfc07ffc000003017fe03000',
  '01003fbbf07ff00000043fffffff00',
  '87ffffffbc3ff0007f8fffffffffff',
  'efffffff3e3f0e01ffffffffffffff',
  '07fffff83e1c0003dfffffffffffff',
  '07cffff078000007dffffffffffe60',
  '0101fffe3f000021dfffffffffc0c0',
  '0000ffff7f8000f7ffffffffffe180',
  '00007fffffc0001ffffffffffff000',
  '00003ffffcc0003fffffffffffc000',
  '00003ffffe00001ffd77ffffffd000',
  '00003ffff00000fbfff7fffffe2000',
  '00001fffe000007017fbfffffa2000',
  '00001fffc000007e03fffffff7c000',
  '000007ff8000007f91fffffff90000',
  '000007fd800000fffffffffff00000',
  '000003f0c00001fffffbfffff00000',
  '000000e0000003fffffe3ffff00000',
  '00000072200003ffffff0f9f800000',
  '0000007c100003fffffc0e1e180000',
  '00000007000003fffff8060f880000',
  '00000003100003ffffd8040b0c0000',
  '00000000ff0001fffff80600040000',
  '000000007fc000f7fff00004200000',
  '000000003fe00001fff0000e700000',
  '000000007ff00003ffc00004f90000',
  '000000007ffe0001ff80000368f000',
  '000000007fff0000ff800001807c00',
  '000000003fff0000ff800000100400',
  '000000003ffe0000ff800000018000',
  '000000001ffe0000ffd8000007d800',
  '000000000ffe0001ff3000000ff800',
  '000000000ffe0000ff3000003ffc00',
  '000000000ff00000fe2000007ffc00',
  '000000000ff000007e0000003ffe00',
  '000000001fe000007c0000003ffe00',
  '000000000fe00000380000003c7e00',
  '000000001f80000000000000003c00',
  '000000001f00000000000000000002',
  '000000001c0000000000000000080c',
  '000000001c00000000000000000008',
  '000000003c00000000000000000000',
  '000000001800000000000000000000',
  '000000001800000000000000000000',
];

export const MAP_COLS = 120;
export const MAP_ROWS = 44;
/** Degrees per dot, both ways. */
export const MAP_STEP = 3;
export const MAP_TOP_LAT = 76;
/** Width and height of the dot grid in dot-pitch units (odd rows reach half a pitch further). */
export const GRID_W = MAP_COLS + 0.5;
export const GRID_H = MAP_ROWS;

export interface GridPoint {
  /** Position in dot-pitch units, from the grid's top-left corner. */
  x: number;
  y: number;
}

export interface LandDots {
  /** x, y pairs in dot-pitch units, west to east then north to south. */
  xy: Float32Array;
  count: number;
}

let cached: LandDots | null = null;

/** Decodes the land mask once: the dot centres, in dot-pitch units. */
export function landDots(): LandDots {
  if (cached) return cached;
  const pts: number[] = [];
  LAND_ROWS.forEach((hex, row) => {
    for (let col = 0; col < MAP_COLS; col++) {
      const nibble = Number.parseInt(hex[col >> 2] ?? '0', 16);
      if ((nibble >> (3 - (col & 3))) & 1) {
        pts.push(col + 0.5 + (row % 2 ? 0.5 : 0), row + 0.5);
      }
    }
  });
  cached = { xy: Float32Array.from(pts), count: pts.length / 2 };
  return cached;
}

/** Longitude and latitude to a continuous position on the dot grid. */
export function project(lon: number, lat: number): GridPoint {
  return { x: (lon + 180) / MAP_STEP, y: (MAP_TOP_LAT - lat) / MAP_STEP };
}

/** The centre of the dot nearest to a place (land or sea): where a lit cell sits. */
export function nearestCell(lon: number, lat: number): GridPoint {
  const p = project(lon, lat);
  const row = Math.min(MAP_ROWS - 1, Math.max(0, Math.floor(p.y)));
  const shift = row % 2 ? 0.5 : 0;
  const col = Math.min(MAP_COLS - 1, Math.max(0, Math.round(p.x - 0.5 - shift)));
  return { x: col + 0.5 + shift, y: row + 0.5 };
}

/** Great-circle distance in kilometres. */
export function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Place {
  lon: number;
  lat: number;
}

/** Index of the place closest to `from`, skipping indices in `skip`. -1 when none is left. */
export function nearestPlace(
  from: Place,
  places: readonly Place[],
  skip: ReadonlySet<number> = new Set(),
): number {
  let best = -1;
  let bestKm = Number.POSITIVE_INFINITY;
  places.forEach((p, i) => {
    if (skip.has(i)) return;
    const km = distanceKm(from.lon, from.lat, p.lon, p.lat);
    if (km < bestKm) {
      bestKm = km;
      best = i;
    }
  });
  return best;
}

/**
 * Points along a curved path from a to b: a quadratic curve whose control point is lifted off the
 * straight line by `bulge` times the span, always toward the top of the screen. Written into `out`
 * as x, y pairs; returns the number of points.
 */
export function arcPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bulge: number,
  out: Float32Array,
): number {
  const n = Math.floor(out.length / 2);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // A perpendicular to the span, chosen to point up the screen (negative y).
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const cx = (ax + bx) / 2 + nx * len * bulge;
  const cy = (ay + by) / 2 + ny * len * bulge;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const u = 1 - t;
    out[i * 2] = u * u * ax + 2 * u * t * cx + t * t * bx;
    out[i * 2 + 1] = u * u * ay + 2 * u * t * cy + t * t * by;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The example placement. Illustrative: these cities stand for "different regions", nothing more.
// ---------------------------------------------------------------------------

export type NodeId = 'iad' | 'fra' | 'sin' | 'syd';

export interface ExampleNode extends Place {
  id: NodeId;
  city: string;
  region: string;
  /** Which side of its cell the label sits on, chosen to stay inside the map. */
  label: 'left' | 'right';
}

/** The three copies the network picks, in the order it picks them, then the replacement. */
export const EXAMPLE_NODES: readonly ExampleNode[] = [
  { id: 'fra', city: 'Frankfurt', region: 'Europe', lon: 8.7, lat: 50.1, label: 'right' },
  { id: 'iad', city: 'Virginia', region: 'North America', lon: -77.4, lat: 38.9, label: 'left' },
  { id: 'sin', city: 'Singapore', region: 'Asia Pacific', lon: 103.8, lat: 1.35, label: 'right' },
  { id: 'syd', city: 'Sydney', region: 'Oceania', lon: 151.2, lat: -33.9, label: 'left' },
];

/** The visitor whose traffic is rerouted. Not a real person, not a real place. */
export const EXAMPLE_VISITOR: Place = { lon: -46.6, lat: -23.5 };
