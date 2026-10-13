import type { AppHealth } from '@shared/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeView, parseStoredView, useBuilds } from './state';

describe('the remembered view', () => {
  it('defaults to the list', () => {
    expect(parseStoredView(null, false)).toBe('cells');
    expect(parseStoredView('garbage', false)).toBe('cells');
    expect(parseStoredView('cells', true)).toBe('cells');
  });

  it('restores the constellation with full motion', () => {
    expect(parseStoredView('constellation', false)).toBe('constellation');
  });

  it('falls back to the list under reduced motion unless it was chosen under reduced motion', () => {
    expect(parseStoredView('constellation', true)).toBe('cells');
    expect(parseStoredView('constellation!', true)).toBe('constellation');
    expect(parseStoredView('constellation!', false)).toBe('constellation');
  });

  it('records under which motion setting the constellation was chosen', () => {
    expect(encodeView('constellation', false)).toBe('constellation');
    expect(encodeView('constellation', true)).toBe('constellation!');
    expect(encodeView('cells', true)).toBe('cells');
  });
});

const probe = (id: string, state: AppHealth['state']): AppHealth => ({
  id,
  state,
  httpStatus: 200,
  latencyMs: 100,
  checkedAt: null,
  since: null,
});

describe('the builds store', () => {
  beforeEach(() => {
    useBuilds.setState({ query: '', category: 'all', builder: null, sort: 'spotlight' });
  });

  it('sets and clears filters', () => {
    const s = useBuilds.getState();
    s.setQuery('node');
    s.setCategory('nodes');
    s.setBuilder('2ndTL Mining');
    s.setSort('az');
    expect(useBuilds.getState()).toMatchObject({
      query: 'node',
      category: 'nodes',
      builder: '2ndTL Mining',
      sort: 'az',
    });
    useBuilds.getState().clearFilters();
    // The sort is a preference, not a filter.
    expect(useBuilds.getState()).toMatchObject({ query: '', category: 'all', builder: null, sort: 'az' });
  });

  it('indexes health by id and keeps references when nothing changed', () => {
    const apps = [probe('atlas', 'up'), probe('noxide', 'down')];
    useBuilds.getState().setHealth(apps, 'live');
    const first = useBuilds.getState().health;
    expect(first.ctx).toEqual({ loaded: true, freshness: 'live' });
    expect(first.byId.atlas?.state).toBe('up');

    useBuilds.getState().setHealth(apps, 'live');
    expect(useBuilds.getState().health).toBe(first);

    useBuilds.getState().setHealth(apps, 'cached');
    const second = useBuilds.getState().health;
    expect(second.byId).toBe(first.byId);
    expect(second.ctx.freshness).toBe('cached');
  });

  it('reports not loaded when no payload has arrived', () => {
    useBuilds.getState().setHealth(null, 'unknown');
    expect(useBuilds.getState().health.ctx).toEqual({ loaded: false, freshness: 'unknown' });
  });
});
