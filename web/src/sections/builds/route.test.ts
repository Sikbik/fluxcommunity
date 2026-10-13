import { describe, expect, it } from 'vitest';
import { appHash, displayId, parseBuildsHash, resolveAppId, shareUrl } from './route';

describe('parseBuildsHash', () => {
  it('resolves a known app', () => {
    const r = parseBuildsHash('#builds/noxide');
    expect(r.kind).toBe('app');
    if (r.kind === 'app') expect(r.app.id).toBe('noxide');
  });

  it('is case insensitive and tolerates a leading slash', () => {
    expect(parseBuildsHash('#builds/NOXIDE').kind).toBe('app');
    expect(parseBuildsHash('#/builds/atlas').kind).toBe('app');
  });

  it('knows an id it cannot resolve', () => {
    expect(parseBuildsHash('#builds/does-not-exist')).toEqual({ kind: 'unknown', id: 'does-not-exist' });
  });

  it('ignores everything that is not an app route', () => {
    expect(parseBuildsHash('')).toEqual({ kind: 'none' });
    expect(parseBuildsHash('#builds')).toEqual({ kind: 'none' });
    expect(parseBuildsHash('#pulse')).toEqual({ kind: 'none' });
    expect(parseBuildsHash('#gateways/atlas')).toEqual({ kind: 'none' });
  });

  it('refuses ids that are not safe path segments', () => {
    expect(parseBuildsHash('#builds/noxide/extra')).toEqual({ kind: 'none' });
    expect(parseBuildsHash('#builds/<script>')).toEqual({ kind: 'none' });
    expect(parseBuildsHash('#builds/../etc')).toEqual({ kind: 'none' });
  });
});

describe('resolveAppId', () => {
  it('handles empty input', () => {
    expect(resolveAppId(null)).toEqual({ kind: 'none' });
    expect(resolveAppId('')).toEqual({ kind: 'none' });
  });
});

describe('links', () => {
  it('builds the hash and the shareable URL', () => {
    expect(appHash('flux-view')).toBe('#builds/flux-view');
    expect(shareUrl('https://community.app.runonflux.io/', 'atlas')).toBe(
      'https://community.app.runonflux.io/#builds/atlas',
    );
    expect(shareUrl('http://127.0.0.1:5173/?intro=0#builds/noxide', 'atlas')).toBe(
      'http://127.0.0.1:5173/?intro=0#builds/atlas',
    );
  });

  it('shortens an unknown id for display', () => {
    expect(displayId('weird!!id<>')).toBe('weirdid');
    expect(displayId('a'.repeat(100))).toHaveLength(40);
  });
});
