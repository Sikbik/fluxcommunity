/**
 * The footer's honest status line. Pure and framework free.
 *
 * "N of M community apps responding": M is the number of catalog apps the server actually probes
 * (this site itself is never probed), N those whose last probe got an answer. `up` is a healthy
 * answer and `degraded` is an answer with something off (slow, or an auth or rate limit status), so
 * both are "responding". `down` is not. `unknown` (never probed, or the API is away) is neither: it is
 * counted separately and said out loud, never folded into a number that looks like a measurement.
 */
import type { AppHealth } from '@shared/api';
import { type CommunityApp, probeUrl } from '@shared/catalog';

export interface HealthSummary {
  /** Apps that are probed at all. The denominator. */
  total: number;
  up: number;
  degraded: number;
  down: number;
  /** Probed apps with no result yet, or a state this client does not know. */
  unchecked: number;
  /** up + degraded. */
  responding: number;
}

export function summarizeHealth(
  apps: readonly CommunityApp[],
  health: readonly AppHealth[] | null | undefined,
): HealthSummary {
  const byId = new Map<string, AppHealth>();
  for (const h of health ?? []) byId.set(h.id, h);

  const s: HealthSummary = { total: 0, up: 0, degraded: 0, down: 0, unchecked: 0, responding: 0 };
  for (const app of apps) {
    if (probeUrl(app) === null) continue;
    s.total += 1;
    const state = byId.get(app.id)?.state;
    if (state === 'up') s.up += 1;
    else if (state === 'degraded') s.degraded += 1;
    else if (state === 'down') s.down += 1;
    else s.unchecked += 1;
  }
  s.responding = s.up + s.degraded;
  return s;
}

export type HealthTone = 'ok' | 'warn' | 'crit' | 'off';

/** The colour role for the status dot. The words carry the meaning; the tone only supports them. */
export function healthTone(s: HealthSummary): HealthTone {
  const checked = s.total - s.unchecked;
  if (s.total === 0 || checked === 0) return 'off';
  if (s.responding === 0) return 'crit';
  return s.responding === s.total ? 'ok' : 'warn';
}

/**
 * The sentence for the footer.
 *   "6 of 7 community apps responding"
 *   "4 of 7 community apps responding, 3 not checked yet"
 *   "Community apps not checked yet"
 */
export function respondingText(s: HealthSummary): string {
  if (s.total === 0) return 'No community apps to check';
  if (s.total - s.unchecked === 0) return 'Community apps not checked yet';
  const noun = s.total === 1 ? 'community app' : 'community apps';
  const base = `${s.responding} of ${s.total} ${noun} responding`;
  return s.unchecked > 0 ? `${base}, ${s.unchecked} not checked yet` : base;
}
