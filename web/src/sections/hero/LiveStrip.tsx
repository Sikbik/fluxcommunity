import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { COPY } from '@/content/copy';
import {
  type SectionKey,
  useChainClock,
  useChainHeight,
  useConnection,
  useNetworkSelect,
  useSectionAge,
  useSectionFreshness,
} from '@/data';
import { cn } from '@/lib/cn';
import { formatDateShort, formatDecimal, formatInt } from '@/lib/format';
import { hexSegments } from '@/lib/hex';
import {
  FreshnessChip,
  Glyph,
  LinkButton,
  Odometer,
  Panel,
  Skeleton,
  StatusDot,
  useIsPhone,
  useReducedMotion,
} from '@/ui';
import hero from './hero.module.css';
import { useBlockBeat, useRollIn } from './hooks';
import { describeChange, digitCount, litSegments, priceDecimals, RING_SEGMENTS, stripTone } from './logic';
import styles from './strip.module.css';

const SEGMENTS = hexSegments(50, 50, 42, RING_SEGMENTS, 0.006);

/** A freshness chip for one section of the network snapshot, labelled with its own age. */
function SectionChip({ section }: { section: SectionKey }) {
  const { freshness } = useSectionFreshness(section);
  const ageMs = useSectionAge(section);
  const connection = useConnection();
  const phone = useIsPhone();
  // On a phone the cell is narrow: LIVE alone says it; a stale or offline chip keeps its age.
  return (
    <FreshnessChip
      freshness={freshness}
      ageMs={ageMs}
      polling={connection === 'polling'}
      hideAge={phone && freshness === 'live'}
    />
  );
}

interface CellProps {
  /** Stagger index for the entrance. */
  index: number;
}

const rise = (index: number): CSSProperties => ({ '--i': index }) as CSSProperties;

// ---------------------------------------------------------------------------
// Block height
// ---------------------------------------------------------------------------

