/**
 * App lifecycle, derived from the catalog and the clock. Pure and framework-free.
 *
 * The catalog states a lifecycle once ("retiring on 2026-11-01, replaced by noxide"). What the
 * page shows depends on the date: before the date the app is retiring and counts down; at and
 * after it the app is retired and its replacement is promoted. The catalog is never edited.
 *
 * A retire date is a UTC calendar date. The app counts as retired from 00:00 UTC that day, and
 * every label reads the date in UTC (see `formatDateShort`), so a visitor's timezone never moves it.
 */
import type { CommunityApp } from '@shared/catalog';
import { COPY } from '@/content/copy';
import { formatDateShort } from '@/lib/format';

export type LifecycleState = 'live' | 'new' | 'retiring' | 'retired';

export type AppLookup = (id: string) => CommunityApp | undefined;

export interface LifecycleView {
  state: LifecycleState;
  /** ISO date the app is (or was) retired, when the catalog says so. */
  retiresOn: string | null;
  /** The retirement instant, epoch ms. */
  retiresAtMs: number | null;
  /** Milliseconds until retirement. Only for `retiring`; never negative. */
  msLeft: number | null;
  /** The app that takes over, when this one is retiring or retired and the catalog resolves it. */
  successorId: string | null;
  /** The app this one takes over from, when the catalog resolves it. */
  predecessorId: string | null;
  /** True for the successor of an app that has already retired: it moves to the front. */
  promoted: boolean;
  /** Short label for a ribbon: "New", "Retiring Nov 1", "Retired". Null when there is none. */
  label: string | null;
  /** The full sentence for the detail view (copy deck 12). Null when there is nothing to say. */
  sentence: string | null;
}

/** Epoch ms of the start (00:00 UTC) of an ISO date or timestamp. Null when unparseable. */
export function retireInstantMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Whether an app is past its retirement instant at `nowMs`. */
export function isRetiredAt(app: CommunityApp, nowMs: number): boolean {
  if (app.lifecycle !== 'retiring') return false;
  const at = retireInstantMs(app.retiresOn);
  return at !== null && nowMs >= at;
}

/**
 * The effective lifecycle of one app at `nowMs`.
 *
 *   live      nothing special
 *   new       declared new (a successor); `promoted` once the app it replaces has retired
 *   retiring  declared retiring and its date has not come: `msLeft` counts down
 *   retired   declared retiring and its date has passed
 */
export function lifecycleOf(app: CommunityApp, nowMs: number, lookup: AppLookup): LifecycleView {
  const retiresAtMs = app.lifecycle === 'retiring' ? retireInstantMs(app.retiresOn) : null;
  const successor = app.replacedBy ? lookup(app.replacedBy) : undefined;
  const predecessor = app.replaces ? lookup(app.replaces) : undefined;

  let state: LifecycleState = 'live';
  if (app.lifecycle === 'retiring') {
    state = retiresAtMs !== null && nowMs >= retiresAtMs ? 'retired' : 'retiring';
  } else if (app.lifecycle === 'new') {
    state = 'new';
  }

  const msLeft = state === 'retiring' && retiresAtMs !== null ? Math.max(0, retiresAtMs - nowMs) : null;
  const predecessorRetired = predecessor ? isRetiredAt(predecessor, nowMs) : false;
  const promoted = state === 'new' && predecessorRetired;

  const date = app.retiresOn ? formatDateShort(app.retiresOn, '') : '';
  let label: string | null = null;
  let sentence: string | null = null;

  if (state === 'retiring') {
    label = date ? `Retiring ${date}` : 'Retiring';
    sentence = date
      ? successor
        ? COPY.retiring(date, successor.name)
        : `Retiring ${date}.`
      : successor
        ? `Retiring. ${successor.name} takes over.`
        : 'Retiring.';
  } else if (state === 'retired') {
    label = 'Retired';
    sentence = date
      ? successor
        ? `Retired on ${date}. ${successor.name} has taken over.`
        : `Retired on ${date}.`
      : successor
        ? `Retired. ${successor.name} has taken over.`
        : 'Retired.';
  } else if (state === 'new') {
    label = 'New';
    const when = predecessor?.retiresOn ? formatDateShort(predecessor.retiresOn, '') : '';
    if (predecessor && when) {
      sentence = predecessorRetired
        ? `Took over from ${predecessor.name} on ${when}.`
        : COPY.successor(predecessor.name, when);
    } else if (predecessor) {
      sentence = `New. Takes over from ${predecessor.name}.`;
    } else {
      sentence = 'New to the community portal.';
    }
  }

  return {
    state,
    retiresOn: app.lifecycle === 'retiring' ? (app.retiresOn ?? null) : null,
    retiresAtMs,
    msLeft,
    successorId: successor ? successor.id : null,
    predecessorId: predecessor ? predecessor.id : null,
    promoted,
    label,
    sentence,
  };
}

/** Whole-number days left, rounded up, for "19 days left"; null when not retiring. */
export function daysLeft(view: LifecycleView): number | null {
  if (view.msLeft === null) return null;
  return Math.ceil(view.msLeft / 86_400_000);
}
