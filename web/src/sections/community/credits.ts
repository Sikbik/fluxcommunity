/**
 * The credits: every builder the catalog names, once. Pure and framework free.
 *
 * The catalog credits the people behind apps (`CommunityApp.builder`) and node hosts
 * (`NodeHost.operator`) with the handle the Flux team used. The same handle can appear on several
 * entries (2ndTL Mining built three apps), and may be spelled with different case or stray spacing
 * between entries, so people are matched on a normalised key and shown with the first spelling seen.
 */
import type { CommunityApp, NodeHost } from '@shared/catalog';

export interface CreditWork {
  kind: 'app' | 'host';
  /** Catalog id of the app or host. */
  id: string;
  name: string;
}

export interface Credit {
  /** Normalised identity used to deduplicate. */
  key: string;
  /** The handle as credited, trimmed, first spelling wins. */
  handle: string;
  /** What this person is credited with, in catalog order. */
  works: CreditWork[];
}

/** Collapses whitespace runs and trims, keeping the credited spelling. */
export function cleanHandle(handle: string): string {
  return handle.replace(/\s+/g, ' ').trim();
}

/** Identity of a handle: case, width and spacing insensitive. */
export function creditKey(handle: string): string {
  return cleanHandle(handle).normalize('NFKC').toLowerCase();
}

/**
 * Builders and operators named in the catalog, deduplicated. Order is first appearance: app builders
 * in catalog order, then node host operators. Unattributed entries (`builder: null`) and blank handles
 * are skipped.
 */
export function collectCredits(apps: readonly CommunityApp[], hosts: readonly NodeHost[]): Credit[] {
  const byKey = new Map<string, Credit>();

  const add = (handle: string | null | undefined, work: CreditWork) => {
    if (typeof handle !== 'string') return;
    const shown = cleanHandle(handle);
    if (shown === '') return;
    const key = creditKey(shown);
    let credit = byKey.get(key);
    if (!credit) {
      credit = { key, handle: shown, works: [] };
      byKey.set(key, credit);
    }
    if (!credit.works.some((w) => w.kind === work.kind && w.id === work.id)) credit.works.push(work);
  };

  for (const app of apps) add(app.builder, { kind: 'app', id: app.id, name: app.name });
  for (const host of hosts) add(host.operator, { kind: 'host', id: host.id, name: host.name });
  return [...byKey.values()];
}
