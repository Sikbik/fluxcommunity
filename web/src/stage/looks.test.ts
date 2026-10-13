import { describe, expect, it } from 'vitest';
import { SECTION_ORDER } from './bus';
import {
  AMBIENT_LOOK,
  AMBIENT_STILL_LOOK,
  blendLooks,
  LOOK_KEYS,
  LOOKS,
  LookSmoother,
  lookFor,
} from './looks';
import { easeInOutCubic, easeOutBack, smoothDamp } from './math';

describe('look presets', () => {
  it('defines a look for every section with sane ranges', () => {
    for (const id of SECTION_ORDER) {
      const l = lookFor(id);
      expect(l).toBe(LOOKS[id]);
      expect(l.height).toBeGreaterThan(0.5);
      expect(l.fov).toBeGreaterThan(20);
      expect(l.fov).toBeLessThan(90);
      for (const k of LOOK_KEYS) expect(Number.isFinite(l[k])).toBe(true);
    }
  });

  it('keeps dense sections dimmer and calmer than the hero', () => {
    for (const id of ['builds', 'hosting', 'learn'] as const) {
      expect(LOOKS[id].exposure).toBeLessThan(LOOKS.hero.exposure * 0.7);
      expect(LOOKS[id].motion).toBeLessThan(LOOKS.hero.motion);
      expect(LOOKS[id].lift).toBeLessThan(LOOKS.hero.lift);
    }
    expect(LOOKS.play.motion).toBeGreaterThan(LOOKS.hero.motion);
  });

  it('has an ambient preset with more bloom and aberration, and a still variant that does not move', () => {
    expect(AMBIENT_LOOK.bloom).toBeGreaterThan(LOOKS.hero.bloom);
    expect(AMBIENT_LOOK.chroma).toBeGreaterThan(LOOKS.hero.chroma);
    expect(AMBIENT_STILL_LOOK.motion).toBe(0);
    expect(AMBIENT_STILL_LOOK.exposure).toBeLessThan(AMBIENT_LOOK.exposure);
  });

  it('blends linearly between looks', () => {
    const mid = blendLooks(LOOKS.hero, LOOKS.builds, 0.5);
    expect(mid.height).toBeCloseTo((LOOKS.hero.height + LOOKS.builds.height) / 2, 9);
    expect(blendLooks(LOOKS.hero, LOOKS.builds, 0).exposure).toBe(LOOKS.hero.exposure);
    expect(blendLooks(LOOKS.hero, LOOKS.builds, 1).exposure).toBe(LOOKS.builds.exposure);
  });
});

describe('LookSmoother', () => {
  it('covers most of the distance in about 1.2 s without overshoot', () => {
    const s = new LookSmoother(LOOKS.hero);
    const target = LOOKS.builds;
    const start = s.value.exposure;
    let max = start;
    let at95 = -1;
    const dt = 1 / 60;
    for (let i = 1; i <= 60 * 4; i++) {
      s.step(target, dt);
      max = Math.max(max, s.value.exposure);
      const done = (start - s.value.exposure) / (start - target.exposure);
      if (at95 < 0 && done >= 0.95) at95 = i * dt;
      expect(s.value.exposure).toBeGreaterThanOrEqual(target.exposure - 1e-6);
    }
    expect(max).toBeLessThanOrEqual(start + 1e-9);
    expect(at95).toBeGreaterThan(0.9);
    expect(at95).toBeLessThan(1.5);
    expect(s.value.exposure).toBeCloseTo(target.exposure, 3);
  });

  it('keeps the path continuous when the target changes mid flight', () => {
    const s = new LookSmoother(LOOKS.hero);
    const dt = 1 / 60;
    let prev = s.value.height;
    let biggest = 0;
    for (let i = 0; i < 30; i++) {
      s.step(LOOKS.builds, dt);
      biggest = Math.max(biggest, Math.abs(s.value.height - prev));
      prev = s.value.height;
    }
    s.step(LOOKS.play, dt);
    const jump = Math.abs(s.value.height - prev);
    // The retarget bends the path: the next step is no bigger than the biggest step so far.
    expect(jump).toBeLessThanOrEqual(biggest * 1.05);
  });

  it('snaps instantly for reduced motion', () => {
    const s = new LookSmoother(LOOKS.hero);
    s.snap(LOOKS.learn);
    expect(s.value.height).toBe(LOOKS.learn.height);
    expect(s.value.exposure).toBe(LOOKS.learn.exposure);
  });
});

describe('easing', () => {
  it('has the right end points and monotonic cubic in out', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.02) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it('overshoots with back easing and lands on 1', () => {
    expect(easeOutBack(1)).toBeCloseTo(1, 9);
    let peak = 0;
    for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, easeOutBack(t));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.2);
  });

  it('smoothDamp converges and never overshoots from rest', () => {
    const v = { v: 0 };
    let x = 0;
    for (let i = 0; i < 600; i++) {
      x = smoothDamp(x, 10, v, 0.3, 1 / 60);
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
    }
    expect(x).toBeCloseTo(10, 4);
  });
});
