/**
 * The builds section's shared state: the filters the visitor sets, the view they chose, and the app
 * health the data layer last delivered. One small store, imported by both the section and the overlay
 * module (the detail drawer pivots on a builder; the section and the drawer read the same health).
 *
 * The only thing persisted is the view choice, under its own key, with every access guarded.
 */
import type { AppHealth } from '@shared/api';
import { create } from 'zustand';
import type { Freshness } from '@/data/types';
import { effectiveReducedMotion } from '@/lib/motion';
import { readItem, writeItem } from '@/lib/storage';
import type { HealthContext } from './health';
import { type CategoryFilter, DEFAULT_FILTERS, type SortKey } from './model';

export type ViewMode = 'cells' | 'constellation';

export const VIEW_KEY = 'fc:builds:view:v1';

/**
 * The remembered view. The constellation moves, so under reduced motion it is only restored when the
 * visitor chose it while motion was reduced (stored as "constellation!"); a choice made with full
 * motion falls back to the list.
 */
export function parseStoredView(raw: string | null, reducedMotion: boolean): ViewMode {
  if (raw === 'constellation!') return 'constellation';
  if (raw === 'constellation') return reducedMotion ? 'cells' : 'constellation';
  return 'cells';
}

export function encodeView(view: ViewMode, reducedMotion: boolean): string {
  return view === 'constellation' && reducedMotion ? 'constellation!' : view;
}

function initialView(): ViewMode {
  if (typeof window === 'undefined') return 'cells';
  return parseStoredView(readItem(VIEW_KEY), effectiveReducedMotion());
}

export interface HealthSlice {
  byId: Readonly<Record<string, AppHealth | undefined>>;
  ctx: HealthContext;
}

interface BuildsState {
  query: string;
  category: CategoryFilter;
  sort: SortKey;
  builder: string | null;
  view: ViewMode;
  health: HealthSlice;
  /** An app id to flash after a "surprise me" or a pivot; consumed by the cell or the graph. */
  ping: { id: string; seq: number } | null;

  setQuery: (query: string) => void;
  setCategory: (category: CategoryFilter) => void;
  setSort: (sort: SortKey) => void;
  setBuilder: (builder: string | null) => void;
  setView: (view: ViewMode) => void;
  clearFilters: () => void;
  setHealth: (apps: readonly AppHealth[] | null, freshness: Freshness) => void;
  pingApp: (id: string) => void;
}

const EMPTY_BY_ID: HealthSlice['byId'] = Object.freeze({});
let pingSeq = 0;
/** The payload the lookup was last built from, so an unchanged snapshot costs nothing. */
let lastApps: readonly AppHealth[] | null | undefined;

export const useBuilds = create<BuildsState>((set, get) => ({
  query: DEFAULT_FILTERS.query,
  category: DEFAULT_FILTERS.category,
  sort: DEFAULT_FILTERS.sort,
  builder: DEFAULT_FILTERS.builder,
  view: initialView(),
  health: { byId: EMPTY_BY_ID, ctx: { loaded: false, freshness: 'unknown' } },
  ping: null,

  setQuery: (query) => set({ query }),
  setCategory: (category) => set({ category }),
  setSort: (sort) => set({ sort }),
  setBuilder: (builder) => set({ builder }),
  setView: (view) => {
    if (get().view === view) return;
    set({ view });
    writeItem(VIEW_KEY, encodeView(view, effectiveReducedMotion()));
  },
  clearFilters: () => set({ query: '', category: 'all', builder: null }),

  setHealth: (apps, freshness) => {
    const prev = get().health;
    const loaded = apps !== null;
    const appsSame = lastApps === apps;
    const ctxSame = prev.ctx.loaded === loaded && prev.ctx.freshness === freshness;
    if (appsSame && ctxSame) return;
    let byId = prev.byId;
    if (!appsSame) {
      lastApps = apps;
      const next: Record<string, AppHealth | undefined> = {};
      for (const a of apps ?? []) next[a.id] = a;
      byId = next;
    }
    set({ health: { byId, ctx: ctxSame ? prev.ctx : { loaded, freshness } } });
  },

  pingApp: (id) => set({ ping: { id, seq: ++pingSeq } }),
}));
