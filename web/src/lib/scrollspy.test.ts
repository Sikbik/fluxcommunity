import { describe, expect, it } from 'vitest';
import {
  pageProgress,
  pickActiveSection,
  type SectionBox,
  sectionProgress,
  smoothVelocity,
} from './scrollspy';

const boxes: SectionBox[] = [
  { id: 'hero', top: 0, height: 900 },
  { id: 'pulse', top: 900, height: 1000 },
  { id: 'gateways', top: 1900, height: 800 },
  { id: 'builds', top: 2700, height: 1200 },
];
const VH = 800;
const DOC = 3900;

describe('pickActiveSection', () => {
  it('is null with no boxes', () => {
    expect(pickActiveSection([], 0, VH, DOC)).toBeNull();
  });

  it('pins the first section at the top', () => {
    expect(pickActiveSection(boxes, 0, VH, DOC)).toMatchObject({ id: 'hero', index: 0, progress: 0 });
  });

  it('switches when the focus line crosses a section top', () => {
    // focus line = scrollY + 0.4 * 800 = scrollY + 320
    expect(pickActiveSection(boxes, 570, VH, DOC)?.id).toBe('hero'); // 890 < 900
    expect(pickActiveSection(boxes, 580, VH, DOC)?.id).toBe('pulse'); // 900
    expect(pickActiveSection(boxes, 1600, VH, DOC)?.id).toBe('gateways'); // 1920
  });

  it('pins the last section at the bottom even when its top is below the focus line', () => {
    const r = pickActiveSection(boxes, DOC - VH, VH, DOC);
    expect(r?.id).toBe('builds');
  });

  it('respects a custom focus fraction', () => {
    expect(pickActiveSection(boxes, 500, VH, DOC, 0.5)?.id).toBe('pulse'); // 500 + 400 = 900
    expect(pickActiveSection(boxes, 500, VH, DOC, 0.25)?.id).toBe('hero'); // 700
  });
});

describe('progress', () => {
  it('sectionProgress is 0 before the top and 1 past the bottom', () => {
    const b = boxes[1] as SectionBox;
    expect(sectionProgress(b, 800)).toBe(0);
    expect(sectionProgress(b, 900)).toBe(0);
    expect(sectionProgress(b, 1400)).toBeCloseTo(0.5);
    expect(sectionProgress(b, 5000)).toBe(1);
  });

  it('sectionProgress tolerates zero height', () => {
    expect(sectionProgress({ id: 'x', top: 0, height: 0 }, 10)).toBe(0);
  });

  it('pageProgress spans the scrollable range', () => {
    expect(pageProgress(0, 800, 3900)).toBe(0);
    expect(pageProgress(1550, 800, 3900)).toBeCloseTo(0.5);
    expect(pageProgress(3100, 800, 3900)).toBe(1);
    expect(pageProgress(10, 800, 800)).toBe(0);
  });
});

describe('smoothVelocity', () => {
  it('moves toward the instantaneous velocity', () => {
    // 100 px in 100 ms is 1000 px/s
    const v1 = smoothVelocity(0, 100, 100);
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(1000);
    const v2 = smoothVelocity(v1, 100, 100);
    expect(v2).toBeGreaterThan(v1);
  });

  it('decays to exactly zero when scrolling stops', () => {
    let v = 800;
    for (let i = 0; i < 80; i++) v = smoothVelocity(v, 0, 16);
    expect(v).toBe(0);
  });

  it('is signed', () => {
    expect(smoothVelocity(0, -50, 50)).toBeLessThan(0);
  });

  it('ignores a zero time step', () => {
    expect(smoothVelocity(123, 10, 0)).toBe(123);
  });
});
