import { type PointerEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDecimal } from '@/lib/format';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResizeObserver } from '../internal/useResizeObserver';
import { placeTargetLabel } from './labelPlacement';
import styles from './Sparkline.module.css';

export interface SparklineProps {
  /** Newest last. */
  values: readonly number[];
  /** Height in px. Default 48. Width is 100% of the container. */
  height?: number;
  /** Fixed y-domain. Default: the data, padded 12%. */
  min?: number;
  max?: number;
  /** A dashed reference line (the 30 s block target). */
  target?: number;
  /**
   * Short mono caption for the target line. It sits at the start of the line, above it, and moves
   * to the end or below when the series runs through that spot.
   */
  targetLabel?: string;
  /** Fill under the line. Default true. */
  area?: boolean;
  /** Slide the series in when a value is appended. Default true. */
  live?: boolean;
  /** Mark the latest point with a hex. Default true. */
  showLast?: boolean;
  /** Hover or touch crosshair with the value. Default true. */
  interactive?: boolean;
  /** Formats values for the tooltip and the screen reader summary. */
  formatValue?: (n: number) => string;
  /** Names the chart for assistive tech: "Block interval, seconds". */
  label?: string;
  className?: string;
}

const W = 100;
const H = 100;

/** The caption's box before it has been measured: 10 px mono, 0.08em tracking. */
const LABEL_H = 10;
const LABEL_CHAR_W = 6.8;
/** The plot's width before it has been measured. */
const PLOT_W = 240;

/**
 * A tiny trend line in SVG with an optional target line, a live-append slide and a
 * hover read-out. Colour follows `color` (defaults to the accent). The width is the
 * container's; give the container the room.
 *
 *   <Sparkline values={intervals} target={30} targetLabel="30 s" label="Block interval" />
 */
