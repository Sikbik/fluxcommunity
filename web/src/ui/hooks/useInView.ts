import { type RefObject, useEffect, useState } from 'react';
import { observe } from '../internal/observer';

export interface InViewOptions {
  /** Stop observing after the first time it is in view. Default false. */
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
}

/** Whether the referenced element intersects the viewport. */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { once = false, rootMargin = '0px', threshold = 0 }: InViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    let stop = () => {};
    stop = observe(
      el,
      (entry) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) stop();
      },
      { rootMargin, threshold },
    );
    return () => stop();
  }, [ref, once, rootMargin, threshold]);
  return inView;
}
