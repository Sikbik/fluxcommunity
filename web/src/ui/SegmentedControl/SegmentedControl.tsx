import { type CSSProperties, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Glyph } from '../Glyph/Glyph';
import type { GlyphName } from '../Glyph/glyphs';
import { useSlider } from '../internal/useSlider';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: GlyphName;
  count?: number;
  /** Accessible name when the label is an icon only. */
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  /** REQUIRED: names the group, e.g. "View". */
  'aria-label': string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * A single-choice switch between a few views (Cells | Constellation). A radio group:
 * arrows move and select, Home and End jump, one tab stop. The thumb slides.
 *
 *   <SegmentedControl aria-label="View" value={view} onValueChange={setView}
 *     options={[{ value: 'cells', label: 'Cells', icon: 'cells' }, { value: 'graph', label: 'Constellation', icon: 'constellation' }]} />
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  fullWidth = false,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const slider = useSlider(list, value, '[aria-checked="true"]');

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = options.length - 1;
    const target = options[next];
    if (!target) return;
    onValueChange(target.value);
    requestAnimationFrame(() => {
      list.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    });
  };

  return (
    <div
      ref={list}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(styles.root, className)}
      data-size={size}
      data-full={fullWidth ? 'true' : undefined}
      onKeyDown={onKeyDown}
      style={{ '--tx': `${slider.x}px`, '--tw': `${slider.w}px` } as CSSProperties}
    >
      <span className={styles.thumb} data-ready={slider.ready ? 'true' : undefined} aria-hidden="true" />
      {options.map((o) => {
        const checked = o.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: custom radio button
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            tabIndex={checked ? 0 : -1}
            className={styles.item}
            onClick={() => onValueChange(o.value)}
          >
            {o.icon ? <Glyph name={o.icon} size={16} /> : null}
            {o.label}
            {o.count !== undefined ? <span className={styles.count}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
