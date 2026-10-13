/**
 * Block cadence: the hex dial synced to the chain clock, the measured average block time against the
 * 30 s protocol target, and a sparkline of the last 60 block intervals. Everything is read from the
 * data hooks; with no live clock the dial is empty and says so, and baked fallback history is not drawn.
 */
import { useMemo } from 'react';
import { blockIntervalStats, useBlocks, useChainClock, useNetworkSelect } from '@/data';
import { formatDecimal } from '@/lib/format';
import { useStageBus } from '@/stage/bus';
import { Odometer, Panel, Skeleton, Sparkline } from '@/ui';
import { DIAL_TARGET_SEC, dialState, intervalDomain } from './cadence';
import styles from './cadence.module.css';
import { HexDial } from './HexDial';
import { BlocksChip, SectionChip, TileHeader } from './shared';

const SPARK_COUNT = 60;
/** Plot height in px; the target tick in the gutter is placed from the same domain. */
const SPARK_HEIGHT = 76;

function captionFor(phase: ReturnType<typeof dialState>['phase'], since: number | null): string {
  if (phase === 'offline' || since === null) return 'No live clock';
  if (phase === 'waiting') return 'Waiting for block';
  return since < 2 ? 'Just landed' : `${since} s ago`;
}

export function CadenceTile() {
  const clock = useChainClock();
  const blocks = useBlocks();
  const measured = useNetworkSelect((n) => n.chain.measuredBlockSec);
  const target = useNetworkSelect((n) => n.chain.targetBlockSec);
  const lastBlockAt = useStageBus((s) => s.chain.lastBlockAt);

  const state = dialState(clock.secondsSinceBlock, clock.live, DIAL_TARGET_SEC);
  const stats = useMemo(() => blockIntervalStats(blocks.data, SPARK_COUNT, DIAL_TARGET_SEC), [blocks.data]);
  // Baked history is a stand-in, not a record: its shape is never drawn as if it were measured.
  const history = blocks.meta?.source === 'fallback' ? null : stats;
  const domain = intervalDomain(history?.minSec ?? null, history?.maxSec ?? null);
  const targetSec = target ?? DIAL_TARGET_SEC;
  const targetTop = ((domain.max - DIAL_TARGET_SEC) / Math.max(1, domain.max - domain.min)) * SPARK_HEIGHT;
  const delta = measured !== null ? measured - targetSec : null;

  return (
    <Panel
      padding="lg"
      hot="br"
      pattern="tl"
      stageFocus
      container
      as="article"
      className={styles.tile}
      contentClassName={styles.content}
    >
      <TileHeader
        label="Block cadence"
        detail="Chain time, block by block"
        chip={<SectionChip section="chain" />}
      />

      <div className={styles.top}>
        <HexDial
          state={state}
          height={clock.height}
          lastBlockAt={lastBlockAt}
          live={clock.live}
          caption={captionFor(state.phase, state.sinceSec)}
        />
        <dl className={styles.readout}>
          <div className={styles.stat}>
            <dt>Measured average</dt>
            <dd className={styles.big}>
              {measured !== null ? (
                <>
                  <Odometer value={measured} decimals={1} flash={false} />
                  <span className={styles.unit}>s</span>
                </>
              ) : (
                <Skeleton width="5ch" height={36} />
              )}
            </dd>
          </div>
          <div className={styles.stat}>
            <dt>Protocol target</dt>
            <dd className={styles.small}>
              {formatDecimal(targetSec, 0)} s
              {delta !== null ? (
                <span className={styles.delta}>
                  {Math.abs(delta) < 0.05
                    ? 'on target'
                    : `${delta > 0 ? '+' : '\u2212'}${formatDecimal(Math.abs(delta), 1)} s`}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      <section className={styles.history} aria-label="Block intervals">
        <div className={styles.historyHead}>
          <span className={styles.historyTitle}>
            Last {history && history.count > 0 ? history.count : SPARK_COUNT} intervals
          </span>
          <BlocksChip />
        </div>
        <div className={styles.spark}>
          {history && history.count > 1 ? (
            <div className={styles.plot}>
              <span className={styles.axis} style={{ top: `${targetTop}px` }} aria-hidden="true">
                {DIAL_TARGET_SEC} s
              </span>
              <Sparkline
                values={history.intervals}
                min={domain.min}
                max={domain.max}
                target={DIAL_TARGET_SEC}
                height={SPARK_HEIGHT}
                label="Seconds between blocks"
                formatValue={(n) => `${Math.round(n)} s`}
              />
            </div>
          ) : (
            <p className={styles.noHistory}>
              {blocks.data === null ? 'Syncing with the chain' : 'No block history to draw right now'}
            </p>
          )}
        </div>
        {history && history.count > 1 ? (
          <p className={styles.range}>
            <span>
              Fastest <b>{formatDecimal(history.minSec ?? 0, 0)} s</b>
            </span>
            <span>
              Median <b>{formatDecimal(history.medianSec ?? 0, 0)} s</b>
            </span>
            <span>
              Slowest <b>{formatDecimal(history.maxSec ?? 0, 0)} s</b>
            </span>
          </p>
        ) : null}
      </section>
    </Panel>
  );
}
