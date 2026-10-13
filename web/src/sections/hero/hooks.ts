/**
 * The hero's behaviour hooks. Each one writes to the DOM directly (a data attribute or a couple of CSS
 * variables) so a pointer move or a phase change never re-renders the section.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { damp } from '@/lib/math';
import { useStageBus } from '@/stage/bus';
import { useReducedMotion } from '@/ui';
import { glintTarget, type HeroPhase, nextHeroPhase, type RectLike, scanBlockPulses } from './logic';

/**
 * The hero's entrance phase, from the stage's intro state (see `HeroPhase`). The first frame always
 * paints the soft state; one animation frame later the shell has decided whether the intro plays (its
 * effect runs after this one, in the same commit), so `intro` is trustworthy from then on.
 */
export function useHeroPhase(): HeroPhase {
  const intro = useStageBus((s) => s.intro);
  const reduced = useReducedMotion();
  const [decided, setDecided] = useState(false);
  const [phase, setPhase] = useState<HeroPhase>('hold');

  useEffect(() => {
    const id = requestAnimationFrame(() => setDecided(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const next = nextHeroPhase(phase, { decided, intro, reduced });
  // Derived state, settled during render: the next render already has the right phase.
  if (next !== phase) setPhase(next);
  return next;
}

/** The glint's writes are quantised to this many steps per unit, and capped at this many per second. */
const GLINT_STEPS = 100;
const GLINT_MAX_HZ = 30;

/**
 * The pointer's light on the headline: writes `--hx` and `--hy` (where the pointer is across the
 * headline's box) and `--hg` (how near it is, 0..1) on the element. The two key words read them as a
 * specular highlight that follows the pointer across their glass letters.
 *
 * It is built to cost nothing when it is not seen: the light only exists near the headline (a pointer
 * dragging the symbol never wakes it), values are quantised and written at most 30 times a second, the
 * box is measured a few times a second rather than per move, and the frame loop sleeps once the light
 * has settled. Touch never drives it.
 */
export function useHeadlineGlint(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let tx = 0;
    let ty = 0;
    let tg = 0;
    let x = 0;
    let y = 0;
    let g = 0;
    // What the element currently holds (NaN: nothing written yet).
    let wx = Number.NaN;
    let wy = Number.NaN;
    let wg = Number.NaN;
    let raf = 0;
    let last = 0;
    let lastWrite = 0;
    let box: RectLike | null = null;
    let boxAt = Number.NEGATIVE_INFINITY;

    const measure = (now: number): RectLike => {
      if (!box || now - boxAt > 400) {
        const r = el.getBoundingClientRect();
        box = { left: r.left, top: r.top, width: r.width, height: r.height };
        boxAt = now;
      }
      return box;
    };

    const write = (now: number) => {
      const qx = Math.round(x * GLINT_STEPS) / GLINT_STEPS;
      const qy = Math.round(y * GLINT_STEPS) / GLINT_STEPS;
      const qg = Math.round(g * GLINT_STEPS) / GLINT_STEPS;
      if (qx === wx && qy === wy && qg === wg) return;
      if (qx !== wx) el.style.setProperty('--hx', String(qx));
      if (qy !== wy) el.style.setProperty('--hy', String(qy));
      if (qg !== wg) el.style.setProperty('--hg', String(qg));
      wx = qx;
      wy = qy;
      wg = qg;
      lastWrite = now;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      let settled: boolean;
      if (tg === 0 && g < 0.002) {
        // Out of reach and dark: nothing is visible, so the position needs no easing and no write.
        x = tx;
        y = ty;
        g = 0;
        settled = true;
      } else {
        x = damp(x, tx, 7, dt);
        y = damp(y, ty, 7, dt);
        g = damp(g, tg, 5, dt);
        settled = Math.abs(x - tx) < 0.004 && Math.abs(y - ty) < 0.004 && Math.abs(g - tg) < 0.004;
        if (settled) {
          x = tx;
          y = ty;
          g = tg;
        }
      }
      if (settled || now - lastWrite >= 1000 / GLINT_MAX_HZ) write(now);
      if (!settled) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const t = glintTarget(e.clientX, e.clientY, measure(e.timeStamp));
      tx = t.x;
      ty = t.y;
      tg = t.g;
      // Far from the headline and already dark: no frame, no write.
      if (tg === 0 && g === 0) return;
      wake();
    };
    const onLeave = () => {
      tg = 0;
      wake();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      el.style.removeProperty('--hx');
      el.style.removeProperty('--hy');
      el.style.removeProperty('--hg');
    };
  }, [ref, enabled]);
}

/**
 * Lets an Odometer roll into place the first time a number arrives: it returns `from` for the first
 * render and `value` straight after (before paint), so the digits spin up instead of just appearing.
 * Null stays null (render a skeleton, never a zero); reduced motion returns the value untouched.
 */
export function useRollIn(value: number | null, from = 0): number | null {
  const reduced = useReducedMotion();
  const [rolled, setRolled] = useState(false);
  useLayoutEffect(() => {
    if (value !== null && !rolled) setRolled(true);
  }, [value, rolled]);
  if (value === null) return null;
  return reduced || rolled ? value : from;
}

/**
 * Calls `onBeat` for every real block the data layer reports (a `block` pulse on the stage bus).
 * Nothing fires offline, for fallback numbers or for a block learned long after the fact, so a
 * flare driven from here is never fabricated. `onBeat` may change identity freely.
 */
export function useBlockBeat(onBeat: () => void): void {
  const latest = useRef(onBeat);
  useEffect(() => {
    latest.current = onBeat;
  });
  useEffect(() => {
    let seen = useStageBus.getState().pulses.at(-1)?.id ?? 0;
    return useStageBus.subscribe((state, prev) => {
      if (state.pulses === prev.pulses) return;
      const scan = scanBlockPulses(state.pulses, seen);
      seen = scan.seen;
      if (scan.block) latest.current();
    });
  }, []);
}
