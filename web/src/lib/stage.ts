/**
 * Small helpers for talking to the stage bus from the page.
 */
import { type Accent, type FocusRegion, useStageBus } from '@/stage/bus';
import { usePrefs } from './prefs';

const stack: Accent[] = [];

/** Pushes the accent the stage should wear right now: the top of the stack, else the visitor's choice. */
export function syncStageAccent(): void {
  const top = stack[stack.length - 1] ?? usePrefs.getState().accent;
  if (useStageBus.getState().accent !== top) useStageBus.getState().setAccent(top);
}

/**
 * Temporarily tints the STAGE (the lattice glow) with an accent, for example while a tier
 * ring is hovered. The page accent on `<html>` does not change. Returns a function that
 * restores the previous accent; calling it twice is harmless.
 */
export function pushStageAccent(accent: Accent): () => void {
  stack.push(accent);
  syncStageAccent();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = stack.lastIndexOf(accent);
    if (i >= 0) stack.splice(i, 1);
    syncStageAccent();
  };
}

/** A FocusRegion from an element's current viewport rectangle. */
export function regionFromElement(id: string, el: Element, strength = 0.6): FocusRegion {
  const r = el.getBoundingClientRect();
  return { id, x: r.left, y: r.top, w: r.width, h: r.height, strength };
}

/** Fires a click wave from a point, if the stage is listening. Harmless otherwise. */
export function fireClickPulse(x: number, y: number, strength = 0.7): void {
  useStageBus.getState().firePulse('click', x, y, strength);
}
