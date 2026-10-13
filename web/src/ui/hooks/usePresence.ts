import { useEffect, useRef, useState } from 'react';

export type PresenceState = 'closed' | 'enter' | 'open' | 'exit';

export interface PresenceOptions {
  /**
   * Called once each time the surface has really gone: it was mounted, the exit animation has
   * played and it has unmounted. Never called for a surface that has not been opened yet (the
   * initial `closed` state is not an exit), so it is safe to restore focus or reset state there.
   */
  onExited?: () => void;
}

/** A real exit: the state went from somewhere mounted to `closed`. The first `closed` is not one. */
export function didExit(prev: PresenceState, next: PresenceState): boolean {
  return next === 'closed' && prev !== 'closed';
}

/**
 * Keeps a component mounted while its exit animation plays.
 *
 *   const { mounted, state } = usePresence(open, 260);
 *
 * `state` goes closed -> enter (mounted, pre-transition frame) -> open -> exit -> closed.
 * It always starts closed, so a surface that is open on first render still animates in.
 * Style on `data-state`. `exitMs` should match the longest exit transition.
 */
export function usePresence(
  open: boolean,
  exitMs: number,
  { onExited }: PresenceOptions = {},
): { mounted: boolean; state: PresenceState } {
  const [state, setState] = useState<PresenceState>('closed');

  // The previous state, to tell a real exit from the initial `closed`.
  const prev = useRef<PresenceState>('closed');
  const exited = useRef(onExited);
  exited.current = onExited;
  useEffect(() => {
    const was = prev.current;
    prev.current = state;
    if (didExit(was, state)) exited.current?.();
  }, [state]);

  useEffect(() => {
    if (open) {
      setState((s) => (s === 'open' ? s : 'enter'));
      const id = requestAnimationFrame(() => {
        // Two frames so the entering styles are committed before the transition starts.
        requestAnimationFrame(() => setState('open'));
      });
      return () => cancelAnimationFrame(id);
    }
    setState((s) => (s === 'closed' ? s : 'exit'));
    const t = window.setTimeout(() => setState('closed'), exitMs);
    return () => window.clearTimeout(t);
  }, [open, exitMs]);

  return { mounted: state !== 'closed', state };
}
