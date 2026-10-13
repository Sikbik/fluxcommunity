/**
 * The decisions behind the sound engine, as pure functions: which sounds exist, what each is made
 * of, how often one may repeat, and whether a sound may play at all. The WebAudio nodes live in
 * `sound.ts`; everything here can be tested without an audio device.
 *
 * Policy (DESIGN 4): sound is OFF by default, never autoplays, and is created only after the
 * visitor has touched the page. Reduced motion means "off" unless the visitor explicitly turned
 * sound on, and `prefs.sound` is only ever true through that explicit act, so the preference is
 * the whole answer.
 */

export type SoundId = 'tick' | 'click' | 'confirm' | 'warn' | 'chime' | 'swellIn' | 'swellOut';

export const SOUND_IDS: readonly SoundId[] = [
  'tick',
  'click',
  'confirm',
  'warn',
  'chime',
  'swellIn',
  'swellOut',
];

/** Minimum time between two plays of the same sound, in ms. */
export const COOLDOWN_MS: Readonly<Record<SoundId, number>> = {
  tick: 70,
  click: 45,
  confirm: 140,
  warn: 400,
  // A block lands every ~30 s; two subscribers hearing the same one must make one chime.
  chime: 3000,
  swellIn: 1500,
  swellOut: 1500,
};

/** When the engine is busy, only sounds at or above this priority may start. */
export const MIN_PRIORITY_WHEN_BUSY = 2;
export const MAX_VOICES = 12;

export const PRIORITY: Readonly<Record<SoundId, number>> = {
  tick: 0,
  click: 1,
  confirm: 2,
  warn: 2,
  chime: 3,
  swellIn: 3,
  swellOut: 3,
};

/** Seconds of silence before the audio context is suspended to let the device sleep. */
export const IDLE_SUSPEND_S = 20;

/** Master level. Every voice gain below is already small; this is the last, low, step. */
export const MASTER_GAIN = 0.9;

export type Wave = 'sine' | 'triangle';

export interface VoiceSpec {
  type: Wave;
  freq: number;
  /** Exponential glide to this frequency over the voice's length. */
  glideTo?: number;
  /** Start offset from the sound's start, seconds. */
  at: number;
  /** Seconds from the start of the voice to its peak. */
  attack: number;
  /** Total length of the voice, seconds. */
  dur: number;
  /** Peak gain, 0..1. */
  gain: number;
}

/** What each sound is made of. Soft sines and triangles; nothing above a tenth of full scale. */
export const RECIPES: Readonly<Record<SoundId, readonly VoiceSpec[]>> = {
  // A fine, high tick as the pointer lands on something pressable.
  tick: [{ type: 'triangle', freq: 2600, glideTo: 1900, at: 0, attack: 0.002, dur: 0.035, gain: 0.014 }],
  // A soft thock with a hairline of click on top.
  click: [
    { type: 'sine', freq: 640, glideTo: 300, at: 0, attack: 0.002, dur: 0.07, gain: 0.05 },
    { type: 'triangle', freq: 2100, at: 0, attack: 0.001, dur: 0.018, gain: 0.018 },
  ],
  // Two rising notes, a fifth apart: something was confirmed.
  confirm: [
    { type: 'sine', freq: 659.25, at: 0, attack: 0.006, dur: 0.14, gain: 0.05 },
    { type: 'sine', freq: 987.77, at: 0.075, attack: 0.006, dur: 0.2, gain: 0.045 },
    { type: 'sine', freq: 1975.5, at: 0.075, attack: 0.004, dur: 0.12, gain: 0.012 },
  ],
  // Two falling notes, mellow rather than alarming.
  warn: [
    { type: 'triangle', freq: 392, at: 0, attack: 0.006, dur: 0.12, gain: 0.045 },
    { type: 'triangle', freq: 311.13, at: 0.1, attack: 0.006, dur: 0.18, gain: 0.04 },
  ],
  // A calm bloom of C, G and C: the chain just moved.
  chime: [
    { type: 'sine', freq: 261.63, at: 0, attack: 0.012, dur: 1.9, gain: 0.05 },
    { type: 'sine', freq: 392, at: 0.03, attack: 0.012, dur: 1.5, gain: 0.032 },
    { type: 'sine', freq: 523.25, at: 0.06, attack: 0.012, dur: 1.2, gain: 0.02 },
    { type: 'sine', freq: 1046.5, at: 0.06, attack: 0.008, dur: 0.6, gain: 0.006 },
  ],
  // The page falls away and the lattice takes over: a slow rising pad.
  swellIn: [
    { type: 'sine', freq: 110, glideTo: 146.83, at: 0, attack: 0.9, dur: 2.3, gain: 0.05 },
    { type: 'sine', freq: 164.81, glideTo: 220, at: 0.1, attack: 1, dur: 2.3, gain: 0.032 },
    { type: 'triangle', freq: 329.63, glideTo: 440, at: 0.2, attack: 1.1, dur: 2.2, gain: 0.012 },
  ],
  // And the way back: a short fall.
  swellOut: [
    { type: 'sine', freq: 220, glideTo: 110, at: 0, attack: 0.02, dur: 1.2, gain: 0.045 },
    { type: 'sine', freq: 329.63, glideTo: 164.81, at: 0, attack: 0.02, dur: 1, gain: 0.025 },
  ],
};

