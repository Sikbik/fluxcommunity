/**
 * The dot matrix itself: a triangular ("hex-offset") lattice of dots over the map box, each carrying
 * how much of its patch of the world is land, plus a light field that makes the dots under a cluster
 * glow in its tier colour. Pure maths over typed arrays; the canvas code only reads the results.
 */
import type { Placed } from './clusters';
import { type LandMask, landCoverage } from './mask';
import { degPerPx, type MapView } from './projection';

export interface Lattice {
  /** Horizontal distance between neighbours in a row, CSS px. */
  pitch: number;
  /** Distance between rows: pitch * sqrt(3) / 2. */
  rowHeight: number;
  count: number;
  cols: number;
  rows: number;
  x: Float32Array;
  y: Float32Array;
  /** Share (0..1) of the dot's patch that is land. */
  land: Float32Array;
}

const ROW_RATIO = Math.sqrt(3) / 2;

/**
 * How strongly clusters light their surroundings at a map width: 1 from about 800 px up, a little less
 * on a phone, where the same clusters are packed into a third of the pixels and would otherwise burn
 * out to white.
 */
export function lightGain(width: number): number {
  const t = Math.min(1, Math.max(0, (width - 320) / 480));
  return 0.72 + 0.28 * t;
}

/** A dot pitch that suits the map width: dense enough to keep coasts, sparse enough to read as dots. */
export function pitchFor(width: number): number {
  return Math.min(9, Math.max(4.5, width / 112));
}

/**
 * Lays dots on a triangular lattice that fills the view (odd rows shifted half a pitch) and samples
 * the land mask under each one. Row and column counts are deterministic for a given size.
 */
export function buildLattice(view: MapView, mask: LandMask, pitch = pitchFor(view.width)): Lattice {
  const rowHeight = pitch * ROW_RATIO;
  const cols = Math.max(1, Math.floor(view.width / pitch));
  const rows = Math.max(1, Math.floor(view.height / rowHeight));
  // Centre the lattice in the box so both margins match.
  const padX = (view.width - (cols - 1) * pitch - pitch / 2) / 2;
  const padY = (view.height - (rows - 1) * rowHeight) / 2;
  const count = cols * rows;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const land = new Float32Array(count);
  const dpp = degPerPx(view);
  const halfLon = (pitch / 2) * dpp;
  const halfLat = (rowHeight / 2) * dpp;
  const { lonMin, latMax } = view.bounds;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 1 ? pitch / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const px = padX + c * pitch + offset;
      const py = padY + r * rowHeight;
      x[i] = px;
      y[i] = py;
      const lon = lonMin + px * dpp;
      const lat = latMax - py * dpp;
      land[i] = landCoverage(mask, lon, lat, halfLon, halfLat, 3);
      i++;
    }
  }
  return { pitch, rowHeight, count, cols, rows, x, y, land };
}

/** Brightness bands the lit dots are drawn in: one batched fill per tier and band. */
export const LIT_EDGES = [0.05, 0.22, 0.45, 0.7, 0.88, 1.01] as const;
export const LIT_BANDS = LIT_EDGES.length - 1;

/** The band (0..LIT_BANDS-1) a brightness falls in, or -1 below the first edge (not lit). */
export function litBand(level: number): number {
  if (!(level >= LIT_EDGES[0])) return -1;
  for (let b = 0; b < LIT_BANDS; b++) if (level < (LIT_EDGES[b + 1] as number)) return b;
  return LIT_BANDS - 1;
}

export interface LightField {
  /** 0..1 brightness per dot. 0 means the dot is not lit by any cluster. */
  level: Float32Array;
  /** Which tier lights the dot most (index into [cumulus, nimbus, stratus]). */
  tier: Uint8Array;
  /** Number of lit dots (level above the threshold). */
  lit: number;
  /**
   * The lit dots grouped for drawing: `bins[tier * LIT_BANDS + band]` lists the lattice indexes in that
   * tier and brightness band, so a frame walks the few hundred lit dots instead of every dot.
   */
  bins: Uint32Array[];
}

