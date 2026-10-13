import { describe, expect, it } from 'vitest';
import { didExit, type PresenceState } from './usePresence';

const STATES: PresenceState[] = ['closed', 'enter', 'open', 'exit'];

describe('didExit', () => {
  it('is not an exit when the surface has never been shown (the initial closed)', () => {
    expect(didExit('closed', 'closed')).toBe(false);
  });

  it('is an exit when a mounted surface becomes closed', () => {
    expect(didExit('exit', 'closed')).toBe(true);
    // Closed again before the entering frames finished: it was mounted, so it did exit.
    expect(didExit('enter', 'closed')).toBe(true);
    expect(didExit('open', 'closed')).toBe(true);
  });

  it('is never an exit while the surface is still mounted', () => {
    for (const prev of STATES) {
      for (const next of STATES) {
        if (next === 'closed') continue;
        expect(didExit(prev, next)).toBe(false);
      }
    }
  });
});
