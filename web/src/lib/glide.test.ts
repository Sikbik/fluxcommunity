import { describe, expect, it } from 'vitest';
import {
  easeInOutCubic,
  GLIDE_MAX_MS,
  GLIDE_MIN_MS,
  type GlideEnv,
  glideDuration,
  startGlide,
} from './glide';

/** A scroller with a manual clock, one frame callback at a time, and a movable destination. */
function fakeScroller(start: number, dest: number | null) {
  let t = 0;
  let y = start;
  let target: number | null = dest;
  let frameCb: (() => void) | null = null;
  let inputCb: (() => void) | null = null;
  const trail: number[] = [];
  const env: GlideEnv = {
    now: () => t,
    position: () => y,
    destination: () => target,
    scrollTo: (v) => {
      y = v;
      trail.push(v);
    },
    frame: (cb) => {
      frameCb = cb;
      return () => {
        if (frameCb === cb) frameCb = null;
      };
    },
    watchInput: (cb) => {
      inputCb = cb;
      return () => {
        inputCb = null;
      };
    },
  };
  return {
    env,
    trail,
    get y() {
      return y;
    },
    set target(v: number | null) {
      target = v;
    },
    /** Advances the clock and runs one frame. */
    tick(ms: number) {
      t += ms;
      const cb = frameCb;
      frameCb = null;
      cb?.();
    },
    /** Runs frames at 60 fps until the glide stops asking for them. */
    run(maxMs = 5000) {
      for (let spent = 0; frameCb && spent < maxMs; spent += 16) this.tick(16);
    },
    input() {
      inputCb?.();
    },
    get running() {
      return frameCb !== null;
    },
  };
}

describe('easeInOutCubic', () => {
  it('runs 0 to 1, is symmetric and clamps outside the range', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 10);
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(9)).toBe(1);
  });

  it('never goes backwards', () => {
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('glideDuration', () => {
  it('grows with distance between a floor and a ceiling', () => {
    expect(glideDuration(0)).toBe(GLIDE_MIN_MS);
    expect(glideDuration(600)).toBeGreaterThan(GLIDE_MIN_MS);
    expect(glideDuration(4000)).toBeGreaterThan(glideDuration(600));
    expect(glideDuration(1_000_000)).toBe(GLIDE_MAX_MS);
  });

  it('treats up and down trips alike', () => {
    expect(glideDuration(-2500)).toBe(glideDuration(2500));
  });
});

describe('startGlide', () => {
  it('ends exactly on a fixed destination and reports arrival', () => {
    const s = fakeScroller(0, 3000);
    const ends: boolean[] = [];
    startGlide(s.env, (a) => ends.push(a));
    s.run();
    expect(s.y).toBe(3000);
    expect(ends).toEqual([true]);
    expect(s.running).toBe(false);
  });

  it('moves monotonically towards a fixed destination', () => {
    const s = fakeScroller(0, 3000);
    startGlide(s.env, () => {});
    s.run();
    for (let i = 1; i < s.trail.length; i++) expect(s.trail[i]).toBeGreaterThanOrEqual(s.trail[i - 1] ?? 0);
  });

  it('matches the plain easing when the destination does not move', () => {
    const s = fakeScroller(100, 2100);
    startGlide(s.env, () => {});
    const duration = glideDuration(2000);
    s.tick(duration / 2);
    // Halfway through an ease-in-out is halfway there.
    expect(s.y).toBeCloseTo(1100, 4);
  });

  it('follows a destination that moves while it runs, without jumping', () => {
    const s = fakeScroller(0, 1000);
    startGlide(s.env, () => {});
    let last = s.y;
    let biggestStep = 0;
    for (let i = 0; i < 12; i++) {
      s.tick(16);
      biggestStep = Math.max(biggestStep, Math.abs(s.y - last));
      last = s.y;
    }
    // A section above the target mounts: the target is now far lower.
    s.target = 2400;
    const before = s.y;
    s.tick(16);
    // Continuous: the frame that learns about it moves by about one ordinary frame, not by the
    // whole 1400 px the destination just shifted.
    expect(Math.abs(s.y - before)).toBeLessThan(Math.max(biggestStep * 3, 60));
    s.run();
    expect(s.y).toBe(2400);
  });

  it('lands on the final destination when it moves late in the flight', () => {
    const s = fakeScroller(0, 800);
    startGlide(s.env, () => {});
    s.tick(glideDuration(800) * 0.9);
    s.target = 1800;
    s.run();
    expect(s.y).toBe(1800);
  });

  it('can scroll up as well as down', () => {
    const s = fakeScroller(5000, 1200);
    startGlide(s.env, () => {});
    s.run();
    expect(s.y).toBe(1200);
  });

  it('stands down when the visitor takes over, and does not scroll again', () => {
    const s = fakeScroller(0, 3000);
    const ends: boolean[] = [];
    startGlide(s.env, (a) => ends.push(a));
    s.tick(100);
    const at = s.y;
    s.input();
    expect(ends).toEqual([false]);
    expect(s.running).toBe(false);
    s.tick(500);
    expect(s.y).toBe(at);
  });

  it('can be stopped by the caller, more than once', () => {
    const s = fakeScroller(0, 3000);
    const ends: boolean[] = [];
    const stop = startGlide(s.env, (a) => ends.push(a));
    s.tick(50);
    stop();
    stop();
    expect(ends).toEqual([false]);
    expect(s.running).toBe(false);
  });

  it('gives up when the target is not in the page', () => {
    const s = fakeScroller(0, null);
    const ends: boolean[] = [];
    startGlide(s.env, (a) => ends.push(a));
    expect(ends).toEqual([false]);
    expect(s.running).toBe(false);
  });

  it('gives up when the target disappears mid-flight', () => {
    const s = fakeScroller(0, 2000);
    const ends: boolean[] = [];
    startGlide(s.env, (a) => ends.push(a));
    s.tick(100);
    s.target = null;
    s.tick(16);
    expect(ends).toEqual([false]);
  });

  it('finishes on the first frame after a long stall (a hidden tab)', () => {
    const s = fakeScroller(0, 2500);
    const ends: boolean[] = [];
    startGlide(s.env, (a) => ends.push(a));
    s.tick(30_000);
    expect(s.y).toBe(2500);
    expect(ends).toEqual([true]);
  });
});
