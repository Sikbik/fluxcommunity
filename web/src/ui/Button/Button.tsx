import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { NewTabHint } from '../ExtLink/NewTabHint';
import { Glyph } from '../Glyph/Glyph';
import type { GlyphName } from '../Glyph/glyphs';
import { useMagnetic } from '../hooks/useMagnetic';
import { outboundLink } from '../internal/links';
import { mergeRefs } from '../internal/refs';
import styles from './Button.module.css';

export interface ButtonVisualProps {
  /** `primary` (lit accent), `secondary` (glass, default), `ghost` (text), `icon` (square or hex). */
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  /** sm 36 px, md 44 px (default), lg 52 px. Touch devices always get a 44 px target. */
  size?: 'sm' | 'md' | 'lg';
  /** A glyph before the label (or the only glyph of an `icon` button). */
  icon?: GlyphName;
  /** A glyph after the label. */
  iconEnd?: GlyphName;
  /**
   * Drift toward a fine pointer within 80 px (max 6 px). Defaults to true for `primary`
   * and `icon`. A number sets the maximum drift in px.
   */
  magnetic?: boolean | number;
  /** Shows a spinner, keeps the width, and ignores presses. */
  loading?: boolean;
  /** Fill the container's width. */
  fullWidth?: boolean;
  /** `hex` makes an icon button a hexagon (the cell). */
  shape?: 'chamfer' | 'hex';
  /** Accessible name. REQUIRED for `variant="icon"` (there is no visible text). */
  label?: string;
  /**
   * Visually hidden until it has focus: for a skip link or a keyboard-only action. It stays in the
   * tab order and is announced as usual. It is out of the layout flow in both states (showing it
   * moves nothing), so give it a `className` that positions it where it should appear.
   */
  hiddenUntilFocus?: boolean;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = ButtonVisualProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonVisualProps> & { ref?: Ref<HTMLButtonElement> };

export type LinkButtonProps = ButtonVisualProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonVisualProps> & {
    href: string;
    /** Append `?utm_source=community` to external URLs. */
    withUtm?: boolean;
    /** Open in a new tab. Defaults to true for external URLs. */
    newTab?: boolean;
    ref?: Ref<HTMLAnchorElement>;
  };

interface InnerProps extends ButtonVisualProps {
  Tag: 'button' | 'a';
  forwardedRef?: Ref<HTMLElement>;
  rest: Record<string, unknown>;
  external?: boolean;
}

function ButtonBase({
  Tag,
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  magnetic,
  loading = false,
  fullWidth = false,
  shape = 'chamfer',
  label,
  hiddenUntilFocus = false,
  className,
  children,
  forwardedRef,
  rest,
  external,
}: InnerProps) {
  const local = useRef<HTMLElement | null>(null);
  const magnet = magnetic ?? (variant === 'primary' || variant === 'icon');
  useMagnetic(local, {
    enabled: magnet !== false && !loading,
    strength: typeof magnet === 'number' ? magnet : 6,
  });

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;
  const disabled = rest.disabled === true || rest['aria-disabled'] === true || loading;
  const Element = Tag as 'button';
  const extra: Record<string, unknown> = { ...rest };
  if (Tag === 'a' && disabled) {
    extra['aria-disabled'] = true;
    extra.tabIndex = -1;
    extra.onClick = (e: Event) => e.preventDefault();
  }
  if (Tag === 'button' && loading) extra['aria-disabled'] = true;

  return (
    <Element
      ref={mergeRefs(local as unknown as Ref<HTMLButtonElement>, forwardedRef as Ref<HTMLButtonElement>)}
      className={cn('chamfer', styles.btn, className)}
      data-variant={variant}
      data-size={size}
      data-shape={shape === 'hex' ? 'hex' : undefined}
      data-full={fullWidth ? 'true' : undefined}
      data-loading={loading ? 'true' : undefined}
      data-until-focus={hiddenUntilFocus ? 'true' : undefined}
      aria-busy={loading || undefined}
      aria-label={label}
      {...(Tag === 'button'
        ? { type: (rest.type as 'button' | 'submit' | 'reset' | undefined) ?? 'button' }
        : {})}
      {...extra}
    >
      <span className={styles.edge} aria-hidden="true" />
      <span className={styles.face} aria-hidden="true" />
      <span className={styles.content}>
        {icon ? <Glyph name={icon} size={iconSize} /> : null}
        {variant !== 'icon' && children != null ? <span className={styles.label}>{children}</span> : null}
        {iconEnd ? <Glyph name={iconEnd} size={iconSize} /> : null}
        {external ? <NewTabHint /> : null}
      </span>
      {loading ? (
        <span className={styles.spinner} aria-hidden="true">
          {/* The HTML box spins, not the svg: a CSS transform on an svg is never composited. */}
          <span className={styles.spin}>
            <svg
              viewBox="0 0 24 24"
              width={iconSize + 2}
              height={iconSize + 2}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 2.5L20.2 7.25V16.75L12 21.5L3.8 16.75V7.25Z" opacity="0.3" />
              <path
                d="M12 2.5L20.2 7.25V16.75L12 21.5L3.8 16.75V7.25Z"
                pathLength="100"
                strokeDasharray="28 72"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </span>
      ) : null}
    </Element>
  );
}

/**
 * The button. Chamfered, magnetic (primary and icon), with a focus beam.
 *
 *   <Button variant="primary" iconEnd="arrow-right" onClick={...}>Explore community builds</Button>
 *   <Button variant="icon" icon="copy" label="Copy link" />
 */
export function Button({
  ref,
  variant,
  size,
  icon,
  iconEnd,
  magnetic,
  loading,
  fullWidth,
  shape,
  label,
  hiddenUntilFocus,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <ButtonBase
      Tag="button"
      variant={variant}
      size={size}
      icon={icon}
      iconEnd={iconEnd}
      magnetic={magnetic}
      loading={loading}
      fullWidth={fullWidth}
      shape={shape}
      label={label}
      hiddenUntilFocus={hiddenUntilFocus}
      className={className}
      forwardedRef={ref as Ref<HTMLElement>}
      rest={rest}
    >
      {children}
    </ButtonBase>
  );
}

/**
 * A link that looks like a button. External URLs open in a new tab with
 * `rel="noopener noreferrer"` and a hidden "Opens in a new tab".
 *
 *   <LinkButton href="https://cloud.runonflux.com" withUtm variant="primary" iconEnd="arrow-up-right">Open FluxCloud</LinkButton>
 */
export function LinkButton({
  ref,
  href,
  withUtm = false,
  newTab,
  variant,
  size,
  icon,
  iconEnd,
  magnetic,
  loading,
  fullWidth,
  shape,
  label,
  hiddenUntilFocus,
  className,
  children,
  target,
  rel,
  ...rest
}: LinkButtonProps) {
  const link = outboundLink(href, { withUtm, newTab });
  return (
    <ButtonBase
      Tag="a"
      variant={variant}
      size={size}
      icon={icon}
      iconEnd={iconEnd}
      magnetic={magnetic}
      loading={loading}
      fullWidth={fullWidth}
      shape={shape}
      label={label}
      hiddenUntilFocus={hiddenUntilFocus}
      className={className}
      forwardedRef={ref as Ref<HTMLElement>}
      external={link.newTab}
      rest={{
        ...link.props,
        target: target ?? link.props.target,
        rel: rel ?? link.props.rel,
        ...rest,
      }}
    >
      {children}
    </ButtonBase>
  );
}
