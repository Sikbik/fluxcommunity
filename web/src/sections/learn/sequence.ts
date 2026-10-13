/**
 * The player state machine for the explainer: when the sequence runs, and how the visitor's
 * actions change that. Pure and immutable, so every rule is a one-line test.
 *
 * Rules (brief: "pauses off-screen, on hover or focus and under reduced motion"):
 * - It never runs while off screen or under reduced motion.
 * - It pauses while the pointer is over it or focus is inside it, so what you are reading holds still.
 * - The visitor's own actions (a step button, Play) override that hover and focus pause for as long
 *   as they stay engaged; otherwise pressing "Place" would freeze on an empty map.
 * - Scrubbing and Pause hold until the visitor presses Play or a step.
 */
import { DURATION, STEPS, type StepId, stepIndexAt } from './timeline';

export interface PlayerState {
  /** Milliseconds into the timeline, 0 up to (not including) DURATION. */
  time: number;
  /** The visitor pressed Pause, or scrubbed. */
  userPaused: boolean;
  /** The pointer is over the explainer. */
  hovering: boolean;
  /** Keyboard focus is inside the explainer. */
  focused: boolean;
  /** At least part of the explainer is on screen. */
  inView: boolean;
  /** Reduced motion: nothing plays. */
  reduced: boolean;
  /** The visitor just drove it: hover and focus no longer hold it, until they leave. */
  driven: boolean;
}

export const INITIAL_PLAYER: PlayerState = {
  time: 0,
  userPaused: false,
  hovering: false,
  focused: false,
  inView: false,
  reduced: false,
  driven: false,
};

/** Why the clock is not advancing, or `none` when it is. The order is the order of precedence. */
export type HoldReason = 'none' | 'reduced' | 'offscreen' | 'user' | 'hover' | 'focus';

export function holdReason(s: PlayerState): HoldReason {
  if (s.reduced) return 'reduced';
  if (!s.inView) return 'offscreen';
  if (s.userPaused) return 'user';
  if (s.driven) return 'none';
  if (s.hovering) return 'hover';
  if (s.focused) return 'focus';
  return 'none';
}

/** True when the clock should advance. */
export function isRunning(s: PlayerState): boolean {
  return holdReason(s) === 'none';
}

/** Longest single step the clock will take, so a background tab does not skip ahead. */
export const MAX_FRAME_MS = 250;

export function advance(s: PlayerState, dtMs: number): PlayerState {
  if (!isRunning(s) || !(dtMs > 0)) return s;
  const next = s.time + Math.min(dtMs, MAX_FRAME_MS);
  return { ...s, time: next >= DURATION ? next % DURATION : next };
}

function clampTime(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(DURATION - 1, Math.max(0, t));
}

/** Scrubbing: move the playhead and hold there. */
export function seek(s: PlayerState, time: number): PlayerState {
  return { ...s, time: clampTime(time), userPaused: true, driven: false };
}

/** A step button: jump to the start of that step and play on from there. */
export function jumpToStep(s: PlayerState, id: StepId): PlayerState {
  const step = STEPS.find((x) => x.id === id);
  if (!step) return s;
  return { ...s, time: step.start, userPaused: false, driven: true };
}

/**
 * The Play / Pause button. It acts on what is actually happening: when the sequence is running it
 * pauses (and holds until Play), otherwise it plays and counts as driving it, so a hover that was
 * holding it still no longer does.
 */
export function toggleRunning(s: PlayerState): PlayerState {
  return isRunning(s) ? { ...s, userPaused: true, driven: false } : { ...s, userPaused: false, driven: true };
}

/** Engaged means hovering or focused; leaving both ends a driven run's immunity to them. */
function settle(s: PlayerState): PlayerState {
  return !s.hovering && !s.focused && s.driven ? { ...s, driven: false } : s;
}

export function setHovering(s: PlayerState, hovering: boolean): PlayerState {
  return s.hovering === hovering ? s : settle({ ...s, hovering });
}

export function setFocused(s: PlayerState, focused: boolean): PlayerState {
  return s.focused === focused ? s : settle({ ...s, focused });
}

export function setInView(s: PlayerState, inView: boolean): PlayerState {
  if (s.inView === inView) return s;
  // Coming back into view starts a driven run over: it was something the visitor did, long ago.
  return { ...s, inView, driven: inView ? s.driven : false };
}

export function setReduced(s: PlayerState, reduced: boolean): PlayerState {
  return s.reduced === reduced ? s : { ...s, reduced };
}

/** Screen-reader value text for the scrubber: "Step 2 of 3, Place". */
export function timelineText(time: number): string {
  const i = stepIndexAt(time);
  const step = STEPS[i];
  return `Step ${i + 1} of ${STEPS.length}, ${step?.title ?? ''}`;
}
