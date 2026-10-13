import { type RefObject, useEffect } from 'react';
import { clamp } from '@/lib/math';

export interface PointerGlowOptions {
  /** Default true. */
  enabled?: boolean;
}

const VARS = ['--px', '--py', '--pxp', '--pyp'] as const;
/** The spotlight (and the edge catch) fade out over --dur-3; the pixel position is kept until then. */
const FADE_MS = 450;

/**
 * Writes the pointer position inside an element to CSS custom properties, once per
 * frame while it moves, and sets `data-hover="true"` while the pointer is over it:
 *
 *   --px, --py     pixels from the element's top-left
 *   --pxp, --pyp   0..1 across and down the element
 *
 * CSS does the drawing (radial gradients under `var(--px)` and `var(--py)`), so React
 * never re-renders for a pointer move. Mouse and pen only; touch has no hover.
 *
 * When the pointer leaves (or focus leaves while the pointer is not over the element) the
 * properties are removed, so `var(--pxp, 0.5)` and the other fallbacks in the CSS give the neutral
 * position again; anything that transitions from the old value (the `.parallax` utility eases its
 * `translate` over --dur-2, and not at all under reduced motion) glides back to centre instead of
 * staying stranded where the pointer left. `--pxp` and `--pyp` go at once; `--px` and `--py` wait
 * for the spotlight to finish fading (a fading light should not jump to the default spot).
 *
 * Cost note: custom properties inherit, so every write restyles the element's whole subtree. Keep
 * the element's subtree small, or read these from a leaf (see README: "Pointer and tilt cost").
 */
export function usePointerGlow(
  ref: RefObject<HTMLElement | null>,
  { enabled = true }: PointerGlowOptions = {},
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let raf = 0;
    let cx = 0;
    let cy = 0;
    let inside = false;
    let timer = 0;
    // The last strings written, so an unchanged value is not written again.
    const last: Record<string, string> = {};

    const set = (name: (typeof VARS)[number], value: string) => {
      if (last[name] === value) return;
      last[name] = value;
      el.style.setProperty(name, value);
    };
    const clear = (names: readonly (typeof VARS)[number][]) => {
      for (const name of names) {
        if (last[name] === undefined) continue;
        delete last[name];
        el.style.removeProperty(name);
      }
    };
    const reset = (now = false) => {
      window.clearTimeout(timer);
      clear(['--pxp', '--pyp']);
      if (now) clear(['--px', '--py']);
      else timer = window.setTimeout(() => clear(['--px', '--py']), FADE_MS);
    };
    const write = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const x = clamp(cx - r.left, 0, r.width);
      const y = clamp(cy - r.top, 0, r.height);
      set('--px', `${x.toFixed(0)}px`);
      set('--py', `${y.toFixed(0)}px`);
      set('--pxp', (r.width ? x / r.width : 0.5).toFixed(3));
      set('--pyp', (r.height ? y / r.height : 0.5).toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      cx = e.clientX;
      cy = e.clientY;
      if (!raf) raf = requestAnimationFrame(write);
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      window.clearTimeout(timer);
      inside = true;
      el.dataset.hover = 'true';
      onMove(e);
    };
    const onLeave = () => {
      inside = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      delete el.dataset.hover;
      reset();
    };
    // Keyboard and programmatic focus: when it leaves and the pointer is not over the element,
    // nothing should stay lit or off-centre.
    const onFocusOut = (e: FocusEvent) => {
      if (inside) return;
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      delete el.dataset.hover;
      reset();
    };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
      el.removeEventListener('focusout', onFocusOut);
      if (raf) cancelAnimationFrame(raf);
      delete el.dataset.hover;
      reset(true);
    };
  }, [ref, enabled]);
}
