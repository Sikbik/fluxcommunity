import { describe, expect, it } from 'vitest';
import { Governor, parseTierQuery, pickStartTier } from './governor';

/** Feeds `seconds` of frames at `fps` and returns every tier change in order. */
function run(g: Governor, seconds: number, fps: number): number[] {
  const changes: number[] = [];
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) {
    const c = g.frame(dt);
    if (c !== null) changes.push(c);
  }
  return changes;
}

describe('Governor', () => {
  it('holds the tier at a steady 60 fps', () => {
    const g = new Governor({ start: 3 });
    expect(run(g, 30, 60)).toEqual([]);
    expect(g.tier).toBe(3);
    expect(g.fps).toBeGreaterThan(58);
  });

  it('ignores the warm up window', () => {
    const g = new Governor({ start: 3 });
    // 1.4 s of terrible frames inside the warm up must not count.
    expect(run(g, 1.4, 20)).toEqual([]);
    expect(g.tier).toBe(3);
  });

  it('steps down after about two seconds under 45 fps', () => {
    const g = new Governor({ start: 3 });
    run(g, 1.6, 60); // warm up
    const changes = run(g, 1.5, 36);
    expect(changes).toEqual([]);
    const more = run(g, 1.5, 36);
    expect(more).toEqual([2]);
    expect(g.tier).toBe(2);
  });

  it('steps down one tier at a time and stops at the floor', () => {
    const g = new Governor({ start: 3 });
    run(g, 1.6, 60);
    const changes = run(g, 20, 38);
    expect(changes).toEqual([2, 1]);
    expect(g.tier).toBe(1);
    expect(run(g, 20, 20)).toEqual([]);
  });

  it('drops two tiers at once on a severe collapse', () => {
    const g = new Governor({ start: 3 });
    run(g, 1.6, 60);
    const changes = run(g, 5, 15);
    expect(changes[0]).toBe(1);
  });

  it('steps up only after about six seconds above 58 fps, never past the ceiling', () => {
    const g = new Governor({ start: 1, ceiling: 2 });
    run(g, 1.6, 60);
    expect(run(g, 5, 60)).toEqual([]);
    expect(run(g, 2, 60)).toEqual([2]);
    expect(run(g, 40, 60)).toEqual([]);
    expect(g.tier).toBe(2);
  });

  it('does not step up on a 50 fps average (the hysteresis band)', () => {
    const g = new Governor({ start: 1, ceiling: 3 });
    run(g, 1.6, 60);
    expect(run(g, 30, 50)).toEqual([]);
    expect(g.tier).toBe(1);
  });

  it('treats a long gap as a stall, not as slow frames', () => {
    const g = new Governor({ start: 3 });
    run(g, 2, 60);
    for (let i = 0; i < 20; i++) expect(g.frame(1.5)).toBeNull();
    expect(g.tier).toBe(3);
    expect(run(g, 5, 60)).toEqual([]);
  });

  it('waits longer to climb again after a bounce', () => {
    const g = new Governor({ start: 2, ceiling: 3 });
    run(g, 1.6, 60);
    expect(run(g, 6.5, 60)).toEqual([3]); // up after ~6 s
    // Immediately too slow at tier 3: a bounce.
    expect(run(g, 3, 30)).toEqual([2]);
    // The next attempt needs twice as long: 8 s of fast frames is not enough.
    expect(run(g, 8, 60)).toEqual([]);
    expect(run(g, 6, 60)).toEqual([3]);
  });

  it('never moves when locked by a forced tier', () => {
    const g = new Governor({ start: 2, locked: true });
    expect(run(g, 30, 12)).toEqual([]);
    expect(g.tier).toBe(2);
  });

  it('force clamps to floor and ceiling', () => {
    const g = new Governor({ start: 1, ceiling: 2 });
    expect(g.force(3)).toBe(2);
    expect(g.force(1)).toBe(1);
  });
});

describe('pickStartTier', () => {
  it('starts low on phones, Save-Data and small memory', () => {
    expect(pickStartTier({ mobile: true, saveData: false })).toEqual({ start: 1, ceiling: 2 });
    expect(pickStartTier({ mobile: false, saveData: true })).toEqual({ start: 1, ceiling: 2 });
    expect(pickStartTier({ mobile: false, saveData: false, deviceMemory: 4 })).toEqual({
      start: 1,
      ceiling: 2,
    });
    expect(pickStartTier({ mobile: false, saveData: false, deviceMemory: 2 })).toEqual({
      start: 1,
      ceiling: 2,
    });
  });

  it('starts medium on weak desktops and high on strong ones', () => {
    expect(pickStartTier({ mobile: false, saveData: false, deviceMemory: 8, cores: 4 })).toEqual({
      start: 2,
      ceiling: 3,
    });
    expect(pickStartTier({ mobile: false, saveData: false, deviceMemory: 8, cores: 12 })).toEqual({
      start: 3,
      ceiling: 3,
    });
    expect(pickStartTier({ mobile: false, saveData: false })).toEqual({ start: 3, ceiling: 3 });
  });
});

describe('parseTierQuery', () => {
  it('maps names and numbers', () => {
    expect(parseTierQuery('?q=low')).toBe(1);
    expect(parseTierQuery('?q=medium')).toBe(2);
    expect(parseTierQuery('?q=high')).toBe(3);
    expect(parseTierQuery('?q=none')).toBe(0);
    expect(parseTierQuery('?q=0')).toBe(0);
    expect(parseTierQuery('?x=1&q=2')).toBe(2);
  });

  it('returns null when absent or unknown', () => {
    expect(parseTierQuery('')).toBeNull();
    expect(parseTierQuery('?q=ultra')).toBeNull();
  });
});
