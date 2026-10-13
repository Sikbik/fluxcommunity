import type { CommunityApp } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { daysLeft, isRetiredAt, lifecycleOf, retireInstantMs } from './lifecycle';
import { AFTER, BEFORE, makeApp, ORPHAN, RETIRES_AT, RETIRING, SUCCESSOR, SYNTH } from './testkit';

const lookup = (id: string) => [...SYNTH, ORPHAN].find((a) => a.id === id);
const NODE_WATCH = SYNTH.find((a) => a.id === 'node-watch') as CommunityApp;

describe('retireInstantMs', () => {
  it('reads a calendar date as 00:00 UTC', () => {
    expect(retireInstantMs('2026-11-01')).toBe(RETIRES_AT);
  });

  it('is null for nothing or garbage', () => {
    expect(retireInstantMs(undefined)).toBeNull();
    expect(retireInstantMs('')).toBeNull();
    expect(retireInstantMs('soon')).toBeNull();
  });
});

describe('lifecycleOf', () => {
  it('counts down while the app is retiring', () => {
    const v = lifecycleOf(RETIRING, BEFORE, lookup);
    expect(v.state).toBe('retiring');
    expect(v.msLeft).toBe(RETIRES_AT - BEFORE);
    expect(v.successorId).toBe('orbit-pay');
    expect(v.label).toBe('Retiring Nov 1');
    expect(v.sentence).toBe('Retiring Nov 1. Orbit Pay takes over.');
    expect(daysLeft(v)).toBe(20);
  });

  it('is still retiring one millisecond before the date', () => {
    const v = lifecycleOf(RETIRING, RETIRES_AT - 1, lookup);
    expect(v.state).toBe('retiring');
    expect(v.msLeft).toBe(1);
    expect(daysLeft(v)).toBe(1);
  });

  it('is retired at the date and after it, with no countdown', () => {
    const at = lifecycleOf(RETIRING, RETIRES_AT, lookup);
    expect(at.state).toBe('retired');
    expect(at.msLeft).toBeNull();
    expect(at.label).toBe('Retired');
    expect(at.sentence).toBe('Retired on Nov 1. Orbit Pay has taken over.');
    const later = lifecycleOf(RETIRING, RETIRES_AT + 90 * 86_400_000, lookup);
    expect(later.state).toBe('retired');
    expect(daysLeft(later)).toBeNull();
  });

  it('marks the successor new, and promotes it once the predecessor has retired', () => {
    const before = lifecycleOf(SUCCESSOR, BEFORE, lookup);
    expect(before.state).toBe('new');
    expect(before.promoted).toBe(false);
    expect(before.predecessorId).toBe('old-ledger');
    expect(before.sentence).toBe('New. Takes over from Old Ledger on Nov 1.');

    const after = lifecycleOf(SUCCESSOR, AFTER, lookup);
    expect(after.state).toBe('new');
    expect(after.promoted).toBe(true);
    expect(after.sentence).toBe('Took over from Old Ledger on Nov 1.');
  });

  it('says what it can about a new app that replaces nothing', () => {
    const fresh = makeApp({ id: 'fresh', lifecycle: 'new' });
    const v = lifecycleOf(fresh, BEFORE, lookup);
    expect(v.state).toBe('new');
    expect(v.label).toBe('New');
    expect(v.promoted).toBe(false);
    expect(v.predecessorId).toBeNull();
    expect(v.sentence).toBe('New to the community portal.');
  });

  it('names a predecessor that has no date without inventing one', () => {
    const successor = makeApp({ id: 'next', lifecycle: 'new', replaces: ORPHAN.id });
    const v = lifecycleOf(successor, BEFORE, lookup);
    expect(v.predecessorId).toBe('lone-star');
    expect(v.sentence).toBe('New. Takes over from Lone Star.');
    expect(v.promoted).toBe(false);
  });

  it('leaves ordinary apps alone', () => {
    const v = lifecycleOf(NODE_WATCH, AFTER, lookup);
    expect(v.state).toBe('live');
    expect(v.label).toBeNull();
    expect(v.sentence).toBeNull();
    expect(v.promoted).toBe(false);
    expect(v.msLeft).toBeNull();
  });

  it('copes with a retiring app that has no date or no successor', () => {
    const v = lifecycleOf(ORPHAN, BEFORE, lookup);
    expect(v.state).toBe('retiring');
    expect(v.msLeft).toBeNull();
    expect(v.label).toBe('Retiring');
    expect(v.sentence).toBe('Retiring.');
    expect(daysLeft(v)).toBeNull();

    const dated: CommunityApp = { ...RETIRING, replacedBy: 'does-not-exist' };
    const w = lifecycleOf(dated, BEFORE, lookup);
    expect(w.successorId).toBeNull();
    expect(w.sentence).toBe('Retiring Nov 1.');

    const retired = lifecycleOf(dated, AFTER, lookup);
    expect(retired.sentence).toBe('Retired on Nov 1.');
  });

  it('never retires an app that has a date but is not declared retiring', () => {
    const stray: CommunityApp = { ...NODE_WATCH, retiresOn: '2020-01-01' };
    const v = lifecycleOf(stray, AFTER, lookup);
    expect(v.state).toBe('live');
    expect(v.retiresOn).toBeNull();
  });

  it('is deterministic for the same clock', () => {
    expect(lifecycleOf(RETIRING, BEFORE, lookup)).toEqual(lifecycleOf(RETIRING, BEFORE, lookup));
  });
});

describe('isRetiredAt', () => {
  it('only retiring apps can retire', () => {
    expect(isRetiredAt(NODE_WATCH, AFTER)).toBe(false);
    expect(isRetiredAt(SUCCESSOR, AFTER)).toBe(false);
    expect(isRetiredAt(RETIRING, RETIRES_AT - 1)).toBe(false);
    expect(isRetiredAt(RETIRING, RETIRES_AT)).toBe(true);
    expect(isRetiredAt(ORPHAN, AFTER)).toBe(false);
  });
});
