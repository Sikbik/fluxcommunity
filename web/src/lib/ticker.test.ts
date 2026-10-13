import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeTickers, subscribeTicker, tickerNow } from './ticker';

describe('ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', { hidden: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares one interval between subscribers and stops when the last leaves', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeTicker(1000, a);
    const offB = subscribeTicker(1000, b);
    expect(activeTickers()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(a).toHaveBeenCalledTimes(3);
    expect(b).toHaveBeenCalledTimes(3);
    offA();
    expect(activeTickers()).toBe(1);
    offB();
    expect(activeTickers()).toBe(0);
  });

  it('does not change the snapshot when the only subscriber resubscribes within one interval', () => {
    // React unsubscribes and resubscribes whenever a `subscribe` closure changes identity. As the only
    // subscriber the ticker stops and restarts each time; the snapshot must not move, or a
    // useSyncExternalStore consumer re-renders, resubscribes and loops ("Maximum update depth").
    const off1 = subscribeTicker(750, () => {});
    const first = tickerNow(750);
    off1();
    vi.advanceTimersByTime(10);
    const off2 = subscribeTicker(750, () => {});
    expect(tickerNow(750)).toBe(first);
    off2();
    // After a real idle gap longer than the interval the value does refresh.
    vi.advanceTimersByTime(5000);
    const off3 = subscribeTicker(750, () => {});
    expect(tickerNow(750)).toBeGreaterThan(first);
    off3();
  });

  it('keeps a stable snapshot between ticks', () => {
    const off = subscribeTicker(500, () => {});
    const first = tickerNow(500);
    expect(tickerNow(500)).toBe(first);
    vi.advanceTimersByTime(500);
    expect(tickerNow(500)).toBeGreaterThanOrEqual(first);
    off();
  });
});
