import { describe, expect, it } from 'vitest';
import { type ArtFitConfig, resolveConfig } from './useArtFit';

/** A stand in for `getComputedStyle`: only `getPropertyValue` is ever read. */
function styleOf(values: Record<string, string>): CSSStyleDeclaration {
  return { getPropertyValue: (name: string) => values[name] ?? '' } as unknown as CSSStyleDeclaration;
}

const base: ArtFitConfig = { box: [0.1, 0.1, 0.9, 0.9], aspect: 1.5 };

describe('resolveConfig', () => {
  it('falls back to the documented defaults when nothing is set', () => {
    const c = resolveConfig(base, styleOf({}));
    expect(c.region).toEqual({ l: 0, t: 0, r: 0, b: 0 });
    expect(c.fill).toBe(0.88);
    expect(c.anchor).toEqual([0.5, 0.5]);
    expect(c.mode).toBe('contain');
    expect(c.scale).toBe(1);
    expect(c.bleed).toBe(false);
    expect(c.depth).toBe(1);
    expect(c.box).toEqual(base.box);
    expect(c.aspect).toBe(1.5);
  });

  it('takes the config values over the defaults', () => {
    const c = resolveConfig(
      {
        ...base,
        region: { l: 0.4, r: 0.1 },
        fill: 0.7,
        anchor: [0.2, 0.8],
        mode: 'cover',
        scale: 1.2,
        bleed: true,
        depth: 2,
      },
      styleOf({}),
    );
    expect(c.region).toEqual({ l: 0.4, t: 0, r: 0.1, b: 0 });
    expect(c.fill).toBe(0.7);
    expect(c.anchor).toEqual([0.2, 0.8]);
    expect(c.mode).toBe('cover');
    expect(c.scale).toBe(1.2);
    expect(c.bleed).toBe(true);
    expect(c.depth).toBe(2);
  });

  it('lets CSS custom properties override the config, so queries can retune the art', () => {
    const c = resolveConfig(
      { ...base, region: { l: 0.4 }, fill: 0.7, mode: 'cover', bleed: true },
      styleOf({
        '--art-l': '0.5',
        '--art-t': ' 0.1 ',
        '--art-fill': '0.96',
        '--art-ax': '0.6',
        '--art-mode': 'contain',
        '--art-bleed': '0',
        '--art-depth': '2.4',
        '--art-scale': '0.9',
      }),
    );
    expect(c.region.l).toBe(0.5);
    expect(c.region.t).toBe(0.1);
    expect(c.fill).toBe(0.96);
    expect(c.anchor).toEqual([0.6, 0.5]);
    expect(c.mode).toBe('contain');
    expect(c.bleed).toBe(false);
    expect(c.depth).toBe(2.4);
    expect(c.scale).toBe(0.9);
  });

  it('treats bleed as on for any positive number', () => {
    expect(resolveConfig(base, styleOf({ '--art-bleed': '1' })).bleed).toBe(true);
    expect(resolveConfig(base, styleOf({ '--art-bleed': '0.5' })).bleed).toBe(true);
    expect(resolveConfig(base, styleOf({ '--art-bleed': '0' })).bleed).toBe(false);
  });

  it('ignores values it cannot read rather than producing NaN', () => {
    const c = resolveConfig(
      { ...base, fill: 0.7, mode: 'cover' },
      styleOf({ '--art-fill': 'wide', '--art-mode': 'stretch', '--art-l': '', '--art-depth': 'NaN' }),
    );
    expect(c.fill).toBe(0.7);
    expect(c.mode).toBe('cover');
    expect(c.region.l).toBe(0);
    expect(c.depth).toBe(1);
    for (const n of [c.fill, c.scale, c.depth, c.region.l, c.region.t, c.region.r, c.region.b]) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });
});
