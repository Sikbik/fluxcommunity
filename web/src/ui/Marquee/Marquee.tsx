import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { Button } from '../Button/Button';
import { useInView } from '../hooks/useInView';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { observeResize } from '../internal/useResizeObserver';
import styles from './Marquee.module.css';

/** What `renderItem` and the item callbacks are told about one item. */
export interface MarqueeItemState {
  /** Position of the item in `items`. */
  index: number;
  /** Which copy of the run is being rendered (0 is the one assistive technology reads). */
  copy: number;
  /** The pointer is over this item, in any copy: the copies of one item light together. */
  hovered: boolean;
  /** Keyboard focus is inside this item, in any copy. */
  focused: boolean;
}

/** What the item callbacks receive besides the item. */
export interface MarqueeItemInfo {
  index: number;
  copy: number;
  /** The item's wrapper element (a `li`), for its rectangle. */
  element: HTMLElement;
}

interface MarqueeBase {
  /** Speed in px per second. Default 36. */
  speed?: number;
  direction?: 'left' | 'right';
  /** Gap between items in px. Default 32. */
  gap?: number;
  /**
   * Show the built-in pause and play button (WCAG 2.2.2). Default true. It sits in its own cell
   * after the track, so it never covers a name. Hover and focus always pause, and so does
   * leaving the screen.
   */
  control?: boolean;
  /**
   * Pause from outside (controlled). With `onPausedChange` the built-in button reports its
   * presses, so a page can keep its own control in step; with `control={false}` the page's own
   * button just sets this.
   */
  paused?: boolean;
  /** The built-in button asked for this value. */
  onPausedChange?: (paused: boolean) => void;
  /** Mark the whole marquee decorative and hide it from assistive tech. */
  decorative?: boolean;
  /** Names the marquee region for assistive tech. */
  label?: string;
  className?: string;
}

interface MarqueeWithChildren extends MarqueeBase {
  /** The items of one run. They repeat to fill the row. */
  children: ReactNode;
  items?: never;
  renderItem?: never;
}

interface MarqueeWithItems<T> extends MarqueeBase {
  /** The data of one run. Each item is rendered once per copy by `renderItem`. */
  items: readonly T[];
  /** Renders one item. Called per copy; `state` carries the hover and focus of that item. */
  renderItem: (item: T, state: MarqueeItemState) => ReactNode;
  /** A stable key per item. Default: the index. */
  getKey?: (item: T, index: number) => string | number;
  /**
   * Let the pointer reach the duplicated copies, so hover (and `onItemEnter`) works wherever the
   * name is on its way past. The copies are still `aria-hidden`, so they must not hold anything
   * focusable. Default false: the copies are `inert`.
   */
  hoverCopies?: boolean;
  onItemEnter?: (item: T, info: MarqueeItemInfo) => void;
  onItemLeave?: (item: T, info: MarqueeItemInfo) => void;
  onItemFocus?: (item: T, info: MarqueeItemInfo) => void;
  onItemBlur?: (item: T, info: MarqueeItemInfo) => void;
  children?: never;
}

export type MarqueeProps<T = unknown> = MarqueeWithChildren | MarqueeWithItems<T>;

/**
 * A pausable, seamless ticker. Pauses on hover, on focus within, off-screen, behind the
 * button, and holds still (as a wrapped list) under reduced motion. Duplicated runs are
 * hidden from assistive tech, so the content is read once.
 *
 *   <Marquee label="Games on Flux">{games.map(g => <span key={g}>{g}</span>)}</Marquee>
 *
 * Or data-driven, with hover and focus state per item:
 *
 *   <Marquee label="Games" items={games} getKey={(g) => g.id}
 *     renderItem={(g, s) => <span data-lit={s.hovered || undefined}>{g.name}</span>}
 *     onItemEnter={(g, { element }) => ripple(element.getBoundingClientRect())} />
 */
