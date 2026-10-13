/**
 * The shape of the "how an app runs on Flux" sequence in time. One timeline of about 22 seconds in
 * three steps; every animated value in the scene is a pure function of a time on it, which is what
 * makes it scrubbable, pausable and testable.
 */
import { clamp01 } from '@/lib/math';

export type StepId = 'describe' | 'place' | 'run';

export interface StepSpan {
  id: StepId;
  /** Short name for the step buttons. */
  title: string;
  start: number;
  end: number;
}

export const STEPS: readonly StepSpan[] = [
  { id: 'describe', title: 'Describe', start: 0, end: 6_400 },
  { id: 'place', title: 'Place', start: 6_400, end: 12_600 },
  { id: 'run', title: 'Run', start: 12_600, end: 22_000 },
];

export const DURATION = 22_000;

/** A fully formed still of each step, for the poster frame and the reduced-motion triptych. */
export const STILL_AT: Readonly<Record<StepId, number>> = {
  describe: 5_900,
  place: 11_900,
  run: 20_800,
};

/**
 * Named moments, in milliseconds on the timeline. Pairs are [from, to]. They are grouped by step
 * and every one lies inside its step's span (a test keeps it that way).
 */
export const BEAT = {
  // ---- 1 Describe ----------------------------------------------------------------------------
  cardIn: [0, 700],
  /** The first field starts here, the next after `typeGap`, and each takes `typeDur` to type. */
  typeStart: 500,
  typeGap: 760,
  typeDur: 520,
  deployIn: [4_900, 5_300],
  deployPress: [5_600, 5_950],

  // ---- 2 Place -------------------------------------------------------------------------------
  /** The spec card docks to the left. */
  glide: [6_400, 7_500],
  /** The map is revealed by a wipe from the card's side. */
  mapReveal: [6_700, 8_300],
  /**
   * The network looks across many nodes: a line sweeps over the map from the card's side and each
   * candidate cell lights, steadily, as the line crosses it. Nothing blinks.
   */
  scan: [7_800, 9_200],
  /** The cells that were only considered dim away; the ones that win hold their light. */
  settle: [9_400, 10_600],
  /** Moment each of the three copies is picked: Frankfurt, Virginia, Singapore. */
  pick: [9_400, 10_200, 11_000],
  pickDur: 700,
  arcDur: 800,

  // ---- 3 Run ---------------------------------------------------------------------------------
  /** The spec card gives way to the status of the three instances. */
  statusIn: [12_600, 13_300],
  /** Each instance starts installing here and is running `installDur` later. */
  install: [13_000, 13_450, 13_900],
  installDur: 500,
  /** The one ring that leaves a node as it comes up; after it the node's light is steady. */
  onlineDur: 900,
  address: [13_400, 13_900],
  visitor: [14_300, 14_800],
  flowA: [14_800, 15_300],
  /** Virginia drops. */
  drop: [16_800, 17_400],
  /** Traffic finds a new path to Frankfurt. */
  reroute: [17_400, 18_200],
  stillUp: [18_200, 18_700],
  /** The network starts a fresh copy in Sydney. */
  replace: [18_500, 19_200],
  replaceRunning: 19_700,
  /** The scene fades at the loop seam. */
  fadeOut: [21_500, 22_000],
  fadeIn: [0, 400],
} as const;

/** Where `t` sits between `a` and `b`, clamped to 0..1. */
export function seg(t: number, a: number, b: number): number {
  return b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a));
}

export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function stepIndexAt(t: number): number {
  const time = Math.max(0, t);
  for (let i = STEPS.length - 1; i >= 0; i--) {
    const s = STEPS[i];
    if (s && time >= s.start) return i;
  }
  return 0;
}

export function stepAt(t: number): StepSpan {
  return STEPS[stepIndexAt(t)] ?? (STEPS[0] as StepSpan);
}

/** 0..1 through the step that `t` is in. */
export function stepProgress(t: number): number {
  const s = stepAt(t);
  return seg(t, s.start, s.end);
}
