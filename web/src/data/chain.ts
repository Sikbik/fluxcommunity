/**
 * The chain tip as seen from live observations, and the rule for when a "block landed" pulse is
 * allowed to fire. Pure state machine: no timers, no store, no bus.
 *
 * Only LIVE observations are fed in. Baked fallback numbers never reach the tracker, so the
 * fallback height can never be mistaken for an old tip that the first real response then
 * "advances" past (which would fire a bogus pulse).
 */

export interface ChainTip {
  height: number;
  /** Client-clock epoch ms of the block header (skew corrected). Null when the source had no time. */
  at: number | null;
  /** Client clock when this tip (or the same height) was last confirmed by live data. */
  confirmedAt: number;
}

export type Observation = 'init' | 'advanced' | 'same' | 'reset' | 'ignored';

export interface ObserveInput {
  height: number;
  /** Header time on the client clock, or null if unknown. */
  atMs: number | null;
  nowMs: number;
  /** False for hello and other resync observations: they update the tip but never fire a pulse. */
  allowBeat: boolean;
}

export interface ObserveResult {
  kind: Observation;
  tip: ChainTip;
  /** True when exactly one block pulse should fire for this observation. */
  beat: boolean;
}

/** A tip this far below the known one is a reset (different server state), not a reorg. */
const RESET_DEPTH = 10;

export interface ChainTracker {
  observe(input: ObserveInput): ObserveResult;
  tip(): ChainTip | null;
  /** Whether the last confirmation is recent enough to call the clock live. */
  isLive(nowMs: number, windowMs: number): boolean;
  clear(): void;
}

export function createChainTracker(intervalMs = 30_000): ChainTracker {
  let tip: ChainTip | null = null;

  return {
    observe({ height, atMs, nowMs, allowBeat }) {
      if (tip === null) {
        tip = { height, at: atMs, confirmedAt: nowMs };
        return { kind: 'init', tip, beat: false };
      }
      if (height > tip.height) {
        tip = { height, at: atMs, confirmedAt: nowMs };
        // A block we only learn about long after it landed (tab was asleep) is not a beat.
        const fresh = atMs === null || nowMs - atMs <= intervalMs * 2;
        return { kind: 'advanced', tip, beat: allowBeat && fresh };
      }
      if (height === tip.height) {
        tip = { height, at: tip.at ?? atMs, confirmedAt: nowMs };
        return { kind: 'same', tip, beat: false };
      }
      if (tip.height - height >= RESET_DEPTH) {
        tip = { height, at: atMs, confirmedAt: nowMs };
        return { kind: 'reset', tip, beat: false };
      }
      return { kind: 'ignored', tip, beat: false };
    },
    tip: () => tip,
    isLive: (nowMs, windowMs) => tip !== null && nowMs - tip.confirmedAt < windowMs,
    clear() {
      tip = null;
    },
  };
}
