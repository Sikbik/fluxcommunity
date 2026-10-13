import { type RefObject, useLayoutEffect, useState } from 'react';
import { observeResize } from './useResizeObserver';

/**
 * Measures the active item of a tab-like list so a thumb can slide under it.
 * Returns `{ x, w, ready }` in px relative to the container's padding box.
 *
 * Re-measures when the selection moves (synchronously, so the thumb never lags a frame) and,
 * through `observeResize`, on the frame after the list or any child changes size. The measuring
 * never runs inside the ResizeObserver callback: it used to, and the thumb (a child it observed)
 * changed size as a result, which is what raises the "loop completed with undelivered
 * notifications" error.
 */
export function useSlider(
  container: RefObject<HTMLElement | null>,
  activeKey: string | null,
  selector = '[data-active="true"]',
): { x: number; w: number; ready: boolean } {
  const [box, setBox] = useState({ x: 0, w: 0, ready: false });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `activeKey` re-measures when the selection moves
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) {
        setBox((b) => (b.ready ? { ...b, ready: false } : b));
        return;
      }
      const next = { x: el.offsetLeft, w: el.offsetWidth, ready: true };
      setBox((b) => (b.x === next.x && b.w === next.w && b.ready ? b : next));
    };
    return observeResize([root, ...Array.from(root.children)], measure, { immediate: true });
  }, [container, activeKey, selector]);

  return box;
}
