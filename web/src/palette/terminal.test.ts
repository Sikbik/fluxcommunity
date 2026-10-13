import { COMMUNITY_APPS, NODE_HOSTS, probeUrl } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { getFallback } from '@/data/fixtures';
import type { ChainClockView, ReductionCountdown } from '@/data/types';
import {
  buildAnswer,
  COMMANDS,
  carryOver,
  formatCountdown,
  freshnessNote,
  parseTerminal,
  type TerminalData,
} from './terminal';

const NOW = Date.parse('2026-10-12T19:00:00.000Z');
const set = getFallback();

const live = { freshness: 'live' as const, ageMs: 3000 };

// The builds the server probes, whatever the catalog lists today.
const probed = COMMUNITY_APPS.filter((a) => probeUrl(a) !== null);
const builtApp = probed.find((a) => a.builder !== null) ?? (probed[0] as (typeof probed)[number]);

function data(over: Partial<TerminalData> = {}): TerminalData {
  const clock: ChainClockView = {
    height: set.network.chain.height,
    secondsSinceBlock: 16,
    secondsToNext: 14,
    progress: 0.5,
    live: true,
  };
  const next = set.network.rewards.nextReduction;
  const reduction: ReductionCountdown | null = next
    ? {
        height: next.height,
        blocksAway: next.blocksAway,
        etaMs: NOW + 12 * 86_400_000 + 4 * 3_600_000 + 31 * 60_000 + 7_000,
        parts: { days: 12, hours: 4, minutes: 31, seconds: 7 },
        fraction: next.fraction,
        perBlockAfter: next.perBlockAfter,
        live: true,
      }
    : null;
  return {
    network: set.network,
    sections: { chain: live, nodes: live, apps: live, market: live },
    blocks: set.blocks,
    health: { data: set.health, ...live },
    clock,
    reduction,
    nowMs: NOW,
    ...over,
  };
}

const ask = (input: string, d: TerminalData = data()) => buildAnswer(parseTerminal(input), d);
const rowValue = (a: ReturnType<typeof ask>, label: string) => a.rows.find((r) => r.label === label)?.value;

describe('parseTerminal', () => {
  it('reads commands with or without the prompt', () => {
    expect(parseTerminal('> block')).toEqual({ type: 'command', id: 'block', arg: '' });
    expect(parseTerminal('>block')).toEqual({ type: 'command', id: 'block', arg: '' });
    expect(parseTerminal('  BLOCK  ')).toEqual({ type: 'command', id: 'block', arg: '' });
  });

  it('keeps arguments', () => {
    expect(parseTerminal('host Goldie Tech')).toEqual({ type: 'command', id: 'host', arg: 'Goldie Tech' });
    expect(parseTerminal('app atlas')).toEqual({ type: 'command', id: 'app', arg: 'atlas' });
  });

  it('accepts aliases and unique prefixes', () => {
    expect(parseTerminal('height')).toMatchObject({ id: 'block' });
    expect(parseTerminal('red')).toMatchObject({ id: 'reduction' });
    expect(parseTerminal('pri')).toMatchObject({ id: 'price' });
    expect(parseTerminal('?')).toMatchObject({ id: 'help' });
  });

  it('keeps exact names exact when a longer one shares the prefix', () => {
    expect(parseTerminal('app')).toMatchObject({ id: 'app' });
    expect(parseTerminal('apps')).toMatchObject({ id: 'apps' });
  });

  it('reports ambiguity and unknown words', () => {
    expect(parseTerminal('h')).toMatchObject({ type: 'ambiguous' });
    expect(parseTerminal('xyzzy')).toEqual({ type: 'unknown', word: 'xyzzy' });
    expect(parseTerminal('')).toEqual({ type: 'empty' });
    expect(parseTerminal('>')).toEqual({ type: 'empty' });
  });

  it('every command can be reached by its own name', () => {
    for (const c of COMMANDS) expect(parseTerminal(c.id)).toMatchObject({ type: 'command', id: c.id });
  });
});

describe('carryOver', () => {
  it('keeps a typed command so Ask the network answers it at once', () => {
    expect(carryOver('price')).toBe('price');
    expect(carryOver('  app atlas ')).toBe('app atlas');
    expect(carryOver('> nodes')).toBe('nodes');
  });

  it('starts empty for anything that is not a command', () => {
    expect(carryOver('')).toBe('');
    expect(carryOver('terminal')).toBe('');
    expect(carryOver('live data')).toBe('');
    expect(carryOver('qzqz')).toBe('');
  });
});

