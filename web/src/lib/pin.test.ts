import { describe, expect, it } from 'vitest';
import { type PinEnv, type PinStopReason, pinTarget } from './pin';

/** A fake environment with a controllable clock, layout events, input and target offset. */
function fakeEnv(initialOffset: number | null = 0) {
  let t = 0;
  let offset: number | null = initialOffset;
  let layoutCb: (() => void) | null = null;
  let inputCb: (() => void) | null = null;
  const timers: Array<{ at: number; cb: () => void; live: boolean }> = [];
  const log = { aligns: 0, layoutDisconnects: 0, inputRemovals: 0 };
  const env: PinEnv = {
    now: () => t,
    offset: () => offset,
    align: () => {
      log.aligns++;
      if (offset !== null) offset = 0;
    },
    watchLayout: (cb) => {
      layoutCb = cb;
      return () => {
        layoutCb = null;
        log.layoutDisconnects++;
      };
    },
    watchInput: (cb) => {
      inputCb = cb;
      return () => {
        inputCb = null;
        log.inputRemovals++;
      };
    },
    after: (ms, cb) => {
      const timer = { at: t + ms, cb, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  };
  return {
    env,
    log,
    setOffset(v: number | null) {
      offset = v;
    },
    layout() {
      layoutCb?.();
    },
    input() {
      inputCb?.();
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const next = timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        t = next.at;
        next.live = false;
        next.cb();
      }
      t = end;
    },
    get watching() {
      return layoutCb !== null;
    },
  };
}

describe('pinTarget', () => {
  it('re-aligns the target when layout shifts it away', () => {
    const f = fakeEnv(0);
    pinTarget(f.env);
    f.setOffset(1076);
    f.layout();
    expect(f.log.aligns).toBe(1);
  });

  it('does nothing while the target is within tolerance', () => {
    const f = fakeEnv(0);
    pinTarget(f.env, { tolerancePx: 2 });
    f.setOffset(2);
    f.layout();
    f.setOffset(-2);
    f.layout();
    expect(f.log.aligns).toBe(0);
  });

  it('does not align when the target is not in the page yet', () => {
    const f = fakeEnv(null);
    pinTarget(f.env);
    f.layout();
    expect(f.log.aligns).toBe(0);
    f.setOffset(500);
    f.layout();
    expect(f.log.aligns).toBe(1);
  });

  it('keeps following successive shifts, then stops once layout has been quiet', () => {
    const f = fakeEnv(0);
    const reasons: PinStopReason[] = [];
    pinTarget(f.env, { quietMs: 1000, maxMs: 6000, onStop: (r) => reasons.push(r) });
    for (const shift of [300, 700, 90]) {
      f.advance(200);
      f.setOffset(shift);
      f.layout();
    }
    expect(f.log.aligns).toBe(3);
    expect(f.watching).toBe(true);
    f.advance(1300);
    expect(f.watching).toBe(false);
    expect(f.log.layoutDisconnects).toBe(1);
    expect(f.log.inputRemovals).toBe(1);
    expect(reasons).toEqual(['quiet']);
  });

  it('corrects drift that no layout event reported, and counts it as activity', () => {
    const f = fakeEnv(0);
    pinTarget(f.env, { quietMs: 500, maxMs: 6000 });
    f.advance(400);
    f.setOffset(48);
    f.advance(120);
    expect(f.log.aligns).toBe(1);
    // That correction restarts the quiet window, so the pin outlives the original 500 ms.
    f.advance(300);
    expect(f.watching).toBe(true);
    f.advance(400);
    expect(f.watching).toBe(false);
  });

  it('stops at the hard cap even if layout keeps changing', () => {
    const f = fakeEnv(0);
    const reasons: PinStopReason[] = [];
    pinTarget(f.env, { quietMs: 1000, maxMs: 3000, onStop: (r) => reasons.push(r) });
    for (let i = 0; i < 40; i++) {
      f.advance(100);
      f.setOffset(10);
      f.layout();
    }
    expect(f.watching).toBe(false);
    expect(reasons).toEqual(['cap']);
  });

  it('yields to the visitor on the first input and never aligns again', () => {
    const f = fakeEnv(0);
    const reasons: PinStopReason[] = [];
    pinTarget(f.env, { onStop: (r) => reasons.push(r) });
    f.input();
    expect(f.watching).toBe(false);
    f.setOffset(900);
    f.layout();
    f.advance(500);
    expect(f.log.aligns).toBe(0);
    expect(reasons).toEqual(['input']);
  });

  it('can be stopped by the caller, more than once', () => {
    const f = fakeEnv(0);
    const reasons: PinStopReason[] = [];
    const stop = pinTarget(f.env, { onStop: (r) => reasons.push(r) });
    stop();
    stop();
    expect(f.log.layoutDisconnects).toBe(1);
    expect(f.log.inputRemovals).toBe(1);
    expect(reasons).toEqual(['released']);
  });
});
