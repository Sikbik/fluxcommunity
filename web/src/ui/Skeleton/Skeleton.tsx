import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** CSS width. Default 100%. */
  width?: string | number;
  /** CSS height. Default 1em. */
  height?: string | number;
  className?: string;
}

/** A shimmering placeholder block. Decorative: pair it with a labelled busy region. */
export function Skeleton({ width, height, className }: SkeletonProps) {
  const px = (v: string | number | undefined) => (typeof v === 'number' ? `${v}px` : v);
  return (
    <span
      aria-hidden="true"
      className={cn(styles.skeleton, className)}
      style={{ '--sk-w': px(width), '--sk-h': px(height) } as CSSProperties}
    />
  );
}
