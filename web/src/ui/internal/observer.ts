/**
 * Shared IntersectionObserver instances, one per (rootMargin, threshold) pair, so a
 * page with hundreds of reveal targets still has a handful of observers.
 */
type Callback = (entry: IntersectionObserverEntry) => void;

interface Shared {
  io: IntersectionObserver;
  callbacks: Map<Element, Set<Callback>>;
}

const pool = new Map<string, Shared>();

function get(rootMargin: string, threshold: number): Shared {
  const key = `${rootMargin}|${threshold}`;
  let shared = pool.get(key);
  if (!shared) {
    const callbacks = new Map<Element, Set<Callback>>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const set = callbacks.get(entry.target);
          if (set) for (const cb of [...set]) cb(entry);
        }
      },
      { rootMargin, threshold },
    );
    shared = { io, callbacks };
    pool.set(key, shared);
  }
  return shared;
}

/** Observes an element. Returns an unobserve function. A no-op where IntersectionObserver is missing. */
export function observe(
  el: Element,
  callback: Callback,
  { rootMargin = '0px', threshold = 0 }: { rootMargin?: string; threshold?: number } = {},
): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const shared = get(rootMargin, threshold);
  let set = shared.callbacks.get(el);
  if (!set) {
    set = new Set();
    shared.callbacks.set(el, set);
    shared.io.observe(el);
  }
  set.add(callback);
  return () => {
    const s = shared.callbacks.get(el);
    if (!s) return;
    s.delete(callback);
    if (s.size === 0) {
      shared.callbacks.delete(el);
      shared.io.unobserve(el);
    }
  };
}
