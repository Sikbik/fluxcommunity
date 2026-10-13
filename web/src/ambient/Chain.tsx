import { useEffect, useState } from 'react';
import { COPY } from '@/content/copy';
import { useChainClock, useConnection } from '@/data';
import { formatInt } from '@/lib/format';
import { useStageBus } from '@/stage/bus';
import { StatusDot } from '@/ui';
import styles from './Ambient.module.css';

/**
 * Block height, the countdown, and the connection: the quiet instrument under the clock. Each
 * REAL block (a `block` pulse on the stage bus, the same event that sends the stage wave) lights
 * a bloom behind the number. No block, no flare: offline has no simulated beat.
 */
export function Chain() {
  const clock = useChainClock();
  const connection = useConnection();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    let seen = useStageBus.getState().pulses.at(-1)?.id ?? 0;
    return useStageBus.subscribe((state) => {
      for (const p of state.pulses) {
        if (p.id <= seen) continue;
        seen = p.id;
        if (p.kind === 'block') setBeat((b) => b + 1);
      }
    });
  }, []);

  const offline = connection === 'offline';
  const status =
    connection === 'live'
      ? { dot: 'ok' as const, word: 'Live', note: '' }
      : connection === 'polling'
        ? { dot: 'ok' as const, word: 'Live', note: 'polling' }
        : connection === 'connecting'
          ? { dot: 'pending' as const, word: 'Connecting', note: '' }
          : { dot: 'crit' as const, word: 'Offline', note: COPY.offline };

  const height = clock.height;
  const next =
    clock.live && clock.secondsToNext !== null
      ? clock.secondsToNext > 0
        ? `next block in ${clock.secondsToNext} s`
        : 'next block due'
      : null;

  return (
    <>
      <p className={styles.chain} data-beat={beat === 0 || offline ? undefined : beat % 2 === 1 ? 'a' : 'b'}>
        <span className={styles.flare} aria-hidden="true" />
        <span className={styles.sweep} aria-hidden="true" />
        {height === null ? (
          <span>{COPY.loading}</span>
        ) : (
          <>
            <span className={styles.chainLabel}>Block</span>
            <span className={styles.height}>{formatInt(height)}</span>
            {next ? <span>{next}</span> : offline ? <span>last known</span> : null}
          </>
        )}
      </p>
      <p className={styles.conn}>
        <StatusDot status={status.dot} pulse={connection === 'live'} size={9} />
        <span>{status.word}</span>
        {status.note ? <span className={styles.connNote}>{status.note}</span> : null}
      </p>
    </>
  );
}
