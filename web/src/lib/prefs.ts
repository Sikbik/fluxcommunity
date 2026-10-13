/**
 * Visitor preferences, persisted to localStorage (every access guarded).
 * The only things the site remembers: accent, sound, auto ambient, a reduced-motion
 * override and whether the intro has been seen.
 *
 *   const accent = usePrefs((s) => s.accent);
 *   usePrefs.getState().set({ accent: 'nimbus' });
 */
import { create } from 'zustand';
import type { Accent } from '@/stage/bus';
import { readJson, writeJson } from './storage';

export interface Prefs {
  accent: Accent;
  /** Sound effects. Off by default; never autoplays. */
  sound: boolean;
  /** Start ambient mode after 90 s without input. On by default. */
  autoAmbient: boolean;
  /** true: always reduce motion. false: always full motion. null: follow the OS. */
  reducedMotionOverride: boolean | null;
  /** The first-visit intro has played at least once on this device. */
  introSeen: boolean;
}

export const ACCENTS: readonly Accent[] = ['flux', 'cumulus', 'nimbus', 'stratus'];

export const DEFAULT_PREFS: Prefs = {
  accent: 'flux',
  sound: false,
  autoAmbient: true,
  reducedMotionOverride: null,
  introSeen: false,
};

export const PREFS_KEY = 'fc:prefs:v1';

function isAccent(v: unknown): v is Accent {
  return typeof v === 'string' && (ACCENTS as readonly string[]).includes(v);
}

/** Coerces anything (a parsed JSON blob, garbage, null) into a valid Prefs. */
export function sanitizePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  return {
    accent: isAccent(r.accent) ? r.accent : DEFAULT_PREFS.accent,
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_PREFS.sound,
    autoAmbient: typeof r.autoAmbient === 'boolean' ? r.autoAmbient : DEFAULT_PREFS.autoAmbient,
    reducedMotionOverride:
      typeof r.reducedMotionOverride === 'boolean'
        ? r.reducedMotionOverride
        : DEFAULT_PREFS.reducedMotionOverride,
    introSeen: typeof r.introSeen === 'boolean' ? r.introSeen : DEFAULT_PREFS.introSeen,
  };
}

interface PrefsActions {
  set: (patch: Partial<Prefs>) => void;
  reset: () => void;
}

export type PrefsState = Prefs & PrefsActions;

function pick(state: Prefs): Prefs {
  return {
    accent: state.accent,
    sound: state.sound,
    autoAmbient: state.autoAmbient,
    reducedMotionOverride: state.reducedMotionOverride,
    introSeen: state.introSeen,
  };
}

export const usePrefs = create<PrefsState>((set) => ({
  ...sanitizePrefs(typeof window === 'undefined' ? null : readJson(PREFS_KEY)),
  set: (patch) => set((s) => sanitizePrefs({ ...pick(s), ...patch })),
  reset: () => set({ ...DEFAULT_PREFS }),
}));

if (typeof window !== 'undefined') {
  let queued = false;
  usePrefs.subscribe(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      writeJson(PREFS_KEY, pick(usePrefs.getState()));
    });
  });
  // Keep tabs in step.
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFS_KEY || e.newValue == null) return;
    try {
      usePrefs.setState(sanitizePrefs(JSON.parse(e.newValue) as unknown));
    } catch {
      /* ignore a malformed write from elsewhere */
    }
  });
}
