import type { CSSProperties } from 'react';
import { useChainHeight, useSectionFreshness } from '@/data';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { Chip, HexBullet, Odometer, Skeleton, StatusDot } from '@/ui';
import styles from './hero.module.css';
import { useRollIn } from './hooks';
import { digitCount } from './logic';

const STATUS = { live: 'ok', cached: 'warn', offline: 'crit', unknown: 'pending' } as const;
const WORD = { live: 'Live', cached: 'Cached', offline: 'Offline', unknown: 'Syncing' } as const;

/**
 * `FLUX / THE DECENTRALIZED CLOUD` and the live block chip. The chip changes once per block and
 * says nothing aloud (`aria-live="off"`): block announcements belong to the data section.
 */
export function Eyebrow() {
  const height = useChainHeight();
  const shown = useRollIn(height, 0);
  const { freshness } = useSectionFreshness('chain');

  return (
    <p className={cn(styles.eyebrow, styles.rise)} style={{ '--i': 0 } as CSSProperties}>
      <span className={styles.brand}>
        <HexBullet size={9} />
        <b>Flux</b>
        <span className={styles.slash} aria-hidden="true">
          /
        </span>
        <span className="sr-only">, </span>
        <span>The decentralized cloud</span>
      </span>
      <span className={styles.eyebrowRule} aria-hidden="true" />
      <Chip size="md" className={styles.blockChip} aria-live="off">
        <span className={styles.chipBody}>
          <StatusDot status={STATUS[freshness]} pulse={freshness === 'live'} size={8} />
          <span>Block</span>
          {height === null || shown === null ? (
            <Skeleton width="8ch" height="1em" />
          ) : (
            <span className={styles.blockNum}>
              <Odometer value={shown} minDigits={digitCount(height)} label={formatInt(height)} />
            </span>
          )}
          <span className="sr-only">{WORD[freshness]}</span>
        </span>
      </Chip>
    </p>
  );
}
