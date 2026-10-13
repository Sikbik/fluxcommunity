/**
 * Reduced motion, resolved in one place. The effective value is the visitor's explicit
 * override when they set one, otherwise the OS preference. It is mirrored to the stage
 * bus and to `html[data-motion="reduced|full"]` so CSS and WebGL agree.
 */
import { useStageBus } from '@/stage/bus';
import { usePrefs } from './prefs';

const QUERY = '(prefers-reduced-motion: reduce)';

export function osPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

export function effectiveReducedMotion(): boolean {
  const override = usePrefs.getState().reducedMotionOverride;
  return override ?? osPrefersReducedMotion();
}

/** Subscribes to either source changing. Returns the unsubscribe function. */
export function subscribeReducedMotion(listener: () => void): () => void {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;
  mq?.addEventListener('change', listener);
  let last = usePrefs.getState().reducedMotionOverride;
  const unsub = usePrefs.subscribe((s) => {
    if (s.reducedMotionOverride !== last) {
      last = s.reducedMotionOverride;
      listener();
    }
  });
  return () => {
    mq?.removeEventListener('change', listener);
    unsub();
  };
}

let started = false;

/** Mirrors the effective value to the bus and the document. Idempotent. */
export function startMotionSync(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  const apply = () => {
    const reduced = effectiveReducedMotion();
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
    useStageBus.getState().setReducedMotion(reduced);
  };
  apply();
  subscribeReducedMotion(apply);
}
