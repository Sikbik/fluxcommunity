/**
 * The shell's behaviour, as small hooks called once from <App>. Each writes the stage
 * bus (the page/stage contract) or the document, and cleans up after itself.
 *
 *   useVisibilityPause   bus.paused follows tab visibility
 *   useAccentSync        prefs.accent -> html[data-accent] and bus.accent
 *   useGlassMode         html[data-glass] from the stage's quality tier and Save-Data
 *   useAmbientSync       overlays.ambient -> bus.ambient, html[data-ambient] (and ?ambient=1 on load);
 *                        while ambient, input wakes the page (the baseline: overlays may add more)
 *   useAutoAmbient       after 90 s without input on a fine pointer, enter ambient (prefs.autoAmbient)
 *   useScrollSync        scroll-spy and progress -> bus.setSection and bus.setScroll
 *   useBeat              a real block -> html[data-beat] flash and the optional chime
 *   useIntroHandshake    the first-visit intro: pending, skip on input, done
 *   useGlobalHotkeys     mod+K, /, ?, A
 *   useKonami            the code: stratus for 20 s, three pulses and a toast
 *   useHashDelegation    in-page #links scroll smoothly instead of jumping
 *   useInitialHashScroll scroll to the hash target once its section exists
 */
import { useEffect } from 'react';
import { getFlags } from '@/lib/flags';
import { parseHash } from '@/lib/hash';
import { isTypingTarget } from '@/lib/hotkeys';
import { effectiveReducedMotion, startMotionSync } from '@/lib/motion';
import { anyModalOverlayOpen, useOverlays } from '@/lib/overlays';
import { prefersSaveData } from '@/lib/platform';
import { usePrefs } from '@/lib/prefs';
import { goToSection, openApp, useRouteStore } from '@/lib/route';
import { cancelScroll, scrollToSection } from '@/lib/scroll';
import { pageProgress, pickActiveSection, type SectionBox, smoothVelocity } from '@/lib/scrollspy';
import { sfx } from '@/lib/sound';
import { pushStageAccent, syncStageAccent } from '@/lib/stage';
import { readItem, writeItem } from '@/lib/storage';
import { SECTION_ORDER, type SectionId, useStageBus } from '@/stage/bus';
import { toast, useHotkeys } from '@/ui';

const INTRO_SESSION_KEY = 'fc:intro:seen';

/** Runs before first render: the attributes CSS keys off must be right from the first paint. */
export function bootDocument(): void {
  const root = document.documentElement;
  const { accent } = usePrefs.getState();
  root.dataset.accent = accent;
  useStageBus.getState().setAccent(accent);
  startMotionSync();
  root.dataset.glass = prefersSaveData() ? 'lite' : 'full';
}

export function useVisibilityPause(): void {
  useEffect(() => {
    const apply = () => useStageBus.getState().setPaused(document.hidden);
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, []);
}

export function useAccentSync(): void {
  const accent = usePrefs((s) => s.accent);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    syncStageAccent();
  }, [accent]);
}

export function useGlassMode(): void {
  const quality = useStageBus((s) => s.stage.quality);
  const ready = useStageBus((s) => s.stage.ready);
  useEffect(() => {
    // Quality 0 with a ready stage is the CSS fallback: the lattice there is flat, and
    // blurred glass over it is wasted work. Tier 1 is a low-end device by definition.
    const lite = prefersSaveData() || (ready && quality <= 1);
    document.documentElement.dataset.glass = lite ? 'lite' : 'full';
  }, [quality, ready]);
}

/** Ambient wakes on a key, a press, a wheel turn, a touch, or the pointer travelling this far. */
const WAKE_MOVE_PX = 80;
/** Input in the first moments of ambient is the input that started it. */
const WAKE_GRACE_MS = 700;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export function useAmbientSync(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (getFlags().ambient) useOverlays.getState().enterAmbient();

    let enteredAt = 0;
    let travelled = 0;
    let lastX = Number.NaN;
    let lastY = Number.NaN;

    const apply = (ambient: boolean) => {
      if (useStageBus.getState().ambient !== ambient) useStageBus.getState().setAmbient(ambient);
      if (ambient) {
        root.dataset.ambient = 'true';
        enteredAt = performance.now();
        travelled = 0;
        lastX = Number.NaN;
      } else {
        delete root.dataset.ambient;
      }
    };
    apply(useOverlays.getState().ambient);
    const unsubscribe = useOverlays.subscribe((s) => apply(s.ambient));

    // Wake. The decision is deferred one task so a hotkey that also reacts to this key
    // (`a` toggles ambient) has already run and is not undone by the wake.
    const wake = (e: Event) => {
      if (!useOverlays.getState().ambient) return;
      if (performance.now() - enteredAt < WAKE_GRACE_MS) return;
      if (e.type === 'keydown' && MODIFIER_KEYS.has((e as KeyboardEvent).key)) return;
      if (e.type === 'pointermove') {
        const p = e as PointerEvent;
        if (p.pointerType === 'touch') return;
        if (!Number.isNaN(lastX)) travelled += Math.hypot(p.clientX - lastX, p.clientY - lastY);
        lastX = p.clientX;
        lastY = p.clientY;
        if (travelled < WAKE_MOVE_PX) return;
      }
      window.setTimeout(() => {
        if (useOverlays.getState().ambient) useOverlays.getState().exitAmbient();
      }, 0);
    };
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;
    const opts = { capture: true, passive: true } as const;
    for (const type of events) window.addEventListener(type, wake, opts);

    return () => {
      unsubscribe();
      for (const type of events) window.removeEventListener(type, wake, opts);
      delete root.dataset.ambient;
    };
  }, []);
}

