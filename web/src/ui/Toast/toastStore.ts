import type { ReactNode } from 'react';
import { create } from 'zustand';
import { useStageBus } from '@/stage/bus';
import type { GlyphName } from '../Glyph/glyphs';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** Visible time in ms. Default 2400; 6000 when there is an action. 0 keeps it until dismissed. */
  duration?: number;
  action?: ToastAction;
  /** Replaces an existing toast with the same id (so repeats do not stack). */
  id?: string;
  icon?: GlyphName;
}

export interface ToastItem {
  id: string;
  message: ReactNode;
  kind: ToastKind;
  duration: number;
  action?: ToastAction;
  icon?: GlyphName;
  leaving: boolean;
}

interface ToastState {
  items: ToastItem[];
  push: (item: ToastItem) => void;
  leave: (id: string) => void;
  remove: (id: string) => void;
}

const MAX = 3;

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) =>
    set((s) => {
      const rest = s.items.filter((t) => t.id !== item.id);
      return { items: [...rest, item].slice(-MAX) };
    }),
  leave: (id) => set((s) => ({ items: s.items.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

let seq = 0;

/**
 * Shows a one-line confirmation. Returns the toast id.
 *
 *   toast('Link copied');
 *   toast.success('Copied the message', { id: 'copy' });
 *   toast.error('Could not reach the API');
 */
export function toast(message: ReactNode, opts: ToastOptions = {}): string {
  const id = opts.id ?? `t${++seq}`;
  const kind = opts.kind ?? 'info';
  const duration = opts.duration ?? (opts.action ? 6000 : kind === 'error' ? 4500 : 2400);
  useToastStore.getState().push({
    id,
    message,
    kind,
    duration,
    action: opts.action,
    icon: opts.icon,
    leaving: false,
  });
  // Good news lights the lattice.
  if (kind === 'success') useStageBus.getState().firePulse('success', null, null, 0.6);
  return id;
}

toast.success = (message: ReactNode, opts: Omit<ToastOptions, 'kind'> = {}) =>
  toast(message, { ...opts, kind: 'success' });
toast.error = (message: ReactNode, opts: Omit<ToastOptions, 'kind'> = {}) =>
  toast(message, { ...opts, kind: 'error' });
toast.warn = (message: ReactNode, opts: Omit<ToastOptions, 'kind'> = {}) =>
  toast(message, { ...opts, kind: 'warn' });
toast.dismiss = (id: string) => useToastStore.getState().leave(id);