export function Marquee<T = unknown>(props: MarqueeProps<T>) {
  const {
    speed = 36,
    direction = 'left',
    gap = 32,
    control = true,
    paused: pausedProp,
    onPausedChange,
    decorative = false,
    label,
    className,
  } = props;
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLElement | null>(null);
  const setMeasure = useCallback((el: HTMLElement | null) => {
    measure.current = el;
  }, []);
  // The data-driven half of the props, or null in children mode.
  const data = props.items !== undefined ? (props as MarqueeWithItems<T>) : null;
  const inView = useInView(root, { rootMargin: '120px' });
  const [ownPaused, setOwnPaused] = useState(false);
  const paused = pausedProp ?? ownPaused;
  const [copies, setCopies] = useState(2);
  const [duration, setDuration] = useState(40);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const hoverEl = useRef<HTMLElement | null>(null);
  const focusEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const m = measure.current;
    const r = root.current;
    if (!m || !r) return;
    const update = () => {
      const run = m.getBoundingClientRect().width;
      const view = r.getBoundingClientRect().width;
      if (run <= 0) return;
      // Enough runs that the track is at least one viewport plus one run wide; always even
      // so translating by -50% lands on an identical frame.
      const needed = Math.max(2, Math.ceil(view / run) + 1);
      const even = needed % 2 === 0 ? needed : needed + 1;
      setCopies(even);
      setDuration((run * even) / 2 / Math.max(8, speed));
    };
    // Frame-deferred: measuring inside the observer's own callback raised the "loop completed with
    // undelivered notifications" window error on every resize.
    return observeResize([m, r], update, { immediate: true });
  }, [speed]);

  const idle = paused || !inView;
  const toggle = () => {
    const next = !paused;
    if (pausedProp === undefined) setOwnPaused(next);
    onPausedChange?.(next);
  };

  // Item bookkeeping (data-driven mode only).
  const itemOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('[data-marquee-item]') : null;
  const infoOf = (el: HTMLElement): MarqueeItemInfo => ({
    index: Number(el.dataset.marqueeItem),
    copy: Number(el.dataset.marqueeCopy),
    element: el,
  });
  const itemAt = (el: HTMLElement): T | undefined => data?.items[Number(el.dataset.marqueeItem)];

  const onOver = (e: PointerEvent<HTMLDivElement>) => {
    if (!data || e.pointerType === 'touch') return;
    const el = itemOf(e.target);
    if (!el || el === hoverEl.current) return;
    const prev = hoverEl.current;
    hoverEl.current = el;
    if (prev) {
      const was = itemAt(prev);
      if (was !== undefined) data.onItemLeave?.(was, infoOf(prev));
    }
    setHovered(Number(el.dataset.marqueeItem));
    const it = itemAt(el);
    if (it !== undefined) data.onItemEnter?.(it, infoOf(el));
  };
  const onLeave = () => {
    const prev = hoverEl.current;
    hoverEl.current = null;
    setHovered(null);
    if (prev && data) {
      const was = itemAt(prev);
      if (was !== undefined) data.onItemLeave?.(was, infoOf(prev));
    }
  };
  const onFocusIn = (e: FocusEvent<HTMLDivElement>) => {
    if (!data) return;
    const el = itemOf(e.target);
    if (!el || el === focusEl.current) return;
    focusEl.current = el;
    setFocused(Number(el.dataset.marqueeItem));
    const it = itemAt(el);
    if (it !== undefined) data.onItemFocus?.(it, infoOf(el));
  };
  const onFocusOut = (e: FocusEvent<HTMLDivElement>) => {
    if (!data) return;
    const el = focusEl.current;
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    focusEl.current = null;
    setFocused(null);
    const it = itemAt(el);
    if (it !== undefined) data.onItemBlur?.(it, infoOf(el));
  };

  const copyCount = reduced ? 1 : copies;
  const hoverCopies = data?.hoverCopies ?? false;

  const renderCopy = (c: number) => {
    const dup = c > 0;
    const common = {
      ref: c === 0 ? setMeasure : undefined,
      className: cn(styles.copy, dup && styles.dup),
      'aria-hidden': dup ? true : undefined,
      // Duplicates must not be tabbable; `inert` also stops the pointer, so a data-driven marquee
      // that wants hover on its copies opts out with `hoverCopies` (and keeps them unfocusable).
      ...(dup && !hoverCopies ? { inert: true } : {}),
    };
    if (data) {
      return (
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it
        <ul key={c} {...common} role="list">
          {data.items.map((item, i) => (
            <li
              key={data.getKey ? data.getKey(item, i) : i}
              className={styles.item}
              data-marquee-item={i}
              data-marquee-copy={c}
              data-hovered={hovered === i ? 'true' : undefined}
              data-focused={focused === i ? 'true' : undefined}
            >
              {data.renderItem(item, { index: i, copy: c, hovered: hovered === i, focused: focused === i })}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div key={c} {...common}>
        {props.children}
      </div>
    );
  };

  return (
    <div
      ref={root}
      className={cn(styles.root, className)}
      data-paused={idle ? 'true' : undefined}
      data-control={control && !decorative ? 'true' : undefined}
      {...(decorative ? { 'aria-hidden': true } : { role: 'group', 'aria-label': label })}
      style={
        {
          '--marquee-gap': `${gap}px`,
          '--marquee-dur': `${duration}s`,
          '--marquee-dir': direction === 'right' ? 'reverse' : 'normal',
        } as CSSProperties
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: event delegation for the items inside; the viewport is not itself a control */}
      <div
        className={styles.viewport}
        onPointerOver={onOver}
        onPointerLeave={onLeave}
        onFocus={onFocusIn}
        onBlur={onFocusOut}
      >
        <div className={styles.track}>{Array.from({ length: copyCount }, (_, c) => renderCopy(c))}</div>
      </div>
      {control && !decorative ? (
        <div className={styles.dock}>
          <Button
            className={styles.control}
            variant="icon"
            size="sm"
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Play the ticker' : 'Pause the ticker'}
            magnetic={false}
            onClick={toggle}
          />
        </div>
      ) : null}
    </div>
  );
}
