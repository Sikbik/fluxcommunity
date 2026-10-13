/**
 * Hash routing, pure parts. The site has no router: `#<section>` scrolls to a section and
 * `#builds/<appId>` opens an app's detail. `#palette` is not a route.
 *
 *   parseHash("#builds/atlas") -> { section: "builds", appId: "atlas", raw: "builds/atlas" }
 *   buildHash({ section: "builds", appId: "atlas" }) -> "#builds/atlas"
 */
import { SECTION_ORDER, type SectionId } from '@/stage/bus';

export interface HashRoute {
  /** The section the hash names, or null when it names none. */
  section: SectionId | null;
  /** The app detail id of `#builds/<id>`, or null. */
  appId: string | null;
  /** The hash without the leading `#`. */
  raw: string;
}

export const EMPTY_ROUTE: HashRoute = { section: null, appId: null, raw: '' };

const APP_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function isSectionId(value: string | undefined | null): value is SectionId {
  return !!value && (SECTION_ORDER as readonly string[]).includes(value);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parses `location.hash`. Never throws; anything unrecognised yields section null. */
export function parseHash(hash: string): HashRoute {
  const raw = hash.replace(/^#\/?/, '').trim();
  if (!raw) return EMPTY_ROUTE;
  const [head = '', ...rest] = raw.split('/');
  const section = isSectionId(head.toLowerCase()) ? (head.toLowerCase() as SectionId) : null;
  let appId: string | null = null;
  if (section === 'builds' && rest.length > 0) {
    const candidate = safeDecode(rest.join('/'));
    if (APP_ID.test(candidate)) appId = candidate.toLowerCase();
  }
  return { section, appId, raw };
}

/** Builds a hash string for a route. `{ section: null }` yields "" (no hash). */
export function buildHash(route: { section: SectionId | null; appId?: string | null }): string {
  if (!route.section) return '';
  if (route.section === 'builds' && route.appId && APP_ID.test(route.appId)) {
    return `#builds/${encodeURIComponent(route.appId)}`;
  }
  return `#${route.section}`;
}

export function sameRoute(a: HashRoute, b: HashRoute): boolean {
  return a.section === b.section && a.appId === b.appId;
}