describe('answers use the data and nothing else', () => {
  it('block', () => {
    const a = ask('block');
    expect(a.title).toBe(`Block ${set.network.chain.height.toLocaleString('en-US')}`);
    expect(rowValue(a, 'Next block')).toBe('in 14 s');
    expect(rowValue(a, 'Last block')).toBe('16 s ago');
    expect(rowValue(a, 'Interval')).toContain('30.1 s measured');
    expect(a.fresh?.freshness).toBe('live');
    expect(a.note).toBeNull();
  });

  it('nodes breaks the total down by tier and adds up', () => {
    const a = ask('nodes');
    expect(a.title).toBe(`${set.network.nodes.total.toLocaleString('en-US')} nodes`);
    const tiers = a.rows.filter((r) => r.tone);
    expect(tiers.map((r) => r.label)).toEqual(['Cumulus', 'Nimbus', 'Stratus']);
    const pct = tiers.map((r) => Number.parseInt(r.note ?? '0', 10));
    expect(pct.reduce((x, y) => x + y, 0)).toBe(100);
    expect(tiers[0]?.note).toContain('1,000 FLUX collateral');
  });

  it('price', () => {
    const net = {
      ...set.network,
      market: { priceUsd: 0.0746, change24hPct: 1.954, marketCapUsd: 40_200_000 },
    };
    const a = ask('price', data({ network: net }));
    expect(a.title).toBe('FLUX $0.0746');
    expect(rowValue(a, '24 h')).toBe('+1.95%');
    expect(rowValue(a, 'Market cap')).toBe('$40.2M');
  });

  it('price with no market data is not a zero', () => {
    const net = { ...set.network, market: null };
    const a = ask(
      'price',
      data({ network: net, sections: { ...data().sections, market: { freshness: 'unknown', ageMs: null } } }),
    );
    expect(a.title).toBe('No price yet');
    expect(a.rows).toHaveLength(0);
    expect(a.note).toBe('Syncing with the chain.');
  });

  it('reduction', () => {
    const a = ask('reduction');
    expect(a.title).toBe('Next reduction in 12d 04h 31m 07s');
    expect(rowValue(a, 'At block')).toBe(set.network.rewards.nextReduction?.height.toLocaleString('en-US'));
    expect(a.rows.find((r) => r.label === 'Cut')?.value).toBe('10%');
  });

  it('reduction is labelled as projected when the clock is not live', () => {
    const d = data();
    const r = d.reduction as ReductionCountdown;
    const a = ask('reduction', data({ reduction: { ...r, live: false } }));
    expect(a.note).toContain('Projected');
    expect(a.rows.find((x) => x.label === 'Estimated')?.note).toBe('projected');
  });

  it('apps counts the probed builds and says what is not up', () => {
    const [one, two] = probed;
    const health = {
      apps: [
        {
          id: one?.id ?? '',
          state: 'up' as const,
          httpStatus: 200,
          latencyMs: 120,
          checkedAt: null,
          since: null,
        },
        {
          id: two?.id ?? '',
          state: 'down' as const,
          httpStatus: 503,
          latencyMs: null,
          checkedAt: null,
          since: null,
        },
      ],
    };
    const a = ask('apps', data({ health: { data: health, ...live } }));
    const builds = a.rows.find((r) => r.label === 'Community builds');
    expect(builds?.value).toBe(`1 of ${probed.length} up`);
    expect(builds?.note).toContain('1 down');
    expect(builds?.note).toContain(`${probed.length - 2} not checked`);
  });

  it('apps does not claim "0 up" when nothing has been checked', () => {
    const none = {
      apps: probed.map((a) => ({
        id: a.id,
        state: 'unknown' as const,
        httpStatus: null,
        latencyMs: null,
        checkedAt: null,
        since: null,
      })),
    };
    const a = ask('apps', data({ health: { data: none, ...live } }));
    const builds = a.rows.find((r) => r.label === 'Community builds');
    expect(builds?.value).toBe('Not checked yet');
    expect(builds?.missing).toBe(true);
    expect(builds?.note).toBeUndefined();
  });

  it('app shows state and latency of one build', () => {
    const health = {
      apps: [
        {
          id: builtApp.id,
          state: 'up' as const,
          httpStatus: 200,
          latencyMs: 141.6,
          checkedAt: new Date(NOW - 45_000).toISOString(),
          since: new Date(NOW - 3 * 3_600_000).toISOString(),
        },
      ],
    };
    const a = ask(`app ${builtApp.name}`, data({ health: { data: health, ...live } }));
    expect(a.title).toBe(builtApp.name);
    expect(rowValue(a, 'Status')).toBe('Up');
    expect(rowValue(a, 'Latency')).toBe('142 ms');
    expect(rowValue(a, 'Since')).toBe('3 h ago');
    expect(rowValue(a, 'Built by')).toBe(builtApp.builder);
  });

  it('app for a build that was never checked says so instead of "Live"', () => {
    const a = ask(
      `app ${builtApp.name}`,
      data({ health: { data: null, freshness: 'unknown', ageMs: null } }),
    );
    expect(rowValue(a, 'Status')).toBe('Not checked yet');
    expect(rowValue(a, 'Latency')).toBe('--');
  });

  const fresh = COMMUNITY_APPS.find((a) => a.lifecycle === 'new' && !a.self);
  it.skipIf(!fresh)('app marks a new build as new, without inventing a predecessor', () => {
    const a = ask(`app ${fresh?.name}`);
    const row = a.rows.find((r) => r.label === 'Lifecycle');
    expect(row?.value).toBe('New');
    if (!fresh?.replaces) expect(row?.note).toBeUndefined();
  });

  it('app with no argument is the whole board', () => {
    const a = ask('app');
    expect(a.rows).toHaveLength(probed.length);
    // This site is not probed, so it is not on the board.
    for (const self of COMMUNITY_APPS.filter((x) => x.self)) {
      expect(a.rows.some((r) => r.label === self.name)).toBe(false);
    }
  });

  it('app that matches nothing is helpful', () => {
    const a = ask('app qzqzqz');
    expect(a.title).toContain('No community build matches');
    expect(a.note).toContain(`app ${(probed[0]?.name ?? '').toLowerCase().split(' ')[0]}`);
  });

  const siteHost = NODE_HOSTS.find((h) => h.host !== null);
  const dmHost = NODE_HOSTS.find((h) => h.host === null);

  it.skipIf(!siteHost)('host answers from the catalog and has no live tag', () => {
    const a = ask(`host ${siteHost?.name}`);
    expect(a.title).toBe(siteHost?.name);
    expect(a.catalog).toBe(true);
    expect(a.fresh).toBeNull();
    expect(rowValue(a, 'Operator')).toBe(siteHost?.operator);
    expect(rowValue(a, 'Site')).toBe(siteHost?.host);
  });

  it.skipIf(!dmHost)('host handles the host that has no site', () => {
    const a = ask(`host ${dmHost?.name}`);
    expect(rowValue(a, 'Site')).toContain('Discord');
  });

  it('help and unknown commands list every command', () => {
    for (const input of ['help', '', 'wibble']) {
      const a = ask(input);
      expect(a.rows.map((r) => r.label)).toEqual(COMMANDS.map((c) => c.usage));
    }
    expect(ask('wibble').title).toBe('Unknown command "wibble"');
  });
});

