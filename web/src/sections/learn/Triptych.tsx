import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { hexPath } from '@/lib/hex';
import { useStageBus } from '@/stage/bus';
import { Panel } from '@/ui';
import styles from './explainer.module.css';
import { paintStill } from './player';
import { EXAMPLE_NOTE, STEP_COPY, STEP_ORDER } from './steps';
import { STILL_AT, type StepId } from './timeline';

const BADGE_PATH = hexPath(17, 19, 16.2);

/**
 * One step as a finished picture. The same drawing code as the sequence, run once at the moment
 * the step is most complete, and again only when the width or the accent changes.
 */
function Tile({ id }: { id: StepId }) {
  const copy = STEP_COPY[id];
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const quality = useStageBus.getState().stage.quality;
    const draw = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w > 0 && h > 0) paintStill(canvas, w, h, STILL_AT[id], quality);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });
    // The canvas text is set in the site's own faces: draw again once they have loaded.
    void document.fonts?.ready.then(draw).catch(() => {});
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [id]);

  return (
    <figure className={styles.tile}>
      <div className={cn('chamfer', styles.screen)}>
        <div ref={boxRef} className={styles.frame} aria-hidden="true">
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
      </div>
      <figcaption>
        <p className={styles.tileHead}>
          <svg
            className={cn(styles.badge, styles.tileBadge)}
            data-on
            viewBox="0 0 34 38"
            aria-hidden="true"
            focusable="false"
          >
            <path d={BADGE_PATH} />
            <text x="17" y="19" dy="0.36em" textAnchor="middle">
              {copy.index}
            </text>
          </svg>
          <span className={styles.tileTitle}>{copy.title}</span>
        </p>
        <p className={styles.tileText}>{copy.summary}</p>
        <p className="sr-only">{copy.shows}</p>
      </figcaption>
    </figure>
  );
}

/** Reduced motion: the three states of the sequence, side by side, nothing moving. */
export function Triptych() {
  return (
    <Panel
      size="lg"
      padding="md"
      hot="tr"
      pattern="bl"
      stageFocus={0.3}
      data-explainer="run-still"
      role="group"
      aria-label="How an app runs on Flux, in three steps"
    >
      <ol className={styles.tiles} aria-label="The three steps">
        {STEP_ORDER.map((id) => (
          <li key={id}>
            <Tile id={id} />
          </li>
        ))}
      </ol>
      <p className={styles.note}>{EXAMPLE_NOTE}</p>
    </Panel>
  );
}
