/**
 * The deck's one-line terminal: `> block`, `> nodes`, `> price`, `> reduction`, `> apps`,
 * `> app <name>`, `> host <name>` and `> help`.
 *
 * Pure. `parseTerminal` turns what was typed into a command; `buildAnswer` turns a command and a
 * plain snapshot of the live data into rows of text. Nothing here reads a store or a clock, so
 * the answers are exactly as honest as the numbers handed in: a missing number is `--`, never
 * a zero, and anything that is not live says so.
 */
import type { AppsHealthSnapshot, BlocksSnapshot, HealthState, NetworkSnapshot, Tier } from '@shared/api';
import { COMMUNITY_APPS, NODE_HOSTS, probeUrl } from '@shared/catalog';
import { COPY } from '@/content/copy';
import { blockIntervalStats, tierSharePercents, timeAgo } from '@/data/derive';
import type { ChainClockView, Freshness, ReductionCountdown } from '@/data/types';
import {
  formatAge,
  formatCompact,
  formatDateLong,
  formatDateShort,
  formatInt,
  formatPct,
  formatUsd,
  NONE,
  pad2,
} from '@/lib/format';
import { prepare, scoreFields, tokenize } from './fuzzy';

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CommandId = 'block' | 'nodes' | 'price' | 'reduction' | 'apps' | 'app' | 'host' | 'help';

export interface CommandSpec {
  id: CommandId;
  /** What to type. */
  usage: string;
  summary: string;
  aliases: readonly string[];
}

export const COMMANDS: readonly CommandSpec[] = [
  { id: 'block', usage: 'block', summary: 'The chain tip and the next block', aliases: ['height', 'tip'] },
  { id: 'nodes', usage: 'nodes', summary: 'Nodes online, by tier', aliases: ['node', 'tiers'] },
  { id: 'price', usage: 'price', summary: 'FLUX price and the 24 h change', aliases: ['flux', 'usd'] },
  {
    id: 'reduction',
    usage: 'reduction',
    summary: 'Countdown to the next reward reduction',
    aliases: ['cut', 'reductions'],
  },
  { id: 'apps', usage: 'apps', summary: 'Apps on the network, and community build health', aliases: [] },
  { id: 'app', usage: 'app <name>', summary: 'Live status of a community build', aliases: [] },
  {
    id: 'host',
    usage: 'host <name>',
    summary: 'A node hosting service from the catalog',
    aliases: ['hosts'],
  },
  { id: 'help', usage: 'help', summary: 'List these commands', aliases: ['commands', '?'] },
];

export type Parsed =
  | { type: 'empty' }
  | { type: 'command'; id: CommandId; arg: string }
  | { type: 'ambiguous'; word: string; candidates: CommandId[] }
  | { type: 'unknown'; word: string };

/** Strips a leading `>` and surrounding space. */
export function stripPrompt(input: string): string {
  return input.replace(/^\s*>?\s*/, '').trim();
}

/**
 * What to carry into the terminal when "Ask the network" is chosen with something typed: a real
 * command ("price") is kept, so Enter answers it at once; anything else starts empty.
 */
export function carryOver(typed: string): string {
  return parseTerminal(typed).type === 'command' ? stripPrompt(typed) : '';
}

export function parseTerminal(input: string): Parsed {
  const text = stripPrompt(input);
  if (!text) return { type: 'empty' };
  const [first = '', ...rest] = text.split(/\s+/);
  const word = first.toLowerCase();
  const arg = rest.join(' ').trim();

  const exact = COMMANDS.find((c) => c.id === word || c.aliases.includes(word));
  if (exact) return { type: 'command', id: exact.id, arg };

  // A unique prefix of a command name runs it, like shell completion.
  const matches = COMMANDS.filter((c) => c.id.startsWith(word) || c.aliases.some((a) => a.startsWith(word)));
  if (matches.length === 1 && matches[0]) return { type: 'command', id: matches[0].id, arg };
  if (matches.length > 1) {
    return { type: 'ambiguous', word, candidates: matches.map((c) => c.id) };
  }
  return { type: 'unknown', word: first };
}

// ---------------------------------------------------------------------------
// Data in, answers out
// ---------------------------------------------------------------------------

export interface FreshTag {
  freshness: Freshness;
  ageMs: number | null;
  /** ISO time the numbers were taken, for "as of". */
  asOf?: string | null;
}

