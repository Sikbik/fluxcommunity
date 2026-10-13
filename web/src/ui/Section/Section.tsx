import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';
import type { SectionId } from '@/stage/bus';
import { Container } from '../Container/Container';
import { SectionHeader, type SectionHeaderProps } from '../SectionHeader/SectionHeader';
import styles from './Section.module.css';

export interface SectionProps {
  /** Must match the registry id: it is the hash target and the scroll-spy key. */
  id: SectionId;
  /** The heading. Omit only for the hero, which renders its own h1. */
  title?: ReactNode;
  lead?: ReactNode;
  /** Buttons or links under the lead. */
  actions?: ReactNode;
  /** Header alignment. Default `start`. */
  align?: SectionHeaderProps['align'];
  /** Container width. Default `default`. */
  width?: 'default' | 'wide' | 'narrow' | 'full';
  /** Smaller vertical padding. */
  tight?: boolean;
  /** Accessible name when there is no `title`. */
  label?: string;
  className?: string;
  /** Class for the content wrapper under the header. */
  bodyClassName?: string;
  children?: ReactNode;
}

/**
 * The wrapper every section renders: the `<section id data-section>` contract the shell
 * relies on, the vertical rhythm, the container, and the header with reveal.
 *
 *   export default function Pulse() {
 *     return (
 *       <Section id="pulse" title="The network, right now." lead="...">
 *         <Reveal>...</Reveal>
 *       </Section>
 *     );
 *   }
 */
export function Section({
  id,
  title,
  lead,
  actions,
  align = 'start',
  width = 'default',
  tight = false,
  label,
  className,
  bodyClassName,
  children,
}: SectionProps) {
  const titleId = useId();
  return (
    <section
      id={id}
      data-section={id}
      className={cn(styles.section, className)}
      data-tight={tight ? 'true' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
    >
      <Container size={width}>
        {title ? (
          <SectionHeader
            section={id}
            title={title}
            lead={lead}
            actions={actions}
            align={align}
            titleId={titleId}
          />
        ) : null}
        {children != null ? <div className={cn(styles.body, bodyClassName)}>{children}</div> : null}
      </Container>
    </section>
  );
}
