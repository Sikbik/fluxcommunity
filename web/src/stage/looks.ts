// The section look presets: one table, easy to tune. A look is a plain bag of numbers (camera height,
// pitch and field of view, how bright and how busy the lattice is, how strong the post is). The stage
// eases between looks with a critically damped spring over roughly 1.2 s, and the camera dollies a
// little with page scroll on top.
//
// Rules of thumb used in the table:
//   hero       bright, close and low: awe. The symbol and the horizon glow carry the frame.
//   play       a touch more energy: faster waves, a stronger lift.
//   dense      builds, hosting, learn: the camera rises and looks down, the lattice dims and stills so
//              body text and cards keep their contrast.
//   ambient    the cinematic screensaver preset: bloom and aberration up, the symbol small and steady.

import type { SectionId } from './bus';
import { lerp, smoothDamp, type Velocity } from './math';

export interface Look {
  /** Camera height above the lattice plane, world units. */
  height: number;
  /** Camera pitch in degrees, positive looks up. */
  pitch: number;
  /** Vertical field of view in degrees (landscape). */
  fov: number;
  /** Lattice emission scale. */
  glow: number;
  /** Final exposure: this is the main "dim behind dense content" control. */
  exposure: number;
  bloom: number;
  chroma: number;
  vignette: number;
  /** Fog scale multiplier; below 1 is denser. */
  fog: number;
  dust: number;
  /** Idle motion and wave speed multiplier. */
  motion: number;
  /** Cursor and pulse lift multiplier. */
  lift: number;
  /** Horizon haze strength. */
  haze: number;
  /** Symbol presence (brightness). 0 hides it. */
  symbol: number;
  /** Light pool under the symbol. */
  pool: number;
  /** World units the page scroll dolly moves the camera over the whole page. */
  travel: number;
  /** Pointer parallax multiplier. */
  parallax: number;
  /** How far the cells stand proud of each other (the static skyline of the field). */
  relief: number;
}

export const LOOK_KEYS = [
  'height',
  'pitch',
  'fov',
  'glow',
  'exposure',
  'bloom',
  'chroma',
  'vignette',
  'fog',
  'dust',
  'motion',
  'lift',
  'haze',
  'symbol',
  'pool',
  'travel',
  'parallax',
  'relief',
] as const satisfies readonly (keyof Look)[];

const HERO: Look = {
  height: 2.5,
  pitch: 3.4,
  fov: 36,
  glow: 1,
  exposure: 1,
  bloom: 1,
  chroma: 1,
  vignette: 1,
  fog: 1,
  dust: 1,
  motion: 1,
  lift: 1,
  haze: 1,
  symbol: 1,
  pool: 1,
  travel: 30,
  parallax: 1,
  relief: 1,
};

function derive(base: Look, over: Partial<Look>): Look {
  return { ...base, ...over };
}