export interface ScheduledVoice extends VoiceSpec {
  /** Absolute start, in the audio context's clock. */
  start: number;
  /** Absolute end. */
  end: number;
  /** Absolute time of the peak. */
  peakAt: number;
}

/** A sound's voices placed on the audio clock. Pure. */
export function planVoices(id: SoundId, startAt: number, level = MASTER_GAIN): ScheduledVoice[] {
  return RECIPES[id].map((v) => ({
    ...v,
    gain: Math.min(0.2, v.gain * level),
    start: startAt + v.at,
    end: startAt + v.at + v.dur,
    peakAt: startAt + v.at + Math.min(v.attack, v.dur),
  }));
}

/** Total length of a sound in seconds (its last voice's end). */
export function soundLength(id: SoundId): number {
  return Math.max(...RECIPES[id].map((v) => v.at + v.dur));
}

export interface Cooldowns {
  /** True and records the play when `id` is allowed at `nowMs`; false when it is too soon. */
  take(id: SoundId, nowMs: number): boolean;
  reset(): void;
}

export function createCooldowns(table: Readonly<Record<SoundId, number>> = COOLDOWN_MS): Cooldowns {
  const last = new Map<SoundId, number>();
  return {
    take(id, nowMs) {
      const prev = last.get(id);
      if (prev !== undefined && nowMs - prev < table[id]) return false;
      last.set(id, nowMs);
      return true;
    },
    reset() {
      last.clear();
    },
  };
}

/** When the engine is already busy, quiet little sounds are dropped rather than piled on. */
export function mayStart(id: SoundId, activeVoices: number): boolean {
  return activeVoices < MAX_VOICES || PRIORITY[id] >= MIN_PRIORITY_WHEN_BUSY;
}

export interface GateInput {
  /** `prefs.sound`: only ever true through the visitor's own act. */
  enabled: boolean;
  /** The page has had a user gesture (browsers refuse audio before one). */
  gestured: boolean;
  hidden: boolean;
  /** A preview ignores the preference (the visitor has just turned sound on). */
  force?: boolean;
}

/** Whether a sound may play at all right now. */
export function mayPlay({ enabled, gestured, hidden, force = false }: GateInput): boolean {
  if (hidden) return false;
  if (!gestured) return false;
  return enabled || force;
}

/** What a delegated control asks for with `data-sound`: a name, or "off". */
export function soundForAttribute(value: string | null | undefined, fallback: SoundId): SoundId | null {
  if (value === 'off') return null;
  if (value === 'confirm' || value === 'warn' || value === 'tick' || value === 'click') return value;
  return fallback;
}
