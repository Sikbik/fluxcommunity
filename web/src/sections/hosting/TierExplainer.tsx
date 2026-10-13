import type { Tier } from '@shared/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { COPY } from '@/content/copy';
import { type Freshness, useNetworkSelect, useSectionAge, useSectionFreshness } from '@/data';
import { formatDateShort } from '@/lib/format';
import { pushStageAccent } from '@/lib/stage';
import {
  Button,
  FreshnessChip,
  HexBullet,
  Panel,
  SegmentedControl,
  type SegmentOption,
  useIsPhone,
  useReducedMotion,
} from '@/ui';
import styles from './explainer.module.css';
import { OrbitStage } from './OrbitStage';
import {
  buildTierModel,
  describeRow,
  formatBlockSeconds,
  formatFluxAmount,
  TIER_NAME,
  worstFreshness,
} from './payout';
import { Formula, LaneSkeletons, Lanes } from './Readout';

type Pinned = 'all' | Tier;

/** The age ticks every second, so it lives here and not in the explainer. */
function NodesFreshness({ freshness }: { freshness: Freshness }) {
  const age = useSectionAge('nodes');
  return <FreshnessChip freshness={freshness} ageMs={age} />;
}

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The tier explainer: three orbits you can touch, and the numbers for the tier you are looking at.
 * Everything printed comes from the network snapshot (or its baked fallback, labelled OFFLINE).
 */
export function TierExplainer() {
  const net = useNetworkSelect((n) => n);
  const model = useMemo(() => (net ? buildTierModel(net) : null), [net]);
  const nodesFresh = useSectionFreshness('nodes');
  const chainFresh = useSectionFreshness('chain');
  const freshness = worstFreshness(nodesFresh.freshness, chainFresh.freshness);
  const reduced = useReducedMotion();
  const phone = useIsPhone();

  const [pinned, setPinned] = useState<Pinned>('all');
  const [hovered, setHovered] = useState<Tier | null>(null);
  const [frozen, setFrozen] = useState(false);
  const focus: Tier | null = hovered ?? (pinned === 'all' ? null : pinned);

  // The lattice behind the page takes the tier's colour while a tier is in focus.
  useEffect(() => {
    if (!focus) return;
    return pushStageAccent(focus);
  }, [focus]);

  const onPick = useCallback((tier: Tier) => {
    setPinned((p) => (p === tier ? 'all' : tier));
  }, []);

  const counts = useMemo(
    () =>
      model
        ? {
            cumulus: model.rows[0]?.nodes ?? 0,
            nimbus: model.rows[1]?.nodes ?? 0,
            stratus: model.rows[2]?.nodes ?? 0,
          }
        : null,
    [model],
  );
  const perBlock = useMemo(
    () =>
      model
        ? {
            cumulus: formatFluxAmount(model.rows[0]?.perBlock ?? Number.NaN),
            nimbus: formatFluxAmount(model.rows[1]?.perBlock ?? Number.NaN),
            stratus: formatFluxAmount(model.rows[2]?.perBlock ?? Number.NaN),
          }
        : null,
    [model],
  );

  const options = useMemo<SegmentOption<Pinned>[]>(
    () => [
      { value: 'all', label: phone ? 'All' : 'All tiers' },
      ...(['cumulus', 'nimbus', 'stratus'] as const).map<SegmentOption<Pinned>>((t) => ({
        value: t,
        label: TIER_NAME[t],
        icon: phone ? undefined : (`tier-${t}` as const),
      })),
    ],
    [phone],
  );

  const pinnedRow = model && pinned !== 'all' ? model.rows.find((r) => r.tier === pinned) : undefined;
  const announce = pinnedRow
    ? describeRow(pinnedRow, fmt)
    : 'Showing all three tiers. One node of each tier is paid in every block.';

  return (
    <Panel
      size="lg"
      padding="lg"
      hot="tr"
      pattern="bl"
      stageFocus={0.32}
      tier={focus ?? undefined}
      className={styles.panel}
      data-explainer="tiers"
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.eyebrow}>
            <HexBullet size={9} />
            How nodes earn
          </p>
          <h3 className={styles.fact}>{COPY.blockPaid}</h3>
        </div>
        <div className={styles.tools}>
          <NodesFreshness freshness={freshness} />
          {reduced ? null : (
            <Button
              variant="secondary"
              size="sm"
              icon={frozen ? 'play' : 'pause'}
              aria-pressed={frozen}
              onClick={() => setFrozen((f) => !f)}
              magnetic={false}
            >
              {frozen ? 'Play motion' : 'Pause motion'}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <figure className={styles.figure}>
          <OrbitStage
            counts={counts}
            perBlock={perBlock}
            focus={focus}
            onHover={setHovered}
            onPick={onPick}
            reduced={reduced}
            frozen={frozen}
          />
          <figcaption className={styles.caption}>
            Each dot stands for about 150 nodes. The sweep is the block clock: a node of each tier is paid
            when it reaches the top.
          </figcaption>
        </figure>

        <div className={styles.readout}>
          <SegmentedControl<Pinned>
            aria-label="Focus a node tier"
            value={pinned}
            onValueChange={setPinned}
            options={options}
            fullWidth={phone}
          />
          {model ? (
            <>
              <Lanes model={model} focus={focus} onHover={setHovered} onPick={onPick} />
              <Formula
                model={model}
                focus={focus}
                note={`${freshness === 'offline' ? `${COPY.offline}${nodesFresh.asOf ? `, as of ${formatDateShort(nodesFresh.asOf)}` : ''}. ` : ''}Block time ${formatBlockSeconds(model.blockTime.seconds)} s, ${model.blockTime.measured ? 'measured over recent blocks' : 'the protocol target'}.`}
              />
            </>
          ) : (
            <LaneSkeletons />
          )}
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
        </div>
      </div>
    </Panel>
  );
}