export const LOOKS: Record<SectionId, Look> = {
  hero: HERO,
  pulse: derive(HERO, {
    height: 3.4,
    pitch: -1,
    fov: 38,
    glow: 0.72,
    exposure: 0.8,
    bloom: 0.85,
    motion: 0.85,
    lift: 0.8,
    haze: 0.85,
    symbol: 0.85,
    pool: 0.7,
    parallax: 0.7,
    relief: 0.8,
  }),
  gateways: derive(HERO, {
    height: 3.2,
    pitch: -2,
    fov: 38,
    glow: 0.7,
    exposure: 0.78,
    bloom: 0.85,
    motion: 0.9,
    lift: 0.85,
    haze: 0.8,
    symbol: 0.8,
    pool: 0.6,
    parallax: 0.7,
    relief: 0.75,
  }),
  builds: derive(HERO, {
    height: 5.4,
    pitch: -15,
    fov: 42,
    glow: 0.5,
    exposure: 0.54,
    bloom: 0.55,
    chroma: 0.6,
    vignette: 1.15,
    fog: 0.9,
    dust: 0.45,
    motion: 0.55,
    lift: 0.5,
    haze: 0.55,
    symbol: 0.6,
    pool: 0.3,
    parallax: 0.4,
    relief: 0.4,
  }),
  hosting: derive(HERO, {
    height: 5,
    pitch: -13,
    fov: 42,
    glow: 0.55,
    exposure: 0.58,
    bloom: 0.6,
    chroma: 0.65,
    vignette: 1.1,
    fog: 0.92,
    dust: 0.5,
    motion: 0.6,
    lift: 0.55,
    haze: 0.6,
    symbol: 0.6,
    pool: 0.3,
    parallax: 0.45,
    relief: 0.45,
  }),
  play: derive(HERO, {
    height: 2.9,
    pitch: 0.5,
    fov: 40,
    glow: 0.95,
    exposure: 0.92,
    bloom: 1.1,
    chroma: 1.15,
    motion: 1.45,
    lift: 1.25,
    haze: 0.95,
    symbol: 0.8,
    pool: 0.8,
    parallax: 1,
    relief: 1.15,
  }),
  learn: derive(HERO, {
    height: 5.8,
    pitch: -17,
    fov: 44,
    glow: 0.46,
    exposure: 0.5,
    bloom: 0.5,
    chroma: 0.55,
    vignette: 1.2,
    fog: 0.88,
    dust: 0.4,
    motion: 0.5,
    lift: 0.45,
    haze: 0.5,
    symbol: 0.55,
    pool: 0.25,
    parallax: 0.35,
    relief: 0.35,
  }),
  community: derive(HERO, {
    height: 3.3,
    pitch: 0.5,
    fov: 38,
    glow: 0.78,
    exposure: 0.8,
    bloom: 0.9,
    motion: 0.85,
    lift: 0.85,
    haze: 0.85,
    symbol: 0.8,
    pool: 0.7,
    parallax: 0.8,
    relief: 0.8,
  }),
};

/** The cinematic screensaver preset. Combined with the tunnel pass by the engine. */
export const AMBIENT_LOOK: Look = derive(HERO, {
  height: 2.2,
  pitch: 0,
  fov: 62,
  glow: 1,
  exposure: 1.02,
  bloom: 1.5,
  chroma: 2.2,
  vignette: 1.15,
  fog: 1,
  dust: 0.8,
  motion: 1,
  lift: 0,
  haze: 0.7,
  symbol: 1,
  pool: 0,
  travel: 0,
  parallax: 0.35,
  relief: 0,
});

/** Reduced motion: a still, dim variant of the ambient look. */
export const AMBIENT_STILL_LOOK: Look = derive(AMBIENT_LOOK, {
  exposure: 0.62,
  bloom: 1,
  chroma: 0.9,
  dust: 0.3,
  motion: 0,
  parallax: 0,
});

export function lookFor(section: SectionId): Look {
  return LOOKS[section] ?? HERO;
}

export function blendLooks(a: Look, b: Look, t: number, out: Look = { ...a }): Look {
  for (const k of LOOK_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

/**
 * Eases a look toward a target with a critically damped spring per field. A `smoothTime` of 0.45 s
 * covers 95 percent of the distance in about 1.1 s (and 99 percent in 1.8 s) with no overshoot and a
 * continuous velocity, so a new section mid-transition just bends the path.
 */
export class LookSmoother {
  readonly value: Look;
  private readonly vel: Record<keyof Look, Velocity>;

  constructor(
    initial: Look,
    public smoothTime = 0.45,
  ) {
    this.value = { ...initial };
    const v = {} as Record<keyof Look, Velocity>;
    for (const k of LOOK_KEYS) v[k] = { v: 0 };
    this.vel = v;
  }

  step(target: Look, dt: number): Look {
    for (const k of LOOK_KEYS)
      this.value[k] = smoothDamp(this.value[k], target[k], this.vel[k], this.smoothTime, dt);
    return this.value;
  }

  snap(target: Look): Look {
    for (const k of LOOK_KEYS) {
      this.value[k] = target[k];
      this.vel[k].v = 0;
    }
    return this.value;
  }
}
