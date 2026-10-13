import type { AppCategory } from '@shared/catalog';
import { lazy, Suspense, useCallback, useId, useMemo, useRef } from 'react';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { useOverlays } from '@/lib/overlays';
import { openApp, useHashRoute } from '@/lib/route';
import { Reveal, Section, Skeleton, useHotkeys, useReducedMotion } from '@/ui';
import styles from './builds.module.css';
import { CellsView } from './CellsView';
import { Controls } from './Controls';
import { HealthBridge } from './HealthBridge';
import {
  builderProfile,
  type CategoryFilter,
  categoryCounts,
  filterAndSort,
  isFiltered,
  type SortKey,
  sharedBuilders,
} from './model';
import { rememberOpener } from './opener';
import { BuilderCard, EmptyState, HealthSummary, ResultsBar } from './Results';
import { useBuilds, type ViewMode } from './state';
import { useEntries } from './useEntries';

const Constellation = lazy(() => import('./Constellation'));

const LEAD_LIVE =
  'Apps and tools from Flux community members, spotlighted by the Flux team. Every status is checked live.';
const LEAD_QUIET = 'Apps and tools from Flux community members, spotlighted by the Flux team.';

function GraphFallback({ failed, onShowCells }: { failed: boolean; onShowCells: () => void }) {
  return (
    <div className={styles.graphHold} role="status">
      {failed ? (
        <p className={styles.graphNote}>
          The constellation could not load.{' '}
          <button type="button" className={styles.linkButton} onClick={onShowCells}>
            Show the list instead
          </button>
        </p>
      ) : (
        <>
          <Skeleton width="100%" height="100%" />
          <span className="sr-only">Loading the constellation</span>
        </>
      )}
    </div>
  );
}

export default function Builds() {
  const entries = useEntries();
  const query = useBuilds((s) => s.query);
  const category = useBuilds((s) => s.category);
  const sort = useBuilds((s) => s.sort);
  const builder = useBuilds((s) => s.builder);
  const view = useBuilds((s) => s.view);
  const ctx = useBuilds((s) => s.health.ctx);
  const { appId } = useHashRoute();
  const reduced = useReducedMotion();
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const lastSurprise = useRef<string | null>(null);

  const filters = useMemo(() => ({ query, category, builder, sort }), [query, category, builder, sort]);
  const results = useMemo(() => filterAndSort(entries, filters), [entries, filters]);
  const counts = useMemo(() => categoryCounts(entries, { query, builder }), [entries, query, builder]);
  const profile = useMemo(() => (builder ? builderProfile(entries, builder) : null), [entries, builder]);
  const pivotBuilders = useMemo(() => sharedBuilders(entries), [entries]);
  const filtered = isFiltered(filters);
  const visible = useMemo<ReadonlySet<string> | null>(
    () => (filtered ? new Set(results.entries.map((e) => e.app.id)) : null),
    [filtered, results.entries],
  );

  // "Every status is checked live" is only said while it is true.
  const quiet = ctx.loaded && ctx.freshness !== 'live';

  // `/` focuses the search while it is on screen; elsewhere it falls through to the command deck.
  useHotkeys(
    {
      '/': () => {
        const el = searchRef.current;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const onScreen = r.bottom > 72 && r.top < window.innerHeight - 24 && r.width > 0;
        if (!onScreen) return false;
        el.focus();
        el.select();
        return undefined;
      },
    },
    { priority: 10 },
  );

  const onQuery = useCallback((value: string) => useBuilds.getState().setQuery(value), []);
  const onCategory = useCallback((value: CategoryFilter) => useBuilds.getState().setCategory(value), []);
  const onSort = useCallback((value: SortKey) => useBuilds.getState().setSort(value), []);
  const onView = useCallback((value: ViewMode) => useBuilds.getState().setView(value), []);
  const onClear = useCallback(() => useBuilds.getState().clearFilters(), []);
  const onClearBuilder = useCallback(() => useBuilds.getState().setBuilder(null), []);
  const onAdd = useCallback(() => useOverlays.getState().openSubmit(), []);
  const onPivot = useCallback((handle: string) => {
    useBuilds.setState({ builder: handle, query: '', category: 'all' });
  }, []);
  const onShowCells = useCallback(() => useBuilds.getState().setView('cells'), []);

  const onToggleCategory = useCallback((c: AppCategory) => {
    const s = useBuilds.getState();
    s.setCategory(s.category === c ? 'all' : c);
  }, []);

  const onOpenApp = useCallback((id: string, from: HTMLElement | null) => {
    rememberOpener(from);
    // The same navigation a cell link makes: pushes #builds/<id> (so Back closes it), never scrolls.
    openApp(id);
  }, []);

  const onSurprise = useCallback(() => {
    const pool = results.entries.filter((e) => !e.app.self && e.lifecycle.state !== 'retired');
    const choices = pool.length > 1 ? pool.filter((e) => e.app.id !== lastSurprise.current) : pool;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (!pick) return;
    lastSurprise.current = pick.app.id;
    useBuilds.getState().pingApp(pick.app.id);
    if (view === 'cells') {
      const cell = document.querySelector<HTMLElement>(`[data-builds-grid] [data-app="${pick.app.id}"]`);
      cell?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      document.querySelector<HTMLElement>(`[data-roving="${pick.app.id}"]`)?.focus({ preventScroll: true });
    } else {
      // The button is above the picture; bring the picture (and the card the camera is about to show)
      // into view, moving the page only as far as it needs to.
      document
        .querySelector<HTMLElement>('[data-constellation]')
        ?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [results.entries, view, reduced]);

  const empty = results.entries.length === 0;

  return (
    <Section
      id="builds"
      width="wide"
      title={
        <>
          What the <b>community</b> built.
        </>
      }
      lead={quiet ? LEAD_QUIET : LEAD_LIVE}
      actions={<HealthSummary entries={entries} />}
    >
      <HealthBridge />
      <div className={styles.stack}>
        <Reveal>
          <Controls
            query={query}
            onQuery={onQuery}
            category={category}
            onCategory={onCategory}
            counts={counts}
            sort={sort}
            onSort={onSort}
            view={view}
            onView={onView}
            onSurprise={onSurprise}
            searchRef={searchRef}
            listId={listId}
          />
        </Reveal>

        <ResultsBar
          count={results.entries.length}
          total={entries.length}
          query={query}
          relevance={results.relevance}
          builder={builder}
          filtered={filtered}
          onClear={onClear}
          onClearBuilder={onClearBuilder}
        />

        {profile ? <BuilderCard profile={profile} onClear={onClearBuilder} /> : null}

        {empty ? (
          <EmptyState onClear={onClear} onAdd={onAdd} />
        ) : view === 'cells' ? (
          <CellsView
            entries={results.entries}
            id={listId}
            pivotBuilders={pivotBuilders}
            onPivot={onPivot}
            onAdd={onAdd}
          />
        ) : (
          <>
            <p className="sr-only">
              The constellation is a visual map of the same builds and is hidden from assistive technology.
              Use the Cells view for the list.
            </p>
            <ErrorBoundary fallback={<GraphFallback failed onShowCells={onShowCells} />}>
              <Suspense fallback={<GraphFallback failed={false} onShowCells={onShowCells} />}>
                <Constellation
                  entries={entries}
                  visible={visible}
                  category={category}
                  selectedId={appId}
                  onOpenApp={onOpenApp}
                  onToggleCategory={onToggleCategory}
                  onShowCells={onShowCells}
                />
              </Suspense>
            </ErrorBoundary>
          </>
        )}
      </div>
    </Section>
  );
}
