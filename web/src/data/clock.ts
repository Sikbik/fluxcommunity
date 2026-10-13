/**
 * Environment seam and the one shared one-second ticker.
 *
 * Everything in the data layer that needs "the page is hidden", "the browser went offline" or "a
 * second passed" goes through here, so it can be driven by fakes in tests and so there is exactly
 * one interval in the whole app no matter how many hooks are mounted.
 */

/** What the data layer needs to know about the page it runs in. */
export interface Env {
  isHidden(): boolean;
  isOnline(): boolean;
  /** Fires when `document.hidden` may have changed. Returns an unsubscribe function. */
  onVisibility(cb: () => void): () => void;
  /** Fires on the window `online` and `offline` events. Returns an unsubscribe function. */
  onOnline(cb: (online: boolean) => void): () => void;
}

/** The real browser environment, tolerant of running without a DOM (tests, SSR). */
export function browserEnv(): Env {
  const hasDoc = typeof document !== 'undefined';
  const hasWin = typeof window !== 'undefined';
  return {
    isHidden: () => (hasDoc ? document.hidden : false),
    isOnline: () => (typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true),
    onVisibility(cb) {
      if (!hasDoc) return () => {};
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    onOnline(cb) {
      if (!hasWin) return () => {};
      const on = () => cb(true);
      const off = () => cb(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => {
        window.removeEventListener('online', on);
        window.removeEventListener('offline', off);
      };
    },
  };
}

export type TickListener = (nowMs: number, tick: number) => void;

export interface Ticker {
  /** Runs the listener once a second while at least one listener exists and the page is visible. */
  subscribe(listener: TickListener): () => void;
  /** Number of ticks fired so far. Part of the cache key for time-derived snapshots. */
  tickCount(): number;
  /** Number of live listeners (diagnostics and tests). */
  size(): number;
}

/**
 * A refcounted interval. It starts with the first subscriber, stops with the last, pauses while the
 * page is hidden and fires an immediate catch-up tick when the page becomes visible again.
 */
export function createTicker(env: Env, intervalMs = 1000): Ticker {
  const listeners = new Set<TickListener>();
  let handle: ReturnType<typeof setInterval> | null = null;
  let unVisibility: (() => void) | null = null;
  let count = 0;

  const fire = () => {
    count += 1;
    const now = Date.now();
    for (const l of [...listeners]) l(now, count);
  };
  const startInterval = () => {
    if (handle === null) handle = setInterval(fire, intervalMs);
  };
  const stopInterval = () => {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  };
  const onVisibility = () => {
    if (env.isHidden()) {
      stopInterval();
    } else if (listeners.size > 0 && handle === null) {
      fire();
      startInterval();
    }
  };
  const activate = () => {
    unVisibility = env.onVisibility(onVisibility);
    if (!env.isHidden()) startInterval();
  };
  const deactivate = () => {
    stopInterval();
    unVisibility?.();
    unVisibility = null;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) activate();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        listeners.delete(listener);
        if (listeners.size === 0) deactivate();
      };
    },
    tickCount: () => count,
    size: () => listeners.size,
  };
}

let shared: Ticker | null = null;

/** The one ticker the whole app shares. Created on first use, never at import time. */
export function getSharedTicker(): Ticker {
  if (!shared) shared = createTicker(browserEnv());
  return shared;
}
