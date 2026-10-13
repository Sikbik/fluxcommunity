import { cn } from '@/lib/cn';
import { formatAge } from '@/lib/format';
import { Chip } from '../Chip/Chip';
import { type Status, StatusDot } from '../StatusDot/StatusDot';
import styles from './FreshnessChip.module.css';

export type FreshnessKind = 'live' | 'cached' | 'offline' | 'unknown';

export interface FreshnessChipProps {
  /** Pass a `Sourced<T>` from the data hooks, or `{ freshness, ageMs }`. */
  value?: { freshness: FreshnessKind; ageMs: number | null };
  /** Or pass the pieces directly. */
  freshness?: FreshnessKind;
  /** Milliseconds since the data was fetched upstream. */
  ageMs?: number | null;
  /** Show a small "polling" hint on a LIVE chip (the stream failed, polling works). */
  polling?: boolean;
  /** Hide the age text. */
  hideAge?: boolean;
  className?: string;
}

const MAP: Record<FreshnessKind, { word: string; status: Status }> = {
  live: { word: 'Live', status: 'ok' },
  cached: { word: 'Cached', status: 'warn' },
  offline: { word: 'Offline', status: 'crit' },
  unknown: { word: 'Syncing', status: 'pending' },
};

/**
 * How trustworthy a number is: LIVE 3 s, CACHED 2 min, OFFLINE last known, or SYNCING.
 * The word is always there, so colour is never the only signal.
 *
 *   const net = useNetwork();
 *   <FreshnessChip value={net} polling={connection === 'polling'} />
 */
export function FreshnessChip({
  value,
  freshness,
  ageMs,
  polling = false,
  hideAge = false,
  className,
}: FreshnessChipProps) {
  const kind = freshness ?? value?.freshness ?? 'unknown';
  const age = ageMs !== undefined ? ageMs : (value?.ageMs ?? null);
  const { word, status } = MAP[kind];
  const ageText = kind === 'live' || kind === 'cached' ? formatAge(age) : '';
  return (
    <Chip status={status} size="sm" className={cn(styles.fresh, className)} data-freshness={kind}>
      <span className={styles.parts}>
        <StatusDot status={status} pulse={kind === 'live'} size={7} />
        <span>{word}</span>
        {!hideAge && ageText ? <span className={styles.age}>{ageText}</span> : null}
        {kind === 'live' && polling ? <span className={styles.hint}>polling</span> : null}
        {kind === 'offline' ? <span className={styles.hint}>last known</span> : null}
      </span>
    </Chip>
  );
}
