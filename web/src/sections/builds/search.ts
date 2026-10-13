/**
 * Forgiving search over the catalog. Pure and framework-free.
 *
 * A query is split into free-text terms and `key:value` operators (`is:new`, `by:2ndtl`,
 * `cat:nodes`, `host:runonflux`). Every term must match something (AND), and the score says how
 * well: a whole word beats a word prefix beats a substring beats initials ("fnm" for FluxNode
 * Monitor) beats a typo ("fluxtrakcer"). Fields are weighted, so a hit in the name outranks the same
 * hit in the description. There is deliberately no loose subsequence match: it turns "node" into a
 * hit for "learn to deploy".
 */

export type OperatorKey = 'is' | 'by' | 'cat' | 'host';
const OPERATOR_KEYS: readonly string[] = ['is', 'by', 'cat', 'host'];

export interface Operator {
  key: OperatorKey;
  /** Folded (lower case, no diacritics). */
  value: string;
}

export interface ParsedQuery {
  raw: string;
  /** Free-text terms, folded, one per word. */
  terms: string[];
  /** The free text re-joined, for whole-name comparisons. */
  text: string;
  operators: Operator[];
  /** True when there is nothing to filter on. */
  empty: boolean;
}

/** Lower case, no diacritics. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Words of a string, camelCase and digit aware: "FluxNode Monitor" gives flux, node, monitor;
 * "2ndTL Mining" gives 2nd, tl, mining; "app.edouard.ai" gives app, edouard, ai.
 */
export function splitWords(text: string): string[] {
  const spaced = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function unquote(value: string): string {
  return value.replace(/^"/, '').replace(/"$/, '');
}

/** Parses the raw text of the search field. Never throws. */
export function parseQuery(raw: string): ParsedQuery {
  const terms: string[] = [];
  const operators: Operator[] = [];
  const parts = raw.match(/[a-z]+:"[^"]*"?|"[^"]*"?|\S+/gi) ?? [];
  for (const part of parts) {
    const op = /^([a-z]+):(.*)$/i.exec(part);
    const key = op?.[1]?.toLowerCase();
    if (op && key && OPERATOR_KEYS.includes(key)) {
      const value = fold(unquote(op[2] ?? '')).trim();
      // "is:" is still being typed: not a filter yet, and not a word either.
      if (value) operators.push({ key: key as OperatorKey, value });
      continue;
    }
    for (const word of splitWords(unquote(part))) terms.push(word);
  }
  return {
    raw,
    terms,
    text: terms.join(' '),
    operators,
    empty: terms.length === 0 && operators.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

export interface SearchDoc {
  name: string;
  tagline: string;
  description: string;
  builder: string | null;
  host: string;
  /** Category label and id, space separated. */
  category: string;
}

export interface FieldIndex {
  words: string[];
  compact: string;
  initials: string;
}

export interface IndexedDoc {
  fields: ReadonlyArray<{ weight: number; index: FieldIndex }>;
  nameCompact: string;
  builder: FieldIndex | null;
}

export const FIELD_WEIGHTS = {
  name: 1,
  builder: 0.75,
  category: 0.6,
  host: 0.5,
  tagline: 0.5,
  description: 0.3,
} as const;

export function indexField(text: string): FieldIndex {
  const words = splitWords(text);
  return { words, compact: words.join(''), initials: words.map((w) => w[0] ?? '').join('') };
}

export function indexDoc(doc: SearchDoc): IndexedDoc {
  const name = indexField(doc.name);
  const builder = doc.builder ? indexField(doc.builder) : null;
  const fields: Array<{ weight: number; index: FieldIndex }> = [
    { weight: FIELD_WEIGHTS.name, index: name },
    { weight: FIELD_WEIGHTS.category, index: indexField(doc.category) },
    { weight: FIELD_WEIGHTS.host, index: indexField(doc.host) },
    { weight: FIELD_WEIGHTS.tagline, index: indexField(doc.tagline) },
    { weight: FIELD_WEIGHTS.description, index: indexField(doc.description) },
  ];
  if (builder) fields.push({ weight: FIELD_WEIGHTS.builder, index: builder });
  return { fields, nameCompact: name.compact, builder };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Optimal string alignment distance (Damerau-Levenshtein without repeated edits), bounded. */
export function osaDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[lb] ?? max + 1, max + 1);
}

/** How well one folded term matches one field, 0 (not at all) to about 100 (a whole word). */
export function scoreTerm(term: string, f: FieldIndex): number {
  const len = term.length;
  if (len === 0 || f.words.length === 0) return 0;
  let best = 0;

  for (const w of f.words) {
    if (w === term) return 100;
    if (w.startsWith(term)) best = Math.max(best, 82 + 10 * (len / w.length));
  }
  if (f.compact.startsWith(term)) best = Math.max(best, 80);
  if (best >= 80) return best;
  if (len >= 2 && f.compact.includes(term)) best = Math.max(best, 58);
  if (len >= 3 && f.initials.startsWith(term)) best = Math.max(best, 54);

  if (len >= 5 && best < 46) {
    const max = len >= 8 ? 2 : 1;
    let d = osaDistance(term, f.compact.slice(0, len), max);
    for (const w of f.words) {
      if (w.length < 4) continue;
      d = Math.min(d, osaDistance(term, w, max), osaDistance(term, w.slice(0, len), max));
    }
    if (d <= max) best = Math.max(best, 48 - 9 * d);
  }

  return best;
}

/** Best weighted score of a term across every field. */
function scoreTermDoc(term: string, doc: IndexedDoc): number {
  let best = 0;
  for (const { weight, index } of doc.fields) {
    const s = scoreTerm(term, index) * weight;
    if (s > best) best = s;
  }
  return best;
}

/**
 * Relevance of a document for the free-text part of a query. 0 means no match (some term found
 * nothing). An empty term list matches everything with a score of 1.
 */
export function scoreDoc(terms: readonly string[], text: string, doc: IndexedDoc): number {
  if (terms.length === 0) return 1;
  let total = 0;
  for (const term of terms) {
    const s = scoreTermDoc(term, doc);
    if (s <= 0) return 0;
    total += s;
  }
  let score = total / terms.length;
  const compactQuery = terms.join('');
  if (compactQuery && doc.nameCompact === compactQuery) score += 40;
  else if (compactQuery && doc.nameCompact.startsWith(compactQuery)) score += 12;
  if (text && text === doc.fields[0]?.index.words.join(' ')) score += 10;
  return score;
}

/** Whether a folded value matches the builder of a document (for `by:`). */
export function matchesBuilder(value: string, doc: IndexedDoc): boolean {
  if (!doc.builder) return false;
  const terms = splitWords(value);
  if (terms.length === 0) return false;
  return terms.every((t) => scoreTerm(t, doc.builder as FieldIndex) > 0);
}
