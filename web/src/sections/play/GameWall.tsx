import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useStageBus } from '@/stage/bus';
import { Button, useInView, useReducedMotion } from '@/ui';
import { GAMES, splitRows, type WallItem } from './games';
import {
  createLimiter,
  loopSeconds,
  RIPPLE_MIN_INTERVAL_MS,
  ROW_MOTION,
  type RowMotion,
  runsNeeded,
} from './wall';
import styles from './wall.module.css';

interface RowProps {
  items: readonly WallItem[];
  motion: RowMotion;
  /** Pause from the visitor's control or because the wall is off screen. */
  idle: boolean;
}

/**
 * One counter-scrolling row. The track holds an even number of identical runs and slides by
 * half its own width, so the loop is seamless. Only the first run is exposed to assistive
 * tech; the others are `aria-hidden` (not `inert`, which would also disable their hover).
 * Under reduced motion there is one run, wrapped, and nothing moves.
 */
function WallRow({ items, motion, idle }: RowProps) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLUListElement>(null);
  const [runs, setRuns] = useState(2);
  const [seconds, setSeconds] = useState(40);

  useEffect(() => {
    const run = first.current;
    const view = root.current;
    if (!run || !view) return;
    const update = () => {
      const runWidth = run.getBoundingClientRect().width;
      const n = runsNeeded(view.getBoundingClientRect().width, runWidth);
      setRuns(n);
      setSeconds(loopSeconds(runWidth, n, motion.speed));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(run);
    ro.observe(view);
    return () => ro.disconnect();
  }, [motion.speed]);

  const vars = {
    '--wall-dur': `${seconds.toFixed(1)}s`,
    '--wall-dir': motion.direction === 'right' ? 'reverse' : 'normal',
  } as CSSProperties;

  return (
    <div ref={root} className={styles.row} data-idle={idle ? 'true' : undefined} style={vars}>
      <div className={styles.viewport}>
        <div className={styles.track}>
          {Array.from({ length: reduced ? 1 : runs }, (_, c) => (
            <ul
              // biome-ignore lint/suspicious/noArrayIndexKey: identical repeated runs
              key={c}
              ref={c === 0 ? first : undefined}
              className={styles.run}
              aria-hidden={c > 0 ? true : undefined}
            >
              {items.map((it) => (
                <li key={it.id} className={cn(styles.item, it.more && styles.more)} data-wall-item="">
                  {it.label}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The kinetic wall: every game name as large mono type in two rows that scroll against each
 * other. Hovering a name lights it and its neighbours (CSS) and sends a small ripple through
 * the lattice at the name (at most four a second). Text only; no logos.
 */
export function GameWall() {
  const reduced = useReducedMotion();
  const [rows] = useState(() => splitRows(GAMES));
  const [paused, setPaused] = useState(false);
  const wall = useRef<HTMLDivElement>(null);
  const inView = useInView(wall, { rootMargin: '160px' });
  const limiter = useMemo(() => createLimiter(RIPPLE_MIN_INTERVAL_MS), []);
  const lastItem = useRef<Element | null>(null);

  const idle = paused || !inView;

  const onOver = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const item = (e.target as Element).closest('[data-wall-item]');
    if (!item || item === lastItem.current) return;
    lastItem.current = item;
    const bus = useStageBus.getState();
    if (bus.reducedMotion || !limiter()) return;
    const r = item.getBoundingClientRect();
    bus.firePulse('click', r.left + r.width / 2, r.top + r.height / 2, 0.5);
  };
  const onLeave = () => {
    lastItem.current = null;
  };

  return (
    <>
      <div className={styles.bar}>
        <p className={styles.caption} id="play-wall-label">
          Games on Flux
        </p>
        {reduced ? null : (
          <Button
            variant="icon"
            size="sm"
            icon={paused ? 'arrow-right' : 'minus'}
            label={paused ? 'Play the game names' : 'Pause the game names'}
            aria-pressed={paused}
            magnetic={false}
            onClick={() => setPaused((p) => !p)}
          />
        )}
      </div>
      <div ref={wall} className={styles.wall} data-idle={idle ? 'true' : undefined}>
        {/* biome-ignore lint/a11y/useSemanticElements: a group of two lists, named by the caption above */}
        <div
          className={styles.rows}
          role="group"
          aria-labelledby="play-wall-label"
          onPointerOver={onOver}
          onPointerLeave={onLeave}
        >
          {rows.map((items, i) => (
            <WallRow
              key={items[0]?.id ?? i}
              items={items}
              motion={ROW_MOTION[i] ?? ROW_MOTION[0]}
              idle={idle}
            />
          ))}
        </div>
      </div>
    </>
  );
}
