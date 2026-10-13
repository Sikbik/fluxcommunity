/**
 * The world map canvas. A thin React shell over `mapEngine`: it hands the engine the data and the
 * flags and reports hover and layout back. The canvas is decorative (`aria-hidden`); the country list
 * beside it is the accessible and keyboard equivalent.
 */
import type { GeoPoint } from '@shared/api';
import { useEffect, useRef } from 'react';
import { useStageBus } from '@/stage/bus';
import { useReducedMotion } from '@/ui';
import type { Placed, TierFilter } from './clusters';
import styles from './map.module.css';
import { createMapEngine, type MapEngine, type MapLayout } from './mapEngine';

export interface WorldMapProps {
  points: readonly GeoPoint[];
  filter: TierFilter;
  /** Country code to emphasise on the map. */
  highlight: string | null;
  /** Last-known data (offline): drawn quieter. */
  muted: boolean;
  onHover: (cluster: Placed | null) => void;
  onLayout: (layout: MapLayout) => void;
}

export default function WorldMap({ points, filter, highlight, muted, onHover, onLayout }: WorldMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<MapEngine | null>(null);
  const reduced = useReducedMotion();
  const paused = useStageBus((s) => s.paused || s.ambient);
  // The latest callbacks, so the engine is created once and never re-wired.
  const callbacks = useRef({ onHover, onLayout });
  callbacks.current = { onHover, onLayout };

  useEffect(() => {
    const w = wrap.current;
    const c = canvas.current;
    if (!w || !c) return;
    const e = createMapEngine({
      wrap: w,
      canvas: c,
      onHover: (cluster) => callbacks.current.onHover(cluster),
      onLayout: (layout) => callbacks.current.onLayout(layout),
    });
    engine.current = e;
    // The accent switch recolours the dots and lines: restyle when <html data-accent> changes.
    const mo = new MutationObserver(() => e.restyle());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });
    return () => {
      mo.disconnect();
      e.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setAnimate(!reduced);
  }, [reduced]);

  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engine.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    engine.current?.setHighlight(highlight);
  }, [highlight]);

  useEffect(() => {
    engine.current?.setData(points, filter);
  }, [points, filter]);

  return (
    <div ref={wrap} className={styles.canvasWrap}>
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas is not focusable; it is decoration for the list beside it */}
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
    </div>
  );
}