/** How long the visitor must be still before the page drifts into ambient mode. */
const IDLE_MS = 90_000;

export function useAutoAmbient(): void {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let lastInput = performance.now();
    const touch = () => {
      lastInput = performance.now();
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const type of events) window.addEventListener(type, touch, { capture: true, passive: true });
    const onVisible = () => {
      if (!document.hidden) touch();
    };
    document.addEventListener('visibilitychange', onVisible);

    // One cheap check every few seconds: no timer is rearmed per pointer event.
    const timer = window.setInterval(() => {
      if (document.hidden || !fine.matches) return;
      if (!usePrefs.getState().autoAmbient || effectiveReducedMotion()) return;
      const overlays = useOverlays.getState();
      if (overlays.ambient || anyModalOverlayOpen(overlays)) {
        touch();
        return;
      }
      if (useStageBus.getState().intro === 'playing' || useRouteStore.getState().appId) return;
      if (performance.now() - lastInput >= IDLE_MS) overlays.enterAmbient();
    }, 5000);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      for (const type of events) window.removeEventListener(type, touch, { capture: true });
    };
  }, []);
}

export function useScrollSync(): void {
  useEffect(() => {
    let boxes: SectionBox[] = [];
    let dirty = true;
    let raf = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let velocity = 0;
    let observed = new Set<Element>();

    const measure = () => {
      dirty = false;
      const y = window.scrollY;
      const next: SectionBox[] = [];
      for (const id of SECTION_ORDER) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next.push({ id, top: r.top + y, height: r.height });
      }
      boxes = next;
    };

    const frame = (now: number) => {
      raf = 0;
      if (dirty) measure();
      const y = window.scrollY;
      const vh = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      const dt = now - lastT;
      const dy = y - lastY;
      lastT = now;
      lastY = y;
      velocity = smoothVelocity(velocity, dy, dt);

      const bus = useStageBus.getState();
      const spy = pickActiveSection(boxes, y, vh, docH);
      if (spy && (spy.id !== bus.section || Math.abs(spy.progress - bus.sectionProgress) > 0.002)) {
        bus.setSection(spy.id as SectionId, spy.progress);
      }
      const pp = pageProgress(y, vh, docH);
      if (Math.abs(pp - bus.pageProgress) > 0.0005 || velocity !== bus.scrollVelocity) {
        bus.setScroll(pp, velocity);
      }
      // Keep running while the page is moving or the velocity is still decaying.
      if (dy !== 0 || velocity !== 0) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (raf) return;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const invalidate = () => {
      dirty = true;
      kick();
    };

    // Section elements come and go (placeholders become real sections): re-observe.
    const ro = new ResizeObserver(invalidate);
    const observeSections = () => {
      const current = new Set<Element>();
      for (const id of SECTION_ORDER) {
        const el = document.getElementById(id);
        if (el) current.add(el);
      }
      for (const el of observed) if (!current.has(el)) ro.unobserve(el);
      for (const el of current) if (!observed.has(el)) ro.observe(el);
      observed = current;
    };
    const main = document.getElementById('main');
    const mo = new MutationObserver(() => {
      observeSections();
      invalidate();
    });
    if (main) mo.observe(main, { childList: true, subtree: true });
    observeSections();

    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', invalidate);
    window.addEventListener('load', invalidate);
    invalidate();
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('load', invalidate);
    };
  }, []);
}

/** A real block (never a simulated one) flashes the Beat and, when sound is on, chimes. */
export function useBeat(): void {
  useEffect(() => {
    let seen = useStageBus.getState().pulses.at(-1)?.id ?? 0;
    let flip = false;
    return useStageBus.subscribe((state) => {
      const pulses = state.pulses;
      for (const p of pulses) {
        if (p.id <= seen) continue;
        seen = p.id;
        if (p.kind !== 'block') continue;
        flip = !flip;
        document.documentElement.dataset.beat = flip ? 'a' : 'b';
        sfx.chime();
      }
    });
  }, []);
}

/**
 * The intro handshake. The page asks (`pending`) on the first visit of a session when
 * motion is allowed and the URL does not say `?intro=0`; the stage plays it and writes
 * `playing` then `done`. Any key, click or scroll skips. If no stage ever answers, the
 * handshake times out so `pending` never lingers.
 */
