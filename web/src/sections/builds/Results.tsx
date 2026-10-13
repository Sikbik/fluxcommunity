import { useEffect, useMemo, useState } from 'react';
import { useAllHealth } from '@/data';
import { cn } from '@/lib/cn';
import { Button, Chip, FreshnessChip, Glyph, HexBullet, Panel, Skeleton } from '@/ui';
import { summarizeHealth } from './health';
import { type AppEntry, type BuilderProfile, categoryLabel } from './model';
import { CATEGORY_GLYPH } from './presentation';
import styles from './Results.module.css';
import { appHash } from './route';

// ---------------------------------------------------------------------------
// Header: what is up right now, and whether we can say
// ---------------------------------------------------------------------------

/** The section header's status line: a freshness chip and a plain-words summary of the apps. */
export function HealthSummary({ entries }: { entries: readonly AppEntry[] }) {
  const health = useAllHealth();
  const summary = useMemo(() => summarizeHealth(entries.map((e) => e.health)), [entries]);
  const loading = health.data === null && health.freshness === 'unknown';
  const offline = health.freshness === 'offline' || (health.data === null && health.freshness !== 'unknown');

  if (loading) {
    return (
      <div className={styles.summary} aria-busy="true">
        <Skeleton width={96} height={26} />
        <Skeleton width={180} height={16} />
      </div>
    );
  }

  if (offline || summary.checked === 0) {
    return (
      <div className={styles.summary}>
        <FreshnessChip value={health} />
        <p className={cn(styles.note)} role="status">
          Live status is unavailable right now; the apps below are still the community&apos;s picks.
        </p>
      </div>
    );
  }

  const parts: string[] = [];
  if (summary.down === 0 && summary.degraded === 0) {
    parts.push(`All ${summary.checked} checked apps are live`);
  } else {
    parts.push(`${summary.up} live`);
    if (summary.degraded > 0) parts.push(`${summary.degraded} degraded`);
    if (summary.down > 0) parts.push(`${summary.down} offline right now`);
  }
  return (
    <div className={styles.summary}>
      <FreshnessChip value={health} />
      <p className={styles.line}>
        <HexBullet size={9} className={styles.bullet} />
        {parts.join(', ')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result count, filters in play, and a polite announcement
// ---------------------------------------------------------------------------

export interface ResultsBarProps {
  count: number;
  total: number;
  query: string;
  relevance: boolean;
  builder: string | null;
  filtered: boolean;
  onClear: () => void;
  onClearBuilder: () => void;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ResultsBar({
  count,
  total,
  query,
  relevance,
  builder,
  filtered,
  onClear,
  onClearBuilder,
}: ResultsBarProps) {
  const noun = count === 1 ? 'build' : 'builds';
  const spoken = filtered
    ? `${count} ${noun} match${count === 1 ? 'es' : ''}${query.trim() ? ` ${query.trim()}` : ''}${builder ? ` by ${builder}` : ''}`
    : `${total} builds`;
  const announce = useDebounced(spoken, 450);

  return (
    <div className={styles.bar}>
      <p className={styles.count} aria-hidden="true">
        <span className={styles.num}>{count}</span>
        {filtered ? <span className={styles.of}>{` of ${total}`}</span> : null}
        <span>{` ${total === 1 && !filtered ? 'build' : 'builds'}`}</span>
        {relevance && count > 1 ? <span className={styles.rank}>best match first</span> : null}
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      <div className={styles.active}>
        {builder ? (
          <Chip
            tone="accent"
            size="sm"
            icon="user"
            className={styles.filterChip}
            onClick={onClearBuilder}
            aria-label={`Built by ${builder}. Remove this filter`}
          >
            <span className={styles.chipInner}>
              {builder}
              <Glyph name="close" size={12} />
            </span>
          </Chip>
        ) : null}
        {filtered ? (
          <Button variant="ghost" size="sm" icon="refresh" onClick={onClear} magnetic={false}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A builder, as a small credit card
// ---------------------------------------------------------------------------

function monogram(handle: string): string {
  const words = handle.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const second = words[1]?.[0] ?? words[0]?.[1] ?? '';
  return `${first}${second}`.toUpperCase();
}

export function BuilderCard({ profile, onClear }: { profile: BuilderProfile; onClear: () => void }) {
  const n = profile.apps.length;
  return (
    <Panel
      as="section"
      variant="slab"
      size="md"
      padding="sm"
      halo={false}
      hot="br"
      pattern="tl"
      className={styles.card}
      data-builder-card=""
      aria-label={`Builds by ${profile.handle}`}
    >
      <div className={styles.cardRow}>
        <span className={styles.mono} aria-hidden="true">
          {monogram(profile.handle)}
        </span>
        <div className={styles.cardText}>
          <p className={styles.cardLabel}>Built by</p>
          <h3 className={styles.cardName}>{profile.handle}</h3>
          <p className={styles.cardMeta}>{`${n} ${n === 1 ? 'build' : 'builds'} on this portal`}</p>
        </div>
        {/* biome-ignore lint/a11y/noRedundantRoles: an explicit list role keeps list semantics in Safari when list-style is none */}
        <ul className={styles.cardApps} role="list" aria-label="Their builds">
          {profile.apps.map((e) => (
            <li key={e.app.id}>
              <a className={styles.cardApp} href={appHash(e.app.id)}>
                <Glyph name={CATEGORY_GLYPH[e.app.category]} size={14} />
                <span>{e.app.name}</span>
                <span className="sr-only">{`, ${categoryLabel(e.app.category)}`}</span>
              </a>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" onClick={onClear} magnetic={false}>
          Show everyone
        </Button>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// No results
// ---------------------------------------------------------------------------

export function EmptyState({ onClear, onAdd }: { onClear: () => void; onAdd: () => void }) {
  return (
    <Panel variant="slab" size="md" padding="lg" halo={false} hot="tr" pattern="br" className={styles.empty}>
      <div className={styles.emptyBody}>
        <span className={styles.emptyEmblem} aria-hidden="true">
          <Glyph name="search" size={30} strokeWidth={1.3} />
        </span>
        <div>
          <p className={styles.emptyTitle}>No match. Try a category, or add your own.</p>
          <p className={styles.emptyText}>
            Search reads names, taglines, builders and hosts. Clearing the filters brings every build back.
          </p>
        </div>
        <div className={styles.emptyActions}>
          <Button variant="secondary" icon="refresh" onClick={onClear} magnetic={false}>
            Clear filters
          </Button>
          <Button variant="primary" icon="plus" onClick={onAdd} magnetic={false}>
            Add your app
          </Button>
        </div>
      </div>
    </Panel>
  );
}
