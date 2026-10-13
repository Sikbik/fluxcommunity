/**
 * Test fixtures for the builds section. The real catalog changes (apps come and go, a category
 * disappears), so behaviour is tested against a small synthetic catalog that has every shape the real
 * one can take: a spotlighted team order, a retiring app with its successor, a builder with several
 * builds, an unattributed build, the site itself. Facts about the real catalog are tested as
 * invariants (a recount, unique ids, every key resolves), never as hard-coded lists.
 *
 * Imported only by tests; nothing in the app bundle reaches it.
 */
import type { AppHealth } from '@shared/api';
import type { AppCategory, CategoryInfo, CommunityApp } from '@shared/catalog';
import type { HealthContext } from './health';
import { type AppEntry, buildEntries } from './model';

/** A catalog app with plain defaults; override what the test is about. */
export function makeApp(over: Partial<CommunityApp> & Pick<CommunityApp, 'id'>): CommunityApp {
  return {
    name: over.id,
    tagline: 'A tagline.',
    description: 'A description.',
    category: 'network',
    builder: null,
    url: `https://${over.id}.example.app`,
    host: `${over.id}.example.app`,
    spotlight: false,
    lifecycle: 'live',
    ...over,
  };
}

/** A UTC calendar date: the synthetic retirement. */
export const RETIRES_ON = '2026-11-01';
/** Before it, and after it. */
export const BEFORE = Date.parse('2026-10-12T19:00:00Z');
export const RETIRES_AT = Date.parse('2026-11-01T00:00:00Z');
export const AFTER = Date.parse('2026-11-02T00:00:00Z');

/** A retiring app and the app that takes over from it. */
export const RETIRING = makeApp({
  id: 'old-ledger',
  name: 'Old Ledger',
  category: 'rewards',
  builder: 'Acme Labs',
  spotlight: true,
  lifecycle: 'retiring',
  retiresOn: RETIRES_ON,
  replacedBy: 'orbit-pay',
});

export const SUCCESSOR = makeApp({
  id: 'orbit-pay',
  name: 'Orbit Pay',
  tagline: 'Payouts, and when they land.',
  category: 'rewards',
  builder: 'Acme Labs',
  spotlight: true,
  lifecycle: 'new',
  replaces: 'old-ledger',
});

/** Retiring with no date and no successor, as a half-written catalog entry might be. */
export const ORPHAN = makeApp({
  id: 'lone-star',
  name: 'Lone Star',
  category: 'education',
  lifecycle: 'retiring',
});

export const CATEGORIES_SYNTH: readonly CategoryInfo[] = [
  { id: 'network', label: 'Network', blurb: 'Watch the network.' },
  { id: 'nodes', label: 'Nodes', blurb: 'Track nodes.' },
  { id: 'rewards', label: 'Rewards', blurb: 'Payouts and claims.' },
  { id: 'onboarding', label: 'Start here', blurb: 'Find your way.' },
  { id: 'education', label: 'Learn', blurb: 'Learn to deploy.' },
];

/** The synthetic catalog: spotlighted builds in the team's order, then the rest. */
export const SYNTH: readonly CommunityApp[] = [
  SUCCESSOR,
  RETIRING,
  makeApp({
    id: 'node-watch',
    name: 'Node Watch',
    tagline: 'Benchmarks for every node tier.',
    description: 'Watches each node and tells you when one falls behind.',
    category: 'nodes',
    builder: 'Beta Works',
    host: 'watch.example.app',
    spotlight: true,
  }),
  makeApp({
    id: 'grid-view',
    name: 'Grid View',
    tagline: 'Every node on one grid.',
    description: 'A single page for the whole network.',
    category: 'network',
    builder: 'Acme Labs',
    spotlight: true,
  }),
  makeApp({
    id: 'north-star',
    name: 'North Star',
    tagline: 'The front door.',
    description: 'You are here.',
    category: 'onboarding',
    builder: 'Cora',
    probe: false,
    spotlight: true,
    self: true,
  }),
  makeApp({
    id: 'learn-lab',
    name: 'Learn Lab',
    tagline: 'Learn to deploy.',
    description: 'Short lessons for people new to the network.',
    category: 'education',
    builder: null,
  }),
  makeApp({
    id: 'node-sizer',
    name: 'Node Size Planner',
    tagline: 'Size a node before you buy it.',
    description: 'A calculator.',
    category: 'nodes',
    builder: 'Dune',
    host: 'sizer.example.app',
  }),
];

export const probe = (id: string, state: AppHealth['state'], latencyMs: number | null = 120): AppHealth => ({
  id,
  state,
  httpStatus: state === 'down' ? 503 : state === 'unknown' ? null : 200,
  latencyMs,
  checkedAt: '2026-10-12T18:59:30.000Z',
  since: '2026-10-12T18:00:00.000Z',
});

export const LIVE: HealthContext = { loaded: true, freshness: 'live' };

/** Entries of a catalog at `now`, with the given probes. */
export function entriesOf(
  apps: readonly CommunityApp[],
  now: number = BEFORE,
  byId: Record<string, AppHealth> = {},
  ctx: HealthContext = LIVE,
): AppEntry[] {
  return buildEntries(apps, { byId, ctx }, now);
}

/** Every category present in a list of apps, in the order of `categories`. */
export function populated(apps: readonly CommunityApp[], categories: readonly CategoryInfo[]): AppCategory[] {
  return categories.filter((c) => apps.some((a) => a.category === c.id)).map((c) => c.id);
}
