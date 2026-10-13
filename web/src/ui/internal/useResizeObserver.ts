import { type RefObject, useEffect, useRef } from 'react';

/**
 * Observing size without the "ResizeObserver loop completed with undelivered notifications" error.
 *
 * The browser raises that error (a `window` error event; Vite logs it as `[Unhandled error]`, a
 * Playwright audit sees a page error) when a ResizeObserver callback changes the size of something it
 * observes and the new notification cannot be delivered in the same frame. Measuring and writing
 * layout inside the callback is the cause. So the callback here does nothing but remember the entries
 * and ask for an animation frame; the work runs from that frame, outside the delivery step. Bursts
 * inside one frame collapse to one call.
 */

export type ResizeFrameCallback = (entries: readonly ResizeObserverEntry[]) => void;

export interface ResizeFrameOptions {
  /** Which box to observe. Default `content-box`. */
  box?: ResizeObserverBoxOptions;
  /**
   * Also call back once, synchronously, as soon as observation starts, with an empty `entries`
   * list: for the first measurement, which should not wait a frame. Default false.
   */
  immediate?: boolean;
}

/**
 * The framework-free core of `useResizeObserver`. Observes `targets` (null and undefined are
 * skipped) and calls `callback` at most once per animation frame with the newest entry of each
 * target that resized since the last call. Returns the function that stops it; after that the
 * callback is never called again.
 */
export function observeResize(
  targets: Iterable<Element | null | undefined>,
  callback: ResizeFrameCallback,
  { box, immediate = false }: ResizeFrameOptions = {},
): () => void {
  let disposed = false;
  if (immediate) callback([]);
  const elements: Element[] = [];
  for (const t of targets) if (t) elements.push(t);
  if (typeof ResizeObserver === 'undefined' || elements.length === 0) return () => {};

  const pending = new Map<Element, ResizeObserverEntry>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    if (disposed || pending.size === 0) return;
    const entries = [...pending.values()];
    pending.clear();
    callback(entries);
  };
  const observer = new ResizeObserver((batch) => {
    for (const entry of batch) pending.set(entry.target, entry);
    if (frame === 0 && !disposed) frame = requestAnimationFrame(flush);
  });
  for (const el of elements) observer.observe(el, box ? { box } : undefined);

  return () => {
    disposed = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    pending.clear();
    observer.disconnect();
  };
}

export interface ResizeObserverHookOptions extends ResizeFrameOptions {
  /** Observe only while true. Default true. */
  enabled?: boolean;
}

/**
 * Calls `callback` on the next animation frame after the element resizes, coalescing bursts, and
 * stops on unmount. Safe to measure layout and to set state in the callback: it never runs inside
 * the observer's own delivery step.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useResizeObserver(ref, () => setWidth(ref.current?.clientWidth ?? 0), { immediate: true });
 *
 * `target` is one ref or several. The elements are read when the effect runs (mount, and when
 * `enabled`, `box` or `immediate` change); the callback may change every render without
 * resubscribing.
 */
export function useResizeObserver(
  target: RefObject<Element | null> | readonly RefObject<Element | null>[],
  callback: ResizeFrameCallback,
  { box, immediate = false, enabled = true }: ResizeObserverHookOptions = {},
): void {
  const latest = useRef(callback);
  latest.current = callback;
  const targets = useRef(target);
  targets.current = target;

  useEffect(() => {
    if (!enabled) return;
    const t = targets.current;
    const refs: readonly RefObject<Element | null>[] = 'current' in t ? [t] : t;
    return observeResize(
      refs.map((r) => r.current),
      (entries) => latest.current(entries),
      { box, immediate },
    );
  }, [enabled, box, immediate]);
}
