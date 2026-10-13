/**
 * Nodes: the total with an odometer and three hex-ring gauges, one per tier, each with its count,
 * share, collateral and the FLUX one node of the tier is paid per block. Hovering or focusing a row
 * tints the stage with that tier and dims the other rings; pressing it filters the world map.
 */
import type { Tier } from '@shared/api';
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY } from '@/content/copy';
import { useNetworkSelect } from '@/data';
import { cn } from '@/lib/cn';
import { formatDecimal, formatInt } from '@/lib/format';
import { pushStageAccent } from '@/lib/stage';
import { Glyph, HexRing, Odometer, Panel, Skeleton } from '@/ui';
import type { TierFilter } from './clusters';
import styles from './nodes.module.css';
import { integerDigits, SectionChip, TileHeader, Unavailable, useEntered, useRollIn } from './shared';
import { TIER_NAMES, type TierRow, tierRows, tierSummary } from './tiers';

interface Props {
  filter: TierFilter;
  /** Pressing a tier row asks the map to show that tier (or all again). */
  onToggleTier: (tier: Tier) => void;
}

/** Tracks the hovered or keyboard-focused tier and tints the stage with it while it is active. */
function useTierEmphasis() {
  const [active, setActive] = useState<Tier | null>(null);
  const restore = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    restore.current?.();
    restore.current = null;
    setActive(null);
  }, []);

  const engage = useCallback((tier: Tier) => {
    restore.current?.();
    restore.current = pushStageAccent(tier);
    setActive(tier);
  }, []);

  // Never leave the stage tinted if the tile goes away while a row is hovered.
  useEffect(
    () => () => {
      restore.current?.();
      restore.current = null;
    },
    [],
  );

  return { active, engage, release };
}

function TierRowView({
  row,
  entered,
  dimmed,
  pressed,
  onEngage,
  onRelease,
  onPress,
}: {
  row: TierRow;
  entered: boolean;
  dimmed: boolean;
  pressed: boolean;
  onEngage: () => void;
  onRelease: () => void;
  onPress: () => void;
}) {
  const shown = useRollIn(row.count, entered);
  const name = TIER_NAMES[row.tier];
  return (
    <button
      type="button"
      className={styles.row}
      data-tier={row.tier}
      data-dim={dimmed ? 'true' : undefined}
      aria-pressed={pressed}
      aria-label={`${tierSummary(row)} ${pressed ? 'Showing only this tier on the map.' : 'Show only this tier on the map.'}`}
      onPointerEnter={(e: PointerEvent) => {
        if (e.pointerType !== 'touch') onEngage();
      }}
      onPointerLeave={onRelease}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) onEngage();
      }}
      onBlur={onRelease}
      onClick={onPress}
    >
      <HexRing value={row.ring} segments={18} size={92} stroke={5} tier={row.tier} dim={dimmed}>
        <span className={styles.pct}>
          {row.percent.toFixed(1)}
          <span className={styles.pctSign}>%</span>
        </span>
      </HexRing>
      <span className={styles.meta}>
        <span className={styles.nameLine}>
          <span className={styles.name}>
            <Glyph name={`tier-${row.tier}`} size={16} />
            {name}
          </span>
          <span className={styles.count}>
            <Odometer value={shown} minDigits={integerDigits(row.count)} flash={false} />
          </span>
        </span>
        <span className={styles.facts}>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Collateral</span>
            <span className={styles.factValue}>{formatInt(row.collateral)} FLUX</span>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Per block</span>
            <span className={styles.factValue}>{formatDecimal(row.perBlock, 2)} FLUX</span>
          </span>
        </span>
      </span>
    </button>
  );
}

export function NodesTile({ filter, onToggleTier }: Props) {
  const nodes = useNetworkSelect((n) => n.nodes);
  const perTier = useNetworkSelect((n) => n.rewards.perTier);
  const rows = useMemo(() => (nodes && perTier ? tierRows(nodes, perTier) : null), [nodes, perTier]);
  const { active, engage, release } = useTierEmphasis();
  const [ref, entered] = useEntered<HTMLDivElement>();
  const total = useRollIn(nodes ? nodes.total : null, entered);

  return (
    <Panel
      padding="lg"
      size="lg"
      hot="tl"
      pattern="bl"
      stageFocus
      container
      as="article"
      className={styles.tile}
      contentClassName={styles.content}
    >
      <TileHeader label="Nodes" detail="Online, by tier" chip={<SectionChip section="nodes" />} />

      <div ref={ref} className={styles.total}>
        {nodes ? (
          <>
            <span className={cn('t-stat', styles.totalNumber)}>
              <Odometer value={total} minDigits={integerDigits(nodes.total)} />
            </span>
            {nodes.countries !== null ? (
              <span className={styles.totalSub}>
                across <b>{formatInt(nodes.countries)}</b> countries
              </span>
            ) : (
              <span className={styles.totalSub}>FluxNodes online right now</span>
            )}
          </>
        ) : (
          <>
            <Skeleton width="58%" height={64} />
            <Skeleton width="38%" height={14} />
          </>
        )}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form field set */}
      <div className={styles.rows} role="group" aria-label="Tiers. Select one to show it on the map.">
        {rows
          ? rows.map((row) => (
              <TierRowView
                key={row.tier}
                row={row}
                entered={entered}
                dimmed={active !== null && active !== row.tier}
                pressed={filter === row.tier}
                onEngage={() => engage(row.tier)}
                onRelease={release}
                onPress={() => onToggleTier(row.tier)}
              />
            ))
          : [0, 1, 2].map((i) => (
              <div key={i} className={cn(styles.row, styles.rowSkeleton)} aria-hidden="true">
                <Skeleton width={92} height={92} />
                <span className={styles.meta}>
                  <Skeleton width="62%" height={18} />
                  <Skeleton width="86%" height={30} />
                </span>
              </div>
            ))}
      </div>

      <footer className={styles.foot}>
        {nodes ? <p className={styles.rule}>{COPY.blockPaid}</p> : <Unavailable>{COPY.loading}</Unavailable>}
      </footer>
    </Panel>
  );
}
