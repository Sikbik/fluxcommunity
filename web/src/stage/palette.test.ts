import { describe, expect, it } from 'vitest';
import { ACCENTS, AccentBlender, hexToLinear, srgbToLinear } from './palette';

describe('palette', () => {
  it('converts sRGB to linear', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 9);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    const [r, g, b] = hexToLinear(0x2b61d1);
    expect(r).toBeCloseTo(0.0242, 3);
    expect(g).toBeCloseTo(0.1195, 3);
    expect(b).toBeCloseTo(0.6376, 3);
  });

  it('crossfades about 95 percent in 600 ms', () => {
    const b = new AccentBlender('flux', 0.6);
    b.setTarget('stratus');
    const from = ACCENTS.flux.base[2];
    const to = ACCENTS.stratus.base[2];
    for (let i = 0; i < 36; i++) b.step(1 / 60);
    const done = (b.current.base[2] - from) / (to - from);
    expect(done).toBeGreaterThan(0.93);
    expect(done).toBeLessThan(0.97);
    for (let i = 0; i < 300; i++) b.step(1 / 60);
    expect(b.current.base[2]).toBeCloseTo(to, 3);
    expect(b.step(1 / 60)).toBe(false);
  });

  it('can jump instantly for reduced motion', () => {
    const b = new AccentBlender('flux');
    b.setTarget('nimbus');
    b.step(0.016, true);
    expect(b.current.hot[0]).toBeCloseTo(ACCENTS.nimbus.hot[0], 9);
  });
});
