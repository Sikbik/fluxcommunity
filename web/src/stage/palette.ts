// Stage colours, in linear light. The page picks an accent; the stage crossfades to its palette over
// about 600 ms. The symbol itself never takes a tier colour: it always uses the Flux blue edge.

import type { Accent } from './bus';
import { damp } from './math';

export type RGB = readonly [number, number, number];

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0xRRGGBB (sRGB) to linear RGB. */
export function hexToLinear(hex: number): [number, number, number] {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

export interface AccentPalette {
  /** The accent itself, for structure. */
  base: RGB;
  /** Brighter, for emission and active edges. */
  hot: RGB;
  /** Near white with a hint of the hue, for white-hot peaks. */
  core: RGB;
  /** Horizon haze: the fog the lattice fades into. */
  haze: RGB;
}

function palette(base: number, hot: number, core: number, haze: number): AccentPalette {
  return { base: hexToLinear(base), hot: hexToLinear(hot), core: hexToLinear(core), haze: hexToLinear(haze) };
}

export const ACCENTS: Record<Accent, AccentPalette> = {
  flux: palette(0x2b61d1, 0x3f7bff, 0xc4d8ff, 0x0a2062),
  cumulus: palette(0x36d3ff, 0x6fe2ff, 0xd2f6ff, 0x05384c),
  nimbus: palette(0xc77dff, 0xdba2ff, 0xf1defe, 0x2e1356),
  stratus: palette(0xffc857, 0xffd985, 0xffefc8, 0x4d3406),
};

/** Tint slots shared with the shaders (see TINT in pulses.ts). */
export const TINT_COLOURS: RGB[] = [
  hexToLinear(0x4f86ff), // accent-hot placeholder, replaced by the live accent
  hexToLinear(0xeaf2ff), // white-hot
  hexToLinear(0xff9a3d), // warn amber
  hexToLinear(0x36d3ff), // cumulus
  hexToLinear(0xc77dff), // nimbus
  hexToLinear(0xffc857), // stratus
];

/** The Flux blue the symbol edge always uses, boosted for emission. */
export const SYMBOL_EDGE: RGB = hexToLinear(0x2f6bff);

export const FLUX_BASE: RGB = ACCENTS.flux.base;

const KEYS = ['base', 'hot', 'core', 'haze'] as const;

/** Crossfades between accent palettes. About 95 percent in `seconds`. */
export class AccentBlender {
  readonly current: Record<(typeof KEYS)[number], [number, number, number]>;
  private lambda: number;
  private target: Accent;

  constructor(initial: Accent, seconds = 0.6) {
    const p = ACCENTS[initial];
    this.current = {
      base: [...p.base],
      hot: [...p.hot],
      core: [...p.core],
      haze: [...p.haze],
    };
    this.target = initial;
    this.lambda = Math.log(20) / seconds;
  }

  setTarget(accent: Accent): void {
    this.target = accent;
  }

  /** Moves toward the target; returns true while still moving. */
  step(dt: number, instant = false): boolean {
    const t = ACCENTS[this.target];
    let moving = false;
    for (const k of KEYS) {
      const cur = this.current[k];
      const tgt = t[k];
      for (let i = 0; i < 3; i++) {
        const v = instant ? tgt[i]! : damp(cur[i]!, tgt[i]!, this.lambda, dt);
        if (Math.abs(v - tgt[i]!) > 1e-4) moving = true;
        cur[i] = v;
      }
    }
    return moving;
  }
}
