/**
 * The world map tile: a dot-matrix world with node clusters glowing by tier, tier filter chips, a
 * top-five countries list (the keyboard and screen reader path to the same information) and a link
 * to the full 3D globe on Flux Atlas. Nothing here is placed by guesswork: clusters come from the
 * API's located nodes, and baked fallback geography is never drawn as if it were measured.
 */
import { appById } from '@shared/catalog';
import { type CSSProperties, lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { COPY } from '@/content/copy';
import { useGeo } from '@/data';
import { cn } from '@/lib/cn';
import { formatDateLong, formatInt, formatShare } from '@/lib/format';
import { Glyph, LinkButton, Panel, Skeleton } from '@/ui';
import { anchorCluster, type Placed, type TierFilter, tierTotals } from './clusters';
import { type CountryRow, tierMix, topCountries } from './countries';
import styles from './map.module.css';
import type { MapLayout } from './mapEngine';
import { formatCoordinates } from './projection';
import { GeoChip, TileHeader } from './shared';
import { TIER_NAMES } from './tiers';

const WorldMap = lazy(() => import('./WorldMap'));

const EMPTY: never[] = [];

interface Props {
  filter: TierFilter;
  onFilter: (filter: TierFilter) => void;
}

const FILTERS: ReadonlyArray<{ id: TierFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'cumulus', label: TIER_NAMES.cumulus },
  { id: 'nimbus', label: TIER_NAMES.nimbus },
  { id: 'stratus', label: TIER_NAMES.stratus },
];

interface TipContent {
  title: string;
  sub: string;
  total: number;
  tiers: readonly [number, number, number];
  x: number;
  y: number;
}

function CountryBar({ row, filter }: { row: CountryRow; filter: TierFilter }) {
  const mix = tierMix(row.tiers);
  return (
    <span className={styles.bar} aria-hidden="true">
      <span className={styles.barFill} style={{ '--len': row.bar } as CSSProperties}>
        {filter === 'all' ? (
          <>
            <i data-tier="cumulus" style={{ flexGrow: mix.cumulus }} />
            <i data-tier="nimbus" style={{ flexGrow: mix.nimbus }} />
            <i data-tier="stratus" style={{ flexGrow: mix.stratus }} />
          </>
        ) : (
          <i data-tier={filter} style={{ flexGrow: 1 }} />
        )}
      </span>
    </span>
  );
}

function Tooltip({ tip, width, height }: { tip: TipContent; width: number; height: number }) {
  const below = tip.y < 118;
  return (
    <div
      className={styles.tip}
      data-below={below ? 'true' : undefined}
      style={{
        left: `clamp(7.75rem, ${tip.x}px, ${Math.max(0, width - 124)}px)`,
        top: `${Math.min(height, Math.max(0, tip.y))}px`,
      }}
      role="status"
    >
      <span className={styles.tipTitle}>{tip.title}</span>
      <span className={styles.tipSub}>{tip.sub}</span>
      <span className={styles.tipTotal}>{formatInt(tip.total)} nodes</span>
      <span className={styles.tipTiers}>
        {(['cumulus', 'nimbus', 'stratus'] as const).map((tier, i) => (
          <span key={tier} data-tier={tier} className={styles.tipTier}>
            <Glyph name={`tier-${tier}`} size={13} />
            <span>{TIER_NAMES[tier]}</span>
            <b>{formatInt(tip.tiers[i] ?? 0)}</b>
          </span>
        ))}
      </span>
    </div>
  );
}

