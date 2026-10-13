/**
 * Query flags (dev and QA), parsed once:
 *   ?kit=1        design-system gallery
 *   ?stage=debug  stage stats overlay (read by the stage)
 *   ?q=low|medium|high   force a quality tier (read by the stage)
 *   ?ambient=1    start in ambient mode
 *   ?intro=0      skip the first-visit intro
 */
export interface Flags {
  kit: boolean;
  /** false only when ?intro=0 was passed. */
  intro: boolean;
  ambient: boolean;
  stage: string | null;
  q: string | null;
}

export function parseFlags(search: string): Flags {
  const p = new URLSearchParams(search);
  const truthy = (v: string | null) => v === '1' || v === 'true' || v === '';
  return {
    kit: p.has('kit') && truthy(p.get('kit')),
    intro: p.get('intro') !== '0' && p.get('intro') !== 'false',
    ambient: p.has('ambient') && truthy(p.get('ambient')),
    stage: p.get('stage'),
    q: p.get('q'),
  };
}

let cached: Flags | null = null;

export function getFlags(): Flags {
  if (!cached) cached = parseFlags(typeof location === 'undefined' ? '' : location.search);
  return cached;
}
