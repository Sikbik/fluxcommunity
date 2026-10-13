import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label. If omitted, pass `aria-label`. */
  children?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * An on/off setting. A real `button role="switch"`: Space and Enter toggle. The thumb
 * is a hexagon.
 *
 *   <Switch checked={sound} onCheckedChange={setSound}>Sound effects</Switch>
 */
export function Switch({
  checked,
  onCheckedChange,
  children,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(styles.switch, className)}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {children != null ? <span>{children}</span> : null}
    </button>
  );
}
