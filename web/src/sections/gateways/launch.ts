import { sfx } from '@/lib/sound';
import { useStageBus } from '@/stage/bus';

/** The warp is 240 ms (DESIGN 4, "Launch"); the attribute stays a beat longer than the keyframes. */
const WARP_MS = 300;

/**
 * Leaving to an external app: the lattice flashes (a `success` wave from the card), the card
 * warps toward the viewer for about 240 ms (CSS, keyed off `data-launch`), and the link opens
 * in a new tab. This never calls preventDefault and never waits: navigation is the browser's.
 *
 * `clientX/Y` are 0 for a keyboard-activated click; the card centre is used then.
 */
export function playLaunch(card: HTMLElement, clientX: number, clientY: number): void {
  const bus = useStageBus.getState();
  if (!bus.reducedMotion) {
    const r = card.getBoundingClientRect();
    const keyboard = clientX === 0 && clientY === 0;
    const x = keyboard ? r.left + r.width / 2 : clientX;
    const y = keyboard ? r.top + r.height / 2 : clientY;
    bus.firePulse('success', x, y, 0.9);
    card.dataset.launch = 'true';
    window.setTimeout(() => {
      delete card.dataset.launch;
    }, WARP_MS);
  }
  sfx.confirm();
}
