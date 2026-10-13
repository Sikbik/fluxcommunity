import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_REL, isExternalHref, NEW_TAB_HINT, outboundLink } from './links';

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { href: 'https://community.example/builds', origin: 'https://community.example' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isExternalHref', () => {
  it('is true only for http(s) URLs on another origin', () => {
    expect(isExternalHref('https://runonflux.com/x')).toBe(true);
    expect(isExternalHref('http://docs.runonflux.com')).toBe(true);
    expect(isExternalHref('https://community.example/other')).toBe(false);
    expect(isExternalHref('/builds')).toBe(false);
    expect(isExternalHref('#top')).toBe(false);
    expect(isExternalHref('mailto:a@b.c')).toBe(false);
    expect(isExternalHref('tel:+15551234')).toBe(false);
    expect(isExternalHref(undefined)).toBe(false);
  });
});

describe('outboundLink', () => {
  it('gives an external link a new tab, noopener and the utm', () => {
    const l = outboundLink('https://runonflux.com/pricing', { withUtm: true });
    expect(l.external).toBe(true);
    expect(l.newTab).toBe(true);
    expect(l.props).toEqual({
      href: 'https://runonflux.com/pricing?utm_source=community',
      target: '_blank',
      rel: EXTERNAL_REL,
    });
  });

  it('leaves the URL alone without withUtm, and honours a custom source', () => {
    expect(outboundLink('https://runonflux.com/').props.href).toBe('https://runonflux.com/');
    expect(outboundLink('https://runonflux.com/', { withUtm: true, utmSource: 'footer' }).props.href).toBe(
      'https://runonflux.com/?utm_source=footer',
    );
  });

  it('keeps an existing utm_source', () => {
    const l = outboundLink('https://runonflux.com/?utm_source=partner', { withUtm: true });
    expect(l.props.href).toBe('https://runonflux.com/?utm_source=partner');
  });

  it('gives an internal link nothing, and no keys that could override a later prop', () => {
    const l = outboundLink('/builds', { withUtm: true });
    expect(l.external).toBe(false);
    expect(l.newTab).toBe(false);
    expect(l.props).toEqual({ href: '/builds' });
    expect('target' in l.props).toBe(false);
    expect('rel' in l.props).toBe(false);
  });

  it('lets newTab override either way', () => {
    expect(outboundLink('https://runonflux.com/', { newTab: false }).props).toEqual({
      href: 'https://runonflux.com/',
    });
    const l = outboundLink('/builds', { newTab: true });
    expect(l.newTab).toBe(true);
    expect(l.props.target).toBe('_blank');
    expect(l.props.rel).toBe(EXTERNAL_REL);
  });

  it('exports the hint text', () => {
    expect(NEW_TAB_HINT).toBe('(Opens in a new tab)');
  });
});
