/**
 * The connection state in the section header: live, polling, offline (or still connecting), in words
 * as well as colour, with the "as of" date when what is on screen is the last known or baked numbers.
 */

import { COPY } from '@/content/copy';
import { useConnection, useSectionFreshness } from '@/data';
import { formatDateLong } from '@/lib/format';
import { Chip, StatusDot } from '@/ui';
import styles from './connection.module.css';

export function ConnectionIndicator() {
  const connection = useConnection();
  const { asOf } = useSectionFreshness('chain');

  let status: 'ok' | 'warn' | 'crit' | 'pending';
  let word: string;
  let note: string;
  switch (connection) {
    case 'live':
      status = 'ok';
      word = 'Live';
      note = 'Streaming from the chain';
      break;
    case 'polling':
      status = 'ok';
      word = 'Live';
      note = 'Polling for updates';
      break;
    case 'offline':
      status = 'crit';
      word = 'Offline';
      note = asOf ? `${COPY.offline}, as of ${formatDateLong(asOf)}` : COPY.offline;
      break;
    default:
      status = 'pending';
      word = 'Syncing';
      note = COPY.loading;
  }

  return (
    <output className={styles.connection} data-connection={connection}>
      <Chip status={status} size="sm">
        <StatusDot status={status} pulse={connection === 'live' || connection === 'polling'} size={7} />
        <span className={styles.word}>{word}</span>
      </Chip>
      <span className={styles.note}>{note}</span>
    </output>
  );
}
