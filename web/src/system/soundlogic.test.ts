import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_MS,
  createCooldowns,
  MASTER_GAIN,
  MAX_VOICES,
  mayPlay,
  mayStart,
  planVoices,
  RECIPES,
  SOUND_IDS,
  soundForAttribute,
  soundLength,
} from './soundlogic';

describe('cooldowns', () => {
  it('lets a sound through once, then not until its gap has passed', () => {
    const c = createCooldowns();
    expect(c.take('tick', 1000)).toBe(true);
    expect(c.take('tick', 1000 + COOLDOWN_MS.tick - 1)).toBe(false);
    expect(c.take('tick', 1000 + COOLDOWN_MS.tick)).toBe(true);
  });

  it('keeps one sound from blocking another', () => {
    const c = createCooldowns();
    expect(c.take('tick', 0)).toBe(true);
    expect(c.take('click', 1)).toBe(true);
    expect(c.take('tick', 2)).toBe(false);
  });

  it('makes one chime out of two listeners hearing the same block', () => {
    const c = createCooldowns();
    expect(c.take('chime', 500)).toBe(true);
    expect(c.take('chime', 500)).toBe(false);
    expect(c.take('chime', 500 + 29_000)).toBe(true);
  });

  it('does not record a refused play', () => {
    const c = createCooldowns();
    c.take('warn', 0);
    c.take('warn', 100); // refused: must not push the window forward
    expect(c.take('warn', COOLDOWN_MS.warn)).toBe(true);
  });

  it('can be reset', () => {
    const c = createCooldowns();
    c.take('confirm', 0);
    c.reset();
    expect(c.take('confirm', 1)).toBe(true);
  });
});

describe('the gate', () => {
  const base = { enabled: true, gestured: true, hidden: false };

  it('is open when sound is on and the visitor has touched the page', () => {
    expect(mayPlay(base)).toBe(true);
  });

  it('is shut by default: sound off', () => {
    expect(mayPlay({ ...base, enabled: false })).toBe(false);
  });

  it('never plays before a gesture, even forced', () => {
    expect(mayPlay({ ...base, gestured: false })).toBe(false);
    expect(mayPlay({ ...base, gestured: false, force: true })).toBe(false);
  });

  it('stays quiet in a hidden tab', () => {
    expect(mayPlay({ ...base, hidden: true })).toBe(false);
  });

  it('lets a preview through while sound is still off', () => {
    expect(mayPlay({ ...base, enabled: false, force: true })).toBe(true);
  });
});

describe('voice cap', () => {
  it('drops quiet sounds when busy but keeps the important ones', () => {
    expect(mayStart('tick', MAX_VOICES - 1)).toBe(true);
    expect(mayStart('tick', MAX_VOICES)).toBe(false);
    expect(mayStart('click', MAX_VOICES)).toBe(false);
    expect(mayStart('chime', MAX_VOICES)).toBe(true);
    expect(mayStart('confirm', MAX_VOICES)).toBe(true);
  });
});

describe('recipes and planning', () => {
  it('has a recipe for every sound', () => {
    for (const id of SOUND_IDS) expect(RECIPES[id].length).toBeGreaterThan(0);
  });

  it('keeps every voice soft, audible and well formed', () => {
    for (const id of SOUND_IDS) {
      for (const v of RECIPES[id]) {
        expect(v.gain).toBeGreaterThan(0);
        expect(v.gain).toBeLessThanOrEqual(0.06);
        expect(v.freq).toBeGreaterThan(60);
        expect(v.freq).toBeLessThan(6000);
        if (v.glideTo) {
          expect(v.glideTo).toBeGreaterThan(60);
          expect(v.glideTo).toBeLessThan(6000);
        }
        expect(v.attack).toBeGreaterThan(0);
        expect(v.attack).toBeLessThanOrEqual(v.dur);
        expect(v.at).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('places voices on the audio clock', () => {
    const plan = planVoices('confirm', 10);
    expect(plan).toHaveLength(RECIPES.confirm.length);
    for (const v of plan) {
      expect(v.start).toBeGreaterThanOrEqual(10);
      expect(v.end).toBeGreaterThan(v.start);
      expect(v.peakAt).toBeGreaterThanOrEqual(v.start);
      expect(v.peakAt).toBeLessThanOrEqual(v.end);
    }
    expect(plan[1]?.start).toBeCloseTo(10.075, 5);
  });

  it('applies the master level', () => {
    const quiet = planVoices('chime', 0, 0.5);
    const loud = planVoices('chime', 0, 1);
    expect((quiet[0]?.gain ?? 0) * 2).toBeCloseTo(loud[0]?.gain ?? 0, 6);
    expect(MASTER_GAIN).toBeLessThanOrEqual(1);
  });

  it('knows how long each sound lasts', () => {
    expect(soundLength('tick')).toBeLessThan(0.1);
    expect(soundLength('chime')).toBeGreaterThan(1);
    expect(soundLength('swellIn')).toBeGreaterThan(soundLength('swellOut'));
  });
});

describe('data-sound', () => {
  it('opts out, picks a sound, or falls back', () => {
    expect(soundForAttribute('off', 'click')).toBeNull();
    expect(soundForAttribute('confirm', 'click')).toBe('confirm');
    expect(soundForAttribute('warn', 'click')).toBe('warn');
    expect(soundForAttribute('', 'click')).toBe('click');
    expect(soundForAttribute(null, 'tick')).toBe('tick');
    expect(soundForAttribute('nonsense', 'click')).toBe('click');
  });
});
