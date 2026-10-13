import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeResize } from './useResizeObserver';

/** A ResizeObserver whose notifications the test fires by hand, and a manual animation frame queue. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly cb: (entries: ResizeObserverEntry[]) => void) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(entries: ResizeObserverEntry[]) {
    this.cb(entries);
  }
}

const el = (name: string) => ({ name }) as unknown as Element;
const entry = (target: Element, width: number) =>
  ({ target, contentRect: { width } }) as unknown as ResizeObserverEntry;

describe('observeResize', () => {
  let frames: Map<number, () => void>;
  let next: number;

  const runFrames = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const f of due) f();
  };

  beforeEach(() => {
    FakeObserver.instances = [];
    frames = new Map();
    next = 1;
    vi.stubGlobal('ResizeObserver', FakeObserver);
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => {
      const id = next++;
      frames.set(id, f);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never calls back inside the observer notification: the work waits for a frame', () => {
    const a = el('a');
    const cb = vi.fn();
    observeResize([a], cb);
    FakeObserver.instances[0]?.fire([entry(a, 100)]);
    expect(cb).not.toHaveBeenCalled();
    runFrames();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst into one call carrying the newest entry of each element', () => {
    const a = el('a');
    const b = el('b');
    const cb = vi.fn();
    observeResize([a, b], cb);
    const ro = FakeObserver.instances[0];
    ro?.fire([entry(a, 100)]);
    ro?.fire([entry(a, 120), entry(b, 40)]);
    ro?.fire([entry(a, 140)]);
    expect(frames.size).toBe(1);
    runFrames();
    expect(cb).toHaveBeenCalledTimes(1);
    const entries = cb.mock.calls[0]?.[0] as ResizeObserverEntry[];
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.target === a)?.contentRect.width).toBe(140);
    expect(entries.find((e) => e.target === b)?.contentRect.width).toBe(40);
  });

  it('delivers again for changes in a later frame', () => {
    const a = el('a');
    const cb = vi.fn();
    observeResize([a], cb);
    const ro = FakeObserver.instances[0];
    ro?.fire([entry(a, 1)]);
    runFrames();
    ro?.fire([entry(a, 2)]);
    runFrames();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('measures once synchronously when asked to, with no entries', () => {
    const cb = vi.fn();
    observeResize([el('a')], cb, { immediate: true });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('stops for good: a pending frame is cancelled and the observer disconnected', () => {
    const a = el('a');
    const cb = vi.fn();
    const stop = observeResize([a], cb);
    const ro = FakeObserver.instances[0];
    ro?.fire([entry(a, 1)]);
    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
    expect(ro?.disconnected).toBe(true);
    ro?.fire([entry(a, 2)]);
    runFrames();
    expect(cb).not.toHaveBeenCalled();
  });

  it('skips missing targets and survives an environment without ResizeObserver', () => {
    const cb = vi.fn();
    observeResize([null, undefined], cb);
    expect(FakeObserver.instances).toHaveLength(0);
    vi.stubGlobal('ResizeObserver', undefined);
    const stop = observeResize([el('a')], cb, { immediate: true });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(() => stop()).not.toThrow();
  });
});
