/**
 * Fuzzy matching for the command deck. Pure, framework-free and cheap: the whole catalog is
 * ranked on every keystroke, so each match is O(token length x text length) with no regular
 * expressions and no allocation beyond a few small typed arrays.
 *
 * How a query is matched
 * - The query is split on whitespace into tokens. EVERY token must match, each against the best
 *   field of the item (name, builder, tagline ...), and the item's score is the sum.
 * - One token matches a text in one of these ways, strongest first:
 *     exact      the whole text
 *     prefix     the start of the text            "atl"  -> "Atlas"
 *     word       the start of a later word        "too"  -> "Flux Tools Hub"
 *     substring  contiguous, mid word             "ode"  -> "Node Orbit"
 *     acronym    the first letters of the words   "fth"  -> "Flux Tools Hub"
 *     fuzzy      an in-order subsequence, tight   "snd"  -> "Toggle sound"
 * - The alignment is the best one (dynamic programming), rewarding word starts and runs and
 *   penalising gaps, so the highlighted characters are the ones a person would expect.
 */

/** Half-open character range [start, end) in the ORIGINAL text. */
export type Range = readonly [start: number, end: number];

export type MatchKind = 'exact' | 'prefix' | 'word' | 'substring' | 'acronym' | 'fuzzy';

export interface TokenMatch {
  /** Higher is better. Comparable only between matches of the same token. */
  score: number;
  kind: MatchKind;
  /** Matched ranges, ascending and merged. */
  ranges: Range[];
}

/** A text prepared once (lower case and word boundaries) so ranking never repeats that work. */
export interface Prepared {
  readonly text: string;
  readonly lower: string;
  /** Per character: 0 none, 1 start of the text, 2 start of a word, 3 camel or digit boundary. */
  readonly bounds: Uint8Array;
}

const SCORE_CHAR = 16;
const BONUS_START = 14;
const BONUS_WORD = 11;
const BONUS_CAMEL = 8;
const CONSECUTIVE = 12;
const GAP = 3;
const LEAD = 1;
const LEAD_CAP = 6;
const NEG = -1_000_000;

const TIER: Record<MatchKind, number> = {
  exact: 600,
  prefix: 320,
  word: 220,
  substring: 80,
  acronym: 70,
  fuzzy: 0,
};

/**
 * A scattered subsequence is a guess, so it counts for half: "status" must not rank the Stratus
 * accent above the Builds section, whose description really does say "status".
 */
const FUZZY_SCALE = 0.5;

function isSeparator(code: number): boolean {
  // space - _ . / : ( ) [ ] , + &
  return (
    code === 32 ||
    code === 45 ||
    code === 95 ||
    code === 46 ||
    code === 47 ||
    code === 58 ||
    code === 40 ||
    code === 41 ||
    code === 91 ||
    code === 93 ||
    code === 44 ||
    code === 43 ||
    code === 38
  );
}

function isLower(code: number): boolean {
  return code >= 97 && code <= 122;
}
function isUpper(code: number): boolean {
  return code >= 65 && code <= 90;
}
function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/** Lower-cases one character at a time so indices in `lower` always line up with `text`. */
function lowerSameLength(text: string): string {
  const low = text.toLowerCase();
  if (low.length === text.length) return low;
  let out = '';
  for (const ch of text) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

export function prepare(text: string): Prepared {
  const lower = lowerSameLength(text);
  const bounds = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    if (i === 0) {
      bounds[i] = 1;
      continue;
    }
    const prev = text.charCodeAt(i - 1);
    const cur = text.charCodeAt(i);
    if (isSeparator(prev)) bounds[i] = isSeparator(cur) ? 0 : 2;
    else if (isLower(prev) && isUpper(cur)) bounds[i] = 3;
    else if ((isDigit(cur) && !isDigit(prev)) || (isDigit(prev) && !isDigit(cur) && !isSeparator(cur))) {
      bounds[i] = 3;
    }
  }
  return { text, lower, bounds };
}

/** Lower-cased whitespace-separated tokens of a query, at most six. */
export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
}

