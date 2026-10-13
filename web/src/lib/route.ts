/**
 * Hash route store. `#<section>` and `#builds/<appId>` live in the URL and are mirrored
 * here so any component can read them and the builds detail can be opened from anywhere.
 *
 *   const { section, appId, openApp, closeApp } = useHashRoute();
 *
 * Opening an app PUSHES a history entry (so Back closes the detail); closing it goes
 * back when that entry is ours, otherwise rewrites the hash to `#builds`. Neither
 * scrolls the page. Navigating to a section scrolls (honouring reduced motion and the
 * header offset).
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import type { SectionId } from '@/stage/bus';
import { buildHash, EMPTY_ROUTE, type HashRoute, parseHash, sameRoute } from './hash';
import { scrollToSection } from './scroll';

interface RouteStoreState extends HashRoute {
  /** Incremented on every change, so effects can react to repeat navigations. */
  seq: number;
}

export const useRouteStore = create<RouteStoreState>(() => ({ ...EMPTY_ROUTE, seq: 0 }));

function readLocation(): HashRoute {
  return typeof location === 'undefined' ? EMPTY_ROUTE : parseHash(location.hash);
}

function apply(next: HashRoute): void {
  const cur = useRouteStore.getState();
  if (sameRoute(cur, next) && cur.raw === next.raw) return;
  useRouteStore.setState({ ...next, seq: cur.seq + 1 });
}

export interface NavigateOptions {
  /** Rewrite the current history entry instead of adding one. */
  replace?: boolean;
  /** Scroll to the section. Defaults to true when only a section is given. */
  scroll?: boolean;
}

/** Updates the URL hash and the store. Prefer the helpers below. */
export function navigate(
  route: { section: SectionId | null; appId?: string | null },
  opts: NavigateOptions = {},
): void {
  if (typeof history === 'undefined') return;
  // Home is the top of the page: no hash is the cleanest URL for it.
  const hash = route.section === 'hero' ? '' : buildHash(route);
  const url = `${location.pathname}${location.search}${hash}`;
  const state = route.appId ? { fcApp: true } : { fc: true };
  if (opts.replace) history.replaceState(state, '', url);
  else history.pushState(state, '', url);
  apply(route.section === 'hero' ? EMPTY_ROUTE : parseHash(hash));
  const scroll = opts.scroll ?? !route.appId;
  if (scroll && route.section) scrollToSection(route.section);
}

/** Smooth-scrolls to a section and records it in the URL. */
export function goToSection(id: SectionId, opts: Pick<NavigateOptions, 'replace'> = {}): void {
  navigate({ section: id }, { ...opts, scroll: true });
}

/** Opens an app's detail (`#builds/<id>`). Does not scroll. */
export function openApp(id: string): void {
  navigate({ section: 'builds', appId: id }, { scroll: false });
}

/** Closes the app detail. Goes back when the open pushed an entry, else rewrites to `#builds`. */
export function closeApp(): void {
  if (typeof history === 'undefined') return;
  const state = history.state as { fcApp?: boolean } | null;
  if (state?.fcApp) {
    history.back();
    return;
  }
  navigate({ section: 'builds' }, { replace: true, scroll: false });
}

if (typeof window !== 'undefined') {
  apply(readLocation());
  // Back, forward and a typed hash. Both events fire for a fragment change; the second
  // finds the route unchanged and does nothing.
  const onChange = () => {
    const prev = useRouteStore.getState();
    const next = readLocation();
    apply(next);
    if (next.section && next.section !== prev.section) scrollToSection(next.section);
  };
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
}

export interface HashRouteApi {
  /** The section named by the hash, or null. */
  section: SectionId | null;
  /** The app id of `#builds/<id>`, or null. */
  appId: string | null;
  openApp: (id: string) => void;
  closeApp: () => void;
  goToSection: (id: SectionId) => void;
}

const api = { openApp, closeApp, goToSection: (id: SectionId) => goToSection(id) };

/** Subscribes to the hash route. */
export function useHashRoute(): HashRouteApi {
  const section = useRouteStore((s) => s.section);
  const appId = useRouteStore((s) => s.appId);
  return useMemo(() => ({ section, appId, ...api }), [section, appId]);
}