export function useIntroHandshake(): void {
  useEffect(() => {
    const bus = useStageBus.getState();
    const reduced = bus.reducedMotion;
    const seenThisSession = readItem(INTRO_SESSION_KEY, 'session') === '1';
    const wanted = getFlags().intro && !reduced && !seenThisSession;
    if (!wanted) {
      bus.setIntro('off');
      return;
    }
    bus.setIntro('pending');
    let finished = false;

    // Removes the listeners and timers. Also the effect's cleanup: it must NOT mark the intro
    // as seen, or React StrictMode's mount-unmount-mount would swallow the first visit.
    const detach = () => {
      for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const) {
        window.removeEventListener(type, skip, true);
      }
      window.removeEventListener('scroll', skip);
      window.clearTimeout(failsafe);
      unsubscribe();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      writeItem(INTRO_SESSION_KEY, '1', 'session');
      usePrefs.getState().set({ introSeen: true });
      detach();
    };
    const skip = () => {
      const state = useStageBus.getState().intro;
      if (state === 'pending' || state === 'playing') useStageBus.getState().setIntro('skip');
      finish();
    };
    for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const) {
      window.addEventListener(type, skip, { capture: true, passive: true });
    }
    window.addEventListener('scroll', skip, { passive: true });

    // No WebGL (the CSS fallback has no intro to play): nothing should wait for one.
    const noStage = (stage: { ready: boolean; quality: number }, intro: string) =>
      stage.ready && stage.quality === 0 && (intro === 'pending' || intro === 'playing');
    const unsubscribe = useStageBus.subscribe((s, prev) => {
      if (s.intro === 'done' && prev.intro !== 'done') finish();
      else if (noStage(s.stage, s.intro)) {
        useStageBus.getState().setIntro('off');
        finish();
      }
    });
    if (noStage(useStageBus.getState().stage, useStageBus.getState().intro)) {
      useStageBus.getState().setIntro('off');
      finish();
    }
    // The stage normally answers within a frame or two and finishes in about 2 s.
    const failsafe = window.setTimeout(() => {
      const state = useStageBus.getState().intro;
      if (state === 'pending' || state === 'playing') useStageBus.getState().setIntro('done');
      finish();
    }, 4500);
    return detach;
  }, []);
}

/** Mirrors the intro state on the document so CSS can stage content against it. */
export function useIntroAttribute(): void {
  const intro = useStageBus((s) => s.intro);
  useEffect(() => {
    document.documentElement.dataset.intro = intro;
  }, [intro]);
}

export function useGlobalHotkeys(): void {
  useHotkeys(
    {
      'mod+k': () => useOverlays.getState().togglePalette(),
      '/': () => useOverlays.getState().openPalette(),
      '?': () => useOverlays.getState().toggleShortcuts(),
      a: () => useOverlays.getState().toggleAmbient(),
    },
    { priority: 0 },
  );
}

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/**
 * The easter egg: up up down down left right left right b a. The stage glows stratus
 * amber for 20 s, three waves roll through the lattice, a toast says so. Under reduced
 * motion only the toast. Runs in the capture phase so the final `a` never toggles ambient.
 */
export function useKonami(): void {
  useEffect(() => {
    let index = 0;
    let restore: (() => void) | null = null;
    let timer = 0;
    const pulses: number[] = [];

    const fire = () => {
      toast('Overclocked', { kind: 'success', icon: 'bolt', id: 'konami', duration: 2600 });
      if (effectiveReducedMotion() || restore) return;
      restore = pushStageAccent('stratus');
      timer = window.setTimeout(() => {
        restore?.();
        restore = null;
      }, 20_000);
      for (const delay of [0, 280, 560]) {
        pulses.push(
          window.setTimeout(() => useStageBus.getState().firePulse('success', null, null, 1), delay),
        );
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) {
        index = 0;
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI[index]) {
        index += 1;
        if (index === KONAMI.length) {
          index = 0;
          e.preventDefault();
          fire();
        }
      } else {
        index = key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
      for (const p of pulses) window.clearTimeout(p);
      restore?.();
    };
  }, []);
}

/** In-page `#section` and `#builds/<id>` links scroll smoothly (and never reload). */
export function useHashDelegation(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const route = parseHash(a.getAttribute('href') ?? '');
      if (!route.section) return; // not ours: #main, #cookie, a custom anchor
      e.preventDefault();
      if (route.appId) openApp(route.appId);
      else goToSection(route.section);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

/**
 * Deep links: when the page loads at `#gateways`, scroll there instantly once the section
 * exists. `scrollToSection` keeps it aligned while lazy sections settle and stands down the
 * moment the visitor scrolls or presses anything. Focus stays where the page put it.
 */
export function useInitialHashScroll(): void {
  useEffect(() => {
    const { section } = useRouteStore.getState();
    if (!section || section === 'hero') return;
    scrollToSection(section, { behavior: 'auto', focus: false });
    return cancelScroll;
  }, []);
}
