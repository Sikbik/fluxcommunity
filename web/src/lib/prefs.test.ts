import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, sanitizePrefs, usePrefs } from './prefs';

describe('sanitizePrefs', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('x')).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs(42)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs([])).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid values', () => {
    const p = sanitizePrefs({
      accent: 'nimbus',
      sound: true,
      autoAmbient: false,
      reducedMotionOverride: true,
      introSeen: true,
    });
    expect(p).toEqual({
      accent: 'nimbus',
      sound: true,
      autoAmbient: false,
      reducedMotionOverride: true,
      introSeen: true,
    });
  });

  it('replaces invalid fields one by one', () => {
    const p = sanitizePrefs({ accent: 'magenta', sound: 'yes', reducedMotionOverride: 'no', introSeen: 1 });
    expect(p).toEqual(DEFAULT_PREFS);
  });

  it('allows the override to be explicitly false (full motion)', () => {
    expect(sanitizePrefs({ reducedMotionOverride: false }).reducedMotionOverride).toBe(false);
  });

  it('drops unknown keys', () => {
    expect(Object.keys(sanitizePrefs({ accent: 'stratus', extra: 1 })).sort()).toEqual(
      ['accent', 'autoAmbient', 'introSeen', 'reducedMotionOverride', 'sound'].sort(),
    );
  });
});

describe('usePrefs store', () => {
  it('starts from defaults without storage and applies patches through sanitize', () => {
    usePrefs.getState().reset();
    expect(usePrefs.getState().accent).toBe('flux');
    usePrefs.getState().set({ accent: 'cumulus', sound: true });
    expect(usePrefs.getState().accent).toBe('cumulus');
    expect(usePrefs.getState().sound).toBe(true);
    // @ts-expect-error deliberately invalid
    usePrefs.getState().set({ accent: 'nope' });
    expect(usePrefs.getState().accent).toBe('flux');
    usePrefs.getState().reset();
  });
});
