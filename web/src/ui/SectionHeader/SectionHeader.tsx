import { type ReactNode, useRef } from 'react';
import { SECTION_META } from '@/content/sections';
import { cn } from '@/lib/cn';
import type { SectionId } from '@/stage/bus';
import { HexBullet } from '../HexBullet/HexBullet';
import { useRevealTrigger } from '../hooks/useRevealTrigger';
import { Reveal } from '../Reveal/Reveal';
import { SplitReveal } from '../SplitReveal/SplitReveal';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  /** Pulls the index and eyebrow from the section registry. Or pass `index` and `eyebrow`. */
  section?: SectionId;
  /** "01". */
  index?: string;
  /** "Network pulse". Printed as `01 / NETWORK PULSE`. */
  eyebrow?: string;
  /** The heading. Inline emphasis allowed: `What the <b>community</b> built.` */
  title: ReactNode;
  /** One or two sentences under the heading. */
  lead?: ReactNode;
  align?: 'start' | 'center';
  /** Heading level. Default 2 (the hero owns the page's single h1). */
  level?: 2 | 3;
  /** Id for the heading, so the section can `aria-labelledby` it. */
  titleId?: string;
  /** Buttons or links under the lead. */
  actions?: ReactNode;
  /** Reveal on mount instead of on scroll. */
  immediate?: boolean;
  className?: string;
}

/**
 * The header every section opens with: a mono eyebrow with a hex bullet and a drawing
 * rule, the headline (revealed word by word) and a lead paragraph. Reveal is built in.
 *
 *   <SectionHeader section="pulse" title="The network, right now." lead="..." titleId="pulse-title" />
 */
export function SectionHeader({
  section,
  index,
  eyebrow,
  title,
  lead,
  align = 'start',
  level = 2,
  titleId,
  actions,
  immediate = false,
  className,
}: SectionHeaderProps) {
  const meta = section ? SECTION_META[section] : undefined;
  const idx = index ?? meta?.index;
  const eye = eyebrow ?? meta?.eyebrow;
  const root = useRef<HTMLElement>(null);
  const shown = useRevealTrigger(root, { immediate });
  const Heading = level === 3 ? 'h3' : 'h2';

  return (
    <header
      ref={root}
      className={cn(styles.head, className)}
      data-align={align}
      data-shown={shown ? 'true' : 'false'}
    >
      {eye ? (
        <Reveal as="p" className={styles.eyebrow} immediate={immediate} direction="none" blur={false}>
          <HexBullet size={9} className={styles.bullet} />
          {idx ? (
            <>
              <span className={styles.index}>{idx}</span>
              <span className={styles.slash} aria-hidden="true">
                /
              </span>
            </>
          ) : null}
          <span>{eye}</span>
          <span className={styles.rule} aria-hidden="true" />
        </Reveal>
      ) : null}
      <SplitReveal as={Heading} className={styles.title} id={titleId} immediate={immediate}>
        {title}
      </SplitReveal>
      {lead ? (
        <Reveal as="p" className={styles.lead} immediate={immediate} delay={160}>
          {lead}
        </Reveal>
      ) : null}
      {actions ? (
        <Reveal className={styles.actions} immediate={immediate} delay={260}>
          {actions}
        </Reveal>
      ) : null}
    </header>
  );
}
