import { type CSSProperties, type ElementType, type ReactNode, type Ref, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useMagnetic } from '../hooks/useMagnetic';
import { usePointerGlow } from '../hooks/usePointerGlow';
import { useTilt } from '../hooks/useTilt';
import { mergeRefs } from '../internal/refs';
import styles from './Interaction.module.css';

interface BaseProps {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export interface TiltProps extends BaseProps {
  /** Maximum rotation in degrees. Default 5. */
  max?: number;
  disabled?: boolean;
}

/**
 * Tilts its content toward the pointer. Also writes `--pxp` and `--pyp` (0..1), so
 * children can parallax opposite with the `parallax` class.
 *
 *   <Tilt><img className="parallax" style={{ '--depth': '16px' }} ... /></Tilt>
 */
export function Tilt({ as, max = 5, disabled = false, className, style, children, ref }: TiltProps) {
  const Tag: ElementType = as ?? 'div';
  const local = useRef<HTMLElement | null>(null);
  useTilt(local, { max, enabled: !disabled });
  usePointerGlow(local, { enabled: !disabled });
  return (
    <Tag ref={mergeRefs(local, ref)} className={cn(styles.tilt, className)} style={style}>
      {children}
    </Tag>
  );
}

export interface MagneticProps extends BaseProps {
  /** Maximum drift in px. Default 6. */
  strength?: number;
  /** Pull starts this many px from the edge. Default 80. */
  field?: number;
  disabled?: boolean;
}

/** Makes its content drift toward a fine pointer. Wrap a button or a glyph. */
export function Magnetic({
  as,
  strength = 6,
  field = 80,
  disabled = false,
  className,
  style,
  children,
  ref,
}: MagneticProps) {
  const Tag: ElementType = as ?? 'span';
  const local = useRef<HTMLElement | null>(null);
  useMagnetic(local, { strength, field, enabled: !disabled });
  return (
    <Tag ref={mergeRefs(local, ref)} className={cn(styles.magnetic, className)} style={style}>
      {children}
    </Tag>
  );
}

export interface SpotlightProps extends BaseProps {
  /** Radius of the light in px. Default 260. */
  radius?: number;
  disabled?: boolean;
}

/** A radial light that follows the pointer inside the element. */
export function Spotlight({
  as,
  radius = 260,
  disabled = false,
  className,
  style,
  children,
  ref,
}: SpotlightProps) {
  const Tag: ElementType = as ?? 'div';
  const local = useRef<HTMLElement | null>(null);
  usePointerGlow(local, { enabled: !disabled });
  return (
    <Tag
      ref={mergeRefs(local, ref)}
      className={cn(styles.spot, className)}
      style={{ ...style, '--spot-r': `${radius}px` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
