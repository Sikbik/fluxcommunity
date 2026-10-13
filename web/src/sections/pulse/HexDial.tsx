/**
 * The block cadence dial: a hexagon whose six edges are 5 s each, so one lap is the 30 s protocol
 * target. The sweep is anchored to the real time of the tip block and runs on the compositor-free
 * Web Animations clock, so it never drifts and never restarts on a re-render. When the target passes
 * without a block the ring holds full; after ten more seconds it says it is waiting. A new block
 * flares the ring and starts the lap again. Offline there is no sweep at all: nothing is faked.
 */
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Odometer, useInView, useReducedMotion } from '@/ui';
import { DIAL_TARGET_SEC, type DialState, dialGeometry, sweepFraction } from './cadence';
import styles from './dial.module.css';

interface Props {
  state: DialState;
  /** Tip height, or null before the first block is known. */
  height: number | null;
  /** Epoch ms of the tip block header on the client clock, or null. */
  lastBlockAt: number | null;
  /** Whether the chain clock is live, so the sweep is allowed to run. */
  live: boolean;
  /** The line under the height: how long ago, or what the dial is waiting for. */
  caption: string;
}

/** Length of the bright head as a fraction of the lap. */
const HEAD = 0.022;
/**
 * The sweep is stepped at this rate rather than redrawn every frame: an SVG stroke offset is main-thread
 * work, and a lap is about 500 px over 30 s, so a step is under 1.5 px and cannot be told from smooth.
 */
const SWEEP_HZ = 12;

export function HexDial({ state, height, lastBlockAt, live, caption }: Props) {
  const geo = useMemo(() => dialGeometry(), []);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { rootMargin: '60px' });
  const arc = useRef<SVGPathElement>(null);
  const glow = useRef<SVGPathElement>(null);
  const head = useRef<SVGPathElement>(null);
  const [flare, setFlare] = useState(0);
  const lastHeight = useRef<number | null>(height);

  // A block that really arrived flares the ring. The first height we see is not a block.
  useEffect(() => {
    const prev = lastHeight.current;
    lastHeight.current = height;
    if (prev !== null && height !== null && height > prev) setFlare((n) => n + 1);
  }, [height]);

  // The sweep: one animation per block, from where the clock says the lap is now to the end of the lap.
  // Off screen there is no animation at all; on return it resumes from the clock, exactly.
  useEffect(() => {
    const a = arc.current;
    const g = glow.current;
    const h = head.current;
    if (!a || !g || !h || reduced || !live || !inView || lastBlockAt === null) return;
    const p0 = sweepFraction(Date.now() - lastBlockAt);
    if (p0 >= 1) return;
    const duration = (1 - p0) * DIAL_TARGET_SEC * 1000;
    const steps = Math.max(1, Math.round((duration / 1000) * SWEEP_HZ));
    const opts: KeyframeAnimationOptions = { duration, easing: `steps(${steps}, end)`, fill: 'forwards' };
    const lap = [{ strokeDashoffset: 1 - p0 }, { strokeDashoffset: 0 }];
    const anims = [
      a.animate(lap, opts),
      g.animate(lap, opts),
      h.animate([{ strokeDashoffset: HEAD - p0 }, { strokeDashoffset: HEAD - 1 }], opts),
    ];
    return () => {
      for (const anim of anims) anim.cancel();
    };
  }, [lastBlockAt, live, reduced, inView]);

  const sweeping = state.phase === 'sweeping';
  const staticOffset = 1 - state.fill;
  const stateKey = state.phase;

  return (
    <div
      ref={root}
      className={styles.dial}
      data-phase={stateKey}
      data-flare={flare === 0 ? undefined : flare % 2 === 0 ? 'a' : 'b'}
      style={{ '--dial-ticks': geo.ticks.length } as CSSProperties}
    >
      <svg
        className={styles.svg}
        viewBox={`0 0 ${geo.size} ${geo.size}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* An outline that expands off the ring when a block lands. */}
        <path className={styles.shock} d={geo.path} key={flare} />
        <path className={styles.track} d={geo.path} />
        <g className={styles.ticks}>
          {geo.ticks.map((t) => (
            <line
              key={t.second}
              className={cn(styles.tick, t.major && styles.tickMajor)}
              data-lit={t.second < state.litTicks ? 'true' : undefined}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
            />
          ))}
        </g>
        {/* The lap so far: a soft wide stroke under a crisp one, then a white-hot head. */}
        <path
          ref={glow}
          className={styles.arcGlow}
          d={geo.path}
          pathLength={1}
          strokeDasharray="1 1"
          style={{ strokeDashoffset: staticOffset }}
        />
        <path
          ref={arc}
          className={styles.arc}
          d={geo.path}
          pathLength={1}
          strokeDasharray="1 1"
          style={{ strokeDashoffset: staticOffset }}
        />
        <path
          ref={head}
          className={styles.head}
          d={geo.path}
          pathLength={1}
          strokeDasharray={`${HEAD} 1`}
          style={{ strokeDashoffset: HEAD - state.fill }}
          data-visible={sweeping ? 'true' : undefined}
        />
        <g className={styles.labels}>
          {geo.labels.map((l) => (
            <text key={l.text} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central">
              {l.text}
            </text>
          ))}
        </g>
      </svg>
      <div className={styles.centre}>
        <span className={styles.kicker}>Block</span>
        <span className={styles.height}>
          {height !== null ? <Odometer value={height} flash /> : <span className={styles.none}>--</span>}
        </span>
        <span className={styles.caption} data-phase={stateKey}>
          {state.phase === 'waiting' || state.phase === 'offline' ? null : (
            <span className={styles.captionDot} aria-hidden="true" />
          )}
          {caption}
        </span>
      </div>
    </div>
  );
}
