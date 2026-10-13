import { useEffect, useSyncExternalStore } from 'react';
import { effectiveReducedMotion, startMotionSync, subscribeReducedMotion } from '@/lib/motion';

/**
 * True when motion should be calm: the visitor's explicit override when they set one,
 * otherwise the OS `prefers-reduced-motion`. The first use also mirrors the value to the
 * stage bus (`reducedMotion`) and to `html[data-motion]`.
 */
export function useReducedMotion(): boolean {
  useEffect(() => {
    startMotionSync();
  }, []);
  return useSyncExternalStore(subscribeReducedMotion, effectiveReducedMotion, () => false);
}
