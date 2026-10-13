import { COMMUNITY_APPS } from '@shared/catalog';
import { useMemo } from 'react';
import { useAllHealth, useChainHeight, useSectionFreshness } from '@/data';
import { FreshnessChip, Odometer, StatusDot } from '@/ui';
import styles from './footer.module.css';
import { healthTone, respondingText, summarizeHealth } from './status';

/**
 * The footer's quiet pulse: the chain height with its freshness, and how many community apps answered
 * their last check. Nothing here is announced (no live region) and nothing is claimed that the data
 * layer has not said: unknown stays unknown, a stale number says so, the baked fallback says offline.
 */
export function StatusTicker() {
  const height = useChainHeight();
  const chain = useSectionFreshness('chain');
  // Re-renders once a second (the age ticks); the leaf is tiny and the summary is memoised.
  const health = useAllHealth();
  const summary = useMemo(() => summarizeHealth(COMMUNITY_APPS, health.data?.apps), [health.data]);
  const checked = summary.total - summary.unchecked > 0;

  return (
    <dl className={styles.status}>
      <div className={styles.metric}>
        <dt className={styles.metricLabel}>Block</dt>
        <dd className={styles.metricValue}>
          <span className={styles.height}>{height === null ? '--' : <Odometer value={height} />}</span>
          <FreshnessChip freshness={chain.freshness} hideAge />
        </dd>
      </div>
      <div className={styles.metric}>
        <dt className={styles.metricLabel}>Community apps</dt>
        <dd className={styles.metricValue}>
          <span className={styles.responding}>
            <StatusDot status={healthTone(summary)} />
            <span>{respondingText(summary)}</span>
          </span>
          {checked ? <FreshnessChip freshness={health.freshness} hideAge /> : null}
        </dd>
      </div>
    </dl>
  );
}
