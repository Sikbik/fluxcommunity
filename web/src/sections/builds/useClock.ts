import { useSyncExternalStore } from 'react';
import { subscribeTicker, tickerNow } from '@/lib/ticker';

export interface Source {
  subscribe: (onChange: () => void) => () => void;
  snapshot: () => number;
}

const sources = new Map<number, Source>();

export function sourceFor(ms: number): Source {
  let s = sources.get(ms);
  if (!s) {
    s = {
      subscribe: (onChange) => subscribeTicker(ms, onChange),
      snapshot: () => tickerNow(ms),
    };
    sources.set(ms, s);
  }
  return s;
}

/**
 * The current time in epoch ms, re-rendering every `ms` on the shared ticker. The same contract as
 * `useNow` from the design system, with one difference that matters when a page holds many
 * consumers: the subscribe function keeps its identity between renders, so React does not tear the
 * subscription down and up on every render (which, with a dozen consumers, never settles).
 */
export function useClock(ms: number): number {
  const { subscribe, snapshot } = sourceFor(ms);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
