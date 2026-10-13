import { useEffect } from 'react';
import { useAllHealth } from '@/data';
import { useBuilds } from './state';

/**
 * Feeds the data layer's app health into the builds store. `useAllHealth` re-renders once a second
 * (its age ticks), so it lives here, in a component that renders nothing, and the rest of the section
 * reads the store and only wakes when the payload or its freshness actually changes.
 */
export function HealthBridge() {
  const { data, freshness } = useAllHealth();
  const apps = data ? data.apps : null;
  useEffect(() => {
    useBuilds.getState().setHealth(apps, freshness);
  }, [apps, freshness]);
  return null;
}
