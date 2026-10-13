/** Platform sniffing, kept to the few things the UI genuinely needs. */

export function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Label of the primary modifier key: the Command symbol on Apple platforms, Ctrl elsewhere. */
export function modKeyLabel(): string {
  return isMacLike() ? '⌘' : 'Ctrl';
}

/** True on connections where the visitor asked to save data, or the link is very slow. */
export function prefersSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

/** Rounded device memory in GB, or null when the browser does not say. */
export function deviceMemory(): number | null {
  if (typeof navigator === 'undefined') return null;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' ? mem : null;
}
