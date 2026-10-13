import { type RefObject, useEffect } from 'react';
import { clamp, damp } from '@/lib/math';
import { registerPointerTick } from '../internal/pointer';
import { usePointerFine } from './useMedia';
import { useReducedMotion } from './useReducedMotion';

export interface MagneticOptions {
  /** Maximum drift in px. Default 6. */
  strength?: number;
  /** Distance from the element's edge at which the pull starts, px. Default 80. */
  field?: number;
  /** Default true. */
  enabled?: boolean;
}

/**
 * Drifts an element toward the pointer when the pointer is within `field` px of its
 * edge. Writes `--mx` and `--my` (px) for the element's CSS to apply:
 *
 *   transform: translate3d(var(--mx, 0px), var(--my, 0px), 0);
 *
 * Fine pointers only, never under reduced motion. Shares one pointer loop with every
 * other magnetic element, and it is idle when the pointer is far away.
 */
export function useMagnetic(
  ref: RefObject<HTMLElement | null>,
  { strength = 6, field = 80, enabled = true }: MagneticOptions = {},
): void {
  const fine = usePointerFine();
  const reduced = useReducedMotion();
  const active = enabled && fine && !reduced;

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let x = 0;
    let y = 0;
    let rect = el.getBoundingClientRect();
    let dirty = false;
    const markDirty = () => {
      dirty = true;
    };
    window.addEventListener('scroll', markDirty, { passive: true });
    window.addEventListener('resize', markDirty);

    const unregister = registerPointerTick((dt, p) => {
      if (dirty) {
        rect = el.getBoundingClientRect();
        dirty = false;
      }
      let tx = 0;
      let ty = 0;
      if (p.inside) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const ex = Math.max(Math.abs(dx) - rect.width / 2, 0);
        const ey = Math.max(Math.abs(dy) - rect.height / 2, 0);
        const dist = Math.hypot(ex, ey);
        if (dist < field) {
          tx = clamp(dx / (rect.width / 2 + field), -1, 1) * strength;
          ty = clamp(dy / (rect.height / 2 + field), -1, 1) * strength;
        }
      }
      x = damp(x, tx, 12, dt);
      y = damp(y, ty, 12, dt);
      const settled = Math.abs(x - tx) < 0.02 && Math.abs(y - ty) < 0.02;
      if (settled) {
        x = tx;
        y = ty;
      }
      el.style.setProperty('--mx', `${x.toFixed(2)}px`);
      el.style.setProperty('--my', `${y.toFixed(2)}px`);
      return !settled;
    });
    return () => {
      unregister();
      window.removeEventListener('scroll', markDirty);
      window.removeEventListener('resize', markDirty);
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    };
  }, [ref, active, strength, field]);
}
