import { memo } from 'react';
import { cn } from '@/lib/cn';
import { Chip, Skeleton } from '@/ui';
import styles from './HealthPill.module.css';
import { type HealthView, pillCopy } from './health';
import { useClock } from './useClock';

export interface HealthPillProps {
  view: HealthView;
  className?: string;
}

/**
 * One app's status as a word, a shape and a number: `Live 142 ms`, `Degraded`, `Offline right now`,
 * `Not checked yet`. While no payload has arrived it is a skeleton, never "Live".
 */
export const HealthPill = memo(function HealthPill({ view, className }: HealthPillProps) {
  // Only a cached result shows an age; the shared 30 s ticker keeps it honest without re-rendering the grid.
  const now = useClock(30_000);
  if (view.kind === 'loading') {
    return (
      <span className={cn(styles.loading, className)}>
        <Skeleton width={92} height={22} />
        <span className="sr-only">Checking status</span>
      </span>
    );
  }
  const copy = pillCopy(view, now);
  const tone = copy.tone;
  return (
    <Chip
      size="sm"
      status={view.kind === 'self' ? undefined : tone}
      tone={view.kind === 'self' ? 'accent' : 'neutral'}
      icon={copy.glyph}
      className={cn(styles.pill, className)}
    >
      <span className={styles.word}>{copy.word}</span>
      {copy.detail ? <span className={styles.detail}>{copy.detail}</span> : null}
      <span className="sr-only">{`. ${copy.sr}`}</span>
    </Chip>
  );
});
