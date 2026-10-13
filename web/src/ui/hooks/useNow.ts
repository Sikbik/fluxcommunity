import { useCallback, useSyncExternalStore } from 'react';
import { subscribeTicker, tickerNow } from '@/lib/ticker';

/**
 * The current time in epoch ms, re-rendering every `ms` (default 1000). One shared
 * interval per distinct `ms`, paused while the tab is hidden.
 */
export function useNow(ms = 1000): number {
  // Stable function identities: a fresh `subscribe` every render makes React resubscribe on every
  // commit, which (as the only subscriber) restarted the ticker and looped.
  const subscribe = useCallback((onChange: () => void) => subscribeTicker(ms, onChange), [ms]);
  const snapshot = useCallback(() => tickerNow(ms), [ms]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
