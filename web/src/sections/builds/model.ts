/**
 * The builds view model: the catalog joined with lifecycle and health, then filtered, ranked and
 * sorted. Pure and framework-free; every function takes the clock and the health as arguments.
 */
import type { AppHealth } from '@shared/api';
import { type AppCategory, CATEGORIES, type CommunityApp } from '@shared/catalog';
import { describeHealth, type HealthContext, type HealthView, statusRank } from './health';
import { type AppLookup, type LifecycleView, lifecycleOf } from './lifecycle';
import {
  type IndexedDoc,
  indexDoc,
  matchesBuilder,
  type Operator,
  type ParsedQuery,
  parseQuery,
  scoreDoc,
} from './search';

export type SortKey = 'default' | 'az' | 'status';
export type CategoryFilter = 'all' | AppCategory;

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'az', label: 'A to Z' },
  { value: 'status', label: 'Status' },
];

export interface AppEntry {
  app: CommunityApp;
  /** Position in the catalog. */
  order: number;
  lifecycle: LifecycleView;
  health: HealthView;
}

export interface HealthInputs {
  byId: Readonly<Record<string, AppHealth | undefined>>;
  ctx: HealthContext;
}

export interface FilterState {
  query: string;
  category: CategoryFilter;
  /** Builder handle to pivot on, exactly as in the catalog. */
  builder: string | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = { query: '', category: 'all', builder: null, sort: 'default' };

const CATEGORY_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

export function categoryLabel(id: AppCategory): string {
  return CATEGORY_LABEL[id] ?? id;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export function makeLookup(apps: readonly CommunityApp[]): AppLookup {
  const byId = new Map(apps.map((a) => [a.id, a]));
  return (id) => byId.get(id);
}

function sameHealth(a: HealthView, b: HealthView): boolean {
  return (
    a.kind === b.kind &&
    a.fresh === b.fresh &&
    a.latencyMs === b.latencyMs &&
    a.checkedAt === b.checkedAt &&
    a.since === b.since &&
    a.httpStatus === b.httpStatus
  );
}

function sameLifecycle(a: LifecycleView, b: LifecycleView): boolean {
  return a.state === b.state && a.promoted === b.promoted && a.label === b.label && a.sentence === b.sentence;
}

/**
 * Joins the catalog with lifecycle and health at `nowMs`. Pass the previous result as `previous`
 * to keep unchanged entries referentially stable (so memoised cells do not re-render).
 */
export function buildEntries(
  apps: readonly CommunityApp[],
  health: HealthInputs,
  nowMs: number,
  previous?: readonly AppEntry[],
): AppEntry[] {
  const lookup = makeLookup(apps);
  const prev = new Map((previous ?? []).map((e) => [e.app.id, e]));
  return apps.map((app, order) => {
    const next: AppEntry = {
      app,
      order,
      lifecycle: lifecycleOf(app, nowMs, lookup),
      health: describeHealth(health.byId[app.id], health.ctx, app.self === true),
    };
    const old = prev.get(app.id);
    if (old && old.order === order && sameHealth(old.health, next.health)) {
      // `msLeft` moves on every call and no cell shows it; the detail view counts down on its own.
      if (sameLifecycle(old.lifecycle, next.lifecycle)) return old;
    }
    return next;
  });
}

// ---------------------------------------------------------------------------
// Search documents (cached per app object)
// ---------------------------------------------------------------------------

const docCache = new WeakMap<CommunityApp, IndexedDoc>();

function docOf(app: CommunityApp): IndexedDoc {
  let doc = docCache.get(app);
  if (!doc) {
    doc = indexDoc({
      name: app.name,
      tagline: app.tagline,
      description: app.description,
      builder: app.builder,
      host: app.host,
      category: `${categoryLabel(app.category)} ${app.category}`,
    });
    docCache.set(app, doc);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export const IS_VALUES = [
  'new',
  'retiring',
  'retired',
  'live',
  'up',
  'degraded',
  'down',
  'unchecked',
  'self',
] as const;

function matchesIs(entry: AppEntry, value: string): boolean {
  switch (value) {
    case 'new':
      return entry.lifecycle.state === 'new';
    case 'retiring':
      return entry.lifecycle.state === 'retiring';
    case 'retired':
      return entry.lifecycle.state === 'retired';
    case 'live':
    case 'up':
      return entry.health.kind === 'up';
    case 'degraded':
      return entry.health.kind === 'degraded';
    case 'down':
    case 'offline':
      return entry.health.kind === 'down';
    case 'unchecked':
    case 'unknown':
      return entry.health.kind === 'unknown' || entry.health.kind === 'loading';
    case 'self':
      return entry.app.self === true;
    default:
      return false;
  }
}

function matchesOperator(entry: AppEntry, op: Operator): boolean {
  const app = entry.app;
  switch (op.key) {
    case 'is':
      return matchesIs(entry, op.value);
    case 'by':
      return matchesBuilder(op.value, docOf(app));
    case 'cat': {
      const label = categoryLabel(app.category).toLowerCase();
      return app.category.startsWith(op.value) || label.startsWith(op.value);
    }
    case 'host':
      return app.host.toLowerCase().includes(op.value);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Filter and sort
// ---------------------------------------------------------------------------

export interface Results {
  /** The matching entries in display order. */
  entries: AppEntry[];
  parsed: ParsedQuery;
  /** Relevance by app id; present only when the query has free text. */
  scores: ReadonlyMap<string, number> | null;
  /** The order is by relevance (a free-text query on the default sort). */
  relevance: boolean;
}

/** The default order's groups: a promoted (new) build first, then the rest, retired builds last. */
function defaultGroup(e: AppEntry): number {
  if (e.lifecycle.state === 'retired') return 2;
  return e.lifecycle.promoted ? 0 : 1;
}

function compareName(a: AppEntry, b: AppEntry): number {
  return a.app.name.localeCompare(b.app.name, 'en', { sensitivity: 'base', numeric: true });
}

function compareDefault(a: AppEntry, b: AppEntry): number {
  return defaultGroup(a) - defaultGroup(b) || a.order - b.order;
}

/** Entries that satisfy every filter except the category (the basis for the category counts). */
function matchBase(
  entries: readonly AppEntry[],
  state: Pick<FilterState, 'query' | 'builder'>,
): { entries: AppEntry[]; parsed: ParsedQuery; scores: Map<string, number> | null } {
  const parsed = parseQuery(state.query);
  const hasText = parsed.terms.length > 0;
  const scores = hasText ? new Map<string, number>() : null;
  const out: AppEntry[] = [];
  for (const entry of entries) {
    if (state.builder !== null && entry.app.builder !== state.builder) continue;
    if (!parsed.operators.every((op) => matchesOperator(entry, op))) continue;
    if (hasText) {
      const s = scoreDoc(parsed.terms, parsed.text, docOf(entry.app));
      if (s <= 0) continue;
      scores?.set(entry.app.id, s);
    }
    out.push(entry);
  }
  return { entries: out, parsed, scores };
}

/** Filters (query, operators, category, builder) and sorts. Never mutates its input. */
export function filterAndSort(entries: readonly AppEntry[], state: FilterState): Results {
  const base = matchBase(entries, state);
  let list = base.entries;
  if (state.category !== 'all') list = list.filter((e) => e.app.category === state.category);

  const scores = base.scores;
  const relevance = scores !== null && state.sort === 'default';
  const sorted = [...list];
  if (state.sort === 'az') {
    sorted.sort((a, b) => compareName(a, b) || a.order - b.order);
  } else if (state.sort === 'status') {
    sorted.sort(
      (a, b) =>
        (a.lifecycle.state === 'retired' ? 1 : 0) - (b.lifecycle.state === 'retired' ? 1 : 0) ||
        statusRank(a.health) - statusRank(b.health) ||
        (a.health.latencyMs ?? Number.POSITIVE_INFINITY) - (b.health.latencyMs ?? Number.POSITIVE_INFINITY) ||
        compareDefault(a, b),
    );
  } else if (relevance && scores) {
    sorted.sort(
      (a, b) =>
        (scores.get(b.app.id) ?? 0) - (scores.get(a.app.id) ?? 0) ||
        defaultGroup(a) - defaultGroup(b) ||
        a.order - b.order,
    );
  } else {
    sorted.sort(compareDefault);
  }
  return { entries: sorted, parsed: base.parsed, scores, relevance };
}

/** How many results each category chip would give, given the query and the builder pivot. */
export function categoryCounts(
  entries: readonly AppEntry[],
  state: Pick<FilterState, 'query' | 'builder'>,
): Record<CategoryFilter, number> {
  const base = matchBase(entries, state).entries;
  const counts: Record<string, number> = { all: base.length };
  for (const c of CATEGORIES) counts[c.id] = 0;
  for (const e of base) counts[e.app.category] = (counts[e.app.category] ?? 0) + 1;
  return counts as Record<CategoryFilter, number>;
}

/** True when any filter narrows the list. */
export function isFiltered(state: FilterState): boolean {
  return state.query.trim() !== '' || state.category !== 'all' || state.builder !== null;
}

// ---------------------------------------------------------------------------
// Builders and related apps
// ---------------------------------------------------------------------------

export interface BuilderProfile {
  handle: string;
  apps: AppEntry[];
  categories: AppCategory[];
}

export function builderProfile(entries: readonly AppEntry[], handle: string): BuilderProfile | null {
  const apps = entries.filter((e) => e.app.builder === handle);
  if (apps.length === 0) return null;
  const categories: AppCategory[] = [];
  for (const e of apps) if (!categories.includes(e.app.category)) categories.push(e.app.category);
  return {
    handle,
    apps,
    categories,
  };
}

/** Every builder handle, in catalog order. */
export function builderHandles(entries: readonly AppEntry[]): string[] {
  const seen: string[] = [];
  for (const e of entries) if (e.app.builder && !seen.includes(e.app.builder)) seen.push(e.app.builder);
  return seen;
}

/**
 * Builders with more than one build on the portal. Only these get a pivot: showing "all of their
 * builds" for a builder with one build leads nowhere.
 */
export function sharedBuilders(entries: readonly AppEntry[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.app.builder) counts.set(e.app.builder, (counts.get(e.app.builder) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [handle, n] of counts) if (n > 1) out.add(handle);
  return out;
}

/**
 * Apps related to `id`: the same builder first, then the same category, retired last, never the app
 * itself.
 */
export function relatedEntries(entries: readonly AppEntry[], id: string, limit = 3): AppEntry[] {
  const me = entries.find((e) => e.app.id === id);
  if (!me) return [];
  const scored: Array<{ entry: AppEntry; score: number }> = [];
  for (const e of entries) {
    if (e.app.id === id) continue;
    let score = 0;
    if (me.app.builder && e.app.builder === me.app.builder) score += 4;
    if (e.app.category === me.app.category) score += 3;
    if (score === 0) continue;
    if (e.lifecycle.state === 'retired') score -= 5;
    if (e.app.self) score -= 1;
    scored.push({ entry: e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.order - b.entry.order);
  return scored.slice(0, limit).map((s) => s.entry);
}

/** The apps named by an app's lifecycle links (what it replaces, what replaces it). */
export function lifecycleLinks(
  entries: readonly AppEntry[],
  id: string,
): { successor: AppEntry | null; predecessor: AppEntry | null } {
  const me = entries.find((e) => e.app.id === id);
  const find = (target: string | null) =>
    target ? (entries.find((e) => e.app.id === target) ?? null) : null;
  return {
    successor: find(me?.lifecycle.successorId ?? null),
    predecessor: find(me?.lifecycle.predecessorId ?? null),
  };
}
