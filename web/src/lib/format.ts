/**
 * Number, time and text formatters. One place, so every section prints
 * "3,031,112", "2 min" and "Nov 1" the same way. Pure functions, en-US.
 *
 * Unknown values print as `NONE` ("--") rather than "0", so a missing number is never
 * mistaken for a real zero.
 */

export const NONE = '--';

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** 3031112 -> "3,031,112" */
export function formatInt(n: number | null | undefined, fallback: string = NONE): string {
  return finite(n) ? INT.format(Math.round(n)) : fallback;
}

/** Fixed decimals with grouping: formatDecimal(1234.5, 2) -> "1,234.50". */
export function formatDecimal(n: number | null | undefined, digits = 2, fallback: string = NONE): string {
  if (!finite(n)) return fallback;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 12345 -> "12.3K", 4_100_000 -> "4.1M" */
export function formatCompact(n: number | null | undefined, fallback: string = NONE): string {
  return finite(n) ? COMPACT.format(n) : fallback;
}

/** A percentage that is already in percent: formatPct(1.954) -> "1.95%"; signed adds "+". */
export function formatPct(
  n: number | null | undefined,
  {
    digits = 2,
    signed = false,
    fallback = NONE,
  }: { digits?: number; signed?: boolean; fallback?: string } = {},
): string {
  if (!finite(n)) return fallback;
  const body = `${Math.abs(n).toFixed(digits)}%`;
  if (n < 0) return `−${body}`;
  return signed && n > 0 ? `+${body}` : body;
}

/** A share given as a 0..1 fraction: formatShare(0.1234) -> "12.3%" */
export function formatShare(
  fraction: number | null | undefined,
  digits = 1,
  fallback: string = NONE,
): string {
  return finite(fraction) ? `${(fraction * 100).toFixed(digits)}%` : fallback;
}

/** USD with enough precision for a sub-dollar price: 0.0746 -> "$0.0746", 12.5 -> "$12.50". */
export function formatUsd(n: number | null | undefined, fallback: string = NONE): string {
  if (!finite(n)) return fallback;
  const small = Math.abs(n) < 1;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: small ? 4 : 2,
    maximumFractionDigits: small ? 4 : 2,
  });
}

/** 9 -> "9.00 FLUX" */
export function formatFlux(n: number | null | undefined, digits = 2, fallback: string = NONE): string {
  return finite(n) ? `${formatDecimal(n, digits)} FLUX` : fallback;
}

/**
 * Age of data, for freshness chips: "now", "3 s", "2 min", "1 h", "2 d".
 * Input in milliseconds.
 */
export function formatAge(ms: number | null | undefined): string {
  if (!finite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 2) return 'now';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Seconds to a compact duration with at most `parts` units: 442800 -> "5d 3h", 200 -> "3m 20s". */
export function formatDuration(
  totalSeconds: number | null | undefined,
  parts = 2,
  fallback: string = NONE,
): string {
  if (!finite(totalSeconds) || totalSeconds < 0) return fallback;
  let s = Math.floor(totalSeconds);
  const units: Array<[string, number]> = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  const out: Array<[number, string]> = [];
  let started = false;
  for (const [label, size] of units) {
    const n = Math.floor(s / size);
    if (n > 0) started = true;
    if (started) {
      out.push([n, label]);
      s -= n * size;
      if (out.length >= parts) break;
    }
  }
  while (out.length > 1 && out[out.length - 1]?.[0] === 0) out.pop();
  return out.length ? out.map(([n, label]) => `${n}${label}`).join(' ') : '0s';
}

export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

/** Splits milliseconds into countdown parts (never negative). */
export function countdownParts(ms: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** ISO date or timestamp to "Nov 1", read in UTC so the label never drifts by timezone. */
export function formatDateShort(
  iso: string | number | Date | null | undefined,
  fallback: string = NONE,
): string {
  if (iso == null) return fallback;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Nov 1, 2026" in UTC. */
export function formatDateLong(
  iso: string | number | Date | null | undefined,
  fallback: string = NONE,
): string {
  if (iso == null) return fallback;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "19:46:52 UTC" */
export function formatTimeUtc(ms: number | Date, withSeconds = true): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return NONE;
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return `${withSeconds ? `${hm}:${pad2(d.getUTCSeconds())}` : hm} UTC`;
}

/** Whole days from `from` to `to` (ISO or ms), rounded up and never negative. */
export function daysUntil(to: string | number, from: number = Date.now()): number {
  const t = typeof to === 'number' ? to : new Date(to).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - from) / 86_400_000));
}

/** Middle-truncates a long identifier: "t1cz5P...Dg9". */
export function truncateMiddle(text: string, head = 6, tail = 4): string {
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

/** English plural: plural(1, "node") -> "1 node", plural(3, "node") -> "3 nodes". */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${formatInt(n)} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