/** A plain snapshot of everything the terminal can say. Assembled from the data hooks. */
export interface TerminalData {
  network: NetworkSnapshot | null;
  sections: Record<'chain' | 'nodes' | 'apps' | 'market', FreshTag>;
  blocks: BlocksSnapshot | null;
  health: { data: AppsHealthSnapshot | null } & FreshTag;
  clock: ChainClockView;
  reduction: ReductionCountdown | null;
  /** Epoch ms, for relative times. */
  nowMs: number;
}

export type RowTone = 'ok' | 'warn' | 'crit' | 'cumulus' | 'nimbus' | 'stratus';

export interface AnswerRow {
  label: string;
  value: string;
  note?: string;
  /** A number with its own freshness (the apps counts, the build health). */
  fresh?: FreshTag;
  tone?: RowTone;
  /** The value is missing: shown dim, as `--`. */
  missing?: boolean;
}

export interface Answer {
  command: CommandId | 'empty' | 'unknown' | 'ambiguous';
  title: string;
  rows: AnswerRow[];
  /** The headline's freshness. Null for answers that come from the static catalog. */
  fresh: FreshTag | null;
  /** The honesty line: last known numbers, cached, syncing. */
  note: string | null;
  /** One sentence for screen readers. */
  summary: string;
  /** What Enter copies. */
  plain: string;
  /** Static catalog answer: no live tag, a "Catalog" tag instead. */
  catalog?: boolean;
}

function num(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? NONE : formatInt(n);
}

