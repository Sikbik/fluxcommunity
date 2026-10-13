import { type RefObject, useEffect } from 'react';
import { usePointerFine, useReducedMotion } from '@/ui';
import { driftOffset, followStep, pointerToUnit, type Unit } from './parallax';

/** Responsiveness of the follower, 1/s: the art settles in about a third of a second. */
const LAMBDA = 9;

interface Mover {
  el: HTMLElement;
  /** The safe drift amplitude, px (from useArtFit, already multiplied by the layer's depth). */
  dx: number;
  dy: number;
}

/**
 * Eases the pointer's position over the host and drifts every art frame inside it opposite
 * the pointer, by writing an inline `translate` on the frame itself (up to its safe `--dx`
 * and `--dy`). Writing the frames, not a variable on the host, means a pointer move restyles
 * a handful of nodes instead of the whole tile.
 *
 * The follower runs on its own rAF only while the pointer is over the host or still
 * settling, and eases back to rest on leave (the primitive `.parallax` utility keeps the
 * last pointer position, which leaves art stranded off-centre). Fine pointers only, and
 * never under reduced motion.
 */
export function useParallax(host: RefObject<HTMLElement | null>, enabled = true): void {
  const fine = usePointerFine();
  const reduced = useReducedMotion();
  const active = enabled && fine && !reduced;

  useEffect(() => {
    const el = host.current;
    if (!el || !active) return;

    const state: Unit = { x: 0, y: 0 };
    const target: Unit = { x: 0, y: 0 };
    let rect: DOMRect | null = null;
    let raf = 0;
    let last = 0;

    let movers: Mover[] = [];
    const collect = () => {
      movers = [...el.querySelectorAll<HTMLElement>('[data-art-frame]')].map((f) => ({
        el: f,
        dx: Number.parseFloat(f.style.getPropertyValue('--dx')) || 0,
        dy: Number.parseFloat(f.style.getPropertyValue('--dy')) || 0,
      }));
    };
    const write = (rest: boolean) => {
      for (const m of movers) {
        if (rest) {
          m.el.style.removeProperty('translate');
          continue;
        }
        const o = driftOffset(state, { x: m.dx, y: m.dy });
        m.el.style.translate = `${o.x.toFixed(2)}px ${o.y.toFixed(2)}px`;
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      last = now;
      const moving = followStep(state, target, LAMBDA, dt);
      write(!moving && state.x === 0 && state.y === 0);
      raf = moving ? requestAnimationFrame(frame) : 0;
    };
    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    // The cached rect is only valid while the page is still: drop it on scroll and resize,
    // and only listen for those while the pointer is actually over the host.
    const invalidate = () => {
      rect = null;
    };
    let tracking = false;
    const track = (on: boolean) => {
      if (on === tracking) return;
      tracking = on;
      if (on) {
        window.addEventListener('scroll', invalidate, { passive: true, capture: true });
        window.addEventListener('resize', invalidate);
      } else {
        window.removeEventListener('scroll', invalidate, { capture: true });
        window.removeEventListener('resize', invalidate);
      }
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      rect = el.getBoundingClientRect();
      collect();
      track(true);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      rect ??= el.getBoundingClientRect();
      if (movers.length === 0) collect();
      const u = pointerToUnit(e.clientX, e.clientY, rect);
      target.x = u.x;
      target.y = u.y;
      wake();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      rect = null;
      track(false);
      wake();
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      track(false);
      if (raf) cancelAnimationFrame(raf);
      write(true);
    };
  }, [host, active]);
}
