import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { FreshnessChip, type FreshnessChipProps } from '../FreshnessChip/FreshnessChip';
import styles from './Stat.module.css';

export interface StatProps {
  /** Mono caption, sentence or caps: "Nodes online". */
  label: string;
  /** The number: pass an <Odometer>, a <CountUp>, or text. */
  value: ReactNode;
  /** A unit after the number: "FLUX", "TB". */
  unit?: string;
  /** One line of context under the number. */
  sub?: ReactNode;
  /** A freshness chip beside the label. Pass the same props FreshnessChip takes. */
  freshness?: FreshnessChipProps;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * The stat block: caption, big tabular number, context line, freshness. Content only;
 * put it in a Panel.
 *
 *   <Stat label="Nodes online" value={<CountUp value={n} />} sub="Across 62 countries" freshness={{ value: net }} />
 */
export function Stat({ label, value, unit, sub, freshness, size = 'md', className }: StatProps) {
  return (
    <div className={cn(styles.stat, className)} data-size={size}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {freshness ? <FreshnessChip {...freshness} /> : null}
      </div>
      <div className={styles.value}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      {sub ? <div className={styles.sub}>{sub}</div> : null}
    </div>
  );
}
