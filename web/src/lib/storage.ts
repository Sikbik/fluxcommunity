/**
 * Safe Web Storage. Every access is wrapped: storage can throw in private windows,
 * with blocked site data, in sandboxed frames and during previews. Callers always get a
 * usable value back and the page renders correctly without it.
 */

type Kind = 'local' | 'session';

function area(kind: Kind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readItem(key: string, kind: Kind = 'local'): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string, kind: Kind = 'local'): boolean {
  try {
    area(kind)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string, kind: Kind = 'local'): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readJson(key: string, kind: Kind = 'local'): unknown {
  const raw = readItem(key, kind);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, kind: Kind = 'local'): boolean {
  try {
    return writeItem(key, JSON.stringify(value), kind);
  } catch {
    return false;
  }
}
