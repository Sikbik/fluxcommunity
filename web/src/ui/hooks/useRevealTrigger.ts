import { type RefObject, useEffect, useState } from 'react';
import { observe } from '../internal/observer';

export interface RevealTriggerOptions {
  /** Reveal on mount (next frame) without waiting for the viewport. For above-the-fold content. */
  immediate?: boolean;
  /** Reveal again every time it re-enters. Default false (once). */
  repeat?: boolean;
  /** Bottom inset of the viewport, as a percentage, before an element counts as arrived. Default 8. */
  inset?: number;
  /** Hold the reveal (for example while the intro plays). Default false. */
  hold?: boolean;
}

/**
 * True once the element has entered the viewport (a little above the bottom edge, so a
 * tall element still triggers). Shared by Reveal and SplitReveal.
 */
export function useRevealTrigger(
  ref: RefObject<Element | null>,
  { immediate = false, repeat = false, inset = 8, hold = false }: RevealTriggerOptions = {},
): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hold) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    if (immediate) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    let stop = () => {};
    stop = observe(
      el,
      (entry) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (!repeat) stop();
        } else if (repeat) {
          setShown(false);
        }
      },
      { rootMargin: `0px 0px -${inset}% 0px`, threshold: 0 },
    );
    return () => stop();
  }, [ref, immediate, repeat, inset, hold]);

  return shown;
}
