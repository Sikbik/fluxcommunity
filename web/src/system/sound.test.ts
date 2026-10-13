import { describe, expect, it } from 'vitest';
import {
  type AudioContextLike,
  createSoundEngine,
  type EngineDeps,
  type GainLike,
  type OscillatorLike,
  type ParamLike,
} from './sound';
import { IDLE_SUSPEND_S, RECIPES } from './soundlogic';

function param(): ParamLike {
  return {
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
}

function fakeContext() {
  const oscillators: OscillatorLike[] = [];
  const gains: GainLike[] = [];
  const log: string[] = [];
  const node = () => ({ connect: (d: unknown) => d, disconnect() {} });
  const ctx: AudioContextLike & { state: string } = {
    currentTime: 5,
    state: 'suspended',
    destination: { name: 'destination' },
    async resume() {
      ctx.state = 'running';
      log.push('resume');
    },
    async suspend() {
      ctx.state = 'suspended';
      log.push('suspend');
    },
    createOscillator() {
      const o: OscillatorLike = {
        ...node(),
        type: 'sine',
        frequency: param(),
        start() {},
        stop() {},
        onended: null,
      };
      oscillators.push(o);
      return o;
    },
    createGain() {
      const g: GainLike = { ...node(), gain: param() };
      gains.push(g);
      return g;
    },
    createBiquadFilter() {
      return { ...node(), type: 'lowpass', frequency: param(), Q: param() };
    },
    createDynamicsCompressor() {
      return { ...node(), threshold: param(), ratio: param(), attack: param(), release: param() };
    },
  };
  return { ctx, oscillators, gains, log };
}

function harness(over: Partial<{ enabled: boolean; gestured: boolean; hidden: boolean }> = {}) {
  const state = { enabled: true, gestured: true, hidden: false, now: 1000, created: 0, ...over };
  const audio = fakeContext();
  const timers: Array<{ fn: () => void; ms: number; id: number }> = [];
  const deps: EngineDeps = {
    now: () => state.now,
    enabled: () => state.enabled,
    gestured: () => state.gestured,
    hidden: () => state.hidden,
    createContext: () => {
      state.created++;
      return audio.ctx;
    },
    setTimer: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ fn, ms, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  return { engine: createSoundEngine(deps), state, audio, timers };
}

describe('sound engine', () => {
  it('makes no context while sound is off', () => {
    const h = harness({ enabled: false });
    h.engine.tick();
    h.engine.chime();
    expect(h.state.created).toBe(0);
    expect(h.engine.started()).toBe(false);
  });

  it('makes no context before the visitor has touched the page', () => {
    const h = harness({ gestured: false });
    h.engine.chime();
    h.engine.preview();
    expect(h.state.created).toBe(0);
  });

  it('makes no sound in a hidden tab', () => {
    const h = harness({ hidden: true });
    h.engine.chime();
    expect(h.state.created).toBe(0);
  });

  it('creates the context on the first sound and schedules the recipe', () => {
    const h = harness();
    h.engine.chime();
    expect(h.state.created).toBe(1);
    expect(h.audio.oscillators).toHaveLength(RECIPES.chime.length);
    expect(h.engine.voices()).toBe(RECIPES.chime.length);
    expect(h.audio.log).toContain('resume');
    h.state.now += 10_000;
    h.engine.confirm();
    expect(h.state.created).toBe(1);
  });

  it('throttles repeats of one sound', () => {
    const h = harness();
    h.engine.tick();
    h.engine.tick();
    h.engine.tick();
    expect(h.audio.oscillators).toHaveLength(RECIPES.tick.length);
    h.state.now += 100;
    h.engine.tick();
    expect(h.audio.oscillators).toHaveLength(RECIPES.tick.length * 2);
  });

  it('plays a preview even while sound is still off', () => {
    const h = harness({ enabled: false });
    h.engine.confirm();
    expect(h.state.created).toBe(0);
    h.engine.preview();
    expect(h.state.created).toBe(1);
    expect(h.audio.oscillators).toHaveLength(RECIPES.confirm.length);
  });

  it('counts voices down as they end', () => {
    const h = harness();
    h.engine.confirm();
    for (const o of h.audio.oscillators) o.onended?.();
    expect(h.engine.voices()).toBe(0);
  });

  it('suspends the context after a quiet spell', () => {
    const h = harness();
    h.engine.confirm();
    for (const o of h.audio.oscillators) o.onended?.();
    const timer = h.timers[h.timers.length - 1];
    expect(timer?.ms).toBe(IDLE_SUSPEND_S * 1000);
    timer?.fn();
    expect(h.audio.log).toContain('suspend');
  });

  it('resumes a sleeping context for the next sound', () => {
    const h = harness();
    h.engine.confirm();
    h.audio.ctx.state = 'suspended';
    h.state.now += 5000;
    h.engine.click();
    expect(h.audio.log.filter((l) => l === 'resume').length).toBeGreaterThanOrEqual(2);
  });
});
