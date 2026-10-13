import { type RefObject, useEffect } from 'react';
import { clamp, damp } from '@/lib/math';
import { usePointerFine } from './useMedia';
import { useReducedMotion } from './useReducedMotion';

export interface TiltOptions {
  /** Maximum rotation in degrees. Default 5. */
  max?: number;
  /** Default true. */
  enabled?: boolean;
}

/** The perspective of the tilt, px. The same figure the CSS used to carry. */
const PERSPECTIVE = 900;

/**
 * Tilts an element up to `max` degrees toward the pointer. The hook writes the element's inline
 * `transform` (`perspective(900px) rotateX() rotateY()`) and `will-change` itself, while the
 * pointer is over it, and clears both when it has settled flat again.
 *
 * It does NOT write custom properties: an inherited custom property changed 60 times a second on
 * an element restyles every descendant on every write (a bento tile with 50 nodes cost about
 * 130 ms of style recalc per second of hovering), while a transform on the element itself costs
 * one element. The element's CSS needs nothing; keep `transform-origin` at its default (centre).
 * `--tilt-on` (0 or 1) still flips on enter and leave, for a specular highlight.
 *
 * Fine pointers only, never under reduced motion. Eases back to flat on leave.
 */
export function useTilt(
  ref: RefObject<HTMLElement | null>,
  { max = 5, enabled = true }: TiltOptions = {},
): void {
  const fine = usePointerFine();
  const reduced = useReducedMotion();
  const active = enabled && fine && !reduced;

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let tx = 0;
    let ty = 0;
    let rx = 0;
    let ry = 0;
    let hovering = false;
    let raf = 0;
    let last = 0;

    const apply = () => {
      el.style.transform = `perspective(${PERSPECTIVE}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    };
    const rest = () => {
      rx = ry = 0;
      el.style.removeProperty('transform');
      el.style.removeProperty('will-change');
      el.style.setProperty('--tilt-on', '0');
    };
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      rx = damp(rx, tx, 14, dt);
      ry = damp(ry, ty, 14, dt);
      const settled = Math.abs(rx - tx) < 0.01 && Math.abs(ry - ty) < 0.01;
      if (settled && !hovering) {
        rest();
        raf = 0;
        return;
      }
      apply();
      raf = requestAnimationFrame(step);
    };
    const wake = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      const ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      // Pointer to the right tilts the right edge away: rotateY positive.
      ty = nx * max;
      tx = -ny * max;
      if (!hovering) {
        hovering = true;
        el.style.willChange = 'transform';
        el.style.setProperty('--tilt-on', '1');
      }
      wake();
    };
    const onLeave = () => {
      hovering = false;
      tx = 0;
      ty = 0;
      wake();
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      el.style.removeProperty('transform');
      el.style.removeProperty('will-change');
      el.style.removeProperty('--tilt-on');
    };
  }, [ref, active, max]);
}
