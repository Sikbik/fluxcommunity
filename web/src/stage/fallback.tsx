// The CSS/SVG stage used when WebGL is unavailable, blocked or lost for good. It sits in the same fixed
// layer as the canvas so the rest of the page is unaffected: an animated hex pattern, a slow glow sweep,
// and the official symbol, static, at the anchor.

import { useEffect, useId, useRef } from 'react';
import { useStageBus } from './bus';
import styles from './fallback.module.css';
import { MARK_ASPECT, MARK_VIEWBOX, RAW_SHARDS } from './mark';

const HEX_ACCENT: Record<string, string> = {
  flux: '#2b61d1',
  cumulus: '#36d3ff',
  nimbus: '#c77dff',
  stratus: '#ffc857',
};

// A pointy-top hexagon of radius 32 tiles into a 55.4 x 96 cell.
const R = 32;
const DX = R * 0.8660254;
const TILE_W = DX * 2;
const TILE_H = R * 3;

function hexPath(cx: number, cy: number): string {
  const p: [number, number][] = [
    [cx, cy - R],
    [cx + DX, cy - R / 2],
    [cx + DX, cy + R / 2],
    [cx, cy + R],
    [cx - DX, cy + R / 2],
    [cx - DX, cy - R / 2],
  ];
  return `M${p.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;
}

const TILE_PATH = [hexPath(DX, R), hexPath(0, R * 2.5), hexPath(TILE_W, R * 2.5)].join('');

export interface FallbackProps {
  reason: string;
}

export function Fallback({ reason }: FallbackProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const symbol = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const accent = useStageBus((s) => s.accent);
  const reduced = useStageBus((s) => s.reducedMotion);
  const stroke = HEX_ACCENT[accent] ?? HEX_ACCENT.flux;

  // Follow the anchor with a transform, once per animation frame, only while the tab is visible.
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let last = '';
    const tick = () => {
      if (stopped) return;
      const el = symbol.current;
      const anchors = document.querySelectorAll<HTMLElement>('[data-stage-anchor="symbol"]');
      let best: DOMRect | null = null;
      let bestArea = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const a of anchors) {
        const r = a.getBoundingClientRect();
        const w = Math.min(r.right, vw) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        const area = w > 0 && h > 0 ? w * h : 0;
        if (area > bestArea) {
          best = r;
          bestArea = area;
        }
      }
      if (el) {
        if (best) {
          const hgt = Math.min(best.height, best.width / MARK_ASPECT) * 0.94;
          const wid = hgt * MARK_ASPECT;
          const x = best.left + best.width / 2 - wid / 2;
          const y = best.top + best.height / 2 - hgt / 2;
          const key = `${x.toFixed(1)},${y.toFixed(1)},${hgt.toFixed(1)}`;
          if (key !== last) {
            last = key;
            el.style.width = `${wid}px`;
            el.style.height = `${hgt}px`;
            el.style.transform = `translate(${x}px, ${y}px)`;
          }
          el.dataset.on = 'true';
        } else {
          el.dataset.on = 'false';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !stopped) raf = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div
      ref={root}
      className={styles.root}
      data-stage-fallback={reason}
      data-still={reduced ? 'true' : 'false'}
      style={{ '--stage-accent': stroke } as React.CSSProperties}
    >
      <svg className={styles.field} aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`${id}-dim`} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse">
            <path d={TILE_PATH} fill="none" stroke={stroke} strokeOpacity="0.2" strokeWidth="1" />
          </pattern>
          <pattern id={`${id}-lit`} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse">
            <path d={TILE_PATH} fill="none" stroke={stroke} strokeOpacity="0.95" strokeWidth="1.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-dim)`} />
      </svg>
      <div className={styles.sweep}>
        <svg className={styles.field} aria-hidden="true" focusable="false">
          <rect width="100%" height="100%" fill={`url(#${id}-lit)`} />
        </svg>
      </div>
      <div className={styles.vignette} />
      <div ref={symbol} className={styles.symbol} data-on="false">
        <svg viewBox={`0 0 ${MARK_VIEWBOX.w} ${MARK_VIEWBOX.h}`} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}-ice`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.55" stopColor="#dde7ff" />
              <stop offset="1" stopColor="#a3b9f2" />
            </linearGradient>
          </defs>
          {RAW_SHARDS.map((s) => (
            <path
              key={s.id}
              d={s.d}
              transform={`translate(${s.tx} ${s.ty})`}
              fill={`url(#${id}-ice)`}
              stroke="#2f6bff"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
