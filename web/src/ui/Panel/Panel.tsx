import { type ComponentPropsWithoutRef, type ElementType, type ReactNode, type Ref, useRef } from 'react';
import { cn } from '@/lib/cn';
import { usePointerGlow } from '../hooks/usePointerGlow';
import { useStageFocus } from '../hooks/useStageFocus';
import { useTilt } from '../hooks/useTilt';
import { mergeRefs } from '../internal/refs';
import styles from './Panel.module.css';

export type PanelCorner = 'tl' | 'tr' | 'bl' | 'br';

interface PanelOwnProps {
  /**
   * `glass` (default): blurred glass. `slab`: near-opaque, no blur (use for long lists and
   * anywhere many panels stack). `ghost`: edge and ticks only.
   */
  variant?: 'glass' | 'slab' | 'ghost';
  /** Chamfer size: sm 8 px, md 14 px (default), lg 22 px. */
  size?: 'sm' | 'md' | 'lg';
  /** Inner padding. Default `md`. `none` for full-bleed media (pair with `clip`). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover spotlight, edge catch and press compression. Default false. */
  interactive?: boolean;
  /** Tilt up to 5 degrees toward the pointer. true uses the token; a number sets the maximum. */
  tilt?: boolean | number;
  /**
   * Light the lattice beneath this panel while it is hovered or focused (useStageFocus).
   * true uses strength 0.6; a number sets it (0..1).
   */
  stageFocus?: boolean | number;
  /** Which corner the edge is hottest at. Default `tr`. */
  hot?: PanelCorner | 'none';
  /** Which corner the hex pattern fades in from. Default `br`. */
  pattern?: PanelCorner | 'none';
  /** Corner crosshairs and tick rulers. Default true. */
  ticks?: boolean;
  /** The soft bloom around the slab. Default true; turn off for dense lists. */
  halo?: boolean;
  /** Clip the content to the chamfer (for full-bleed media). Default false. */
  clip?: boolean;
  /** Make the panel a size container so children can use `@container` queries. */
  container?: boolean;
  /** Re-points the accent roles for this panel to a node tier colour. */
  tier?: 'cumulus' | 'nimbus' | 'stratus';
  /**
   * Let `mix-blend-mode` art inside the panel (emissive pieces on black, `screen`) blend with
   * what is painted behind it, instead of with the panel's own isolated group, where black stays
   * black and the art shows as a box. The panel drops its stacking context (tilt, press
   * compression and `clip` are off), so the art blends with the panel's own glass and the stage
   * under it. Works only when no ancestor of the panel is a stacking context either; see the
   * README ("Blended art inside a Panel").
   */
  blendArt?: boolean;
  className?: string;
  /** Class for the inner content wrapper (for layout: flex, grid, scrolling). */
  contentClassName?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export type PanelProps<T extends ElementType = 'div'> = PanelOwnProps & {
  /** The element to render. Default `div`. Use `a`, `button`, `li`, `article`, `section`... */
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof PanelOwnProps | 'as'>;

/**
 * The glass slab: chamfered corners, a gradient edge that is hot on one cut, a faint hex
 * lattice, grain, corner ticks and a cursor spotlight. The surface every card, tile and
 * stat in the site sits on.
 *
 *   <Panel padding="lg" hot="tr" pattern="br">...</Panel>
 *   <Panel as="a" href="..." interactive tilt stageFocus>...</Panel>
 */
export function Panel<T extends ElementType = 'div'>({
  as,
  variant = 'glass',
  size = 'md',
  padding = 'md',
  interactive = false,
  tilt = false,
  stageFocus = false,
  hot = 'tr',
  pattern = 'br',
  ticks = true,
  halo = true,
  clip = false,
  container = false,
  tier,
  blendArt = false,
  className,
  contentClassName,
  children,
  ref,
  ...rest
}: PanelProps<T>) {
  const Tag: ElementType = as ?? 'div';
  const local = useRef<HTMLElement | null>(null);
  const tiltMax = typeof tilt === 'number' ? tilt : 5;
  const focusStrength = typeof stageFocus === 'number' ? stageFocus : 0.6;

  const tilting = interactive && tilt !== false && !blendArt;
  usePointerGlow(local, { enabled: interactive });
  useTilt(local, { max: tiltMax, enabled: tilting });
  useStageFocus(local, focusStrength, { enabled: stageFocus !== false });

  const props = rest as Record<string, unknown>;
  const clickable = Tag === 'a' || Tag === 'button' || typeof props.onClick === 'function';

  return (
    <Tag
      ref={mergeRefs(local, ref)}
      className={cn('chamfer', styles.panel, className)}
      data-variant={variant}
      data-size={size}
      data-pad={padding}
      data-interactive={interactive || undefined}
      data-clickable={clickable && interactive ? 'true' : undefined}
      data-tilt={tilting ? 'true' : undefined}
      data-blend={blendArt ? 'true' : undefined}
      data-hot={hot}
      data-pattern={pattern}
      data-ticks={ticks ? undefined : 'false'}
      data-halo={halo ? undefined : 'false'}
      data-clip={clip ? 'true' : undefined}
      data-container={container ? '' : undefined}
      data-tier={tier}
      {...rest}
    >
      <span className={styles.halo} aria-hidden="true" />
      <span className={styles.edge} aria-hidden="true" />
      <span className={styles.fill} aria-hidden="true" />
      <span className={styles.pattern} aria-hidden="true" />
      <span className={styles.grain} aria-hidden="true" />
      <span className={styles.spot} aria-hidden="true" />
      <span className={styles.marks} aria-hidden="true" />
      <div className={cn(styles.content, contentClassName)}>{children}</div>
    </Tag>
  );
}
