import { describe, expect, it, vi } from 'vitest';
import { createPulseSlots } from './pulseSlots';

describe('pulse slots', () => {
  it('hands out at most `max` slots', () => {
    const slots = createPulseSlots(2);
    const [a, b, c] = [{}, {}, {}];
    expect(slots.claim(a)).toBe(true);
    expect(slots.claim(b)).toBe(true);
    expect(slots.claim(c)).toBe(false);
    expect(slots.used).toBe(2);
  });

  it('claiming again with the same token is a no-op that still succeeds', () => {
    const slots = createPulseSlots(1);
    const a = {};
    expect(slots.claim(a)).toBe(true);
    expect(slots.claim(a)).toBe(true);
    expect(slots.used).toBe(1);
  });

  it('offers a freed slot to waiting bullets, in the order they asked, until it is taken', () => {
    const slots = createPulseSlots(1);
    const holder = {};
    const first = {};
    const second = {};
    slots.claim(holder);
    const grants: string[] = [];
    slots.wait(() => {
      if (slots.claim(first)) grants.push('first');
    });
    slots.wait(() => {
      if (slots.claim(second)) grants.push('second');
    });
    slots.release(holder);
    expect(grants).toEqual(['first']);
    expect(slots.used).toBe(1);
  });

  it('stops asking when a bullet gives up waiting', () => {
    const slots = createPulseSlots(1);
    const holder = {};
    slots.claim(holder);
    const retry = vi.fn();
    const stop = slots.wait(retry);
    stop();
    slots.release(holder);
    expect(retry).not.toHaveBeenCalled();
  });

  it('releasing a token that holds nothing changes nothing', () => {
    const slots = createPulseSlots(1);
    const retry = vi.fn();
    slots.wait(retry);
    slots.release({});
    expect(retry).not.toHaveBeenCalled();
    expect(slots.used).toBe(0);
  });
});
