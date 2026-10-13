import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { Glyph } from '../Glyph/Glyph';
import type { GlyphName } from '../Glyph/glyphs';
import type { Status } from '../StatusDot/StatusDot';
import styles from './Chip.module.css';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'> {
  /**
   * `label`: mono uppercase, for tags and metadata (default). `filter`: sentence-case
   * Montserrat, for selectable category chips.
   */
  kind?: 'label' | 'filter';
  /** Colour role. `status` and `tier` below take precedence when set. */
  tone?: 'neutral' | 'accent';
  /** A status colour (reserved meaning; always pair with a word). */
  status?: Status;
  /** A node tier colour. */
  tier?: 'cumulus' | 'nimbus' | 'stratus';
  /** For filter chips: whether it is on. Makes the chip a toggle button (aria-pressed). */
  selected?: boolean;
  /** A glyph before the text. */
  icon?: GlyphName;
  /** A count after the text, in mono (category chips: "Nodes 4"). */
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * A small chamfered tag. Renders a `span` normally, and a toggle `button` when it is
 * interactive (`onClick` or `selected` given).
 *
 *   <Chip tier="stratus" icon="tier-stratus">Stratus</Chip>
 *   <Chip kind="filter" selected={cat === 'nodes'} count={4} onClick={...}>Nodes</Chip>
 */
export function Chip({
  kind = 'label',
  tone = 'neutral',
  status,
  tier,
  selected,
  icon,
  count,
  size = 'md',
  className,
  children,
  ref,
  onClick,
  ...rest
}: ChipProps) {
  const interactive = typeof onClick === 'function' || selected !== undefined;
  const common = {
    className: cn('chamfer', styles.chip, className),
    'data-kind': kind,
    'data-tone': tone,
    'data-size': size,
    'data-status': status,
    'data-tier': tier,
    'data-selected': selected ? 'true' : undefined,
    'data-interactive': interactive ? 'true' : undefined,
  };
  const body = (
    <span className={styles.content}>
      {icon ? <Glyph name={icon} size={size === 'sm' ? 12 : 14} /> : null}
      {children != null ? <span className={styles.text}>{children}</span> : null}
      {count !== undefined ? <span className={styles.count}>{formatInt(count)}</span> : null}
    </span>
  );
  if (interactive) {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        {...common}
        {...rest}
      >
        {body}
      </button>
    );
  }
  // A static chip is a span: it keeps the caller's aria-*, data-*, id, title and handlers (they used
  // to be dropped) but not the attributes that only mean something on a button.
  const {
    type: _type,
    disabled: _disabled,
    name: _name,
    value: _value,
    form: _form,
    formAction: _formAction,
    formEncType: _formEncType,
    formMethod: _formMethod,
    formNoValidate: _formNoValidate,
    formTarget: _formTarget,
    ...spanProps
  } = rest;
  return (
    <span ref={ref as Ref<HTMLSpanElement>} {...(spanProps as HTMLAttributes<HTMLSpanElement>)} {...common}>
      {body}
    </span>
  );
}