function trimFlux(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** "12d 04h 31m 07s", dropping leading zero units. */
export function formatCountdown(p: {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}): string {
  const out: string[] = [];
  if (p.days > 0) out.push(`${p.days}d`);
  if (p.days > 0 || p.hours > 0) out.push(`${p.days > 0 ? pad2(p.hours) : p.hours}h`);
  out.push(`${p.days > 0 || p.hours > 0 ? pad2(p.minutes) : p.minutes}m`);
  out.push(`${pad2(p.seconds)}s`);
  return out.join(' ');
}

/** The honesty line for a freshness, or null when the numbers are live. */
export function freshnessNote(tag: FreshTag): string | null {
  switch (tag.freshness) {
    case 'live':
      return null;
    case 'cached': {
      const age = formatAge(tag.ageMs);
      return age ? `Cached, ${age} old. Waiting for a fresh update.` : 'Cached. Waiting for a fresh update.';
    }
    case 'offline':
      return tag.asOf ? `${COPY.offline}, as of ${formatDateShort(tag.asOf)}.` : `${COPY.offline}.`;
    case 'unknown':
      return `${COPY.loading}.`;
  }
}

function finish(
  command: Answer['command'],
  title: string,
  rows: AnswerRow[],
  fresh: FreshTag | null,
  extra: { note?: string | null; catalog?: boolean } = {},
): Answer {
  const note = extra.note !== undefined ? extra.note : fresh ? freshnessNote(fresh) : null;
  const lead = rows
    .slice(0, 4)
    .filter((r) => !r.missing)
    .map((r) => `${r.label} ${r.value}`)
    .join('. ');
  const state = fresh
    ? fresh.freshness === 'live'
      ? 'Live data.'
      : fresh.freshness === 'unknown'
        ? 'Syncing.'
        : 'Last known numbers.'
    : '';
  const summary = [title, lead, state].filter(Boolean).join('. ').replace(/\.\./g, '.');
  const plain = [title, ...rows.map((r) => `${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`)]
    .concat(note ? [note] : [])
    .join('\n');
  return { command, title, rows, fresh, note, summary, plain, catalog: extra.catalog };
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

function answerBlock(d: TerminalData): Answer {
  const tag = d.sections.chain;
  const chain = d.network?.chain ?? null;
  const height = d.clock.height ?? chain?.height ?? null;
  const live = d.clock.live;
  const measured = chain?.measuredBlockSec ?? null;
  const target = chain?.targetBlockSec ?? null;
  const stats = blockIntervalStats(d.blocks, 60, target ?? 30);

  const rows: AnswerRow[] = [
    {
      label: 'Next block',
      value: live && d.clock.secondsToNext !== null ? `in ${d.clock.secondsToNext} s` : NONE,
      missing: !(live && d.clock.secondsToNext !== null),
    },
    {
      label: 'Last block',
      value: live && d.clock.secondsSinceBlock !== null ? `${d.clock.secondsSinceBlock} s ago` : NONE,
      missing: !(live && d.clock.secondsSinceBlock !== null),
    },
    {
      label: 'Interval',
      value:
        measured !== null
          ? `${measured.toFixed(1)} s measured`
          : target !== null
            ? `${target} s target`
            : NONE,
      note: measured !== null && target !== null ? `${target} s target` : undefined,
      missing: measured === null && target === null,
    },
  ];
  if (stats.count >= 5 && stats.meanSec !== null) {
    rows.push({ label: 'Recent', value: `${stats.meanSec.toFixed(1)} s over ${stats.count} blocks` });
  }
  if (chain?.consensus) rows.push({ label: 'Consensus', value: chain.consensus });

  return finish('block', height === null ? 'No block height yet' : `Block ${formatInt(height)}`, rows, tag);
}

function answerNodes(d: TerminalData): Answer {
  const tag = d.sections.nodes;
  const n = d.network?.nodes ?? null;
  const rewards = d.network?.rewards ?? null;
  if (!n) return finish('nodes', 'No node count yet', [], tag);

  const shares = tierSharePercents(n.tiers);
  const tiers: Array<{ id: Tier; label: string; tone: RowTone }> = [
    { id: 'cumulus', label: 'Cumulus', tone: 'cumulus' },
    { id: 'nimbus', label: 'Nimbus', tone: 'nimbus' },
    { id: 'stratus', label: 'Stratus', tone: 'stratus' },
  ];
  const rows: AnswerRow[] = tiers.map((t) => {
    const parts = [`${shares[t.id]}%`, `${formatInt(n.collateral[t.id])} FLUX collateral`];
    const per = rewards?.perTier[t.id];
    if (per !== undefined) parts.push(`${trimFlux(per)} FLUX per block`);
    return { label: t.label, value: formatInt(n.tiers[t.id]), note: parts.join(' · '), tone: t.tone };
  });
  if (n.countries !== null) rows.push({ label: 'Countries', value: formatInt(n.countries) });
  return finish('nodes', `${formatInt(n.total)} nodes`, rows, tag);
}

function answerPrice(d: TerminalData): Answer {
  const tag = d.sections.market;
  const m = d.network?.market ?? null;
  if (!m) return finish('price', 'No price yet', [], tag);
  const rows: AnswerRow[] = [
    {
      label: '24 h',
      value: m.change24hPct === null ? NONE : formatPct(m.change24hPct, { signed: true }),
      missing: m.change24hPct === null,
    },
    {
      label: 'Market cap',
      value: m.marketCapUsd === null ? NONE : `$${formatCompact(m.marketCapUsd)}`,
      missing: m.marketCapUsd === null,
    },
  ];
  return finish('price', `FLUX ${formatUsd(m.priceUsd)}`, rows, tag);
}

function answerReduction(d: TerminalData): Answer {
  const tag = d.sections.chain;
  const next = d.network?.rewards.nextReduction ?? null;
  const r = d.reduction;
  if (d.network && next === null) {
    return finish('reduction', 'No further reductions scheduled', [], tag);
  }
  if (!r || !next) return finish('reduction', 'No reduction countdown yet', [], tag);

  const cutPct = Math.round(r.fraction * 1000) / 10;
  const rows: AnswerRow[] = [
    { label: 'At block', value: formatInt(r.height) },
    { label: 'Blocks away', value: formatInt(r.blocksAway) },
    { label: 'Estimated', value: formatDateLong(r.etaMs), note: r.live === false ? 'projected' : undefined },
    {
      label: 'Cut',
      value: formatPct(cutPct, { digits: Number.isInteger(cutPct) ? 0 : 1 }),
      note: `${trimFlux(r.perBlockAfter)} FLUX per block after`,
    },
  ];
  if (next.index !== undefined && next.of !== undefined) {
    rows.push({ label: 'Reduction', value: `${next.index} of ${next.of}` });
  }
  const note =
    r.live === false ? `Projected from the last snapshot. ${freshnessNote(tag) ?? ''}`.trim() : undefined;
  return finish('reduction', `Next reduction in ${formatCountdown(r.parts)}`, rows, tag, { note });
}

const STATE_WORD: Record<HealthState, string> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Not checked yet',
};
const STATE_TONE: Partial<Record<HealthState, RowTone>> = { up: 'ok', degraded: 'warn', down: 'crit' };

function probedApps() {
  return COMMUNITY_APPS.filter((a) => probeUrl(a) !== null);
}

function answerApps(d: TerminalData): Answer {
  const net = d.sections.apps;
  const stats = d.network?.apps ?? null;
  const health = d.health;
  const probed = probedApps();
  const byId = new Map((health.data?.apps ?? []).map((a) => [a.id, a] as const));
  const count = (state: HealthState) =>
    probed.filter((a) => (byId.get(a.id)?.state ?? 'unknown') === state).length;
  const up = count('up');
  const degraded = count('degraded');
  const down = count('down');
  const unknown = count('unknown');

  const rows: AnswerRow[] = [];
  if (stats) {
    rows.push({ label: 'Registered', value: num(stats.registered), missing: stats.registered === null });
  }
  if (health.data && probed.length > 0) {
    if (unknown === probed.length) {
      // Nothing has been checked: "0 of 7 up" would read as "all down", which is not known.
      rows.push({ label: 'Community builds', value: COPY.unchecked, missing: true, fresh: health });
    } else {
      const parts: string[] = [];
      if (degraded) parts.push(`${degraded} degraded`);
      if (down) parts.push(`${down} down`);
      if (unknown) parts.push(`${unknown} not checked`);
      rows.push({
        label: 'Community builds',
        value: `${up} of ${probed.length} up`,
        note: parts.length ? parts.join(' · ') : undefined,
        fresh: health,
        tone: up === probed.length ? 'ok' : undefined,
      });
    }
  }
  const running = stats?.running ?? null;
  const title = running !== null ? `${formatInt(running)} apps running` : 'No app count yet';
  return finish('apps', title, rows, net);
}

/** One lower-case word of a catalog name for a usage hint, so the hint never names something that is gone. */
function exampleWord(name: string | undefined): string {
  return (name ?? 'name').toLowerCase().split(/\s+/)[0] ?? 'name';
}

function findByName<T extends { id: string; name: string }>(
  list: readonly T[],
  query: string,
  extra: (item: T) => Array<{ text: string; weight: number }>,
): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of list) {
    const fields = [
      { field: prepare(item.name), weight: 1 },
      { field: prepare(item.id.replace(/-/g, ' ')), weight: 0.7 },
      ...extra(item).map((e) => ({ field: prepare(e.text), weight: e.weight })),
    ];
    const score = scoreFields(tokens, fields);
    if (score >= 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

function answerApp(d: TerminalData, arg: string): Answer {
  const probed = probedApps();
  const byId = new Map((d.health.data?.apps ?? []).map((a) => [a.id, a] as const));

  if (!arg) {
    const rows: AnswerRow[] = probed.map((app) => {
      const h = byId.get(app.id);
      const state: HealthState = h?.state ?? 'unknown';
      return {
        label: app.name,
        value: STATE_WORD[state],
        note: h?.latencyMs != null && state !== 'unknown' ? `${Math.round(h.latencyMs)} ms` : undefined,
        tone: STATE_TONE[state],
        missing: state === 'unknown',
      };
    });
    return finish('app', 'Community builds', rows, d.health, {});
  }

  const found = findByName(COMMUNITY_APPS, arg, (a) => [
    ...(a.builder ? [{ text: a.builder, weight: 0.6 }] : []),
    { text: a.host, weight: 0.4 },
  ]);
  const app = found[0];
  if (!app) {
    return finish('app', `No community build matches "${arg}"`, [], null, {
      note: `Try: app ${exampleWord(probed[0]?.name)}, or just app for the whole board.`,
      catalog: true,
    });
  }
  const h = byId.get(app.id);
  const probe = probeUrl(app) !== null;
  const state: HealthState = probe ? (h?.state ?? 'unknown') : 'unknown';
  const rows: AnswerRow[] = [];
  if (!probe) {
    rows.push({ label: 'Status', value: COPY.youAreHere, note: 'this site is not probed' });
  } else {
    rows.push({
      label: 'Status',
      value: STATE_WORD[state],
      tone: STATE_TONE[state],
      missing: state === 'unknown',
    });
    rows.push({
      label: 'Latency',
      value: h?.latencyMs != null && state !== 'unknown' ? `${Math.round(h.latencyMs)} ms` : NONE,
      missing: !(h?.latencyMs != null && state !== 'unknown'),
    });
    if (h?.since) rows.push({ label: 'Since', value: timeAgo(h.since, d.nowMs) });
    if (h?.checkedAt) rows.push({ label: 'Checked', value: timeAgo(h.checkedAt, d.nowMs) });
  }
  rows.push({ label: 'Host', value: app.host });
  if (app.builder) rows.push({ label: 'Built by', value: app.builder });
  if (app.lifecycle === 'retiring' && app.retiresOn) {
    const successor = COMMUNITY_APPS.find((a) => a.id === app.replacedBy)?.name ?? 'its successor';
    rows.push({ label: 'Lifecycle', value: COPY.retiring(formatDateShort(app.retiresOn), successor) });
  } else if (app.lifecycle === 'new') {
    const before = app.replaces ? COMMUNITY_APPS.find((a) => a.id === app.replaces) : undefined;
    rows.push({
      label: 'Lifecycle',
      value: 'New',
      note: before ? `takes over from ${before.name}` : undefined,
    });
  }
  const others = found.slice(1, 3).map((a) => a.name);
  const answer = finish('app', app.name, rows, probe ? d.health : null, {
    note: probe ? undefined : null,
    catalog: !probe,
  });
  if (others.length) {
    answer.note = [answer.note, `Also matches: ${others.join(', ')}.`].filter(Boolean).join(' ');
  }
  return answer;
}

function answerHost(arg: string): Answer {
  if (!arg) {
    const rows: AnswerRow[] = NODE_HOSTS.map((h) => ({
      label: h.name,
      value: h.host ?? 'Direct message on Discord',
    }));
    return finish('host', 'Node hosting services', rows, null, { catalog: true, note: null });
  }
  const found = findByName(NODE_HOSTS, arg, (h) => [
    { text: h.operator, weight: 0.8 },
    ...(h.host ? [{ text: h.host, weight: 0.5 }] : []),
  ]);
  const host = found[0];
  if (!host) {
    return finish('host', `No node host matches "${arg}"`, [], null, {
      note: `Try: host ${exampleWord(NODE_HOSTS[0]?.name)}, or just host for the whole list.`,
      catalog: true,
    });
  }
  const rows: AnswerRow[] = [
    { label: 'Operator', value: host.operator },
    { label: 'Site', value: host.host ?? 'Direct message on the Flux Discord' },
    { label: 'About', value: host.blurb },
  ];
  const answer = finish('host', host.name, rows, null, { catalog: true, note: null });
  const others = found.slice(1, 3).map((h) => h.name);
  if (others.length) answer.note = `Also matches: ${others.join(', ')}.`;
  return answer;
}

function answerHelp(prefix?: string): Answer {
  const rows: AnswerRow[] = COMMANDS.map((c) => ({ label: c.usage, value: c.summary }));
  return finish('help', prefix ?? 'Ask the network', rows, null, {
    catalog: true,
    note: 'Type a command after >. Answers use the live data and say how fresh it is.',
  });
}

/** The answer to what was typed. */
export function buildAnswer(parsed: Parsed, data: TerminalData): Answer {
  switch (parsed.type) {
    case 'empty':
      return { ...answerHelp(), command: 'empty' };
    case 'unknown':
      return {
        ...answerHelp(`Unknown command "${parsed.word}"`),
        command: 'unknown',
      };
    case 'ambiguous': {
      const names = parsed.candidates.join(', ');
      return {
        ...answerHelp(`Did you mean ${names}?`),
        command: 'ambiguous',
      };
    }
    case 'command':
      switch (parsed.id) {
        case 'block':
          return answerBlock(data);
        case 'nodes':
          return answerNodes(data);
        case 'price':
          return answerPrice(data);
        case 'reduction':
          return answerReduction(data);
        case 'apps':
          return answerApps(data);
        case 'app':
          return answerApp(data, parsed.arg);
        case 'host':
          return answerHost(parsed.arg);
        case 'help':
          return answerHelp();
      }
  }
}
