/**
 * Programmatic scrolling that honours reduced motion and the fixed header.
 *
 * Sections below the hero mount lazily, and a section is far taller than its placeholder. So the
 * page keeps growing ahead of (and above) a jump, and a plain `scrollIntoView` lands short or
 * drifts afterwards. Jumps here are a `glide` (re-aimed every frame) followed by a `pin`
 * (re-aligned while the layout settles); both stand down the moment the visitor scrolls.
 *
 * While a glide runs, lazy sections do not mount (see `useGlideStore` and SectionSlot): the page
 * is passing over them, and mounting five of them mid-flight is where a slow phone would stutter.
 * They arm when the glide ends, near wherever it ended, and the pin absorbs the growth.
 */
import { create } from 'zustand';
import type { SectionId } from '@/stage/bus';
import { startGlide } from './glide';
import { effectiveReducedMotion } from './motion';
import { type PinEnv, pinTarget } from './pin';

export function sectionElement(id: SectionId): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(id);
}

export interface ScrollOptions {
  behavior?: ScrollBehavior;
  /** Move keyboard focus to the target after scrolling, for screen reader users. Default true. */
  focus?: boolean;
}

const INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

interface GlideState {
  /** True while a glide is animating. */
  gliding: boolean;
  /** Incremented each time a glide ends, so observers can look again at where it left the viewport. */
  settled: number;
}

/** Read by SectionSlot: lazy sections hold their mount while `gliding`, and re-check on `settled`. */
export const useGlideStore = create<GlideState>(() => ({ gliding: false, settled: 0 }));

/** Stops whatever glide or pin is running. */
let release: (() => void) | null = null;

/** Cancels any scroll started by `scrollToSection`. */
export function cancelScroll(): void {
  const r = release;
  release = null;
  r?.();
}

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Where the page must be scrolled so the section's top edge sits under the header: what
 * `scrollIntoView({ block: 'start' })` would pick, honouring scroll-padding and scroll-margin.
 * The element is looked up on every call because a section replaces its placeholder in the DOM.
 */
function destinationOf(id: SectionId): number | null {
  if (id === 'hero') return 0;
  const el = sectionElement(id);
  if (!el) return null;
  const root = document.documentElement;
  const pad = px(getComputedStyle(root).scrollPaddingTop);
  const margin = px(getComputedStyle(el).scrollMarginTop);
  const top = el.getBoundingClientRect().top + window.scrollY - pad - margin;
  const max = Math.max(0, root.scrollHeight - root.clientHeight);
  return Math.min(max, Math.max(0, top));
}

function jump(y: number): void {
  window.scrollTo({ top: y, behavior: 'instant' });
}

function watchInput(cb: () => void): () => void {
  for (const type of INPUT_EVENTS) window.addEventListener(type, cb, { passive: true, capture: true });
  return () => {
    for (const type of INPUT_EVENTS) window.removeEventListener(type, cb, { capture: true });
  };
}

function watchLayout(cb: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(cb);
  ro.observe(document.documentElement);
  const main = document.getElementById('main');
  if (main) ro.observe(main);
  return () => ro.disconnect();
}

function pinEnv(id: SectionId): PinEnv {
  return {
    now: () => performance.now(),
    offset: () => {
      const dest = destinationOf(id);
      return dest === null ? null : dest - window.scrollY;
    },
    align: () => {
      const dest = destinationOf(id);
      if (dest !== null) jump(dest);
    },
    watchLayout,
    watchInput,
    after: (ms, cb) => {
      const t = window.setTimeout(cb, ms);
      return () => window.clearTimeout(t);
    },
  };
}

/**
 * Scrolls a section to the top of the viewport (below the header, via scroll-padding), and keeps it
 * there while the page settles. Returns false when the section is not in the DOM (yet).
 */
export function scrollToSection(id: SectionId, opts: ScrollOptions = {}): boolean {
  if (typeof window === 'undefined') return false;
  if (destinationOf(id) === null) return false;
  cancelScroll();

  const smooth = (opts.behavior ?? (effectiveReducedMotion() ? 'auto' : 'smooth')) === 'smooth';
  const wantFocus = opts.focus !== false;
  const focusSection = (): void => focusTarget(sectionElement(id));

  const settle = (): void => {
    if (id === 'hero') return;
    const stopPin = pinTarget(pinEnv(id), {
      onStop: (reason) => {
        if (release === stopPin) release = null;
        // The placeholder the focus was given to has been replaced by the real section.
        const active = document.activeElement;
        if (wantFocus && (reason === 'quiet' || reason === 'cap') && (!active || active === document.body)) {
          focusSection();
        }
      },
    });
    release = stopPin;
  };

  const arrive = (): void => {
    if (wantFocus) focusSection();
    settle();
  };

  if (!smooth) {
    const dest = destinationOf(id);
    if (dest !== null) jump(dest);
    arrive();
    return true;
  }

  useGlideStore.setState({ gliding: true });
  const stopGlide = startGlide(
    {
      now: () => performance.now(),
      position: () => window.scrollY,
      destination: () => destinationOf(id),
      scrollTo: jump,
      frame: (cb) => {
        const h = window.requestAnimationFrame(cb);
        return () => window.cancelAnimationFrame(h);
      },
      watchInput,
    },
    (arrived) => {
      useGlideStore.setState((s) => ({ gliding: false, settled: s.settled + 1 }));
      if (arrived) arrive();
      else if (release === stopGlide) release = null;
    },
  );
  // The glide may already be over (it ends at once when the target is missing).
  if (release === null) release = stopGlide;
  return true;
}

/** Programmatic focus without scrolling, so assistive tech lands on the new place. */
function focusTarget(el: HTMLElement | null): void {
  if (!el) return;
  const had = el.hasAttribute('tabindex');
  if (!had) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (!had) {
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }
}
