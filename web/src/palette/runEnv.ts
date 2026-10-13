/**
 * The real effects behind `run.ts`: the shell's stores, the router, the clipboard, the toast
 * host and the stage bus. Kept apart so `run.ts` stays testable without a browser.
 */
import { copyText } from '@/lib/clipboard';
import { effectiveReducedMotion } from '@/lib/motion';
import { useOverlays } from '@/lib/overlays';
import { usePrefs } from '@/lib/prefs';
import { goToSection, openApp } from '@/lib/route';
import { sfx } from '@/lib/sound';
import { useStageBus } from '@/stage/bus';
import { toast } from '@/ui';
import type { RunEnv } from './run';

/** Opens a URL in a new tab the way a link click would, so popup blockers leave it alone. */
function openInNewTab(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function pageLink(): string {
  const { origin, pathname, hash } = window.location;
  return `${origin}${pathname}${hash}`;
}

export const browserRunEnv: RunEnv = {
  openApp,
  goToSection: (id) => goToSection(id),
  launch(url) {
    // DESIGN 4: the lattice flashes, the link opens, nothing waits for the flash.
    useStageBus.getState().firePulse('success', null, null, 0.9);
    openInNewTab(url);
  },
  copy: copyText,
  toast: {
    success: (message) => void toast.success(message),
    error: (message) => void toast.error(message),
    info: (message) => void toast(message),
  },
  prefs: {
    get: () => {
      const { sound, autoAmbient } = usePrefs.getState();
      return { sound, autoAmbient };
    },
    set: (patch) => usePrefs.getState().set(patch),
  },
  effectiveReducedMotion,
  enterAmbient: () => useOverlays.getState().enterAmbient(),
  openSubmit: () => useOverlays.getState().openSubmit(),
  openShortcuts: () => useOverlays.getState().openShortcuts(),
  pageLink,
  confirm: () => sfx.confirm(),
  previewSound: () => sfx.preview(),
};
