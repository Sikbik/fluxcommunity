import { COMMUNITY_APPS } from '@shared/catalog';
import { useMemo, useRef } from 'react';
import { type AppEntry, buildEntries } from './model';
import { useBuilds } from './state';
import { useClock } from './useClock';

/** How often lifecycle is re-evaluated against the clock (a retirement can land at most this late). */
const LIFECYCLE_TICK_MS = 30_000;

/**
 * Every catalog app joined with its lifecycle and health. Entries keep their identity while nothing
 * visible about them changes, so memoised cells stay quiet between health snapshots.
 */
export function useEntries(): AppEntry[] {
  const byId = useBuilds((s) => s.health.byId);
  const ctx = useBuilds((s) => s.health.ctx);
  const now = useClock(LIFECYCLE_TICK_MS);
  const previous = useRef<AppEntry[]>([]);
  return useMemo(() => {
    const next = buildEntries(COMMUNITY_APPS, { byId, ctx }, now, previous.current);
    previous.current = next;
    return next;
  }, [byId, ctx, now]);
}
