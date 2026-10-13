/**
 * Which system overlays are open. The shell owns the flags and the global hotkeys; the
 * overlay modules (command deck, ambient, builds detail and submit) only react to them.
 *
 *   const open = useOverlays((s) => s.palette);
 *   useOverlays.getState().openSubmit();
 *
 * Rules: the palette, shortcuts and submit overlays are exclusive (opening one closes the
 * others). Turning ambient on closes them all. `ambient` mirrors to the stage bus.
 */
import { create } from 'zustand';

export type OverlayName = 'palette' | 'shortcuts' | 'submit' | 'ambient';

const MODALS: readonly OverlayName[] = ['palette', 'shortcuts', 'submit'];

interface OverlayFlags {
  palette: boolean;
  shortcuts: boolean;
  submit: boolean;
  ambient: boolean;
}

interface OverlayActions {
  open: (name: OverlayName) => void;
  close: (name: OverlayName) => void;
  toggle: (name: OverlayName) => void;
  closeAll: () => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleShortcuts: () => void;
  openSubmit: () => void;
  closeSubmit: () => void;
  enterAmbient: () => void;
  exitAmbient: () => void;
  toggleAmbient: () => void;
}

export type OverlaysState = OverlayFlags & OverlayActions;

const NONE_OPEN: OverlayFlags = { palette: false, shortcuts: false, submit: false, ambient: false };

export const useOverlays = create<OverlaysState>((set, get) => {
  const open = (name: OverlayName) =>
    set((s) => {
      if (s[name]) return s;
      if (name === 'ambient') return { ...NONE_OPEN, ambient: true };
      const next: Partial<OverlayFlags> = { [name]: true };
      for (const other of MODALS) if (other !== name) next[other] = false;
      // Opening a modal overlay while ambient is running wakes the page.
      next.ambient = false;
      return next;
    });
  const close = (name: OverlayName) => set((s) => (s[name] ? { [name]: false } : s));
  return {
    ...NONE_OPEN,
    open,
    close,
    toggle: (name) => (get()[name] ? close(name) : open(name)),
    closeAll: () => set({ ...NONE_OPEN }),
    openPalette: () => open('palette'),
    closePalette: () => close('palette'),
    togglePalette: () => (get().palette ? close('palette') : open('palette')),
    openShortcuts: () => open('shortcuts'),
    closeShortcuts: () => close('shortcuts'),
    toggleShortcuts: () => (get().shortcuts ? close('shortcuts') : open('shortcuts')),
    openSubmit: () => open('submit'),
    closeSubmit: () => close('submit'),
    enterAmbient: () => open('ambient'),
    exitAmbient: () => close('ambient'),
    toggleAmbient: () => (get().ambient ? close('ambient') : open('ambient')),
  };
});

/** True while any modal-style overlay (palette, shortcuts, submit) is open. */
export function anyModalOverlayOpen(state: OverlayFlags): boolean {
  return state.palette || state.shortcuts || state.submit;
}
