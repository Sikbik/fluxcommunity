import type { Tier } from '@shared/api';
import { useEffect, useId, useRef } from 'react';
import { useChainClock } from '@/data';
import { cn } from '@/lib/cn';
import { hexPath } from '@/lib/hex';
import { useStageBus } from '@/stage/bus';
import { FluxMark, Glyph, useInView } from '@/ui';
import {
  CENTER,
  chipFraction,
  GATE_HALF,
  gateFraction,
  HUB_R,
  hexVertexOffsets,
  ORBIT_ORDER,
  ORBIT_R,
  tierAtOffset,
  VIEW,
} from './orbit';
import { type OrbitCounts, OrbitScene } from './orbitScene';
import { TIER_NAME } from './payout';
import styles from './stage.module.css';

export interface OrbitStageProps {
  /** Null until a snapshot (live or last known) exists: the rings show, the sample does not. */
  counts: OrbitCounts | null;
  /** FLUX per block as display text, for the payout pops at the gates. */
  perBlock: Record<Tier, string> | null;
  /** The orbit being looked at, or null for all three. */
  focus: Tier | null;
  onHover: (tier: Tier | null) => void;
  onPick: (tier: Tier) => void;
  /** Reduced motion: the diagram holds still and shows its numbers. */
  reduced: boolean;
  /** The visitor paused the circulation. */
  frozen: boolean;
}

/** Seconds to the next block, from the shared chain clock. Re-renders once a second, and only here. */
function HubClock() {
  const clock = useChainClock();
  if (clock.live && clock.secondsToNext !== null) {
    return (
      <>
        <span className={styles.hubLabel}>Next block</span>
        <span className={styles.hubValue}>
          {clock.secondsToNext}
          <span className={styles.hubUnit}> s</span>
        </span>
      </>
    );
  }
  // No live clock: the hub is just the mark. Nothing is simulated.
  return <FluxMark tone="white" variant="mark" size={30} />;
}

const VERTICES = hexVertexOffsets();

/**
 * The orbit diagram: three nested hexagonal orbits (Cumulus outside, Stratus inside), a sample of
 * nodes circulating on each, a payout gate at 12 o'clock and, when the chain clock is live, a sweep
 * that is the block clock itself. Hover or tap a ring to isolate it.
 *
 * Layers: a static SVG (rings, ticks, gates), one canvas (everything that moves), then small DOM
 * overlays (hub, tier chips, payout pops). The diagram is decoration with a full text equivalent in
 * the readout next to it, so the whole thing is aria-hidden.
 */
