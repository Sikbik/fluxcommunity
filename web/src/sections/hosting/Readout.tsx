import type { Tier } from '@shared/api';
import { ART, TIER_ART } from '@/content/art';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { Glyph, Odometer, Skeleton } from '@/ui';
import { formatBlockSeconds, formatFluxAmount, type TierModel, type TierRow } from './payout';
import styles from './readout.module.css';

/** Tier crystals are not size-laddered in the files: a ladder in CSS says "bigger tier". */
const LADDER: Record<Tier, number> = { cumulus: 0.74, nimbus: 0.88, stratus: 1 };

type LaneState = 'rest' | 'active' | 'dim';

interface LaneProps {
  row: TierRow;
  state: LaneState;
  onHover: (tier: Tier | null) => void;
  onPick: (tier: Tier) => void;
}

function Crystal({ tier }: { tier: Tier }) {
  const art = ART[TIER_ART[tier] ?? 'tier-cumulus'];
  return (
    <span
      className={styles.crystal}
      style={{ '--ladder': LADDER[tier] } as React.CSSProperties}
      aria-hidden="true"
    >
      <picture>
        {art.avif ? <source srcSet={art.avif} type="image/avif" /> : null}
        <img src={art.src} width={art.width} height={art.height} alt="" loading="lazy" decoding="async" />
      </picture>
    </span>
  );
}

function Lane({ row, state, onHover, onPick }: LaneProps) {
  return (
    // Pointer convenience only: the segmented control above is the keyboard and AT path.
    // biome-ignore lint/a11y/useKeyWithClickEvents: an equivalent keyboard control sits beside the lanes
    <li
      className={cn('chamfer', styles.lane)}
      data-tier={row.tier}
      data-state={state}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') onHover(row.tier);
      }}
      onPointerLeave={() => onHover(null)}
      onClick={() => onPick(row.tier)}
    >
      <Crystal tier={row.tier} />
      <div className={styles.laneHead}>
        <h4 className={styles.laneName}>
          <Glyph name={`tier-${row.tier}`} size={16} />
          {row.name}
        </h4>
        <span className={styles.share}>{row.sharePct}% of nodes</span>
      </div>
      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt>Nodes</dt>
          <dd>
            <Odometer value={row.nodes} flash={false} />
          </dd>
        </div>
        <div className={styles.metric}>
          <dt>Collateral</dt>
          <dd>
            {formatInt(row.collateral)}
            <small>FLUX</small>
          </dd>
        </div>
        <div className={styles.metric}>
          <dt>Per block</dt>
          <dd>
            {formatFluxAmount(row.perBlock)}
            <small>FLUX</small>
          </dd>
        </div>
        <div className={cn(styles.metric, styles.every)}>
          <dt>Paid about every</dt>
          <dd>
            {row.every ? (
              <>
                {row.every.value}
                <small>{row.every.unitText}</small>
              </>
            ) : (
              '--'
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function LaneSkeletons() {
  return (
    <ul className={styles.lanes} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className={styles.laneSkeleton}>
          <Skeleton height={104} />
        </li>
      ))}
    </ul>
  );
}

export interface LanesProps {
  model: TierModel;
  focus: Tier | null;
  onHover: (tier: Tier | null) => void;
  onPick: (tier: Tier) => void;
}

export function Lanes({ model, focus, onHover, onPick }: LanesProps) {
  return (
    <ul className={styles.lanes}>
      {model.rows.map((row) => (
        <Lane
          key={row.tier}
          row={row}
          state={focus === null ? 'rest' : focus === row.tier ? 'active' : 'dim'}
          onHover={onHover}
          onPick={onPick}
        />
      ))}
    </ul>
  );
}

export interface FormulaProps {
  model: TierModel;
  focus: Tier | null;
  /** A footnote about where the numbers came from, printed under the sentence. */
  note?: string;
}

/** The one-sentence teaching moment under the lanes: nodes times block time is the wait. */
export function Formula({ model, focus, note }: FormulaProps) {
  const row = focus ? model.rows.find((r) => r.tier === focus) : undefined;
  const footnote = note ? <p className={styles.note}>{note}</p> : null;
  if (!row?.every) {
    return (
      <div className={styles.formula}>
        <p className={styles.formulaText}>
          Each block pays one node in every tier. A tier with more nodes takes longer to come back around, so
          each of its nodes is paid less often.
        </p>
        {footnote}
      </div>
    );
  }
  return (
    <div className={styles.formula} data-tier={row.tier}>
      <p className={styles.formulaLine}>
        <span className={styles.term}>
          {formatInt(row.nodes)}
          <small>nodes</small>
        </span>
        <span className={styles.op} aria-hidden="true">
          ×
        </span>
        <span className={styles.term}>
          {formatBlockSeconds(model.blockTime.seconds)}
          <small>s per block</small>
        </span>
        <span className={styles.op} aria-hidden="true">
          =
        </span>
        <span className={cn(styles.term, styles.result)}>
          <small>about</small>
          {row.every.text}
        </span>
      </p>
      <p className={styles.formulaText}>
        One {row.name} node is paid in every block, so each of the {formatInt(row.nodes)} takes its turn about
        every {row.every.text}.
      </p>
      {footnote}
    </div>
  );
}
