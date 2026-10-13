import { describe, expect, it } from 'vitest';
import { clampUnit, driftOffset, followStep, pointerToUnit, REST_EPSILON, type Unit } from './parallax';

const rect = { left: 100, top: 50, width: 400, height: 200 };

describe('pointerToUnit', () => {
  it('is 0,0 at the centre and +-1 at the edges', () => {
    expect(pointerToUnit(300, 150, rect)).toEqual({ x: 0, y: 0 });
    expect(pointerToUnit(100, 50, rect)).toEqual({ x: -1, y: -1 });
    expect(pointerToUnit(500, 250, rect)).toEqual({ x: 1, y: 1 });
  });

  it('clamps outside the rect', () => {
    expect(pointerToUnit(-900, 9000, rect)).toEqual({ x: -1, y: 1 });
  });

  it('survives a zero-size rect', () => {
    expect(pointerToUnit(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('driftOffset', () => {
  it('moves opposite the pointer', () => {
    const o = driftOffset({ x: 1, y: -0.5 }, { x: 10, y: 8 });
    expect(o.x).toBe(-10);
    expect(o.y).toBe(4);
  });

  it('is zero for a centred pointer', () => {
    const o = driftOffset({ x: 0, y: 0 }, { x: 10, y: 8 });
    expect(o.x + 0).toBe(0);
    expect(o.y + 0).toBe(0);
  });
});

describe('followStep', () => {
  it('converges to the target and reports when it rests', () => {
    const state: Unit = { x: 0, y: 0 };
    const target: Unit = { x: 1, y: -1 };
    let frames = 0;
    while (followStep(state, target, 12, 1 / 60) && frames < 600) frames++;
    expect(frames).toBeGreaterThan(5);
    expect(frames).toBeLessThan(120);
    expect(state).toEqual(target);
  });

  it('is monotonic (no overshoot): a damped follower never crosses the target', () => {
    const state: Unit = { x: 0, y: 0 };
    const target: Unit = { x: 0.8, y: 0 };
    for (let i = 0; i < 200; i++) {
      followStep(state, target, 14, 1 / 60);
      expect(state.x).toBeLessThanOrEqual(0.8 + 1e-9);
    }
  });

  it('returns false immediately when already at rest', () => {
    const state: Unit = { x: 0.5, y: 0.5 };
    expect(followStep(state, { x: 0.5, y: 0.5 }, 12, 1 / 60)).toBe(false);
  });

  it('snaps within the rest epsilon', () => {
    const state: Unit = { x: 1 - REST_EPSILON / 2, y: 0 };
    expect(followStep(state, { x: 1, y: 0 }, 1, 1 / 60)).toBe(false);
    expect(state.x).toBe(1);
  });
});

describe('clampUnit', () => {
  it('clamps', () => {
    expect(clampUnit(3)).toBe(1);
    expect(clampUnit(-3)).toBe(-1);
    expect(clampUnit(0.25)).toBe(0.25);
  });
});
