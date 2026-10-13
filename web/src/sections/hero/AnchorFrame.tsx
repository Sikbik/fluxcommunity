import { type CSSProperties, useEffect, useId, useRef } from 'react';
import { fireClickPulse } from '@/lib/stage';
import { Button, toast, usePointerFine, useReducedMotion } from '@/ui';
import styles from './frame.module.css';
import hero from './hero.module.css';
import { formatCoord, reticleAt, ringArcs } from './logic';

/** The ring's drawing space. Geometry is in these units; CSS scales the whole SVG. */
const VIEW = 640;
const C = VIEW / 2;
const R_TEXT = 296;
const R_HAIR_OUT = 314;
const R_HAIR_IN = 268;
const R_TICKS = 280;
/** One arc per phrase: short text boxes, and every glyph gets the same share of the circle. */
const ARCS = ringArcs(C, C, R_TEXT, 3);
const TICK_CIRC = 2 * Math.PI * R_TICKS;
const MINOR_ON = 1.1;
const MAJOR_ON = 1.8;

const dash = (on: number, count: number) => `${on} ${(TICK_CIRC / count - on).toFixed(3)}`;

/**
 * The frame the Flux symbol floats in. The anchor is an empty, aria-hidden element; the stage owns
 * everything drawn inside it. Around it: corner ticks, a ring of slowly turning words, and (for
 * fine pointers) a reticle with a coordinate readout. A separate, visually hidden button gives
 * keyboard and assistive-technology visitors the same shockwave a click gives everyone else.
 */
export function AnchorFrame() {
  const frame = useRef<HTMLDivElement>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const ringId = `hero-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fine = usePointerFine();
  const reduced = useReducedMotion();
  const hud = fine && !reduced;

  // The reticle: one pointermove listener, one layout read per frame while the pointer is moving.
  // Its position is written on the reticle itself, so a move only restyles its handful of nodes.
  useEffect(() => {
    const el = frame.current;
    const mark = reticle.current;
    if (!el || !mark || !hud) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    let inside = false;

    const setInside = (next: boolean) => {
      if (next === inside) return;
      inside = next;
      el.dataset.inside = next ? 'true' : 'false';
    };

    const apply = () => {
      raf = 0;
      const r = reticleAt(px, py, el.getBoundingClientRect());
      setInside(r.inside);
      if (!r.inside) return;
      const rect = el.getBoundingClientRect();
      mark.style.setProperty('--rx', `${(px - rect.left).toFixed(1)}px`);
      mark.style.setProperty('--ry', `${(py - rect.top).toFixed(1)}px`);
      const out = readout.current;
      if (out) out.textContent = `X ${formatCoord(r.x)}  Y ${formatCoord(r.y)}`;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => setInside(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      delete el.dataset.inside;
      mark.style.removeProperty('--rx');
      mark.style.removeProperty('--ry');
    };
  }, [hud]);

  const sendPulse = () => {
    const el = frame.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    fireClickPulse(r.left + r.width / 2, r.top + r.height / 2, 0.9);
    toast('Pulse sent through the lattice', { id: 'hero-pulse', kind: 'success', duration: 1800 });
  };

  return (
    <div ref={frame} className={styles.frame}>
      {/* The anchor: plain, empty and hidden from assistive tech. The stage draws the symbol here. */}
      <div className={styles.anchor} data-stage-anchor="symbol" aria-hidden="true" />

      <div className={`${styles.hud} ${hero.rise}`} style={{ '--i': 1 } as CSSProperties} aria-hidden="true">
        <svg className={styles.ring} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" focusable="false">
          <circle className={styles.hairline} cx={C} cy={C} r={R_HAIR_OUT} />
          <circle className={styles.hairline} cx={C} cy={C} r={R_HAIR_IN} />
          <circle
            className={styles.tickMinor}
            cx={C}
            cy={C}
            r={R_TICKS}
            strokeDasharray={dash(MINOR_ON, 120)}
          />
          <circle
            className={styles.tickMajor}
            cx={C}
            cy={C}
            r={R_TICKS}
            strokeDasharray={dash(MAJOR_ON, 12)}
          />
        </svg>

        {/* The lettering turns inside a plain box of its own. The browser rotates the box on the
            compositor, so the slow turn costs no layout (rotating an svg root re-lays out its text
            on every frame). */}
        <div className={`${styles.ring} ${styles.spin}`}>
          <svg
            className={styles.ringSvg}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              {ARCS.map((arc, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed ring of arcs
                <path key={i} id={`${ringId}-${i}`} d={arc.d} />
              ))}
            </defs>
            {ARCS.map((arc, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed ring of arcs
              <text key={i} className={styles.ringText}>
                <textPath href={`#${ringId}-${i}`} textLength={arc.length} lengthAdjust="spacing">
                  {arc.text}
                </textPath>
              </text>
            ))}
          </svg>
        </div>

        <span className={styles.corner} data-c="tl" />
        <span className={styles.corner} data-c="tr" />
        <span className={styles.corner} data-c="bl" />
        <span className={styles.corner} data-c="br" />

        {hud ? (
          <div ref={reticle} className={styles.reticle}>
            <span className={styles.reticleV} />
            <span className={styles.reticleH} />
            <span className={styles.reticleDot} />
            <span className={styles.readout}>
              <span ref={readout}>X +0.00 Y +0.00</span>
              <span className={styles.readoutHint}>Drag to rotate</span>
            </span>
          </div>
        ) : null}
      </div>

      {/* Keyboard and assistive tech: the same shockwave a click gives. Hidden until focused. */}
      <Button
        hiddenUntilFocus
        className={styles.pulse}
        variant="secondary"
        size="sm"
        icon="spark"
        magnetic={false}
        onClick={sendPulse}
      >
        Send a pulse through the lattice
      </Button>
    </div>
  );
}