export function Sparkline({
  values,
  height = 48,
  min,
  max,
  target,
  targetLabel,
  area = true,
  live = true,
  showLast = true,
  interactive = true,
  formatValue = (n) => formatDecimal(n, 1),
  label = 'Trend',
  className,
}: SparklineProps) {
  const id = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const slide = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const rootEl = useRef<HTMLDivElement>(null);
  const labelEl = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Plot and caption sizes in px, for the caption placement (null until measured).
  const [sizes, setSizes] = useState<{ w: number; h: number; lw: number; lh: number } | null>(null);

  const geometry = useMemo(() => {
    const n = values.length;
    if (n === 0) return null;
    let lo = min ?? Math.min(...values, target ?? Number.POSITIVE_INFINITY);
    let hi = max ?? Math.max(...values, target ?? Number.NEGATIVE_INFINITY);
    if (min === undefined || max === undefined) {
      const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
      if (min === undefined) lo -= pad;
      if (max === undefined) hi += pad;
    }
    const span = hi - lo || 1;
    const xs = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const ys = (v: number) => H - ((v - lo) / span) * H;
    const pts = values.map((v, i) => [xs(i), ys(v)] as const);
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
    const first = pts[0];
    const last = pts[n - 1];
    const fill = first && last ? `${line}L${last[0].toFixed(2)} ${H}L${first[0].toFixed(2)} ${H}Z` : '';
    return { line, fill, pts, ty: target !== undefined ? ys(target) : null, step: n > 1 ? W / (n - 1) : 0 };
  }, [values, min, max, target]);

  // The caption placement needs the real sizes. Frame-deferred, so the state set here never runs
  // inside the observer's delivery step.
  const hasLabel = Boolean(targetLabel) && geometry !== null && geometry.ty !== null;
  const measure = useCallback(() => {
    const root = rootEl.current;
    const label = labelEl.current;
    if (!root || !label) return;
    const next = {
      w: Math.round(root.clientWidth),
      h: Math.round(root.clientHeight),
      lw: Math.ceil(label.offsetWidth),
      lh: Math.ceil(label.offsetHeight),
    };
    setSizes((prev) =>
      prev && prev.w === next.w && prev.h === next.h && prev.lw === next.lw && prev.lh === next.lh
        ? prev
        : next,
    );
  }, []);
  useResizeObserver([rootEl, labelEl], measure, { immediate: true, enabled: hasLabel });

  // Slide the series in when it grows by one. The element that moves is an HTML wrapper: a
  // transform animated on SVG nodes is never composited and lays the SVG out again every frame.
  const prevLen = useRef(values.length);
  useEffect(() => {
    const el = slide.current;
    const grew =
      values.length > prevLen.current || (values.length === prevLen.current && prevLen.current > 0);
    prevLen.current = values.length;
    if (!live || reduced || !el || !geometry || !grew || geometry.step === 0) return;
    const w = el.getBoundingClientRect().width;
    const px = (geometry.step / W) * w;
    if (px <= 0) return;
    const opts = { duration: 520, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
    const anim = el.animate([{ translate: `${px}px 0` }, { translate: '0 0' }], opts);
    // The marker rides the same slide so it never detaches from the end of the line.
    const dotAnim = dot.current?.animate([{ translate: `${px}px 0` }, { translate: '0 0' }], opts);
    return () => {
      anim.cancel();
      dotAnim?.cancel();
    };
  }, [values, live, reduced, geometry]);

  if (!geometry) {
    return (
      <div
        className={cn(styles.root, className)}
        style={{ blockSize: height }}
        role="img"
        aria-label={`${label}: no data yet`}
      />
    );
  }

  const lastPoint = geometry.pts[geometry.pts.length - 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const latest = values[values.length - 1] as number;
  const summary = `${label}: latest ${formatValue(latest)}, low ${formatValue(lo)}, high ${formatValue(hi)}, ${values.length} points`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || values.length < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(t * (values.length - 1)));
  };

  const hp = hover !== null ? geometry.pts[hover] : undefined;
  const hv = hover !== null ? values[hover] : undefined;

  const labelAt =
    targetLabel && geometry.ty !== null
      ? placeTargetLabel({
          points: geometry.pts,
          ty: geometry.ty,
          width: sizes?.w || PLOT_W,
          height: sizes?.h || height,
          labelWidth: sizes?.lw || targetLabel.length * LABEL_CHAR_W,
          labelHeight: sizes?.lh || LABEL_H,
        })
      : null;

  return (
    <div
      ref={rootEl}
      className={cn(styles.root, className)}
      style={{ blockSize: height }}
      role="img"
      aria-label={summary}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {geometry.ty !== null ? (
        <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className={styles.target} x1="0" x2={W} y1={geometry.ty} y2={geometry.ty} />
        </svg>
      ) : null}
      {/* The slide-in starts one step to the right; the outer box is the clip (the plot's width,
          generous above and below) and the inner box is what moves. */}
      <div className={styles.clip}>
        <div ref={slide} className={styles.slide}>
          <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.32" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area ? <path d={geometry.fill} fill={`url(#${id}f)`} stroke="none" /> : null}
            <path className={styles.line} d={geometry.line} />
          </svg>
        </div>
      </div>
      {targetLabel && geometry.ty !== null && labelAt ? (
        <span
          ref={labelEl}
          className={styles.targetLabel}
          data-side={labelAt.side}
          data-edge={labelAt.edge}
          style={{ insetBlockStart: `${geometry.ty}%` }}
        >
          {targetLabel}
        </span>
      ) : null}
      {showLast && lastPoint ? (
        <span
          ref={dot}
          className={styles.dot}
          style={{ left: `${lastPoint[0]}%`, top: `${lastPoint[1]}%` }}
        />
      ) : null}
      {hp && hv !== undefined ? (
        <>
          <span className={styles.cursor} style={{ left: `${hp[0]}%` }} />
          <span className={styles.tip} style={{ left: `${Math.min(88, Math.max(12, hp[0]))}%` }}>
            {formatValue(hv)}
          </span>
        </>
      ) : null}
    </div>
  );
}
