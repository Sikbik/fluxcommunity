import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type Ref,
  useRef,
} from 'react';
import { cn } from '@/lib/cn';
import { useRevealTrigger } from '../hooks/useRevealTrigger';
import { mergeRefs } from '../internal/refs';
import styles from './Reveal.module.css';

interface RevealOwnProps {
  /** Extra delay in ms. */
  delay?: number;
  /** Position in a staggered group: adds `index * 60 ms` to the delay. */
  index?: number;
  /** Where it travels from. Default `up`. */
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  /** Animate the 8 px blur too. Default true. */
  blur?: boolean;
  /** Reveal on mount, for above-the-fold content. Default false (reveals on entering the viewport). */
  immediate?: boolean;
  /** Reveal again whenever it re-enters. Default false. */
  repeat?: boolean;
  /** Hold the reveal (for example until the intro is done). */
  hold?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * The props of `Reveal` for the element it renders (`as`, default `div`): everything that element
 * takes (`id`, `aria-*`, `data-*`, `role`, event handlers, `href` for `as="a"`...) besides the
 * Reveal's own.
 */
export type RevealProps<T extends ElementType = 'div'> = RevealOwnProps & {
  /** Element to render. Default `div`. */
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof RevealOwnProps | 'as'>;

const STAGGER_MS = 60;

/**
 * Entrance animation: fade, rise and un-blur, once, when it scrolls into view.
 *
 *   <Reveal>...</Reveal>
 *   {items.map((it, i) => <Reveal key={it.id} index={i}>...</Reveal>)}
 */
export function Reveal<T extends ElementType = 'div'>({
  as,
  delay = 0,
  index = 0,
  direction = 'up',
  blur = true,
  immediate = false,
  repeat = false,
  hold = false,
  className,
  style,
  children,
  ref,
  ...rest
}: RevealProps<T>) {
  const Tag: ElementType = as ?? 'div';
  const local = useRef<HTMLElement | null>(null);
  const shown = useRevealTrigger(local, { immediate, repeat, hold });
  const total = delay + index * STAGGER_MS;
  return (
    <Tag
      ref={mergeRefs(local, ref)}
      className={cn(styles.reveal, className)}
      data-shown={shown ? 'true' : 'false'}
      data-dir={direction}
      data-blur={blur ? undefined : 'false'}
      style={total > 0 ? ({ ...style, '--rd': `${total}ms` } as CSSProperties) : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
