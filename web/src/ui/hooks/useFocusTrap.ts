import { type RefObject, useEffect, useRef } from 'react';
import { focusInitial, trapTab } from '../internal/focus';
import { isTopModal, registerModal } from '../internal/modal';

export interface FocusTrapOptions {
  active: boolean;
  /** Called when Escape is pressed and this is the top-most modal. */
  onEscape?: () => void;
  /** Return focus to the previously focused element on deactivate. Default true. */
  restoreFocus?: boolean;
}

/**
 * Modal behaviour for a container: registers it in the modal stack (page goes inert,
 * scroll locks), moves focus in, traps Tab, closes on Escape, and returns focus.
 * Used by Drawer and Dialog; exported for overlay modules that build their own surface.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  { active, onEscape, restoreFocus = true }: FocusTrapOptions,
): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    const unregister = registerModal(el);
    // Wait a frame: the surface may still be mounting its content.
    const raf = requestAnimationFrame(() => focusInitial(el));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(el)) {
        e.stopPropagation();
        e.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (isTopModal(el)) trapTab(el, e);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      unregister();
      if (restoreFocus && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref, active, restoreFocus]);
}
