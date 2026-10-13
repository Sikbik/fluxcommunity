import { describe, expect, it } from 'vitest';
import { clamp, clamp01, damp, invLerp, lerp, mod, remap, roundTo, smoothstep } from './math';

describe('math', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });

  it('lerps and inverts', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(invLerp(0, 10, 2.5)).toBe(0.25);
    expect(invLerp(3, 3, 5)).toBe(0);
  });

  it('remaps with clamping', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(20, 0, 10, 0, 100)).toBe(100);
  });

  it('smoothsteps', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('damps toward the target and never overshoots', () => {
    let v = 0;
    for (let i = 0; i < 120; i++) v = damp(v, 1, 12, 1 / 60);
    expect(v).toBeGreaterThan(0.99);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('modulos positively', () => {
    expect(mod(-1, 10)).toBe(9);
    expect(mod(11, 10)).toBe(1);
  });

  it('rounds', () => {
    expect(roundTo(1.2345, 2)).toBe(1.23);
  });
});
