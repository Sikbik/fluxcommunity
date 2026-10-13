import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { hexSegments } from '@/lib/hex';
import { clamp01 } from '@/lib/math';
import styles from './HexRing.module.css';

export interface HexRingProps {
  /** 0..1 how full the ring is. */
  value: number;
  /** Number of cells around the ring. Default 12. */
  segments?: number;
  /**
   * Outer size in px. Default 120. A stylesheet can override it: set `--hex-ring-size` (any length)
   * on the ring or on an ancestor, for example inside a media or container query. The stroke and
   * the cells scale with it, so the ring keeps its proportions.
   */
  size?: number;
  /** Stroke width in px at `size`. Default 5. It scales with `--hex-ring-size`. */
  stroke?: number;
  /** Dim the ring (for example when another tier is hovered). */
  dim?: boolean;
  /** Centre content: a number, a label. */
  children?: ReactNode;
  /** Tier colour. Without it the ring wears the page accent. */
  tier?: 'cumulus' | 'nimbus' | 'stratus';
  /** Accessible description, e.g. "Cumulus: 58% of nodes". The ring is otherwise decorative. */
  label?: string;
  className?: string;
}

const VIEW = 100;
const R = 44;

/**
 * A hexagonal segmented gauge. The segments fill clockwise from the top, staggered.
 *
 *   <HexRing value={0.58} tier="cumulus" label="Cumulus: 58 percent of nodes">
 *     <b>5,812</b>
 *   </HexRing>
 */
export function HexRing({
  value,
  segments = 12,
  size = 120,
  stroke = 5,
  dim = false,
  children,
  tier,
  label,
  className,
}: HexRingProps) {
  const v = clamp01(value);
  const paths = hexSegments(VIEW / 2, VIEW / 2, R, segments, 0.014);
  const per = 1 / segments;
  return (
    <div
      className={cn(styles.root, className)}
      style={
        {
          // The prop is the default of the custom property, so a stylesheet can still win.
          '--ring-size': `var(--hex-ring-size, ${size}px)`,
          // In viewBox units, so the stroke is a constant fraction of the ring at any size.
          '--ring-stroke': (stroke * VIEW) / size,
        } as CSSProperties
      }
      data-tier={tier}
      data-dim={dim ? 'true' : undefined}
      {...(label ? { role: 'img', 'aria-label': label } : {})}
    >
      <svg className={styles.svg} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" focusable="false">
        {paths.map((d, i) => {
          const f = clamp01((v - i * per) / per);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed ordered set
            <g key={i} style={{ '--seg': i } as CSSProperties}>
              <path className={styles.track} d={d} />
              <path
                className={styles.fill}
                d={d}
                pathLength={1}
                strokeDasharray={`${f} ${1.0001}`}
                style={{ '--seg': i } as CSSProperties}
              />
            </g>
          );
        })}
      </svg>
      {children != null ? <div className={styles.center}>{children}</div> : null}
    </div>
  );
}
