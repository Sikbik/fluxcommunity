import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useChainHeight } from '@/data';
import { cn } from '@/lib/cn';
import { hexPath } from '@/lib/hex';
import styles from './fx.module.css';
import type { FxId } from './tiles';

/**
 * Per-tile micro animations. They render INSIDE the art frame, so every position is a
 * percentage of the art and they move, drift and zoom with it. All of them are CSS: they
 * idle slowly while the bento is on screen, play brisker while the tile is hovered or
 * focused, and are removed under reduced motion. Positions are read off the art itself (see
 * the coordinates in fx.module.css); every one stays decorative and aria-hidden.
 *
 * Two slots: `FxUnder` paints behind the art (echoes), `FxOver` in front of it.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** The pointer's specular highlight, clipped to the object's own light by the art alpha. */
export function Glint() {
  return <span className={cn(styles.mask, styles.glint)} />;
}

/** A band of light that crosses the object. `angle` is the gradient angle in degrees. */
export function Sheen({
  angle = 108,
  delay = 0,
  slow = 1,
}: {
  angle?: number;
  delay?: number;
  slow?: number;
}) {
  const v: Vars = { '--sheen-angle': `${angle}deg`, '--sd': `${delay}s`, '--ss': slow };
  return (
    <span className={styles.mask}>
      <span className={styles.band} style={v} />
    </span>
  );
}

const HEX = hexPath(13, 15, 12.4);

function HexChip({
  x,
  y,
  size,
  delay,
  spin = 1,
}: {
  x: number;
  y: number;
  size: number;
  delay: number;
  spin?: 1 | -1;
}) {
  const v: Vars = { '--x': `${x}%`, '--y': `${y}%`, '--s': `${size}%`, '--d': `${delay}s`, '--spin': spin };
  return (
    <svg className={styles.chip} style={v} viewBox="0 0 26 30" aria-hidden="true" focusable="false">
      <path d={HEX} />
    </svg>
  );
}

/**
 * The explorer's live detail: when the chain tip moves, one brighter block leaves the near
 * end and travels the chain. Nothing renders before the first height or without a change, so
 * offline (or on fallback numbers) the tile just idles.
 */
function ArrivingBlock() {
  const height = useChainHeight();
  const seen = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (height === null) return;
    if (seen.current !== null && height > seen.current) setTick((t) => t + 1);
    seen.current = height;
  }, [height]);

  if (tick === 0) return null;
  return (
    <span key={tick} className={styles.arrival}>
      <span className={styles.arrivalCube} />
    </span>
  );
}

export function FxUnder({ id }: { id: FxId }) {
  switch (id) {
    case 'cloud':
      // Echoes: the stack replicated across nodes, fading away behind it.
      return (
        <>
          <span className={cn(styles.echo, styles.echo1)} />
          <span className={cn(styles.echo, styles.echo2)} />
        </>
      );
    default:
      return null;
  }
}

export function FxOver({ id }: { id: FxId }) {
  switch (id) {
    case 'cloud':
      // Containers dock: a copy of the top row slides in and lights the stack as it lands.
      return (
        <>
          <Sheen angle={112} delay={1.5} />
          <span className={styles.arrive} />
          <Glint />
        </>
      );

    case 'docs':
      // Code light: a scan line crosses the pages and the lines glow as it passes.
      return (
        <>
          <span className={styles.mask}>
            <span className={styles.scan} />
          </span>
          <Glint />
        </>
      );

    case 'edge':
      // Traces light up: a ring of light leaves the die core and runs out along the circuits.
      return (
        <>
          <span className={styles.mask}>
            <span className={styles.pulse} />
            <span className={cn(styles.pulse, styles.pulseLate)} />
          </span>
          <Glint />
        </>
      );

    case 'ai':
      // The orb breathes (the layer scales) and its core brightens with each breath.
      return (
        <>
          <span className={styles.mask}>
            <span className={styles.core} />
          </span>
          <Glint />
        </>
      );

    case 'games':
      // Hex tiles flip: loose glass tiles turn over, one after another, around the pad.
      return (
        <>
          <Sheen angle={100} delay={3} />
          <HexChip x={13} y={34} size={7} delay={0} />
          <HexChip x={29} y={14} size={5.5} delay={0.5} spin={-1} />
          <HexChip x={72} y={12} size={6} delay={1} />
          <HexChip x={87} y={30} size={7.5} delay={1.5} spin={-1} />
          <HexChip x={92} y={58} size={5} delay={2} />
          <Glint />
        </>
      );

    case 'explorer':
      // A chain of blocks slides: new blocks leave the near end and travel the chain.
      return (
        <>
          <span className={cn(styles.track)} style={{ '--td': '0s' } as Vars}>
            <span className={styles.cube} />
          </span>
          <span className={cn(styles.track)} style={{ '--td': '-1.7s' } as Vars}>
            <span className={styles.cube} />
          </span>
          <span className={cn(styles.track)} style={{ '--td': '-3.4s' } as Vars}>
            <span className={styles.cube} />
          </span>
          <ArrivingBlock />
          <Sheen angle={118} delay={2} />
          <Glint />
        </>
      );

    case 'node':
      // A node pulses: concentric rings leave the base of the pillar.
      return (
        <>
          <span className={styles.ripple} style={{ '--rd': '0s' } as Vars} />
          <span className={styles.ripple} style={{ '--rd': '-1.2s' } as Vars} />
          <span className={styles.ripple} style={{ '--rd': '-2.4s' } as Vars} />
          <Glint />
        </>
      );

    case 'site':
      // The lattice horizon: a bright seam breathes and a spark runs along it.
      return (
        <>
          <span className={styles.mask}>
            <span className={styles.seam} />
          </span>
          <Sheen angle={92} delay={1} slow={1.3} />
          <Glint />
        </>
      );

    case 'wallet':
      // Key glint: a narrow sheen and a four point flare on the key's bow.
      return (
        <>
          <Sheen angle={122} delay={0.5} slow={0.9} />
          <span className={styles.flare} />
          <Glint />
        </>
      );

    default:
      return null;
  }
}