function boundBonus(b: number): number {
  return b === 1 ? BONUS_START : b === 2 ? BONUS_WORD : b === 3 ? BONUS_CAMEL : 0;
}

function mergeRanges(positions: number[]): Range[] {
  const out: Array<[number, number]> = [];
  for (const p of positions) {
    const last = out[out.length - 1];
    if (last && last[1] === p) last[1] = p + 1;
    else out.push([p, p + 1]);
  }
  return out;
}

// Scratch buffers, grown on demand and reused: matching runs on every keystroke.
let prevRow = new Int32Array(128);
let curRow = new Int32Array(128);
let back = new Int16Array(16 * 128);

function ensure(m: number, n: number): void {
  if (prevRow.length < n) {
    prevRow = new Int32Array(n * 2);
    curRow = new Int32Array(n * 2);
  }
  if (back.length < m * n) back = new Int16Array(m * n * 2);
}

/**
 * Best alignment of `token` (lower case) inside `p`, or null when it does not match well enough.
 * A single character only matches at the start of a word, which keeps one-letter queries useful.
 */
export function matchToken(token: string, p: Prepared): TokenMatch | null {
  const m = token.length;
  const n = p.lower.length;
  if (m === 0 || n === 0 || m > n) return null;

  // Cheap tiers first: they cover most real queries and need no DP.
  if (p.lower === token) {
    return { score: TIER.exact + m * SCORE_CHAR, kind: 'exact', ranges: [[0, n]] };
  }
  if (m === 1) {
    const first = p.lower.charCodeAt(0) === token.charCodeAt(0);
    if (first) return { score: TIER.prefix + SCORE_CHAR, kind: 'prefix', ranges: [[0, 1]] };
    for (let j = 1; j < n; j++) {
      if (p.lower.charCodeAt(j) === token.charCodeAt(0) && (p.bounds[j] ?? 0) >= 2) {
        return { score: TIER.word + SCORE_CHAR - Math.min(j, 40) / 4, kind: 'word', ranges: [[j, j + 1]] };
      }
    }
    return null;
  }

  ensure(m, n);
  const t0 = token.charCodeAt(0);
  for (let j = 0; j < n; j++) {
    prevRow[j] =
      p.lower.charCodeAt(j) === t0
        ? SCORE_CHAR + boundBonus(p.bounds[j] ?? 0) - Math.min(j, LEAD_CAP) * LEAD
        : NEG;
  }

  for (let i = 1; i < m; i++) {
    const ti = token.charCodeAt(i);
    let g1 = NEG; // G[j-1]: best of prev[k] - GAP * (j - 1 - k) over k <= j - 1
    let g2 = NEG; // G[j-2]
    let a1 = -1;
    let a2 = -1;
    for (let j = 0; j < n; j++) {
      let value = NEG;
      let from = -1;
      if (p.lower.charCodeAt(j) === ti) {
        const consecutive =
          j > 0 && (prevRow[j - 1] ?? NEG) > NEG ? (prevRow[j - 1] ?? NEG) + CONSECUTIVE : NEG;
        const gapped = g2 > NEG ? g2 - GAP : NEG;
        if (consecutive >= gapped && consecutive > NEG) {
          value = consecutive;
          from = j - 1;
        } else if (gapped > NEG) {
          value = gapped;
          from = a2;
        }
        if (value > NEG) value += SCORE_CHAR + boundBonus(p.bounds[j] ?? 0);
      }
      curRow[j] = value;
      back[i * n + j] = from;
      // Advance G and its argmax: G[j] = max(prev[j], G[j-1] - GAP).
      g2 = g1;
      a2 = a1;
      const here = prevRow[j] ?? NEG;
      const carried = g1 > NEG ? g1 - GAP : NEG;
      if (here >= carried && here > NEG) {
        g1 = here;
        a1 = j;
      } else {
        g1 = carried;
        // a1 stays: the carried best came from the same k
      }
    }
    // swap rows
    const tmp = prevRow;
    prevRow = curRow;
    curRow = tmp;
  }

  // Best end position.
  let best = NEG;
  let end = -1;
  for (let j = 0; j < n; j++) {
    const v = prevRow[j] ?? NEG;
    if (v > best) {
      best = v;
      end = j;
    }
  }
  if (end < 0 || best <= NEG) return null;

  // Backtrack the positions.
  const positions = new Array<number>(m);
  let j = end;
  for (let i = m - 1; i >= 0; i--) {
    positions[i] = j;
    j = i > 0 ? (back[i * n + j] ?? -1) : -1;
    if (i > 0 && j < 0) return null;
  }

  const first = positions[0] as number;
  const last = positions[m - 1] as number;
  const span = last - first + 1;
  const contiguous = span === m;
  let boundaryHits = 0;
  for (const pos of positions) if ((p.bounds[pos] ?? 0) >= 1) boundaryHits++;

  let kind: MatchKind;
  if (contiguous && first === 0) kind = m === n ? 'exact' : 'prefix';
  else if (contiguous && (p.bounds[first] ?? 0) >= 2) kind = 'word';
  else if (contiguous) kind = 'substring';
  else if (boundaryHits === m && m >= 2) kind = 'acronym';
  else kind = 'fuzzy';

  if (kind === 'fuzzy') {
    // Loose subsequences are only welcome when they are tight: otherwise "ab" matches half the page.
    if (m < 3 || span > m * 3 + 2 || best < m * 15) return null;
  }
  const score = kind === 'fuzzy' ? (best + TIER.fuzzy) * FUZZY_SCALE : best + TIER[kind];
  return { score, kind, ranges: mergeRanges(positions) };
}

