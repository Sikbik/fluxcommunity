import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { clamp01 } from '@/lib/math';
import styles from './Meter.module.css';

export interface MeterProps {
  /** 0..1 */
  value: number;
  /** Names what is measured: "Storage in use". Required for assistive tech. */
  label: string;
  /** Text read out instead of the percentage, e.g. "12.4 of 20 TB". */
  valueText?: string;
  size?: 'md' | 'lg';
  /** Re-points the colour to a tier. */
  tier?: 'cumulus' | 'nimbus' | 'stratus';
  className?: string;
}

/**
 * A thin animated bar with a slanted end. The fill scales on the compositor.
 *
 *   <Meter value={0.62} label="Cores in use" />
 */
export function Meter({ value, label, valueText, size = 'md', tier, className }: MeterProps) {
  const v = clamp01(value);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled bar needs a div; role=meter carries the value
    <div
      className={cn(styles.meter, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={valueText}
      data-size={size}
      data-tier={tier}
    >
      <span className={styles.fill} style={{ '--v': v } as CSSProperties} />
    </div>
  );
}
