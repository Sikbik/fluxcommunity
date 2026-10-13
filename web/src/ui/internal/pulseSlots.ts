/**
 * Which pulsing rings may animate. Each ring is a compositing layer with an infinite animation;
 * nine of them on screen cost about 3 percent of the main thread in software raster. So a page
 * gets a small number of live rings at once, the rest render the same ring still.
 *
 * Framework-free: `HexBullet` claims a slot while it is on screen and wants to pulse, and
 * releases it when it leaves the screen or unmounts. A bullet that could not get a slot is
 * told (through the callback it registered) when one frees up.
 */

/** How many rings animate at once, page wide. */
export const MAX_LIVE_RINGS = 4;

export interface PulseSlots {
  /** Takes a slot for `token`. True when it has one (including when it already did). */
  claim(token: object): boolean;
  /** Gives the slot back and offers it to the first waiting bullet, in the order they asked. */
  release(token: object): void;
  /** Asks to be told when a slot frees up. Returns the function that stops asking. */
  wait(retry: () => void): () => void;
  /** Slots in use. */
  readonly used: number;
}

export function createPulseSlots(max: number): PulseSlots {
  const held = new Set<object>();
  const waiting = new Set<() => void>();
  return {
    claim(token) {
      if (held.has(token)) return true;
      if (held.size >= max) return false;
      held.add(token);
      return true;
    },
    release(token) {
      if (!held.delete(token)) return;
      for (const retry of [...waiting]) {
        if (held.size >= max) break;
        retry();
      }
    },
    wait(retry) {
      waiting.add(retry);
      return () => {
        waiting.delete(retry);
      };
    },
    get used() {
      return held.size;
    },
  };
}

/** The page's slots. */
export const pulseSlots = createPulseSlots(MAX_LIVE_RINGS);
