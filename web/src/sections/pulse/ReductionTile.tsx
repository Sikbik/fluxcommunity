/**
 * The next reward reduction: a live d/h/m/s countdown anchored to the chain tip, the block it lands
 * on, the size of the cut and what a block pays after it, the estimated date in the visitor's locale,
 * and how far through the current reward epoch the chain is. The epoch bar needs the server's epoch
 * fields and is hidden without them; nothing here is guessed.
 */
import { useMemo } from 'react';
import { useConnection, useNetworkSelect, useReductionCountdown } from '@/data';
import { formatDecimal, formatInt } from '@/lib/format';
import { Meter, Odometer, Panel, Skeleton } from '@/ui';
import { COUNTDOWN_UNITS, epochProgress, formatCut, formatEta, reductionOrdinal } from './reduction';
import styles from './reduction.module.css';
import { SectionChip, TileHeader, Unavailable } from './shared';

const UNIT_LABELS = { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' } as const;

/** One row of the before/after comparison: a bar that is the real ratio of that reward to today's. */
function StepRow({ label, value, ratio }: { label: string; value: number; ratio: number }) {
  return (
    <div className={styles.stepRow}>
      <span className={styles.stepLabel}>{label}</span>
      <Meter
        value={ratio}
        label={`Reward per block, ${label.toLowerCase()}`}
        valueText={`${formatDecimal(value, 1)} FLUX`}
      />
      <span className={styles.stepValue}>
        {formatDecimal(value, 1)}
        <span className={styles.stepUnit}> FLUX</span>
      </span>
    </div>
  );
}

export function ReductionTile() {
  const countdown = useReductionCountdown();
  const next = useNetworkSelect((n) => n.rewards.nextReduction);
  const perBlock = useNetworkSelect((n) => n.rewards.perBlock);
  const connection = useConnection();
  const known = next !== null;
  const loaded = perBlock !== null;

  const epoch = useMemo(
    () => (next && countdown ? epochProgress(next, countdown.blocksAway) : null),
    [next, countdown],
  );
  const cut = formatCut(next?.fraction ?? countdown?.fraction);
  const ordinal = next ? reductionOrdinal(next.index, next.of) : null;
  const after = next?.perBlockAfter ?? countdown?.perBlockAfter ?? null;
  const estimate = countdown ? formatEta(countdown.etaMs) : null;
  const hasStep = perBlock !== null && after !== null && perBlock > 0;

  return (
    <Panel
      padding="lg"
      hot="bl"
      pattern="tr"
      stageFocus
      container
      as="article"
      className={styles.tile}
      contentClassName={styles.content}
    >
      <TileHeader
        label="Next reward reduction"
        detail={ordinal ?? 'The subsidy steps down'}
        chip={<SectionChip section="chain" />}
      />

      {countdown ? (
        <>
          <div className={styles.clock} role="timer" aria-label={clockLabel(countdown.parts)}>
            {COUNTDOWN_UNITS.map((unit, i) => (
              <div key={unit} className={styles.unit}>
                <span className={styles.digits}>
                  <Odometer
                    value={countdown.parts[unit]}
                    minDigits={unit === 'days' ? 1 : 2}
                    flash={false}
                    duration={420}
                  />
                </span>
                <span className={styles.unitLabel}>{UNIT_LABELS[unit]}</span>
                {i < COUNTDOWN_UNITS.length - 1 ? <span className={styles.colon} aria-hidden="true" /> : null}
              </div>
            ))}
          </div>

          {epoch ? (
            <div className={styles.epoch}>
              <div className={styles.epochHead}>
                <span>
                  <b>{formatDecimal(epoch.fraction * 100, 1)}%</b> of the epoch
                </span>
                <span>
                  <b>{formatInt(countdown.blocksAway)}</b> blocks to go
                </span>
              </div>
              <Meter
                value={epoch.fraction}
                size="lg"
                label="Blocks elapsed in the current reward epoch"
                valueText={`${formatInt(epoch.elapsedBlocks)} of ${formatInt(epoch.epochBlocks)} blocks`}
              />
              <div className={styles.ruler} aria-hidden="true" />
              <div className={styles.epochEnds}>
                <span>Block {formatInt(epoch.startHeight)}</span>
                <span>Block {formatInt(epoch.endHeight)}</span>
              </div>
            </div>
          ) : (
            <p className={styles.blocksOnly}>
              <b>{formatInt(countdown.blocksAway)}</b> blocks to go, at block {formatInt(countdown.height)}
            </p>
          )}

          {hasStep ? (
            // biome-ignore lint/a11y/useSemanticElements: a labelled group of two readouts, not a form field set
            <div
              className={styles.step}
              role="group"
              aria-label="Paid per block, now and after the reduction"
            >
              <span className={styles.stepHead} aria-hidden="true">
                Paid per block
              </span>
              <StepRow label="Now" value={perBlock} ratio={1} />
              <StepRow label="After" value={after} ratio={Math.min(1, after / perBlock)} />
            </div>
          ) : null}

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>The cut</dt>
              <dd>{cut ?? '--'}</dd>
            </div>
            {!hasStep && perBlock !== null ? (
              <div className={styles.fact}>
                <dt>Paid per block</dt>
                <dd>
                  {formatDecimal(perBlock, 1)}
                  <span className={styles.flux}> FLUX</span>
                </dd>
              </div>
            ) : null}
            {!hasStep && after !== null ? (
              <div className={styles.fact}>
                <dt>Paid per block after</dt>
                <dd>
                  {formatDecimal(after, 1)}
                  <span className={styles.flux}> FLUX</span>
                </dd>
              </div>
            ) : null}
            <div className={styles.fact}>
              <dt>{countdown.live ? 'Estimated' : 'Estimated from the last snapshot'}</dt>
              <dd className={styles.date}>{estimate}</dd>
            </div>
          </dl>
        </>
      ) : known || loaded ? (
        <Unavailable>
          {connection === 'offline'
            ? 'The countdown needs a live connection. It returns when the numbers do.'
            : 'No further reward reduction is scheduled in the data right now.'}
        </Unavailable>
      ) : (
        <div className={styles.skeleton} aria-hidden="true">
          <Skeleton height={56} />
          <Skeleton height={12} width="70%" />
          <Skeleton height={10} />
        </div>
      )}
    </Panel>
  );
}

function clockLabel(parts: { days: number; hours: number; minutes: number; seconds: number }): string {
  return `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes and ${parts.seconds} seconds to the next reward reduction`;
}
