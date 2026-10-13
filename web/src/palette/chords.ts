/**
 * The `g` chord: press `g`, then a letter, to jump to a section. A small state machine so the
 * timing and the "any other key cancels" rules are testable without a keyboard.
 */
import type { SectionId } from '@/stage/bus';
import { CHORD_PREFIX, CHORD_TIMEOUT_MS, sectionForChord } from './shortcuts';

export type ChordResult =
  /** The prefix was pressed: wait for a letter. */
  | { type: 'armed' }
  /** A letter completed the chord. */
  | { type: 'jump'; section: SectionId }
  /** Not part of a chord (or the chord was cancelled by another key). */
  | { type: 'ignored' };

export interface ChordMachine {
  /** Feed one plain key (already filtered for modifiers and typing targets). */
  press(key: string, nowMs: number): ChordResult;
  /** True while the prefix is armed and has not timed out. */
  armed(nowMs: number): boolean;
  reset(): void;
}

export function createChordMachine(timeoutMs: number = CHORD_TIMEOUT_MS): ChordMachine {
  let armedAt: number | null = null;
  const live = (now: number) => armedAt !== null && now - armedAt <= timeoutMs;

  return {
    press(rawKey, nowMs) {
      const key = rawKey.toLowerCase();
      const wasArmed = live(nowMs);
      if (key === CHORD_PREFIX) {
        // `g g` simply re-arms: there is no section behind a second g.
        armedAt = nowMs;
        return { type: 'armed' };
      }
      armedAt = null;
      if (!wasArmed) return { type: 'ignored' };
      const section = sectionForChord(key);
      return section ? { type: 'jump', section } : { type: 'ignored' };
    },
    armed: live,
    reset() {
      armedAt = null;
    },
  };
}
