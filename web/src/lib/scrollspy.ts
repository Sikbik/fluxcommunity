/**
 * Scroll-spy maths. Pure: the shell measures, these functions decide.
 *
 * Boxes are in DOCUMENT coordinates (rect.top + scrollY), sorted by `top`. The active
 * section is the last one whose top is at or above a focus line a fraction of the way down
 * the viewport, with the first and last section pinned at the document's ends.
 */
import { clamp01 } from './math';

export interface SectionBox {
  id: string;
  top: number;
  height: number;
}

export interface SpyResult {
  index: number;
  id: string;
  /** 0..1 through the active section: 0 when its top reaches the viewport top, 1 when its bottom does. */
  progress: number;
}

export const DEFAULT_FOCUS = 0.4;

export function pickActiveSection(
  boxes: readonly SectionBox[],
  scrollY: number,
  viewportH: number,
  docH: number,
  focus: number = DEFAULT_FOCUS,
): SpyResult | null {
  if (boxes.length === 0) return null;
  const last = boxes.length - 1;
  let index = 0;
  if (scrollY <= 1) {
    index = 0;
  } else if (scrollY + viewportH >= docH - 2) {
    index = last;
  } else {
    const focusY = scrollY + viewportH * focus;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box && box.top <= focusY) index = i;
    }
  }
  const box = boxes[index];
  if (!box) return null;
  return { index, id: box.id, progress: sectionProgress(box, scrollY) };
}

export function sectionProgress(box: SectionBox, scrollY: number): number {
  if (box.height <= 0) return 0;
  return clamp01((scrollY - box.top) / box.height);
}

export function pageProgress(scrollY: number, viewportH: number, docH: number): number {
  const range = docH - viewportH;
  return range <= 0 ? 0 : clamp01(scrollY / range);
}

/**
 * Smooths a signed scroll velocity (px/s). `dy` px over `dtMs` is the instantaneous
 * reading; `tauMs` is the smoothing time constant. Returns 0 below `epsilon` so the
 * value settles instead of decaying forever.
 */
export function smoothVelocity(prev: number, dy: number, dtMs: number, tauMs = 110, epsilon = 2): number {
  if (dtMs <= 0) return prev;
  const instant = (dy / dtMs) * 1000;
  const alpha = 1 - Math.exp(-dtMs / tauMs);
  const next = prev + (instant - prev) * alpha;
  return Math.abs(next) < epsilon ? 0 : next;
}
