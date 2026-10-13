import { type RefObject, useLayoutEffect, useState } from 'react';

/** How many columns a CSS grid currently has, read from its computed `grid-template-columns`. */
export function useColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns;
      const n = tracks && tracks !== 'none' ? tracks.split(' ').filter(Boolean).length : 1;
      setColumns((prev) => (prev === n ? prev : Math.max(1, n)));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return columns;
}
