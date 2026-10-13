/**
 * Pointer parallax maths. The art drifts OPPOSITE the pointer: pointer at the right edge of
 * a tile moves the art left. All values are unit coordinates (-1..1, 0 at the tile centre);
 * CSS multiplies them by the safe drift in px, so React never re-renders for a pointer move.
 */
import { damp } from '@/lib/math';

export interface Unit {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The pointer's position inside a rect as -1..1 per axis. Clamped; a zero-size rect is the centre. */
export function pointerToUnit(clientX: number, clientY: number, rect: RectLike): Unit {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((clientY - rect.top) / rect.height) * 2 - 1;
  return { x: clampUnit(x), y: clampUnit(y) };
}

export function clampUnit(n: number): number {
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

/** The CSS translate, in px, for a unit pointer position and a drift amplitude (opposite sign). */
export function driftOffset(unit: Unit, drift: Unit): Unit {
  return { x: -unit.x * drift.x, y: -unit.y * drift.y };
}

/** Below this the follower is considered at rest. */
export const REST_EPSILON = 0.002;

/**
 * One frame of a critically damped follower. Mutates `state` towards `target` and returns
 * true while it is still moving, so a rAF loop knows when it may stop.
 */
export function followStep(state: Unit, target: Unit, lambda: number, dt: number): boolean {
  state.x = damp(state.x, target.x, lambda, dt);
  state.y = damp(state.y, target.y, lambda, dt);
  const moving = Math.abs(state.x - target.x) > REST_EPSILON || Math.abs(state.y - target.y) > REST_EPSILON;
  if (!moving) {
    state.x = target.x;
    state.y = target.y;
  }
  return moving;
}
