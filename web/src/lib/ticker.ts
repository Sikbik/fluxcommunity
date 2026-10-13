/**
 * Shared interval tickers. Many components want "the current time, every second":
 * each distinct interval gets exactly one setInterval, shared by every subscriber,
 * paused while the tab is hidden and stopped when nobody listens.
 */

interface TickerRecord {
  now: number;
  listeners: Set<() => void>;
  id: number | null;
}

const tickers = new Map<number, TickerRecord>();

function record(ms: number): TickerRecord {
  let r = tickers.get(ms);
  if (!r) {
    r = { now: Date.now(), listeners: new Set(), id: null };
    tickers.set(ms, r);
  }
  return r;
}

function start(ms: number, r: TickerRecord): void {
  if (r.id != null || typeof window === 'undefined') return;
  // Refresh the snapshot only when it is stale. A consumer that unsubscribes and resubscribes inside
  // one interval (React does so whenever a `subscribe` function changes identity) must not see the
  // value change underneath it: it would re-render, resubscribe and loop.
  const t = Date.now();
  if (t - r.now >= ms) r.now = t;
  r.id = window.setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    r.now = Date.now();
    for (const l of r.listeners) l();
  }, ms);
}

/** Subscribes to a shared ticker. Returns the unsubscribe function. */
export function subscribeTicker(ms: number, listener: () => void): () => void {
  const r = record(ms);
  r.listeners.add(listener);
  start(ms, r);
  return () => {
    r.listeners.delete(listener);
    if (r.listeners.size === 0 && r.id != null) {
      window.clearInterval(r.id);
      r.id = null;
    }
  };
}

/** The ticker's current timestamp. Stable between ticks, so it is a valid external-store snapshot. */
export function tickerNow(ms: number): number {
  return record(ms).now;
}

/** Test helper: number of live intervals. */
export function activeTickers(): number {
  let n = 0;
  for (const r of tickers.values()) if (r.id != null) n++;
  return n;
}
