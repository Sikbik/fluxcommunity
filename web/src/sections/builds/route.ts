/**
 * Deep links into the builds section, pure parts. The URL grammar itself (`#builds/<appId>`) is the
 * shell's (`@/lib/hash`); this resolves an id against the catalog and builds shareable links.
 */
import { COMMUNITY_APPS, type CommunityApp } from '@shared/catalog';
import { buildHash, parseHash } from '@/lib/hash';

export type BuildsRoute =
  /** The hash does not name an app. */
  | { kind: 'none' }
  /** The hash names an app the catalog knows. */
  | { kind: 'app'; app: CommunityApp }
  /** The hash is `#builds/<id>` for an id the catalog does not have. */
  | { kind: 'unknown'; id: string };

/** Resolves an app id from the route against the catalog (case insensitive). */
export function resolveAppId(
  appId: string | null | undefined,
  apps: readonly CommunityApp[] = COMMUNITY_APPS,
): BuildsRoute {
  if (!appId) return { kind: 'none' };
  const id = appId.toLowerCase();
  const app = apps.find((a) => a.id === id);
  return app ? { kind: 'app', app } : { kind: 'unknown', id };
}

/** Parses a location hash straight to a builds route. */
export function parseBuildsHash(hash: string, apps: readonly CommunityApp[] = COMMUNITY_APPS): BuildsRoute {
  const route = parseHash(hash);
  if (route.section !== 'builds') return { kind: 'none' };
  return resolveAppId(route.appId, apps);
}

/** `#builds/noxide`. */
export function appHash(id: string): string {
  return buildHash({ section: 'builds', appId: id });
}

/** The shareable URL of an app: the current page URL with its hash set to the app. */
export function shareUrl(pageUrl: string, id: string): string {
  const i = pageUrl.indexOf('#');
  const base = i >= 0 ? pageUrl.slice(0, i) : pageUrl;
  return `${base}${appHash(id)}`;
}

/** A short, safe label for an unknown id, for a message ("No app called ..."). */
export function displayId(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
}
