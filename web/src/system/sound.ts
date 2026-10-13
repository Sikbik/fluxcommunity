/**
 * The sound engine: a tiny WebAudio synth with no audio files. Soft hover ticks, a click, a calm
 * block chime, confirm and warn blips, and a swell as ambient mode begins and ends.
 *
 * - OFF by default (`prefs.sound`), and it never plays on its own: no AudioContext is created
 *   until the visitor has touched the page AND sound is on.
 * - Low master level, a gentle low-pass and a compressor, so overlapping sounds never bite.
 * - Every sound has a cooldown (`soundlogic`), so a sweep of the pointer is a flutter of ticks,
 *   not a buzz, and two listeners hearing the same block make one chime.
 * - The context sleeps after 20 s of silence.
 *
 * The decisions are in `soundlogic.ts` (tested); this file only turns them into nodes. The audio
 * itself cannot be verified headless.
 */
import { usePrefs } from '@/lib/prefs';
import {
  createCooldowns,
  IDLE_SUSPEND_S,
  MASTER_GAIN,
  mayPlay,
  mayStart,
  planVoices,
  type ScheduledVoice,
  type SoundId,
} from './soundlogic';

/** The slice of AudioContext the engine uses, so tests can supply a fake. */
export interface AudioNodeLike {
  connect(dest: unknown): unknown;
  disconnect?(): void;
}
export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime?(v: number, t: number): unknown;
  cancelScheduledValues?(t: number): unknown;
}
export interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: ParamLike;
  start(t: number): void;
  stop(t: number): void;
  onended: (() => void) | null;
}
export interface GainLike extends AudioNodeLike {
  gain: ParamLike;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBiquadFilter(): AudioNodeLike & { type: string; frequency: ParamLike; Q: ParamLike };
  createDynamicsCompressor(): AudioNodeLike & {
    threshold: ParamLike;
    ratio: ParamLike;
    attack: ParamLike;
    release: ParamLike;
  };
}

export interface EngineDeps {
  now(): number;
  enabled(): boolean;
  gestured(): boolean;
  hidden(): boolean;
  createContext(): AudioContextLike | null;
  /** setTimeout and clearTimeout, for the idle suspend. */
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export interface SoundEngine {
  tick(): void;
  click(): void;
  confirm(): void;
  warn(): void;
  chime(): void;
  swellIn(): void;
  swellOut(): void;
  /** Plays a confirm blip regardless of the preference (the visitor just turned sound on). */
  preview(): void;
  /** Number of voices currently sounding (diagnostics and tests). */
  voices(): number;
  /** True once an AudioContext exists. */
  started(): boolean;
}

export function createSoundEngine(deps: EngineDeps): SoundEngine {
  const cooldowns = createCooldowns();
  let ctx: AudioContextLike | null = null;
  let out: GainLike | null = null;
  let active = 0;
  let idleTimer = 0;

  function ensure(): boolean {
    if (ctx) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      return true;
    }
    const created = deps.createContext();
    if (!created) return false;
    ctx = created;
    // voices -> master -> low-pass -> compressor -> speakers
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 7000;
    lowpass.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.14;
    master.connect(lowpass);
    lowpass.connect(comp);
    comp.connect(ctx.destination);
    out = master;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    return true;
  }

  function voice(c: AudioContextLike, dest: GainLike, v: ScheduledVoice): void {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, v.start);
    if (v.glideTo) osc.frequency.exponentialRampToValueAtTime(v.glideTo, v.end);
    env.gain.setValueAtTime(0.0001, v.start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain), Math.max(v.peakAt, v.start + 0.001));
    env.gain.exponentialRampToValueAtTime(0.0001, v.end);
    osc.connect(env);
    env.connect(dest);
    active++;
    osc.onended = () => {
      active = Math.max(0, active - 1);
      osc.disconnect?.();
      env.disconnect?.();
    };
    osc.start(v.start);
    osc.stop(v.end + 0.03);
  }

  function armIdle(): void {
    deps.clearTimer(idleTimer);
    idleTimer = deps.setTimer(() => {
      if (ctx && ctx.state === 'running' && active === 0) void ctx.suspend().catch(() => undefined);
    }, IDLE_SUSPEND_S * 1000);
  }

  function play(id: SoundId, force = false): void {
    if (!mayPlay({ enabled: deps.enabled(), gestured: deps.gestured(), hidden: deps.hidden(), force }))
      return;
    if (!cooldowns.take(id, deps.now())) return;
    if (!mayStart(id, active)) return;
    if (!ensure() || !ctx || !out) return;
    const startAt = ctx.currentTime + 0.01;
    for (const v of planVoices(id, startAt)) voice(ctx, out, v);
    armIdle();
  }

  return {
    tick: () => play('tick'),
    click: () => play('click'),
    confirm: () => play('confirm'),
    warn: () => play('warn'),
    chime: () => play('chime'),
    swellIn: () => play('swellIn'),
    swellOut: () => play('swellOut'),
    preview: () => play('confirm', true),
    voices: () => active,
    started: () => ctx !== null,
  };
}

// ---------------------------------------------------------------------------
// The browser's engine
// ---------------------------------------------------------------------------

function browserContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' }) as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

/** Browsers refuse audio before a gesture; `userActivation` says whether there has been one. */
function hasGesture(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

/** The effects the rest of the app calls (`sfx.chime()`), backed by one shared engine. */
export const sfx: SoundEngine = createSoundEngine({
  now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
  enabled: () => usePrefs.getState().sound,
  gestured: hasGesture,
  hidden: () => typeof document !== 'undefined' && document.hidden,
  createContext: browserContext,
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (id) => window.clearTimeout(id),
});

/** True when sound is on. Only the visitor's own toggle can make this true. */
export function soundEnabled(): boolean {
  return usePrefs.getState().sound;
}
