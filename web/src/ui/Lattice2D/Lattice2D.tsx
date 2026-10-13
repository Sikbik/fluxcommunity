import { type CSSProperties, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { registerPointerTick } from '../internal/pointer';
import { CELLS_A, CELLS_B, CELLS_C, type CellTile } from './cells';
import styles from './Lattice2D.module.css';

export interface Lattice2DProps {
  /** `field`: a flat lattice (default). `floor`: a lattice receding to a horizon. */
  variant?: 'field' | 'floor';
  /** Overall brightness 0..1. Default 0.6. */
  intensity?: number;
  /** Cell size multiplier. Default 1 (a hexagon is 55 px wide). */
  scale?: number;
  /** Drift and twinkle. Default true. (Reduced motion always holds still.) */
  animate?: boolean;
  /** Drift speed multiplier. Default 1. */
  speed?: number;
  /** Where the main glow sits. Default `top`. */
  glow?: 'top' | 'center' | 'bottom';
  /** Darken the corners. Default true. */
  vignette?: boolean;
  /** Brighten the lattice under the pointer. Fine pointers only. Default false. */
  interactive?: boolean;
  /** Cover the viewport (position: fixed) instead of the parent. Default false. */
  fixed?: boolean;
  className?: string;
  style?: CSSProperties;
}

function cellVars(tile: CellTile): CSSProperties {
  return {
    '--cells-url': tile.url,
    '--cells-w': `${tile.w}px`,
    '--cells-h': `${tile.h}px`,
  } as CSSProperties;
}

/**
 * The hexagonal lattice, in CSS: hairline hex grid, breathing lit cells, a seamless
 * drift and a vignette. Decorative (`aria-hidden`, no pointer events). It is the page
 * backdrop until the stage renders and the no-WebGL fallback texture.
 *
 *   <div style={{ position: 'relative' }}><Lattice2D intensity={0.5} /> ...content </div>
 */
export function Lattice2D({
  variant = 'field',
  intensity = 0.6,
  scale = 1,
  animate = true,
  speed = 1,
  glow = 'top',
  vignette = true,
  interactive = false,
  fixed = false,
  className,
  style,
}: Lattice2DProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !interactive) return;
    return registerPointerTick((_dt, p) => {
      const r = el.getBoundingClientRect();
      if (p.inside) {
        el.style.setProperty('--mx', `${p.x - r.left}px`);
        el.style.setProperty('--my', `${p.y - r.top}px`);
      } else {
        el.style.removeProperty('--mx');
        el.style.removeProperty('--my');
      }
      return false;
    });
  }, [interactive]);

  const plane = (
    <div className={styles.plane}>
      <div className={styles.grid} />
      {animate ? (
        <>
          <div className={styles.cells} data-layer="a" style={cellVars(CELLS_A)} />
          <div className={styles.cells} data-layer="b" style={cellVars(CELLS_B)} />
          <div className={styles.cells} data-layer="c" style={cellVars(CELLS_C)} />
        </>
      ) : (
        <div
          className={styles.cells}
          data-layer="a"
          style={{ ...cellVars(CELLS_A), opacity: 0.6, animation: 'none' }}
        />
      )}
    </div>
  );

  return (
    <div
      ref={root}
      className={cn(styles.root, className)}
      data-variant={variant}
      data-glow={glow}
      data-fixed={fixed ? 'true' : undefined}
      data-vignette={vignette ? undefined : 'false'}
      data-interactive={interactive ? 'true' : undefined}
      data-animate={animate ? undefined : 'false'}
      aria-hidden="true"
      style={
        {
          '--s': scale,
          '--i': intensity,
          '--speed': speed,
          ...style,
        } as CSSProperties
      }
    >
      <div className={styles.wash} />
      {variant === 'floor' ? (
        <>
          <div className={styles.floor}>{plane}</div>
          <div className={styles.horizon} />
        </>
      ) : (
        plane
      )}
      {interactive ? <div className={styles.reveal} /> : null}
      <div className={styles.fade} />
    </div>
  );
}