describe('freshness honesty', () => {
  it('offline answers say they are the last known numbers, with a date', () => {
    const off = { freshness: 'offline' as const, ageMs: 3_600_000, asOf: '2026-10-12T00:00:00.000Z' };
    const a = ask('nodes', data({ sections: { chain: off, nodes: off, apps: off, market: off } }));
    expect(a.fresh?.freshness).toBe('offline');
    expect(a.note).toBe('Showing the last known numbers, as of Oct 12.');
    expect(a.summary).toContain('Last known numbers');
  });

  it('cached answers say how old they are', () => {
    expect(freshnessNote({ freshness: 'cached', ageMs: 125_000 })).toBe(
      'Cached, 2 min old. Waiting for a fresh update.',
    );
  });

  it('offline block has no countdown', () => {
    const clock: ChainClockView = {
      height: 3_031_000,
      secondsSinceBlock: null,
      secondsToNext: null,
      progress: 0,
      live: false,
    };
    const off = { freshness: 'offline' as const, ageMs: 9e6, asOf: '2026-10-12T00:00:00.000Z' };
    const a = ask('block', data({ clock, sections: { chain: off, nodes: off, apps: off, market: off } }));
    expect(rowValue(a, 'Next block')).toBe('--');
    expect(rowValue(a, 'Last block')).toBe('--');
    expect(a.rows.find((r) => r.label === 'Next block')?.missing).toBe(true);
  });

  it('with no data at all nothing is invented', () => {
    const none = { freshness: 'unknown' as const, ageMs: null };
    const clock: ChainClockView = {
      height: null,
      secondsSinceBlock: null,
      secondsToNext: null,
      progress: 0,
      live: false,
    };
    const empty = data({
      network: null,
      blocks: null,
      clock,
      reduction: null,
      sections: { chain: none, nodes: none, apps: none, market: none },
      health: { data: null, ...none },
    });
    expect(ask('block', empty).title).toBe('No block height yet');
    expect(ask('nodes', empty).title).toBe('No node count yet');
    expect(ask('price', empty).title).toBe('No price yet');
    expect(ask('reduction', empty).title).toBe('No reduction countdown yet');
    expect(ask('apps', empty).title).toBe('No app count yet');
  });

  it('an answer carries a screen reader summary and copyable text', () => {
    const a = ask('block');
    expect(a.summary).toMatch(/^Block [\d,]+\./);
    expect(a.summary).toContain('Live data');
    expect(a.plain.split('\n')[0]).toBe(a.title);
  });
});

describe('formatCountdown', () => {
  it('drops leading zero units and pads the rest', () => {
    expect(formatCountdown({ days: 12, hours: 4, minutes: 31, seconds: 7 })).toBe('12d 04h 31m 07s');
    expect(formatCountdown({ days: 0, hours: 4, minutes: 31, seconds: 7 })).toBe('4h 31m 07s');
    expect(formatCountdown({ days: 0, hours: 0, minutes: 9, seconds: 5 })).toBe('9m 05s');
    expect(formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 5 })).toBe('0m 05s');
  });
});
