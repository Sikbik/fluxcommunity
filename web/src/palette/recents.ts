/**
 * Recent deck items: the last few things the visitor ran, newest first, kept in localStorage
 * (guarded by `lib/storage`, which never throws). Ids only, no text, nothing about the visitor.
 */
import { readJson, writeJson } from '@/lib/storage';

export const RECENTS_KEY = 'fc:deck:recent:v1';
export const MAX_RECENTS = 6;

/** Moves `id` to the front, removing a duplicate and capping the length. */
export function pushRecent(list: readonly string[], id: string, max: number = MAX_RECENTS): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** Anything stored (garbage, an older shape, ids that no longer exist) becomes a clean list. */
export function sanitizeRecents(
  raw: unknown,
  isValid: (id: string) => boolean,
  max: number = MAX_RECENTS,
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || out.includes(entry) || !isValid(entry)) continue;
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

export function loadRecents(isValid: (id: string) => boolean): string[] {
  return sanitizeRecents(readJson(RECENTS_KEY), isValid);
}

export function saveRecents(list: readonly string[]): void {
  writeJson(RECENTS_KEY, list);
}
