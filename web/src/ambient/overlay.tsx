/**
 * Ambient mode's face: the HUD and the caption tour over the lattice (DESIGN 7).
 *
 * The shell owns the triggers, the fade-out of the page, the stage's cinematic preset and the
 * wake rules (any key, press, wheel, touch or 80 px of pointer travel). This renders only while
 * the `ambient` flag is on, never takes the pointer, and moves focus onto itself on the way in
 * and back to where it was on the way out.
 */
import { type CSSProperties, useEffect, useId, useRef } from 'react';
import { useOverlays } from '@/lib/overlays';
import { closeApp, openApp, useRouteStore } from '@/lib/route';
import { useTick } from '@/system/useTick';
import { FluxMark, usePresence, useReducedMotion } from '@/ui';
import styles from './Ambient.module.css';
import { Chain } from './Chain';
import { Clock } from './Clock';
import { driftOffset } from './schedule';
import { Tour } from './Tour';

const EXIT_MS = 420;

function Hud({ state, calm }: { state: string; calm: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();
  const minute = Math.floor(useTick(60_000) / 60_000);
  const drift = calm ? { x: 0, y: 0 } : driftOffset(minute);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // Land the keyboard here: the page behind is inert and focus must not be left on it.
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={root}
      className={styles.root}
      data-state={state}
      data-calm={calm ? 'true' : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      tabIndex={-1}
    >
      <span id={titleId} className="sr-only">
        Ambient mode: a tour of what the Flux community built
      </span>
      <div className={styles.scrim} aria-hidden="true" />
      <div className={styles.hud} style={{ '--dx': `${drift.x}px`, '--dy': `${drift.y}px` } as CSSProperties}>
        <div className={`${styles.corner} ${styles.topLeft}`} aria-hidden="true">
          <FluxMark variant="round" tone="blue" size={30} />
          <span className={styles.word}>
            Flux <span>Community</span>
          </span>
        </div>
        <div className={`${styles.corner} ${styles.topRight}`}>
          <p className={styles.hint} id={hintId}>
            {touch ? 'Tap to wake' : 'Move the mouse to wake'}
          </p>
        </div>
        <div className={`${styles.corner} ${styles.bottomLeft}`}>
          <Clock />
          <Chain />
        </div>
        <Tour />
      </div>
    </div>
  );
}

export default function AmbientOverlay() {
  const ambient = useOverlays((s) => s.ambient);
  const calm = useReducedMotion();
  const { mounted, state } = usePresence(ambient, EXIT_MS);
  const previous = useRef<Element | null>(null);
  const was = useRef(false);
  /** The build detail that was open when ambient began: it is put back when the page wakes. */
  const reopen = useRef<string | null>(null);

  // Remember where focus was while the page was live.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (!useOverlays.getState().ambient) previous.current = e.target as Element;
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, []);

  useEffect(() => {
    // Going in: an open build detail is a modal drawer above this layer, and a static panel on a
    // screen saver is the one thing it must not have. Close it now, reopen it on the way out.
    if (ambient && !was.current) {
      const id = useRouteStore.getState().appId;
      if (id) {
        reopen.current = id;
        closeApp();
      }
    }

    // Going back: the detail returns (it manages its own focus); otherwise focus goes to what had
    // it, if that is still there and usable.
    if (!ambient && was.current) {
      const id = reopen.current;
      reopen.current = null;
      if (id) {
        // The page becomes interactive again one frame after the flag flips.
        requestAnimationFrame(() => openApp(id));
      } else {
        const el = previous.current as HTMLElement | null;
        const restore = () => {
          if (el?.isConnected && !el.closest('[inert]') && typeof el.focus === 'function') {
            el.focus({ preventScroll: true });
          }
        };
        requestAnimationFrame(restore);
      }
    }
    was.current = ambient;
  }, [ambient]);

  if (!mounted) return null;
  return <Hud state={ambient ? state : 'exit'} calm={calm} />;
}