export function OrbitStage({ counts, perBlock, focus, onHover, onPick, reduced, frozen }: OrbitStageProps) {
  const uid = useId();
  const glowId = `${uid}-glow`;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbitScene | null>(null);
  const popFlip = useRef(false);
  const inView = useInView(stageRef, { threshold: 0.05, rootMargin: '80px' });
  const busPaused = useStageBus((s) => s.paused);
  const active = inView && !busPaused && !frozen && !reduced;

  // Latest inputs for the long-lived scene, without re-creating it.
  const latest = useRef({ counts, focus, reduced });
  latest.current = { counts, focus, reduced };

  // The scene: created once, resized with the stage.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const scene = new OrbitScene(canvas);
    sceneRef.current = scene;
    scene.onBlock = () => {
      const pops = popsRef.current;
      if (!pops) return;
      popFlip.current = !popFlip.current;
      pops.dataset.pop = popFlip.current ? 'a' : 'b';
    };

    const syncSize = () => {
      const w = stage.clientWidth;
      if (w <= 0) return;
      const quality = useStageBus.getState().stage.quality;
      const dpr = Math.min(window.devicePixelRatio || 1, quality > 0 && quality <= 1 ? 1 : 2);
      scene.resize(w, dpr);
      scene.snap(performance.now());
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(stage);

    // The accent drives the sweep tint; re-read the palette when it changes.
    const mo = new MutationObserver(() => scene.refreshPalette());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Inputs and the frame loop.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setCounts(counts);
    scene.setFocus(focus);
    scene.setReduced(reduced);
    scene.setAnimating(active);

    if (reduced) {
      scene.snap(performance.now());
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      scene.frame(now);
      raf = active || scene.isSettling() ? requestAnimationFrame(loop) : 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [counts, focus, reduced, active]);

  const tierAt = (e: { clientX: number; clientY: number }): Tier | null => {
    const el = stageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const dx = ((e.clientX - r.left) / r.width) * VIEW - CENTER;
    const dy = ((e.clientY - r.top) / r.height) * VIEW - CENTER;
    return tierAtOffset(dx, dy);
  };

  return (
    // The pointer handlers are a convenience: the segmented control beside the diagram is the
    // keyboard and assistive-technology path to exactly the same state.
    <div
      ref={stageRef}
      className={styles.stage}
      data-focus={focus ?? 'none'}
      data-motion={reduced ? 'still' : frozen ? 'frozen' : 'live'}
      aria-hidden="true"
      onPointerMove={(e) => {
        if (e.pointerType !== 'touch') onHover(tierAt(e));
      }}
      onPointerLeave={() => onHover(null)}
      onClick={(e) => {
        const t = tierAt(e);
        if (t) onPick(t);
      }}
    >
      <svg className={styles.rings} viewBox={`0 0 ${VIEW} ${VIEW}`} focusable="false" aria-hidden="true">
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Spokes: the six directions of the lattice, hub to outer ring. */}
        <g className={styles.spokes}>
          {VERTICES.map((v) => (
            <line
              key={`${v.x}:${v.y}`}
              x1={CENTER + v.x * HUB_R}
              y1={CENTER + v.y * HUB_R}
              x2={CENTER + v.x * ORBIT_R.cumulus}
              y2={CENTER + v.y * ORBIT_R.cumulus}
            />
          ))}
        </g>

        {ORBIT_ORDER.map((tier) => {
          const r = ORBIT_R[tier];
          const d = hexPath(CENTER, CENTER, r);
          const state = focus === null ? 'rest' : focus === tier ? 'active' : 'dim';
          return (
            <g key={tier} className={styles.orbit} data-tier={tier} data-state={state}>
              <path className={styles.band} d={d} />
              <path className={styles.ticks} d={d} pathLength={360} />
              <path className={styles.glow} d={d} filter={`url(#${glowId})`} />
              <path className={styles.line} d={d} />
              {VERTICES.map((v) => (
                <path
                  key={`${v.x}:${v.y}`}
                  className={styles.bolt}
                  d={hexPath(CENTER + v.x * r, CENTER + v.y * r, 3.4)}
                />
              ))}
              {/* The gate: where the next payee stands. A pointer above, a cross-hair on the ring. */}
              <path
                className={styles.gatePointer}
                d={`M${CENTER - 5} ${CENTER - r - GATE_HALF - 11}H${CENTER + 5}L${CENTER} ${CENTER - r - GATE_HALF - 2}Z`}
              />
              <path
                className={styles.gate}
                d={`M${CENTER} ${CENTER - r - GATE_HALF + 3}V${CENTER - r + GATE_HALF}`}
              />
            </g>
          );
        })}

        <path className={styles.hubFrame} d={hexPath(CENTER, CENTER, HUB_R)} />
        <path className={styles.hubInner} d={hexPath(CENTER, CENTER, HUB_R - 6)} />
      </svg>

      <canvas ref={canvasRef} className={styles.canvas} />

      <div className={styles.hub}>
        <HubClock />
      </div>

      {/* Each tag hangs just below its ring's bottom vertex, clear of every ring line, so no dot
          ever passes underneath it. */}
      <div className={styles.chips}>
        {ORBIT_ORDER.map((tier) => {
          const f = chipFraction(tier);
          return (
            <span
              key={tier}
              className={cn('chamfer', styles.chip)}
              data-tier={tier}
              data-state={focus === null ? 'rest' : focus === tier ? 'active' : 'dim'}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}
            >
              <Glyph name={`tier-${tier}`} size={14} className={styles.chipGlyph} />
              <span className={styles.chipName}>{TIER_NAME[tier]}</span>
            </span>
          );
        })}
      </div>

      <div ref={popsRef} className={styles.pops}>
        {ORBIT_ORDER.map((tier) => {
          const g = gateFraction(tier);
          return (
            <span
              key={tier}
              className={styles.pop}
              data-tier={tier}
              style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%` }}
            >
              {perBlock ? `+${perBlock[tier]}` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
