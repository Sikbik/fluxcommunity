// The quality governor: a pure state machine fed one frame time per drawn frame. It keeps an
// exponential moving average of the frame time and moves the tier with hysteresis: down after about
// two seconds under 45 fps, up after about six seconds over 58 fps, one step at a time, never above the
// ceiling. Stalls (a gap far longer than a frame: a hidden tab, a locked screen) are not evidence either
// way, and a tier that bounces (up, then straight back down) waits longer before the next attempt.
//
// No browser APIs here, so it is unit tested in node. `pickStartTier` and `parseTierQuery` hold the
// policy for where to begin and for the `?q=` override.

import type { QualityTier } from './bus';

export type ActiveTier = 1 | 2 | 3;

export interface GovernorOptions {
  start: ActiveTier;
  ceiling?: ActiveTier;
  floor?: ActiveTier;
  /** Below this smoothed fps the clock for stepping down runs. */
  downFps?: number;
  downSeconds?: number;
  /** Above this smoothed fps the clock for stepping up runs. */
  upFps?: number;
  upSeconds?: number;
  /** Frames this soon after start (shader compilation, first uploads) are ignored. */
  warmupSeconds?: number;
  /** A gap longer than this is a stall, not a slow frame. */
  stallSeconds?: number;
  /** Quiet time after any change before new evidence counts. */
  settleSeconds?: number;
  /** Smoothing time constant of the frame time average. */
  emaSeconds?: number;
  /** A forced tier (`?q=`): the governor reports it and never moves. */
  locked?: boolean;
}

const DEFAULTS = {
  downFps: 45,
  downSeconds: 2,
  upFps: 58,
  upSeconds: 6,
  warmupSeconds: 1.5,
  stallSeconds: 0.25,
  settleSeconds: 0.8,
  emaSeconds: 0.35,
} as const;

/** A step down this soon after a step up is a bounce and doubles the wait for the next step up. */
const BOUNCE_SECONDS = 20;
const MAX_PENALTY = 8;
const SEVERE_FPS = 24;
const SEVERE_SECONDS = 1;

export class Governor {
  tier: ActiveTier;
  ceiling: ActiveTier;
  floor: ActiveTier;
  locked: boolean;
  /** Smoothed frame time, seconds (0 until the first real frame). */
  ema = 0;
  private readonly o: Required<Omit<GovernorOptions, 'start' | 'ceiling' | 'floor' | 'locked'>>;
  private clock = 0;
  private quiet = 0;
  private below = 0;
  private above = 0;
  private penalty = 1;
  private lastUp = Number.NEGATIVE_INFINITY;

  constructor(opts: GovernorOptions) {
    this.tier = opts.start;
    this.ceiling = opts.ceiling ?? 3;
    this.floor = opts.floor ?? 1;
    this.locked = opts.locked ?? false;
    this.o = {
      downFps: opts.downFps ?? DEFAULTS.downFps,
      downSeconds: opts.downSeconds ?? DEFAULTS.downSeconds,
      upFps: opts.upFps ?? DEFAULTS.upFps,
      upSeconds: opts.upSeconds ?? DEFAULTS.upSeconds,
      warmupSeconds: opts.warmupSeconds ?? DEFAULTS.warmupSeconds,
      stallSeconds: opts.stallSeconds ?? DEFAULTS.stallSeconds,
      settleSeconds: opts.settleSeconds ?? DEFAULTS.settleSeconds,
      emaSeconds: opts.emaSeconds ?? DEFAULTS.emaSeconds,
    };
    this.quiet = this.o.warmupSeconds;
  }

  /** Smoothed frames per second, 0 before any evidence. */
  get fps(): number {
    return this.ema > 0 ? 1 / this.ema : 0;
  }

  /** Feed one drawn frame that took `dt` seconds. Returns the new tier when it changed, else null. */
  frame(dt: number): ActiveTier | null {
    if (!(dt > 0)) return null;
    this.clock += dt;
    if (dt > this.o.stallSeconds) {
      // Not drawing is not evidence; what came before the gap is stale.
      this.below = 0;
      this.above = 0;
      this.quiet = Math.max(this.quiet, 0.4);
      return null;
    }
    if (this.quiet > 0) {
      this.quiet -= dt;
      // Keep the average honest while we wait, but do not collect evidence.
      this.ema = this.ema > 0 ? this.ema + (dt - this.ema) * 0.25 : dt;
      return null;
    }
    const a = 1 - Math.exp(-dt / this.o.emaSeconds);
    this.ema = this.ema > 0 ? this.ema + (dt - this.ema) * a : dt;
    if (this.locked) return null;

    const fps = 1 / this.ema;
    if (fps < this.o.downFps) {
      this.below += dt;
      this.above = 0;
    } else {
      this.below = Math.max(0, this.below - dt * 2);
      this.above = fps > this.o.upFps ? this.above + dt : 0;
    }

    if (this.tier > this.floor) {
      const severe = fps < SEVERE_FPS && this.below >= SEVERE_SECONDS;
      if (this.below >= this.o.downSeconds || severe) {
        const steps = severe && this.tier - 2 >= this.floor ? 2 : 1;
        this.tier = (this.tier - steps) as ActiveTier;
        if (this.clock - this.lastUp < BOUNCE_SECONDS) this.penalty = Math.min(MAX_PENALTY, this.penalty * 2);
        return this.changed();
      }
    }
    if (this.tier < this.ceiling && this.above >= this.o.upSeconds * this.penalty) {
      this.tier = (this.tier + 1) as ActiveTier;
      this.lastUp = this.clock;
      return this.changed();
    }
    return null;
  }

  /** Jump to a tier (clamped to floor and ceiling) and forget the evidence. */
  force(tier: ActiveTier): ActiveTier {
    this.tier = Math.min(this.ceiling, Math.max(this.floor, tier)) as ActiveTier;
    return this.changed();
  }

  private changed(): ActiveTier {
    this.below = 0;
    this.above = 0;
    this.quiet = this.o.settleSeconds;
    this.ema = 0;
    return this.tier;
  }
}

export interface DeviceHints {
  /** Phone or tablet class device (coarse pointer, mobile UA). */
  mobile: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB, when exposed. */
  deviceMemory?: number;
  cores?: number;
}

export interface TierPlan {
  start: ActiveTier;
  ceiling: ActiveTier;
}

/** Where to begin and how high the governor may climb. Low-end devices start at 1 and may reach 2. */
export function pickStartTier(h: DeviceHints): TierPlan {
  if (h.mobile || h.saveData || (h.deviceMemory !== undefined && h.deviceMemory <= 4)) {
    return { start: 1, ceiling: 2 };
  }
  if (h.cores !== undefined && h.cores <= 4) return { start: 2, ceiling: 3 };
  return { start: 3, ceiling: 3 };
}

/** `?q=low|medium|high|none` (also 0..3). Returns null when absent or unrecognised. */
export function parseTierQuery(search: string): QualityTier | null {
  const q = new URLSearchParams(search).get('q');
  if (q === null) return null;
  switch (q.toLowerCase()) {
    case 'none':
    case 'off':
    case '0':
      return 0;
    case 'low':
    case '1':
      return 1;
    case 'medium':
    case 'med':
    case '2':
      return 2;
    case 'high':
    case '3':
      return 3;
    default:
      return null;
  }
}
