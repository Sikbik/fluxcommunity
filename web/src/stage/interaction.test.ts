import { describe, expect, it } from 'vitest';
import type { FocusRegion } from './bus';
import {
  FocusEaser,
  INTRO_DURATION,
  INTRO_SKIP_SECONDS,
  introFrame,
  introSkipRate,
  pickAnchor,
  pointInRect,
  SymbolMotion,
  visibleArea,
} from './interaction';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('anchor picking', () => {
  it('computes the visible area inside the viewport', () => {
    expect(visibleArea(rect(0, 0, 100, 100), 1000, 800)).toBe(10000);
    expect(visibleArea(rect(-50, -50, 100, 100), 1000, 800)).toBe(2500);
    expect(visibleArea(rect(0, 900, 100, 100), 1000, 800)).toBe(0);
  });

  it('picks the most visible anchor and ignores empty ones', () => {
    const rects = [rect(0, 0, 0, 0), rect(100, 700, 200, 200), rect(500, 100, 300, 300)];
    expect(pickAnchor(rects, 1440, 900)).toBe(2);
    expect(pickAnchor([rect(0, 0, 0, 0)], 1440, 900)).toBe(-1);
    expect(pickAnchor([], 1440, 900)).toBe(-1);
  });

  it('breaks ties by document order', () => {
    const rects = [rect(0, 0, 200, 200), rect(300, 0, 200, 200)];
    expect(pickAnchor(rects, 1440, 900)).toBe(0);
  });

  it('prefers any visible anchor to a fully off screen one', () => {
    const rects = [rect(0, 2000, 500, 500), rect(10, 10, 40, 40)];
    expect(pickAnchor(rects, 1440, 900)).toBe(1);
  });

  it('hit tests with padding', () => {
    const r = rect(10, 10, 100, 100);
    expect(pointInRect(50, 50, r)).toBe(true);
    expect(pointInRect(5, 50, r)).toBe(false);
    expect(pointInRect(5, 50, r, 6)).toBe(true);
  });
});

describe('FocusEaser', () => {
  const region = (id: string, strength = 1): FocusRegion => ({
    id,
    x: 100,
    y: 200,
    w: 300,
    h: 120,
    strength,
  });

  it('eases a region in and back out, then forgets it', () => {
    const e = new FocusEaser();
    const first = e.update([region('a')], 1 / 60)[0]!;
    expect(first.s).toBeGreaterThan(0);
    expect(first.s).toBeLessThan(0.3);
    for (let i = 0; i < 60; i++) e.update([region('a')], 1 / 60);
    expect(e.items[0]!.s).toBeGreaterThan(0.95);
    expect(e.items[0]!.cx).toBe(250);
    expect(e.items[0]!.cy).toBe(260);
    for (let i = 0; i < 40; i++) e.update([], 1 / 60);
    expect(e.items).toHaveLength(1);
    expect(e.items[0]!.s).toBeLessThan(0.6);
    for (let i = 0; i < 200; i++) e.update([], 1 / 60);
    expect(e.items).toHaveLength(0);
  });

  it('packs into uniform arrays', () => {
    const e = new FocusEaser();
    for (let i = 0; i < 90; i++) e.update([region('a', 0.5)], 1 / 60);
    const a = new Float32Array(32);
    const b = new Float32Array(32);
    expect(e.pack(a, b)).toBe(1);
    expect(a[2]).toBe(150);
    expect(a[3]).toBe(60);
    expect(b[0]).toBeCloseTo(0.5, 2);
  });

  it('never holds more than eight regions', () => {
    const e = new FocusEaser();
    const many = Array.from({ length: 12 }, (_, i) => region(`r${i}`));
    for (let i = 0; i < 5; i++) e.update(many, 1 / 60);
    expect(e.items.length).toBeLessThanOrEqual(8);
  });
});

describe('SymbolMotion', () => {
  it('follows a drag and carries on after release, then springs back upright', () => {
    const m = new SymbolMotion();
    m.beginDrag();
    for (let i = 0; i < 10; i++) m.drag(20, 0, 1 / 60);
    expect(m.yaw).toBeGreaterThan(1.4);
    m.endDrag();
    let maxYaw = m.yaw;
    for (let i = 0; i < 60 * 12; i++) {
      m.step(1 / 60, 0);
      maxYaw = Math.max(maxYaw, m.yaw);
    }
    expect(maxYaw).toBeGreaterThanOrEqual(1.4);
    expect(Math.abs(m.yaw)).toBeLessThan(0.01);
    expect(m.settling).toBe(false);
  });

  it('settles to the nearest whole turn after a hard spin', () => {
    const m = new SymbolMotion();
    m.beginDrag();
    for (let i = 0; i < 30; i++) m.drag(60, 0, 1 / 60);
    m.endDrag();
    for (let i = 0; i < 60 * 20; i++) m.step(1 / 60, 0);
    const turns = m.yaw / (Math.PI * 2);
    expect(Math.abs(turns - Math.round(turns))).toBeLessThan(0.01);
  });

  it('clamps pitch and eases hover', () => {
    const m = new SymbolMotion();
    m.beginDrag();
    for (let i = 0; i < 40; i++) m.drag(0, 100, 1 / 60);
    expect(m.pitch).toBeLessThanOrEqual(0.9);
    for (let i = 0; i < 60; i++) m.step(1 / 60, 1);
    expect(m.hover).toBeGreaterThan(0.98);
  });
});

describe('intro timeline', () => {
  it('starts dark and ends settled', () => {
    const a = introFrame(0);
    expect(a.ignite).toBe(0);
    expect(a.assemble).toEqual([0, 0, 0, 0]);
    expect(a.flash).toBe(0);
    expect(a.done).toBe(false);
    const z = introFrame(INTRO_DURATION + 0.01);
    expect(z.done).toBe(true);
    expect(z.ignite).toBe(1);
    expect(z.assemble).toEqual([1, 1, 1, 1]);
    expect(z.flash).toBe(0);
  });

  it('ignites cells before the shards arrive and flashes as they lock', () => {
    const early = introFrame(0.45);
    expect(early.ignite).toBeGreaterThan(0.05);
    expect(early.assemble[0]).toBeGreaterThan(0);
    expect(early.assemble[3]).toBeLessThan(early.assemble[0]);
    const lock = introFrame(1.3);
    expect(lock.assemble.every((v) => v > 0.9)).toBe(true);
    expect(lock.flash).toBeGreaterThan(0.3);
    const late = introFrame(1.75);
    expect(late.flash).toBeLessThan(0.1);
  });

  it('finishes a skip in under 200 ms', () => {
    let t = 0.2;
    let wall = 0;
    const dt = 1 / 60;
    const rate = introSkipRate(t);
    while (t < INTRO_DURATION && wall < 1) {
      t += dt * rate;
      wall += dt;
    }
    expect(wall).toBeLessThan(0.2);
    expect(INTRO_SKIP_SECONDS).toBeLessThan(0.2);
    expect(introSkipRate(INTRO_DURATION)).toBe(1);
  });
});