function BlockCell({ index }: CellProps) {
  const height = useChainHeight();
  const shown = useRollIn(height, 0);
  return (
    <div className={cn(styles.cell, hero.rise)} style={rise(index)}>
      <dt className={styles.label}>
        <span className={styles.labelText}>Block height</span>
        <SectionChip section="chain" />
      </dt>
      <dd className={styles.value} aria-live="off">
        {height === null || shown === null ? (
          <Skeleton width="8ch" height="0.9em" />
        ) : (
          <span className={styles.num}>
            <Odometer value={shown} minDigits={digitCount(height)} label={formatInt(height)} />
          </span>
        )}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The next-block ring and countdown
// ---------------------------------------------------------------------------

interface RingProps {
  lit: number;
  live: boolean;
  complete: boolean;
  flare: 'a' | 'b' | null;
}

function BlockRing({ lit, live, complete, flare }: RingProps) {
  const shown = complete ? RING_SEGMENTS : lit;
  return (
    <svg
      className={styles.ring}
      viewBox="0 0 100 100"
      data-live={live ? 'true' : 'false'}
      data-complete={complete ? '' : undefined}
      data-flare={flare ?? undefined}
      aria-hidden="true"
      focusable="false"
    >
      {SEGMENTS.map((d, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed ring of cells
          key={i}
          d={d}
          className={styles.seg}
          data-lit={i < shown ? '' : undefined}
          data-head={!complete && i === shown - 1 ? '' : undefined}
        />
      ))}
    </svg>
  );
}

function NextBlockCell({ index }: CellProps) {
  const clock = useChainClock();
  const measured = useNetworkSelect((n) => n.chain.measuredBlockSec);
  const reduced = useReducedMotion();
  const [flare, setFlare] = useState<'a' | 'b' | null>(null);
  const [complete, setComplete] = useState(false);
  const timer = useRef(0);

  // A real block completes the ring, flares it once, then the next interval begins.
  useBlockBeat(() => {
    if (reduced) return;
    setFlare((f) => (f === 'a' ? 'b' : 'a'));
    setComplete(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setComplete(false), 720);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const live = clock.live && clock.secondsToNext !== null;
  const lit = live ? litSegments(clock.progress) : 0;

  return (
    <div className={cn(styles.cell, hero.rise)} style={rise(index)}>
      <dt className={styles.label}>
        <span className={styles.labelText}>
          <StatusDot status={live ? 'ok' : 'off'} pulse={live} size={8} />
          Next block
        </span>
      </dt>
      <dd className={styles.nextBody} aria-live="off">
        <BlockRing lit={lit} live={live} complete={complete} flare={flare} />
        <span className={styles.nextText}>
          {live && clock.secondsToNext !== null ? (
            <span className={styles.nextValue}>
              <Odometer
                value={clock.secondsToNext}
                minDigits={2}
                flash={false}
                duration={380}
                label={`${clock.secondsToNext} seconds`}
              />
              <span className={styles.unit} aria-hidden="true">
                s
              </span>
            </span>
          ) : (
            <span className={cn(styles.nextValue, styles.missing)}>--</span>
          )}
          {live && measured !== null ? (
            <span className={styles.nextSub}>avg {formatDecimal(measured, 1)} s</span>
          ) : (
            <span className={styles.nextSub}>
              {clock.height === null ? 'Syncing' : live ? '' : 'Not live'}
            </span>
          )}
        </span>
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nodes online
// ---------------------------------------------------------------------------

function NodesCell({ index }: CellProps) {
  const total = useNetworkSelect((n) => n.nodes.total);
  const shown = useRollIn(total, 0);
  return (
    <div className={cn(styles.cell, hero.rise)} style={rise(index)}>
      <dt className={styles.label}>
        <span className={styles.labelText}>Nodes online</span>
        <SectionChip section="nodes" />
      </dt>
      <dd className={styles.value} aria-live="off">
        {total === null || shown === null ? (
          <Skeleton width="5ch" height="0.9em" />
        ) : (
          <span className={styles.num}>
            <Odometer value={shown} minDigits={digitCount(total)} label={formatInt(total)} />
          </span>
        )}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FLUX price
// ---------------------------------------------------------------------------

function PriceCell({ index }: CellProps) {
  const market = useNetworkSelect((n) => n.market ?? ('none' as const));
  const price = market !== null && market !== 'none' ? market.priceUsd : null;
  const shown = useRollIn(price, 0);
  const change = describeChange(market !== null && market !== 'none' ? market.change24hPct : null);

  let body: React.ReactNode;
  if (market === null) {
    body = <Skeleton width="6ch" height="0.9em" />;
  } else if (price === null || shown === null) {
    body = <span className={styles.missing}>--</span>;
  } else {
    body = (
      <>
        <span className={styles.num}>
          <Odometer
            value={shown}
            decimals={priceDecimals(price)}
            prefix="$"
            label={`${price.toFixed(priceDecimals(price))} US dollars`}
          />
        </span>
        {change.direction === 'none' ? null : (
          <span className={styles.change} data-dir={change.direction}>
            <span aria-hidden="true" className={styles.changeBody}>
              {change.direction === 'flat' ? (
                <Glyph name="minus" size={14} strokeWidth={2} />
              ) : (
                <Glyph name="arrow-up-right" size={14} strokeWidth={2} />
              )}
              <span>{change.text}</span>
              <span className={styles.window}>24 h</span>
            </span>
            <span className="sr-only">{change.spoken}</span>
          </span>
        )}
      </>
    );
  }

  return (
    <div className={cn(styles.cell, hero.rise)} style={rise(index)}>
      <dt className={styles.label}>
        <span className={styles.labelText}>FLUX price</span>
        <SectionChip section="market" />
      </dt>
      <dd className={styles.value} aria-live="off">
        {body}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The strip
// ---------------------------------------------------------------------------

/** One line above the slab for the strip as a whole: syncing, or the last known numbers. */
function Caption() {
  const chain = useSectionFreshness('chain');
  const nodes = useSectionFreshness('nodes');
  const market = useSectionFreshness('market');
  const tone = stripTone([chain.freshness, nodes.freshness, market.freshness]);

  let text = '';
  if (tone === 'syncing') text = COPY.loading;
  else if (tone === 'offline') {
    const asOf = formatDateShort(chain.asOf ?? nodes.asOf ?? market.asOf, '');
    text = asOf ? `${COPY.offline}. As of ${asOf}` : COPY.offline;
  }

  return (
    <p className={styles.caption} data-tone={tone}>
      {text ? (
        <>
          <Glyph name={tone === 'offline' ? 'status-warn' : 'status-pending'} size={14} />
          <span>{text}</span>
        </>
      ) : null}
    </p>
  );
}

export function LiveStrip() {
  return (
    <div className={styles.wrap}>
      <Caption />
      <Panel size="sm" padding="none" hot="tr" pattern="bl" role="group" aria-label="Live network numbers">
        <dl className={styles.cells}>
          <BlockCell index={12} />
          <NextBlockCell index={13} />
          <NodesCell index={14} />
          <PriceCell index={15} />
        </dl>
      </Panel>
      <div className={styles.cue}>
        {/* The nudge moves this plain box (animating an svg is never composited). */}
        <div className={styles.cueBob}>
          <LinkButton
            href="#pulse"
            variant="icon"
            shape="hex"
            size="md"
            icon="chevron-down"
            label="Scroll to the network pulse"
            magnetic={false}
          />
        </div>
      </div>
    </div>
  );
}
