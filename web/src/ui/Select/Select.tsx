import { useId } from 'react';
import { cn } from '@/lib/cn';
import { Glyph } from '../Glyph/Glyph';
import styles from './Select.module.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** REQUIRED: the accessible name; also printed as the small mono caption when `showLabel`. */
  label: string;
  /** Print the label as a mono caption inside the control ("SORT"). Default true. */
  showLabel?: boolean;
  className?: string;
}

/**
 * A native `<select>` in the site's chamfered style: the browser's own accessible, mobile
 * friendly picker, dressed to match.
 *
 *   <Select label="Sort" value={sort} onValueChange={setSort}
 *     options={[{ value: 'default', label: 'Default' }, { value: 'az', label: 'A to Z' }]} />
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  label,
  showLabel = true,
  className,
}: SelectProps<T>) {
  const id = useId();
  return (
    <span className={cn('chamfer', styles.wrap, className)}>
      {showLabel ? (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className={styles.select}
        value={value}
        aria-label={showLabel ? undefined : label}
        onChange={(e) => onValueChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Glyph name="chevron-down" size={16} className={styles.caret} />
    </span>
  );
}