const LITERAL: ReadonlySet<MatchKind> = new Set<MatchKind>(['exact', 'prefix', 'word', 'substring']);

/**
 * Union of every token's ranges inside one text, for highlighting. Tokens that miss are skipped.
 * `loose` allows acronym and fuzzy highlights (a title); otherwise only literal ones.
 */
export function highlightRanges(tokens: readonly string[], p: Prepared, loose = true): Range[] {
  if (tokens.length === 0) return [];
  const flags = new Uint8Array(p.text.length);
  let any = false;
  for (const token of tokens) {
    const hit = matchToken(token, p);
    if (!hit) continue;
    if (!loose && !LITERAL.has(hit.kind)) continue;
    // Do not paint scattered letters across a title because a tagline matched: only tight matches show.
    if (hit.kind === 'fuzzy' && hit.ranges.length > 2) continue;
    for (const [a, b] of hit.ranges) {
      for (let i = a; i < b; i++) flags[i] = 1;
      any = true;
    }
  }
  if (!any) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    const last = out[out.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else out.push([i, i + 1]);
  }
  return out;
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits a text into hit and plain segments for rendering. */
export function segments(text: string, ranges: readonly Range[]): Segment[] {
  if (ranges.length === 0) return [{ text, hit: false }];
  const out: Segment[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) out.push({ text: text.slice(at, a), hit: false });
    out.push({ text: text.slice(a, b), hit: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

export interface ScoredField {
  field: Prepared;
  /** Multiplier for this field: names count most, descriptions least. */
  weight: number;
  /**
   * Whether scattered (acronym and fuzzy) matches count. Names and handles are short and can be
   * abbreviated, so they are loose; a tagline or a description only matches literal words.
   */
  loose?: boolean;
}

/**
 * Score of an item for a tokenised query, or -1 when any token matches none of its fields.
 * Each token takes its best weighted field; the total is the sum over tokens.
 */
export function scoreFields(tokens: readonly string[], fields: readonly ScoredField[]): number {
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const token of tokens) {
    let best = -1;
    for (const { field, weight, loose = true } of fields) {
      const hit = matchToken(token, field);
      if (!hit) continue;
      if (!loose && !LITERAL.has(hit.kind)) continue;
      const s = hit.score * weight;
      if (s > best) best = s;
    }
    if (best < 0) return -1;
    total += best;
  }
  return total;
}
