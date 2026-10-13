/**
 * The launch effect (DESIGN 4): leaving for an app flashes the lattice under the card and gives the
 * card a short punch toward the viewer. It never delays the navigation: the link opens at once.
 */
import { effectiveReducedMotion } from '@/lib/motion';
import { useStageBus } from '@/stage/bus';

const PUNCH_MS = 240;

/** Plays the effect from `origin` (the card, or the drawer's picture). Safe to call with null. */
export function playLaunch(origin: HTMLElement | null): void {
  const r = origin?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : null;
  const y = r ? r.top + r.height / 2 : null;
  useStageBus.getState().firePulse('success', x, y, 0.9);
  if (!origin || effectiveReducedMotion() || typeof origin.animate !== 'function') return;
  origin.animate(
    [
      { scale: '1', filter: 'brightness(1)' },
      { scale: '1.05', filter: 'brightness(1.55) saturate(1.25)', offset: 0.42 },
      { scale: '1', filter: 'brightness(1)' },
    ],
    { duration: PUNCH_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
}
