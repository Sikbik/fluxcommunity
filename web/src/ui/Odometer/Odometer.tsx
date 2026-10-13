import { memo, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '../hooks/useReducedMotion';
import styles from './Odometer.module.css';

export interface OdometerProps {
  value: number;
  /** Fixed decimals. Default 0. */
  decimals?: number;
  /** Thousands separators. Default true. */
  grouping?: boolean;
  /** Pad the integer part to at least this many digits with zeros (clocks: 2). */
  minDigits?: number;
  /** Text before and after the number (e.g. "$", " s"). Not animated. */
  prefix?: string;
  suffix?: string;
  /** A soft light wash when the value changes. Default true. */
  flash?: boolean;
  /** Roll duration in ms. Defaults to the --dur-tick token (520 ms). */
  duration?: number;
  className?: string;
  /** Overrides the screen reader text (default: the formatted number). */
  label?: string;
}

const ROWS = 30; // three repeats of 0..9, so every roll can wrap in either direction
const REST = 10; // the middle repeat

function format(value: number, decimals: number, grouping: boolean, minDigits: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const s = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
    minimumIntegerDigits: Math.max(1, minDigits),
  });
  return safe < 0 ? `−${s}` : s;
}

interface DigitProps {
  digit: number;
  /** +1 the number went up, -1 it went down. */
  dir: 1 | -1;
  order: number;
  animate: boolean;
  duration: number;
}

/** The 30 rows of every strip, built once: the same elements every render, so React skips them. */
const STRIP = Array.from({ length: ROWS }, (_, i) => (
  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed strip of digits
  <span key={i}>{i % 10}</span>
));

/**
 * One rolling digit. Memoised: the parent renders once a second (a clock) or on every block, and
 * only the digits whose value changed need to do anything.
 */
const Digit = memo(function Digit({ digit, dir, order, animate, duration }: DigitProps) {
  const strip = useRef<HTMLSpanElement>(null);
  const prev = useRef(digit);

  useLayoutEffect(() => {
    const el = strip.current;
    const from = prev.current;
    prev.current = digit;
    if (!el || from === digit || !animate) return;
    let target = REST + digit;
    if (dir > 0 && digit < from) target = REST + 10 + digit;
    if (dir < 0 && digit > from) target = digit;
    const anim = el.animate(
      [{ transform: `translateY(${-(REST + from)}em)` }, { transform: `translateY(${-target}em)` }],
      { duration, delay: order * 28, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
    );
    return () => anim.cancel();
  }, [digit, dir, order, animate, duration]);

  return (
    <span className={styles.cell}>
      <span ref={strip} className={styles.strip} style={{ transform: `translateY(${-(REST + digit)}em)` }}>
        {STRIP}
      </span>
    </span>
  );
});

/**
 * A number whose digits roll like an odometer when it changes. Size it with
 * `font-size`; it measures in `em`. Use for block heights and other live counters.
 * The visual is hidden from assistive tech and a plain-text copy is provided with
 * no live region (per-block counters are announced only on demand).
 *
 *   <Odometer value={chain.height} className="t-stat" />
 */
export function Odometer({
  value,
  decimals = 0,
  grouping = true,
  minDigits = 1,
  prefix,
  suffix,
  flash = true,
  duration,
  className,
  label,
}: OdometerProps) {
  const reduced = useReducedMotion();
  const text = format(value, decimals, grouping, minDigits);
  const prevValue = useRef(value);
  const lastDir = useRef<1 | -1>(1);
  const [tick, setTick] = useState(0);
  // Read during render, written after commit: pure under StrictMode's double render. The direction
  // is that of the last real change and stays put across re-renders with the same value, so the
  // memoised digits are not handed a new `dir` for nothing.
  const dir: 1 | -1 = value === prevValue.current ? lastDir.current : value > prevValue.current ? 1 : -1;

  useLayoutEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      lastDir.current = dir;
      setTick((t) => t + 1);
    }
  }, [value, dir]);

  const chars = Array.from(text);
  const total = chars.length;
  const ms = duration ?? 520;
  return (
    <span
      className={cn(styles.odo, className)}
      // Alternating a/b restarts the settle wash on every change.
      data-flash={flash && !reduced && tick > 0 ? (tick % 2 === 0 ? 'a' : 'b') : undefined}
    >
      <span className="sr-only">
        {prefix}
        {label ?? text}
        {suffix}
      </span>
      <span aria-hidden="true" className={styles.cells}>
        {prefix ? <span className={styles.affix}>{prefix}</span> : null}
        {chars.map((ch, i) => {
          const fromRight = total - 1 - i;
          return /\d/.test(ch) ? (
            <Digit
              key={`d${fromRight}`}
              digit={Number(ch)}
              dir={dir}
              order={fromRight}
              animate={!reduced}
              duration={ms}
            />
          ) : (
            <span key={`s${fromRight}`} className={styles.sep}>
              {ch}
            </span>
          );
        })}
        {suffix ? <span className={styles.affix}>{suffix}</span> : null}
      </span>
    </span>
  );
}
