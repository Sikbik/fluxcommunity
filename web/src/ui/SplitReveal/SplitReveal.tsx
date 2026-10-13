import {
  Children,
  type CSSProperties,
  cloneElement,
  type ElementType,
  Fragment,
  isValidElement,
  type ReactNode,
  type Ref,
  useLayoutEffect,
  useRef,
} from 'react';
import { cn } from '@/lib/cn';
import { useRevealTrigger } from '../hooks/useRevealTrigger';
import { mergeRefs } from '../internal/refs';
import { observeResize } from '../internal/useResizeObserver';
import styles from './SplitReveal.module.css';

export interface SplitRevealProps {
  /** Element to render. Default `span`; use `h1`, `h2`, `p`. */
  as?: ElementType;
  /** `word` staggers each word; `line` staggers each visual line (measured, reflows on resize). */
  by?: 'word' | 'line';
  /** Delay before the first word, ms. */
  delay?: number;
  /** Stagger between words (or lines), ms. Default 40 for words, 110 for lines. */
  stagger?: number;
  /** Reveal on mount rather than on entering the viewport. */
  immediate?: boolean;
  /** Hold the reveal (for example until the intro is done). */
  hold?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Text, with inline elements allowed: `Built by the <b>community</b>.` */
  children: ReactNode;
  ref?: Ref<HTMLElement>;
  id?: string;
}

/** Splits string children into word spans, recursing through inline elements. */
function split(node: ReactNode, counter: { n: number }): ReactNode {
  if (typeof node === 'number') return split(String(node), counter);
  if (typeof node === 'string') {
    const parts = node.split(/(\s+)/).filter((p) => p !== '');
    return (
      <>
        {parts.map((part, i) => {
          if (/^\s+$/.test(part)) return part;
          const index = counter.n++;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one string are static and ordered
            <span key={i} className={styles.word} data-w="">
              <span className={styles.inner} style={{ '--i': index } as CSSProperties}>
                {part}
              </span>
            </span>
          );
        })}
      </>
    );
  }
  if (Array.isArray(node)) {
    return Children.toArray(node).map((child, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: children are static and ordered
      <Fragment key={i}>{split(child, counter)}</Fragment>
    ));
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.props.children === undefined) return node;
    return cloneElement(node, undefined, split(node.props.children, counter));
  }
  return node;
}

/**
 * Headline reveal: words (or lines) rise out of their line box in sequence.
 *
 *   <SplitReveal as="h2" className="t-h2">What the <b>community</b> built.</SplitReveal>
 */
export function SplitReveal({
  as,
  by = 'word',
  delay = 0,
  stagger,
  immediate = false,
  hold = false,
  className,
  style,
  children,
  ref,
  ...rest
}: SplitRevealProps) {
  const Tag: ElementType = as ?? 'span';
  const local = useRef<HTMLElement | null>(null);
  const shown = useRevealTrigger(local, { immediate, hold });
  const step = stagger ?? (by === 'line' ? 110 : 40);

  // Line mode: give every word on the same visual line the same index. Measures every word first and
  // writes afterwards (a write between two reads would force a layout per word), and runs from
  // `observeResize`'s frame callback rather than inside the observer's own notification.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `children` re-measures the lines when the text changes
  useLayoutEffect(() => {
    const root = local.current;
    if (!root || by !== 'line') return;
    const apply = () => {
      const words = Array.from(root.querySelectorAll<HTMLElement>('[data-w]'));
      const tops = words.map((w) => w.offsetTop);
      let line = -1;
      let top = Number.NEGATIVE_INFINITY;
      const indices = tops.map((y) => {
        if (Math.abs(y - top) > 4) {
          line++;
          top = y;
        }
        return line;
      });
      words.forEach((w, i) => {
        (w.firstElementChild as HTMLElement | null)?.style.setProperty('--i', String(indices[i]));
      });
    };
    return observeResize([root], apply, { immediate: true });
  }, [by, children]);

  const counter = { n: 0 };
  return (
    <Tag
      ref={mergeRefs(local, ref)}
      className={cn(styles.root, className)}
      data-shown={shown ? 'true' : 'false'}
      style={{ ...style, '--split-step': `${step}ms`, '--split-delay': `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {split(children, counter)}
    </Tag>
  );
}
