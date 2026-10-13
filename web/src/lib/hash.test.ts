import { describe, expect, it } from 'vitest';
import { buildHash, EMPTY_ROUTE, isSectionId, parseHash, sameRoute } from './hash';

describe('parseHash', () => {
  it('returns the empty route for no hash', () => {
    expect(parseHash('')).toEqual(EMPTY_ROUTE);
    expect(parseHash('#')).toEqual(EMPTY_ROUTE);
  });

  it('parses a section', () => {
    expect(parseHash('#pulse')).toEqual({ section: 'pulse', appId: null, raw: 'pulse' });
    expect(parseHash('#HERO').section).toBe('hero');
  });

  it('parses an app detail under builds', () => {
    expect(parseHash('#builds/atlas')).toEqual({ section: 'builds', appId: 'atlas', raw: 'builds/atlas' });
    expect(parseHash('#builds/flux-tools-hub').appId).toBe('flux-tools-hub');
    expect(parseHash('#/builds/Atlas').appId).toBe('atlas');
  });

  it('ignores an app id on any other section', () => {
    expect(parseHash('#pulse/atlas')).toMatchObject({ section: 'pulse', appId: null });
  });

  it('rejects ids that are not kebab-case-ish or are too long', () => {
    expect(parseHash('#builds/<script>').appId).toBeNull();
    expect(parseHash(`#builds/${'a'.repeat(80)}`).appId).toBeNull();
    expect(parseHash('#builds/a b').appId).toBeNull();
  });

  it('keeps unknown hashes as raw with no section', () => {
    expect(parseHash('#palette')).toEqual({ section: null, appId: null, raw: 'palette' });
  });

  it('decodes percent-encoding safely', () => {
    expect(parseHash('#builds/%E0%A4%A').appId).toBeNull();
    expect(parseHash('#builds/atlas%2Dtwo').appId).toBe('atlas-two');
  });
});

describe('buildHash', () => {
  it('builds section and app hashes', () => {
    expect(buildHash({ section: 'gateways' })).toBe('#gateways');
    expect(buildHash({ section: 'builds', appId: 'atlas' })).toBe('#builds/atlas');
    expect(buildHash({ section: null })).toBe('');
  });

  it('drops an app id that is not on builds or is malformed', () => {
    expect(buildHash({ section: 'pulse', appId: 'atlas' })).toBe('#pulse');
    expect(buildHash({ section: 'builds', appId: '../x' })).toBe('#builds');
  });

  it('round-trips', () => {
    const route = { section: 'builds' as const, appId: 'flux-tools-hub' };
    expect(parseHash(buildHash(route))).toMatchObject(route);
  });
});

describe('helpers', () => {
  it('isSectionId narrows', () => {
    expect(isSectionId('community')).toBe(true);
    expect(isSectionId('nope')).toBe(false);
    expect(isSectionId(null)).toBe(false);
  });

  it('sameRoute compares section and app', () => {
    expect(sameRoute(parseHash('#builds/a'), parseHash('#builds/a'))).toBe(true);
    expect(sameRoute(parseHash('#builds/a'), parseHash('#builds'))).toBe(false);
  });
});
