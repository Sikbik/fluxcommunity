import { describe, expect, it } from 'vitest';
import {
  dialGeometry,
  dialState,
  intervalDomain,
  perimeterPoint,
  sweepFraction,
  WAIT_AFTER_OVERDUE_SEC,
} from './cadence';

describe('dialState', () => {
  it('is offline without a live clock', () => {
    expect(dialState(null, false).phase).toBe('offline');
    expect(dialState(12, false).phase).toBe('offline');
    expect(dialState(null, true).phase).toBe('offline');
    expect(dialState(12, false).litTicks).toBe(0);
    expect(dialState(12, false).fill).toBe(0);
  });

  it('sweeps until the target, lighting a tick per second', () => {
    const s = dialState(12, true);
    expect(s.phase).toBe('sweeping');
    expect(s.sinceSec).toBe(12);
    expect(s.litTicks).toBe(13);
    expect(s.fill).toBeCloseTo(0.4, 6);
    expect(dialState(0, true).litTicks).toBe(1);
  });

  it('holds full once the target passes, then says it is waiting', () => {
    const at30 = dialState(30, true);
    expect(at30.phase).toBe('complete');
    expect(at30.fill).toBe(1);
    expect(at30.litTicks).toBe(30);
    expect(dialState(30 + WAIT_AFTER_OVERDUE_SEC - 1, true).phase).toBe('complete');
    const waiting = dialState(30 + WAIT_AFTER_OVERDUE_SEC, true);
    expect(waiting.phase).toBe('waiting');
    expect(waiting.overdueSec).toBe(WAIT_AFTER_OVERDUE_SEC);
    expect(waiting.fill).toBe(1);
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(dialState(12.9, true).sinceSec).toBe(12);
    expect(dialState(-3, true).sinceSec).toBe(0);
  });
});

describe('sweepFraction', () => {
  it('maps elapsed time onto the 30 s ring and clamps', () => {
    expect(sweepFraction(0)).toBe(0);
    expect(sweepFraction(15_000)).toBeCloseTo(0.5, 9);
    expect(sweepFraction(45_000)).toBe(1);
    expect(sweepFraction(-5)).toBe(0);
    expect(sweepFraction(Number.NaN)).toBe(0);
  });
});

describe('dialGeometry', () => {
  const g = dialGeometry();

  it('draws 30 ticks, six of them long, one per second', () => {
    expect(g.ticks).toHaveLength(30);
    expect(g.ticks.filter((t) => t.major)).toHaveLength(6);
    expect(g.ticks.map((t) => t.second)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('puts the major ticks on the six vertices', () => {
    const majors = g.ticks.filter((t) => t.major);
    majors.forEach((t, k) => {
      const v = g.vertices[k];
      expect(t.x1).toBeCloseTo(v?.x ?? 0, 1);
      expect(t.y1).toBeCloseTo(v?.y ?? 0, 1);
    });
  });

  it('starts at the top vertex and goes clockwise', () => {
    const top = g.vertices[0];
    expect(top?.x).toBeCloseTo(g.centre, 6);
    expect(top?.y).toBeCloseTo(g.centre - g.radius, 6);
    const quarter = perimeterPoint(g.vertices, 0.25);
    expect(quarter.x).toBeGreaterThan(g.centre);
  });

  it('every tick points inward', () => {
    for (const t of g.ticks) {
      const d1 = Math.hypot(t.x1 - g.centre, t.y1 - g.centre);
      const d2 = Math.hypot(t.x2 - g.centre, t.y2 - g.centre);
      expect(d2).toBeLessThan(d1);
    }
  });

  it('labels the vertices 0, 5, ... 25 outside the ring', () => {
    expect(g.labels.map((l) => l.text)).toEqual(['0', '5', '10', '15', '20', '25']);
    for (const l of g.labels) {
      expect(Math.hypot(l.x - g.centre, l.y - g.centre)).toBeGreaterThan(g.radius);
    }
  });

  it('is a closed path', () => {
    expect(g.path.startsWith('M')).toBe(true);
    expect(g.path.endsWith('Z')).toBe(true);
  });
});

describe('intervalDomain', () => {
  it('hugs the data but always contains the target, in 5 s steps', () => {
    expect(intervalDomain(13, 34)).toEqual({ min: 5, max: 40 });
    expect(intervalDomain(26, 34)).toEqual({ min: 20, max: 40 });
  });

  it('never goes below zero and keeps a minimum span', () => {
    const d = intervalDomain(2, 31);
    expect(d.min).toBe(0);
    expect(d.max - d.min).toBeGreaterThanOrEqual(20);
  });

  it('falls back to a window around the target with no data', () => {
    const d = intervalDomain(null, null);
    expect(d.min).toBeLessThan(30);
    expect(d.max).toBeGreaterThan(30);
  });
});
