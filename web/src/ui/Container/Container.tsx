import type { ElementType, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import styles from './Container.module.css';

export interface ContainerProps {
  /** `default` 1280 px, `wide` 1520 px, `narrow` 760 px, `full` edge to edge with gutters. */
  size?: 'default' | 'wide' | 'narrow' | 'full';
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
  id?: string;
}

/** Centres content to the page width with the fluid gutter. */
export function Container({ size = 'default', as, className, children, ref, ...rest }: ContainerProps) {
  const Tag: ElementType = as ?? 'div';
  return (
    <Tag ref={ref} className={cn(styles.container, className)} data-size={size} {...rest}>
      {children}
    </Tag>
  );
}
