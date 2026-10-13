import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from './engine';
import { createLayerController, demoRequested } from './layer';

function fakeEngine() {
  const calls = { start: 0, stop: 0 };
  let running = false;
  const engine: Engine = {
    start() {
      if (running) return;
      running = true;
      calls.start += 1;
    },
    stop() {
      if (!running) return;
      running = false;
      calls.stop += 1;
    },
    running: () => running,
  };
  return { engine, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('layer controller', () => {
  it('is refcounted: one engine for many holders, stopped when the last releases', () => {
    const { engine, calls } = fakeEngine();
    const make = vi.fn(() => engine);
    const layer = createLayerController(make);
    const a = layer.acquire();
    const b = layer.acquire();
    expect(make).toHaveBeenCalledTimes(1);
    expect(calls.start).toBe(1);
    expect(layer.holders()).toBe(2);
    a();
    vi.runAllTimers();
    expect(calls.stop).toBe(0);
    b();
    vi.runAllTimers();
    expect(calls.stop).toBe(1);
    expect(layer.active()).toBe(false);
  });

  it('release functions are idempotent', () => {
    const { engine, calls } = fakeEngine();
    const layer = createLayerController(() => engine);
    const a = layer.acquire();
    const b = layer.acquire();
    a();
    a();
    a();
    vi.runAllTimers();
    expect(layer.holders()).toBe(1);
    expect(calls.stop).toBe(0);
    b();
    vi.runAllTimers();
    expect(calls.stop).toBe(1);
  });

  it('survives a StrictMode mount, unmount, mount without restarting the engine', () => {
    const { engine, calls } = fakeEngine();
    const make = vi.fn(() => engine);
    const layer = createLayerController(make);
    const first = layer.acquire(); // effect
    first(); // simulated StrictMode cleanup
    const second = layer.acquire(); // effect again
    vi.runAllTimers();
    expect(make).toHaveBeenCalledTimes(1);
    expect(calls.start).toBe(1);
    expect(calls.stop).toBe(0);
    expect(layer.active()).toBe(true);
    second();
    vi.runAllTimers();
    expect(calls.stop).toBe(1);
  });

  it('can start again after a full stop, with a fresh engine', () => {
    const made: Engine[] = [];
    const layer = createLayerController(() => {
      const { engine } = fakeEngine();
      made.push(engine);
      return engine;
    });
    layer.acquire()();
    vi.runAllTimers();
    layer.acquire();
    expect(made).toHaveLength(2);
    expect(made[1]?.running()).toBe(true);
  });

  it('dispose() stops immediately even with holders (hot module reload)', () => {
    const { engine, calls } = fakeEngine();
    const layer = createLayerController(() => engine);
    layer.acquire();
    layer.acquire();
    layer.dispose();
    expect(calls.stop).toBe(1);
    expect(layer.active()).toBe(false);
    expect(layer.holders()).toBe(0);
  });
});

describe('demoRequested', () => {
  it('only in development builds, only with demo=1', () => {
    expect(demoRequested('?demo=1', true)).toBe(true);
    expect(demoRequested('?demo=1', false)).toBe(false);
    expect(demoRequested('?demo=0', true)).toBe(false);
    expect(demoRequested('', true)).toBe(false);
    expect(demoRequested('?x=1&demo=1', true)).toBe(true);
  });
});
