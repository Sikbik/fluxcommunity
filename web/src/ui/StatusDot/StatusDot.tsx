import { cn } from '@/lib/cn';
import { HexBullet } from '../HexBullet/HexBullet';
import styles from './StatusDot.module.css';

export type Status = 'ok' | 'pending' | 'warn' | 'crit' | 'off';

export interface StatusDotProps {
  status: Status;
  /** Pulse a ring (use for live things only). Default false. */
  pulse?: boolean;
  /** Width in px. Default 9. */
  size?: number;
  className?: string;
}

/**
 * A status hexagon in the reserved status colours. It is never the only carrier of the
 * status: put the word next to it (FreshnessChip does).
 */
export function StatusDot({ status, pulse = false, size = 9, className }: StatusDotProps) {
  return (
    <span className={cn(styles.dot, className)} data-status={status}>
      <HexBullet size={size} pulse={pulse && status === 'ok'} />
    </span>
  );
}
