import { describe, expect, it } from 'vitest';
import { createChainTracker } from './chain';

describe('chain tracker', () => {
  const obs = (height: number, atMs: number | null, nowMs: number, allowBeat = true) => ({
    height,
    atMs,
    nowMs,
    allowBeat,
  });

  it('the first observation initialises and never beats', () => {
    const t = createChainTracker();
    const r = t.observe(obs(100, 1000, 2000));
    expect(r).toMatchObject({ kind: 'init', beat: false });
    expect(t.tip()).toMatchObject({ height: 100, at: 1000 });
  });

  it('beats exactly once per new height', () => {
    const t = createChainTracker();
    t.observe(obs(100, 0, 0));
    const a = t.observe(obs(101, 30_000, 30_500));
    expect(a).toMatchObject({ kind: 'advanced', beat: true });
    const dup = t.observe(obs(101, 30_000, 31_000));
    expect(dup).toMatchObject({ kind: 'same', beat: false });
    const b = t.observe(obs(102, 60_000, 60_200));
    expect(b.beat).toBe(true);
  });

  it('a multi-block jump is one beat, not a burst', () => {
    const t = createChainTracker();
    t.observe(obs(100, 0, 0));
    expect(t.observe(obs(105, 140_000, 141_000)).beat).toBe(true);
  });

  it('never beats when beats are not allowed (hello), but still moves the tip', () => {
    const t = createChainTracker();
    t.observe(obs(100, 0, 0));
    const r = t.observe(obs(101, 30_000, 30_100, false));
    expect(r).toMatchObject({ kind: 'advanced', beat: false });
    expect(t.tip()?.height).toBe(101);
    // And the block is then already known, so the real block event does not beat either.
    expect(t.observe(obs(101, 30_000, 30_200)).beat).toBe(false);
  });

  it('a block learned about long after it landed is not a beat', () => {
    const t = createChainTracker();
    t.observe(obs(100, 0, 0));
    const r = t.observe(obs(101, 30_000, 30_000 + 5 * 60_000));
    expect(r).toMatchObject({ kind: 'advanced', beat: false });
  });

  it('ignores a small regression and resets on a large one without beating', () => {
    const t = createChainTracker();
    t.observe(obs(100, 0, 0));
    expect(t.observe(obs(99, 0, 10)).kind).toBe('ignored');
    expect(t.tip()?.height).toBe(100);
    expect(t.observe(obs(50, 0, 20))).toMatchObject({ kind: 'reset', beat: false });
    expect(t.tip()?.height).toBe(50);
  });

  it('is live only while confirmations are recent', () => {
    const t = createChainTracker();
    expect(t.isLive(0, 45_000)).toBe(false);
    t.observe(obs(100, 0, 1000));
    expect(t.isLive(30_000, 45_000)).toBe(true);
    expect(t.isLive(46_001, 45_000)).toBe(false);
    t.observe(obs(100, 0, 40_000)); // same height confirms again
    expect(t.isLive(60_000, 45_000)).toBe(true);
  });
});
