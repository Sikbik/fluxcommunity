/**
 * The current time on a shared ticker (`lib/ticker`), re-rendering every `ms`.
 *
 * Same job as the design system's `useNow`, with one difference that matters when a component is
 * the ONLY subscriber to its interval: the subscribe function here is stable. `useNow` builds a
 * new one every render, so uSES unsubscribes and resubscribes each time, the interval stops and
 * restarts, restarting refreshes the timestamp, and a changed snapshot renders again, forever.
 * (Reported to the design-system owner; this is the workaround for the overlays.)
 */
import { useSyncExternalStore } from 'react';
import { subscribeTicker, tickerNow } from '@/lib/ticker';

interface Bound {
  subscribe: (onChange: () => void) => () => void;
  snapshot: () => number;
}

const bound = new Map<number, Bound>();

function forInterval(ms: number): Bound {
  let b = bound.get(ms);
  if (!b) {
    b = { subscribe: (onChange) => subscribeTicker(ms, onChange), snapshot: () => tickerNow(ms) };
    bound.set(ms, b);
  }
  return b;
}

/** Epoch ms, changing every `ms` while the tab is visible. */
export function useTick(ms = 1000): number {
  const b = forInterval(ms);
  return useSyncExternalStore(b.subscribe, b.snapshot, b.snapshot);
}
