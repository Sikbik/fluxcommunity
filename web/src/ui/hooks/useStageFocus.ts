import { type RefObject, useEffect, useId } from 'react';
import { regionFromElement } from '@/lib/stage';
import { useStageBus } from '@/stage/bus';

export interface StageFocusOptions {
  /** Default true. */
  enabled?: boolean;
}

/**
 * THE primitive for "the lattice lights beneath this card". While the element is hovered
 * (mouse or pen) or has keyboard focus inside it, its viewport rectangle is written to the
 * stage bus as a FocusRegion; it is cleared on leave and blur and kept in step with scroll
 * and resize meanwhile.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useStageFocus(ref, 0.7);
 *   return <div ref={ref}>...</div>;
 *
 * `strength` is 0..1 (how brightly the lattice lights; default 0.6). Touch taps do not
 * hold a region (there is no hover); keyboard focus does.
 */
export function useStageFocus(
  ref: RefObject<HTMLElement | null>,
  strength = 0.6,
  { enabled = true }: StageFocusOptions = {},
): void {
  const id = `focus:${useId()}`;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let hover = false;
    let focus = false;
    let active = false;
    let raf = 0;

    const write = () => {
      raf = 0;
      if (active) useStageBus.getState().setFocus(regionFromElement(id, el, strength));
    };
    const schedule = () => {
      if (!raf && active) raf = requestAnimationFrame(write);
    };
    const update = () => {
      const next = hover || focus;
      if (next === active) return;
      active = next;
      if (active) {
        write();
        window.addEventListener('scroll', schedule, { passive: true, capture: true });
        window.addEventListener('resize', schedule);
      } else {
        window.removeEventListener('scroll', schedule, { capture: true });
        window.removeEventListener('resize', schedule);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        useStageBus.getState().clearFocus(id);
      }
    };
    const keyboardFocused = () => el.matches(':focus-visible') || !!el.querySelector(':focus-visible');

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      hover = true;
      update();
    };
    const onLeave = () => {
      hover = false;
      update();
    };
    const onFocusIn = () => {
      focus = keyboardFocused();
      update();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      focus = !!next && el.contains(next) && keyboardFocused();
      update();
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
      if (active) useStageBus.getState().clearFocus(id);
    };
  }, [ref, id, strength, enabled]);
}
