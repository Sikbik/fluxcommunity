import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicker } from './clock';
import * as data from './index';
import { createFakeEnv } from './testkit';

describe('public surface', () => {
  it('exports every stub hook with the original names', () => {
    const fns = [
      data.startDataLayer,
      data.useNetwork,
      data.useGeo,
      data.useBlocks,
      data.useAllHealth,
      data.useAppHealth,
      data.useConnection,
      data.useChainClock,
      data.useReductionCountdown,
    ];
    expect(fns.map((f) => typeof f)).toEqual(Array(9).fill('function'));
    expect(data.startDataLayer.name).toBe('startDataLayer');
    expect(data.useAppHealth.length).toBe(1);
  });

  it('renders every hook server-side with honest "no data yet" values', () => {
    const seen: Record<string, unknown> = {};
    function Probe() {
      seen.network = data.useNetwork();
      seen.geo = data.useGeo();
      seen.blocks = data.useBlocks();
      seen.health = data.useAllHealth();
      seen.app = data.useAppHealth('atlas');
      seen.connection = data.useConnection();
      seen.clock = data.useChainClock();
      seen.reduction = data.useReductionCountdown();
      seen.height = data.useChainHeight();
      seen.fresh = data.useFreshness('network');
      seen.sel = data.useNetworkSelect((n) => n.nodes.total);
      seen.debug = data.useDataLayerDebug();
      seen.section = data.useSectionFreshness('market');
      seen.sectionAge = data.useSectionAge('capacity');
      return null;
    }
    renderToString(createElement(Probe));
    expect(seen.network).toEqual({ data: null, meta: null, freshness: 'unknown', ageMs: null });
    expect(seen.app).toBeNull();
    expect(seen.connection).toBe('connecting');
    expect(seen.clock).toEqual({
      height: null,
      secondsSinceBlock: null,
      secondsToNext: null,
      progress: 0,
      live: false,
    });
    expect(seen.reduction).toBeNull();
    expect(seen.sel).toBeNull();
    expect(seen.section).toEqual({ freshness: 'unknown', asOf: null });
    expect(seen.sectionAge).toBeNull();
  });

  it('importing the module starts nothing', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      await import('./index');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is one interval no matter how many subscribers, and stops with the last', () => {
    const env = createFakeEnv();
    const ticker = createTicker(env);
    const counts = [0, 0, 0];
    const offs = counts.map((_, i) =>
      ticker.subscribe(() => {
        counts[i] = (counts[i] ?? 0) + 1;
      }),
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(counts).toEqual([3, 3, 3]);
    for (const off of offs) off();
    expect(vi.getTimerCount()).toBe(0);
    expect(env.listeners()).toBe(0);
  });

  it('pauses while hidden and ticks immediately on return', () => {
    const env = createFakeEnv();
    const ticker = createTicker(env);
    let n = 0;
    const off = ticker.subscribe(() => {
      n += 1;
    });
    vi.advanceTimersByTime(2000);
    expect(n).toBe(2);
    env.setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(n).toBe(2);
    env.setHidden(false);
    expect(n).toBe(3);
    vi.advanceTimersByTime(1000);
    expect(n).toBe(4);
    off();
  });
});
