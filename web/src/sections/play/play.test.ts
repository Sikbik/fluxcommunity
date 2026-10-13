import { describe, expect, it } from 'vitest';
import { AND_MORE, GAMES, splitRows } from './games';
import { createLimiter, loopSeconds, RIPPLE_MIN_INTERVAL_MS, ROW_MOTION, runsNeeded } from './wall';

describe('the wall list', () => {
  it('has the ten games from the brief, text only', () => {
    expect(GAMES.map((g) => g.label)).toEqual([
      'Minecraft',
      'Valheim',
      'Rust',
      'Palworld',
      'Project Zomboid',
      'FiveM',
      'ARK: Survival Ascended',
      'Terraria',
      'Factorio',
      "Don't Starve Together",
    ]);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
  });

  it('splits across two rows in order, with "and more" closing the second', () => {
    const [a, b] = splitRows(GAMES);
    expect([...a, ...b.slice(0, -1)].map((x) => x.id)).toEqual(GAMES.map((x) => x.id));
    expect(b[b.length - 1]).toEqual(AND_MORE);
    expect(a.length).toBeGreaterThan(2);
    expect(b.length).toBeGreaterThan(2);
  });

  it('keeps the two rows within a quarter of each other in characters', () => {
    const [a, b] = splitRows(GAMES);
    const chars = (r: readonly { label: string }[]) => r.reduce((n, x) => n + x.label.length, 0);
    const ca = chars(a);
    const cb = chars(b);
    expect(Math.abs(ca - cb) / (ca + cb)).toBeLessThan(0.25);
  });

  it('never returns an empty row, even for tiny lists', () => {
    const [a, b] = splitRows([{ id: 'x', label: 'X' }]);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });
});

describe('marquee maths', () => {
  it('always uses an even number of runs, at least two', () => {
    for (const [view, run] of [
      [390, 1200],
      [1440, 700],
      [1920, 330],
      [0, 100],
      [500, 0],
    ] as const) {
      const n = runsNeeded(view, run);
      expect(n % 2).toBe(0);
      expect(n).toBeGreaterThanOrEqual(2);
    }
  });

  it('makes the track at least a viewport plus a run wide', () => {
    for (const [view, run] of [
      [1440, 700],
      [1920, 330],
      [390, 1200],
    ] as const) {
      expect(runsNeeded(view, run) * run).toBeGreaterThanOrEqual(view + run);
    }
  });

  it('loops at the requested speed (half the track per cycle)', () => {
    const runs = 4;
    const seconds = loopSeconds(500, runs, 50);
    // Half of 4 runs of 500 px is 1000 px; at 50 px/s that is 20 s.
    expect(seconds).toBeCloseTo(20, 6);
  });

  it('floors the speed so a bad value cannot stall the loop', () => {
    expect(loopSeconds(800, 2, 0)).toBeCloseTo(100, 6);
    expect(Number.isFinite(loopSeconds(0, 2, 10))).toBe(true);
  });

  it('the two rows move in opposite directions at different speeds', () => {
    expect(ROW_MOTION[0].direction).not.toBe(ROW_MOTION[1].direction);
    expect(ROW_MOTION[0].speed).not.toBe(ROW_MOTION[1].speed);
  });
});

describe('ripple limiter', () => {
  it('allows at most four per second', () => {
    let t = 0;
    const allow = createLimiter(RIPPLE_MIN_INTERVAL_MS, () => t);
    let fired = 0;
    // A hover storm: an attempt every 10 ms for one second.
    for (t = 0; t < 1000; t += 10) if (allow()) fired++;
    expect(fired).toBeLessThanOrEqual(4);
    expect(fired).toBeGreaterThanOrEqual(3);
  });

  it('lets the first event through and spaces the rest', () => {
    let t = 1000;
    const allow = createLimiter(250, () => t);
    expect(allow()).toBe(true);
    t = 1100;
    expect(allow()).toBe(false);
    t = 1250;
    expect(allow()).toBe(true);
  });
});
