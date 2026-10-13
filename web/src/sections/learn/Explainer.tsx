import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { hexPath } from '@/lib/hex';
import { useStageBus } from '@/stage/bus';
import { Button, Panel, useInView, useReducedMotion } from '@/ui';
import styles from './explainer.module.css';
import { Player } from './player';
import {
  type HoldReason,
  jumpToStep,
  type PlayerState,
  seek,
  setFocused,
  setHovering,
  setInView,
  timelineText,
  toggleRunning,
} from './sequence';
import { EXAMPLE_NOTE, STEP_COPY, STEP_ORDER } from './steps';
import { Triptych } from './Triptych';
import { DURATION, STEPS, type StepId } from './timeline';

/** The step badge: a pointy-top hexagon the numeral sits in. */
const BADGE_PATH = hexPath(17, 19, 16.2);

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" /> : <path d="M4 2.5L13 8L4 13.5Z" />}
    </svg>
  );
}

/** What the arrow keys and Page Up and Down move the playhead by on the scrubber, in ms. */
const KEY_STEP = 1_000;
const KEY_PAGE = 5_000;

/** Where each step begins on the scrubber, as a percentage, for the tick marks. */
const TICKS = STEPS.slice(1).map((s) => (s.start / DURATION) * 100);

const STATUS_TEXT: Record<HoldReason, string> = {
  none: 'Playing',
  reduced: '',
  offscreen: 'Paused',
  user: 'Paused',
  hover: 'Paused while hovered',
  focus: 'Paused while focused',
};

/**
 * The explainer. Reduced motion gets three finished stills side by side; everyone else gets the
 * sequence, which they can pause, scrub and jump around.
 */
export function Explainer() {
  const reduced = useReducedMotion();
  return reduced ? <Triptych /> : <Sequence />;
}

function Sequence() {
  const uid = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const scrubWrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const stepRef = useRef<StepId>('describe');

  const [step, setStep] = useState<StepId>('describe');
  const [hold, setHold] = useState<HoldReason>('offscreen');
  const [announce, setAnnounce] = useState('');

  const visible = useInView(boxRef, { threshold: 0.12 });
  const tabHidden = useStageBus((s) => s.paused);

  // The player: created once, resized with its box, repainted when the accent changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const quality = useStageBus.getState().stage.quality;
    const player = new Player(
      canvas,
      {
        onTime: (t, s) => {
          const wrap = scrubWrapRef.current;
          if (wrap) wrap.style.setProperty('--p', (t / DURATION).toFixed(4));
          const input = scrubRef.current;
          if (input) input.value = String(Math.round(t));
          if (s !== stepRef.current) {
            stepRef.current = s;
            setStep(s);
          }
        },
        onHold: setHold,
      },
      quality,
    );
    playerRef.current = player;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) player.resize(r.width, r.height);
    });
    ro.observe(box);
    const mo = new MutationObserver(() => player.refresh());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });
    player.resize(box.clientWidth, box.clientHeight);

    return () => {
      ro.disconnect();
      mo.disconnect();
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  // Inputs from outside: on screen, and the tab visible. (Reduced motion never gets here: it is
  // the triptych, chosen one level up.)
  const active = visible && !tabHidden;
  useEffect(() => {
    playerRef.current?.dispatch((s) => setInView(s, active));
  }, [active]);

  const dispatch = useCallback((fn: (s: PlayerState) => PlayerState) => playerRef.current?.dispatch(fn), []);

  const jump = (id: StepId) => {
    dispatch((s) => jumpToStep(s, id));
    const copy = STEP_COPY[id];
    setAnnounce(`${copy.title}. ${copy.shows}`);
  };

  const running = hold === 'none';
  const stepStart = STEPS.find((s) => s.id === step)?.start ?? 0;
  const copy = STEP_COPY[step];

  return (
    <Panel
      size="lg"
      padding="md"
      hot="tr"
      pattern="bl"
      stageFocus={0.3}
      className={styles.panel}
      data-explainer="run"
      role="group"
      aria-label="How an app runs on Flux, in three steps"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') dispatch((s) => setHovering(s, true));
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') dispatch((s) => setHovering(s, false));
      }}
      onFocus={() => dispatch((s) => setFocused(s, true))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dispatch((s) => setFocused(s, false));
      }}
    >
      <ol className={styles.rail} aria-label="The three steps">
        {STEP_ORDER.map((id) => {
          const c = STEP_COPY[id];
          const current = id === step;
          return (
            <li key={id}>
              <button
                type="button"
                className={styles.step}
                aria-current={current ? 'step' : undefined}
                aria-labelledby={`${uid}-${id}-t`}
                aria-describedby={`${uid}-${id}-d`}
                onClick={() => jump(id)}
              >
                <svg
                  className={styles.badge}
                  data-on={current || undefined}
                  viewBox="0 0 34 38"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d={BADGE_PATH} />
                  <text x="17" y="19" dy="0.36em" textAnchor="middle">
                    {c.index}
                  </text>
                </svg>
                <span id={`${uid}-${id}-t`} className={styles.title}>
                  {c.title}
                </span>
                <span id={`${uid}-${id}-d`} className={styles.summary}>
                  {c.summary}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className={styles.activeNote} aria-hidden="true">
        {copy.summary}
      </p>
      <p className="sr-only">{`Now showing: ${copy.title}. ${copy.shows}`}</p>

      <div className={cn('chamfer', styles.screen)}>
        <div ref={boxRef} className={styles.frame} aria-hidden="true">
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
      </div>

      <div className={styles.controls}>
        <Button
          variant="secondary"
          size="sm"
          magnetic={false}
          className={styles.play}
          onClick={() => {
            const willPlay = !running;
            dispatch(toggleRunning);
            setAnnounce(willPlay ? 'Playing.' : 'Paused.');
          }}
        >
          <span className={styles.toolLabel}>
            <PlayIcon playing={running} />
            {running ? 'Pause' : 'Play'}
          </span>
        </Button>

        <div ref={scrubWrapRef} className={styles.scrub}>
          <div className={styles.track} aria-hidden="true">
            <span className={styles.trackFill} />
            {TICKS.map((pct) => (
              <span key={pct} className={styles.tick} style={{ insetInlineStart: `${pct}%` }} />
            ))}
          </div>
          <input
            ref={scrubRef}
            className={styles.range}
            type="range"
            min={0}
            max={DURATION - 1}
            step={50}
            defaultValue={0}
            aria-label="Timeline"
            aria-valuetext={timelineText(stepStart)}
            onChange={(e) => dispatch((s) => seek(s, Number(e.currentTarget.value)))}
            onKeyDown={(e) => {
              // The native step is 50 ms, right for dragging and hopeless for a key: a second at a
              // time with the arrows, five with Page Up and Page Down.
              const delta =
                e.key === 'ArrowRight' || e.key === 'ArrowUp'
                  ? KEY_STEP
                  : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                    ? -KEY_STEP
                    : e.key === 'PageUp'
                      ? KEY_PAGE
                      : e.key === 'PageDown'
                        ? -KEY_PAGE
                        : 0;
              if (delta === 0) return;
              e.preventDefault();
              const at = Number(e.currentTarget.value);
              dispatch((s) => seek(s, at + delta));
            }}
          />
          <span className={styles.thumbGlow} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
        </div>

        <p className={styles.status}>{STATUS_TEXT[hold]}</p>
      </div>

      <p className={styles.note}>{EXAMPLE_NOTE}</p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </Panel>
  );
}
