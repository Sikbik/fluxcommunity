import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { easeOutExpo } from '@/lib/math';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { observe } from '../internal/observer';

export interface CountUpProps {
  value: number;
  /** Fixed decimals. Default 0. */
  decimals?: number;
  /** Thousands separators. Default true. */
  grouping?: boolean;
  prefix?: string;
  suffix?: string;
  /** Where the first count starts. Default 0. */
  from?: number;
  /** Duration in ms. Default 700 (--dur-4). */
  duration?: number;
  /** Start counting on mount instead of when it scrolls into view. */
  immediate?: boolean;
  className?: string;
}

function fmt(n: number, decimals: number, grouping: boolean): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
  });
}

/**
 * Counts up from 0 (or `from`) the first time it appears, then eases to any new value.
 * Writes straight to the DOM, so a count never re-renders React. Under reduced motion it
 * shows the final value at once. A plain-text copy of the final value is always present
 * for assistive tech.
 *
 *   <CountUp value={network.nodes.total} className="t-stat" />
 */
export function CountUp({
  value,
  decimals = 0,
  grouping = true,
  prefix = '',
  suffix = '',
  from = 0,
  duration = 700,
  immediate = false,
  className,
}: CountUpProps) {
  const reduced = useReducedMotion();
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(from);
  const started = useRef(false);
  const raf = useRef(0);
  const latest = useRef({ value, decimals, grouping, prefix, suffix, duration, reduced });
  latest.current = { value, decimals, grouping, prefix, suffix, duration, reduced };

  const paint = (n: number) => {
    const o = latest.current;
    if (el.current) el.current.textContent = `${o.prefix}${fmt(n, o.decimals, o.grouping)}${o.suffix}`;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `paint` reads through the latest ref
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const run = () => {
      cancelAnimationFrame(raf.current);
      const o = latest.current;
      const start = shown.current;
      const end = o.value;
      if (o.reduced || start === end) {
        shown.current = end;
        paint(end);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / o.duration);
        shown.current = start + (end - start) * easeOutExpo(t);
        paint(shown.current);
        if (t < 1) raf.current = requestAnimationFrame(step);
        else paint(end);
      };
      raf.current = requestAnimationFrame(step);
    };

    if (started.current || immediate || typeof IntersectionObserver === 'undefined') {
      started.current = true;
      run();
      return () => cancelAnimationFrame(raf.current);
    }
    paint(from);
    const stop = observe(node, (entry) => {
      if (!entry.isIntersecting) return;
      started.current = true;
      stop();
      run();
    });
    return () => {
      stop();
      cancelAnimationFrame(raf.current);
    };
  }, [value, reduced, immediate, from]);

  return (
    <span className={cn('t-num', className)}>
      <span className="sr-only">
        {prefix}
        {fmt(value, decimals, grouping)}
        {suffix}
      </span>
      <span ref={el} aria-hidden="true">
        {prefix}
        {fmt(from, decimals, grouping)}
        {suffix}
      </span>
    </span>
  );
}
