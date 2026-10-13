import { describe, expect, it } from 'vitest';
import { sourceFor } from './useClock';

/**
 * Regression: the design system's `useNow` hands React a new `subscribe` function on every render.
 * React unsubscribes and resubscribes each time, the shared ticker restarts and stamps a new time, the
 * snapshot changes, and with a dozen consumers the page re-renders until React gives up with
 * "Maximum update depth exceeded". `useClock` must keep one stable `subscribe` and `snapshot` per
 * interval, so React subscribes once and the snapshot only changes on a tick.
 */
describe('useClock source', () => {
  it('gives the same subscribe and snapshot functions for the same interval', () => {
    const a = sourceFor(30_000);
    const b = sourceFor(30_000);
    expect(b.subscribe).toBe(a.subscribe);
    expect(b.snapshot).toBe(a.snapshot);
    expect(sourceFor(1000).subscribe).not.toBe(a.subscribe);
  });

  it('returns a stable number between ticks', () => {
    const { snapshot } = sourceFor(5000);
    const first = snapshot();
    for (let i = 0; i < 50; i++) expect(snapshot()).toBe(first);
  });
});