const TIER_INDEX = { cumulus: 0, nimbus: 1, stratus: 2 } as const;

/**
 * Accumulates every cluster's gaussian glow into the lattice. Each dot keeps a brightness (a soft
 * saturation of the summed weights, so a dense metro goes white-hot without clipping the colour) and
 * the tier that contributed most, so Frankfurt reads cyan and Helsinki amber at a glance.
 */
export function lightLattice(lattice: Lattice, clusters: readonly Placed[], gain = 1): LightField {
  const level = new Float32Array(lattice.count);
  const tier = new Uint8Array(lattice.count);
  const best = new Float32Array(lattice.count);
  const acc = new Float32Array(lattice.count);
  for (const cl of clusters) {
    // Kernel radius follows the halo; weight follows the cluster's size (its radius, sub-linear).
    const radius = Math.max(cl.halo * 0.85, lattice.pitch * 1.1);
    const weight = (0.55 + Math.min(1.1, cl.core / 4)) * gain;
    const t = TIER_INDEX[cl.dominant];
    const r2 = radius * radius;
    const rowLo = Math.max(0, Math.floor((cl.y - radius) / lattice.rowHeight) - 1);
    const rowHi = Math.min(lattice.rows - 1, Math.ceil((cl.y + radius) / lattice.rowHeight) + 1);
    for (let r = rowLo; r <= rowHi; r++) {
      const colLo = Math.max(0, Math.floor((cl.x - radius) / lattice.pitch) - 1);
      const colHi = Math.min(lattice.cols - 1, Math.ceil((cl.x + radius) / lattice.pitch) + 1);
      for (let c = colLo; c <= colHi; c++) {
        const i = r * lattice.cols + c;
        const dx = (lattice.x[i] ?? 0) - cl.x;
        const dy = (lattice.y[i] ?? 0) - cl.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const k = weight * Math.exp((-2.2 * d2) / r2);
        acc[i] = (acc[i] ?? 0) + k;
        if (k > (best[i] ?? 0)) {
          best[i] = k;
          tier[i] = t;
        }
      }
    }
  }
  let lit = 0;
  const counts = new Uint32Array(3 * LIT_BANDS);
  const band = new Int8Array(lattice.count).fill(-1);
  for (let i = 0; i < lattice.count; i++) {
    const v = 1 - Math.exp(-(acc[i] ?? 0) * 1.35);
    level[i] = v;
    if (v > 0.06) lit++;
    const b = litBand(v);
    if (b >= 0) {
      band[i] = b;
      counts[(tier[i] as number) * LIT_BANDS + b] =
        (counts[(tier[i] as number) * LIT_BANDS + b] as number) + 1;
    }
  }
  const bins = Array.from(counts, (n) => new Uint32Array(n));
  const fill = new Uint32Array(3 * LIT_BANDS);
  for (let i = 0; i < lattice.count; i++) {
    const b = band[i] as number;
    if (b < 0) continue;
    const slot = (tier[i] as number) * LIT_BANDS + b;
    (bins[slot] as Uint32Array)[fill[slot] as number] = i;
    fill[slot] = (fill[slot] as number) + 1;
  }
  return { level, tier, lit, bins };
}

/** A fixed random-looking subset of the land dots that twinkle: indexes, with a phase and a speed each. */
export function pickTwinklers(
  lattice: Lattice,
  random: () => number,
  share = 0.045,
): { index: Uint32Array; phase: Float32Array; speed: Float32Array; level: Uint8Array } {
  const picked: number[] = [];
  for (let i = 0; i < lattice.count; i++) {
    if ((lattice.land[i] ?? 0) >= 0.5 && random() < share) picked.push(i);
  }
  const index = Uint32Array.from(picked);
  const phase = new Float32Array(picked.length);
  const speed = new Float32Array(picked.length);
  for (let k = 0; k < picked.length; k++) {
    phase[k] = random() * Math.PI * 2;
    speed[k] = 0.35 + random() * 0.9;
  }
  return { index, phase, speed, level: new Uint8Array(picked.length) };
}
