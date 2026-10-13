import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { comboLabels } from '@/lib/hotkeys';
import { isMacLike } from '@/lib/platform';
import styles from './Kbd.module.css';

export interface KbdProps {
  /** A single key label, or pass `combo` instead. */
  children?: ReactNode;
  /**
   * A hotkey combo such as "mod+k" or "shift+/". Renders one cap per key, using the
   * Command symbol on Apple platforms and "Ctrl" elsewhere.
   */
  combo?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A keycap. `<Kbd>Esc</Kbd>` or `<Kbd combo="mod+k" />`.
 */
export function Kbd({ children, combo, size = 'md', className }: KbdProps) {
  if (combo) {
    const labels = comboLabels(combo, isMacLike());
    return (
      <span className={cn(styles.group, className)}>
        {labels.map((label, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the labels of one combo are static and ordered
          <Fragment key={`${label}-${i}`}>
            <kbd className={styles.kbd} data-size={size}>
              {label}
            </kbd>
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    <kbd className={cn(styles.kbd, className)} data-size={size}>
      {children}
    </kbd>
  );
}