export function MapTile({ filter, onFilter }: Props) {
  const geo = useGeo();
  const data = geo.data;
  const baked = geo.meta?.source === 'fallback';
  const lastKnown = geo.freshness === 'offline' && !baked;
  const points = !baked && data ? data.points : EMPTY;
  const countries = data ? data.countries : EMPTY;

  const [hoverCluster, setHoverCluster] = useState<Placed | null>(null);
  const [layout, setLayout] = useState<MapLayout | null>(null);
  const [rowHover, setRowHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const totals = useMemo(() => tierTotals(points), [points]);
  const rows = useMemo(() => topCountries(countries, filter, 5), [countries, filter]);
  const highlight = rowHover ?? pinned;
  const plotted = points.length > 0;

  const onHover = useCallback((c: Placed | null) => setHoverCluster(c), []);
  const onLayout = useCallback((l: MapLayout) => setLayout(l), []);

  const atlas = appById('atlas');

  // What the tooltip says: the cluster under the pointer, else the country of a hovered or pinned row.
  const tip = useMemo<TipContent | null>(() => {
    if (hoverCluster) {
      const name = countries.find((c) => c.code === hoverCluster.cc)?.name ?? null;
      return {
        title: name ?? 'Location',
        sub: formatCoordinates(hoverCluster.lat, hoverCluster.lon),
        total: hoverCluster.total,
        tiers: hoverCluster.tiers,
        x: hoverCluster.x,
        y: hoverCluster.y - hoverCluster.halo * 0.6,
      };
    }
    const cc = highlight;
    if (cc && layout) {
      const country = countries.find((c) => c.code === cc);
      const anchor = anchorCluster(layout.placed, cc);
      if (country && anchor) {
        return {
          title: country.name,
          sub: `${formatShare(country.nodes / Math.max(1, data?.located ?? country.nodes), 1)} of located nodes`,
          total: country.nodes,
          tiers: [country.tiers.cumulus, country.tiers.nimbus, country.tiers.stratus],
          x: anchor.x,
          y: anchor.y - anchor.halo * 0.6,
        };
      }
    }
    return null;
  }, [hoverCluster, highlight, layout, countries, data]);

  const note =
    geo.data === null
      ? COPY.loading
      : baked
        ? 'No live location data'
        : !plotted
          ? 'No node locations reported right now'
          : null;
  const count = (tier: TierFilter): number | undefined => {
    if (!plotted) return undefined;
    if (tier === 'all') return totals.cumulus + totals.nimbus + totals.stratus;
    return totals[tier];
  };

  return (
    <Panel
      padding="lg"
      size="lg"
      hot="tr"
      pattern="br"
      stageFocus
      container
      as="article"
      className={styles.tile}
      contentClassName={styles.content}
    >
      <TileHeader label="World map" detail="Where the nodes run, by tier" chip={<GeoChip />} />

      {/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form field set */}
      <div className={styles.filters} role="group" aria-label="Show nodes of tier">
        {FILTERS.map((f) => {
          const n = count(f.id);
          return (
            <button
              key={f.id}
              type="button"
              className={cn('chamfer', styles.filter)}
              data-tier={f.id === 'all' ? undefined : f.id}
              aria-pressed={filter === f.id}
              onClick={() => onFilter(f.id === filter && f.id !== 'all' ? 'all' : f.id)}
            >
              {f.id === 'all' ? null : <Glyph name={`tier-${f.id}`} size={15} />}
              <span>{f.label}</span>
              {n !== undefined ? <span className={styles.filterCount}>{formatInt(n)}</span> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.screen} data-state={note ? 'empty' : undefined}>
        <Suspense fallback={<div className={styles.screenSkeleton} aria-hidden="true" />}>
          <WorldMap
            points={points}
            filter={filter}
            highlight={highlight}
            muted={lastKnown}
            onHover={onHover}
            onLayout={onLayout}
          />
        </Suspense>
        {tip && layout ? <Tooltip tip={tip} width={layout.width} height={layout.height} /> : null}
        {note ? (
          <p className={styles.note}>
            <span className={styles.noteMark} aria-hidden="true" />
            {note}
          </p>
        ) : null}
        <p className="sr-only">
          {plotted
            ? `A dot map of ${formatInt(points.length)} node locations. The list of top countries below is the same information.`
            : 'The node map has no location data right now.'}
        </p>
      </div>

      <div className={styles.lower}>
        <section className={styles.list} aria-label="Top countries by nodes">
          {rows.length > 0 ? (
            // biome-ignore lint/a11y/noRedundantRoles: list-style none makes Safari drop the list semantics unless the role is explicit
            <ol className={styles.rows} role="list">
              {rows.map((row) => {
                const interactive = plotted;
                const inner = (
                  <>
                    <span className={styles.rank}>{String(row.rank).padStart(2, '0')}</span>
                    <span className={styles.country}>{row.name}</span>
                    <span className={styles.share}>{formatShare(row.share, 1)}</span>
                    <CountryBar row={row} filter={filter} />
                    <span className={styles.nodes}>{formatInt(row.nodes)}</span>
                  </>
                );
                return (
                  <li key={row.code} className={styles.rowItem}>
                    {interactive ? (
                      <button
                        type="button"
                        className={styles.row}
                        aria-pressed={pinned === row.code}
                        aria-label={`${row.name}: ${formatInt(row.nodes)} nodes, ${formatShare(row.share, 1)} of located nodes. ${
                          pinned === row.code ? 'Highlighted on the map.' : 'Highlight on the map.'
                        }`}
                        data-active={highlight === row.code ? 'true' : undefined}
                        onPointerEnter={() => setRowHover(row.code)}
                        onPointerLeave={() => setRowHover(null)}
                        onFocus={(e) => {
                          if (e.currentTarget.matches(':focus-visible')) setRowHover(row.code);
                        }}
                        onBlur={() => setRowHover(null)}
                        onClick={() => setPinned((p) => (p === row.code ? null : row.code))}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className={cn(styles.row, styles.rowStatic)}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : geo.data === null ? (
            <div className={styles.rowsSkeleton} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={34} />
              ))}
            </div>
          ) : null}
        </section>

        <footer className={styles.foot}>
          {data ? (
            <p className={styles.located}>
              <b>{formatInt(data.located)}</b> of {formatInt(data.total)} nodes have a known location
              {baked ? <>, as of {formatDateLong(geo.meta?.asOf)}</> : null}
            </p>
          ) : null}
          {atlas ? (
            <LinkButton
              href={atlas.url}
              withUtm
              variant="secondary"
              size="sm"
              iconEnd="arrow-up-right"
              className={styles.atlas}
            >
              Explore it in 3D on Flux Atlas
            </LinkButton>
          ) : null}
        </footer>
      </div>
    </Panel>
  );
}
