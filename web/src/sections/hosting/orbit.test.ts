import { describe, expect, it } from 'vitest';
import {
  CENTER,
  chipFraction,
  distanceToGate,
  dotCountFor,
  dotPosition,
  gateFraction,
  hexNorm,
  hexPerimeterPoint,
  hexPoints,
  hexVertexOffsets,
  MAX_DOTS,
  MAX_PERIOD_S,
  MIN_DOTS,
  MIN_PERIOD_S,
  nextPayeeIndex,
  ORBIT_R,
  orbitPeriodSec,
  tierAtOffset,
  VIEW,
  ZONE_EDGE,
} from './orbit';

const SQRT3 = Math.sqrt(3);
const out = { x: 0, y: 0 };

describe('hexNorm', () => {
  it('is the circumradius for every vertex and every outline point', () => {
    const r = 100;
    for (let i = 0; i < 6; i++) {
      const a = ((-90 + i * 60) * Math.PI) / 180;
      expect(hexNorm(r * Math.cos(a), r * Math.sin(a))).toBeCloseTo(r, 9);
    }
    for (let k = 0; k < 24; k++) {
      hexPerimeterPoint(r, k / 24, out);
      expect(hexNorm(out.x, out.y)).toBeCloseTo(r, 9);
    }
  });

  it('is zero at the centre and grows outward', () => {
    expect(hexNorm(0, 0)).toBe(0);
    expect(hexNorm(10, 0)).toBeLessThan(hexNorm(20, 0));
    expect(hexNorm(0, 10)).toBeLessThan(hexNorm(0, 20));
  });

  it('is symmetric in all four quadrants', () => {
    expect(hexNorm(30, 40)).toBeCloseTo(hexNorm(-30, 40), 9);
    expect(hexNorm(30, 40)).toBeCloseTo(hexNorm(30, -40), 9);
    expect(hexNorm(30, 40)).toBeCloseTo(hexNorm(-30, -40), 9);
  });

  it('puts the flat side at r * sqrt(3) / 2 on the horizontal axis', () => {
    // Pointy-top: the flat sides are left and right.
    expect(hexNorm((100 * SQRT3) / 2, 0)).toBeCloseTo(100, 9);
  });
});

describe('hexPerimeterPoint', () => {
  it('starts at the top vertex: that is the payout gate', () => {
    hexPerimeterPoint(100, 0, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(-100, 9);
  });

  it('visits the vertices every sixth of the way, clockwise', () => {
    hexPerimeterPoint(100, 1 / 6, out);
    expect(out.x).toBeCloseTo((100 * SQRT3) / 2, 9);
    expect(out.y).toBeCloseTo(-50, 9);
    hexPerimeterPoint(100, 0.5, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(100, 9);
  });

  it('interpolates along an edge', () => {
    hexPerimeterPoint(100, 1 / 12, out);
    expect(out.x).toBeCloseTo((100 * SQRT3) / 4, 9);
    expect(out.y).toBeCloseTo(-75, 9);
  });

  it('wraps', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    hexPerimeterPoint(100, 0.25, a);
    hexPerimeterPoint(100, 1.25, b);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    hexPerimeterPoint(100, -0.75, b);
    expect(b.x).toBeCloseTo(a.x, 9);
  });

  it('reuses the object it is given', () => {
    const o = { x: 0, y: 0 };
    expect(hexPerimeterPoint(50, 0.3, o)).toBe(o);
  });
});

describe('hexPoints', () => {
  it('lists six vertices starting at the top', () => {
    const pts = hexPoints(300, 300, 100).split(' ');
    expect(pts).toHaveLength(6);
    expect(pts[0]).toBe('300,200');
    expect(pts[3]).toBe('300,400');
  });
});

describe('hexVertexOffsets', () => {
  it('is six unit vectors, the first straight up', () => {
    const v = hexVertexOffsets();
    expect(v).toHaveLength(6);
    expect(v[0]).toEqual({ x: 0, y: -1 });
    expect(v[3]).toEqual({ x: 0, y: 1 });
    for (const p of v) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 2);
  });
});

describe('tierAtOffset', () => {
  it('maps each orbit and the space around it to its tier', () => {
    expect(tierAtOffset(0, -ORBIT_R.cumulus)).toBe('cumulus');
    expect(tierAtOffset(0, -ORBIT_R.nimbus)).toBe('nimbus');
    expect(tierAtOffset(0, -ORBIT_R.stratus)).toBe('stratus');
    expect(tierAtOffset(0, 0)).toBe('stratus');
  });

  it('tiles with no gaps: walking out from the centre only ever advances stratus, nimbus, cumulus', () => {
    const seen: string[] = [];
    for (let y = 0; y <= ZONE_EDGE.limit; y += 1) {
      const t = tierAtOffset(0, -y);
      if (t && seen[seen.length - 1] !== t) seen.push(t);
    }
    expect(seen).toEqual(['stratus', 'nimbus', 'cumulus']);
  });

  it('is null outside the diagram', () => {
    expect(tierAtOffset(0, -(ZONE_EDGE.limit + 1))).toBeNull();
    expect(tierAtOffset(ZONE_EDGE.limit * 2, 0)).toBeNull();
  });

  it('follows the hexagon, not a circle: the corners of a ring are further out than its sides', () => {
    // Along the horizontal axis the Cumulus outline is at 262 * sqrt(3)/2 = 226.9; that point is still Cumulus.
    expect(tierAtOffset(226, 0)).toBe('cumulus');
    // A point at the same Euclidean distance as the top vertex but on the flat side is inside Nimbus's zone edge.
    expect(tierAtOffset(0, -(ZONE_EDGE.outer + 1))).toBe('cumulus');
    expect(tierAtOffset(0, -(ZONE_EDGE.outer - 1))).toBe('nimbus');
  });
});

describe('dotCountFor', () => {
  it('is about one dot per 150 nodes', () => {
    expect(dotCountFor(3583)).toBe(24);
    expect(dotCountFor(1689)).toBe(11);
    expect(dotCountFor(1830)).toBe(12);
  });

  it('stays within a readable range', () => {
    expect(dotCountFor(0)).toBe(MIN_DOTS);
    expect(dotCountFor(Number.NaN)).toBe(MIN_DOTS);
    expect(dotCountFor(10)).toBe(MIN_DOTS);
    expect(dotCountFor(1_000_000)).toBe(MAX_DOTS);
  });
});

describe('orbitPeriodSec', () => {
  it('keeps the relative pace of the tiers honest', () => {
    const c = orbitPeriodSec(3583);
    const n = orbitPeriodSec(1689);
    // 3,583 / 1,689 nodes: Cumulus takes about 2.12x as long to come around.
    expect(c / n).toBeCloseTo(3583 / 1689, 5);
  });

  it('clamps', () => {
    expect(orbitPeriodSec(10)).toBe(MIN_PERIOD_S);
    expect(orbitPeriodSec(10_000_000)).toBe(MAX_PERIOD_S);
    expect(orbitPeriodSec(0)).toBe(MAX_PERIOD_S);
  });
});

describe('dots on an orbit', () => {
  it('spaces dots evenly and wraps', () => {
    const n = 8;
    const positions = Array.from({ length: n }, (_, i) => dotPosition(i, n, 0.9));
    const sorted = [...positions].sort((a, b) => a - b);
    for (let i = 1; i < n; i++) {
      expect((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)).toBeCloseTo(1 / n, 9);
    }
    expect(Math.max(...positions)).toBeLessThan(1);
  });

  it('picks the dot closest to the gate as the next payee', () => {
    const n = 10;
    const phase = 0.04; // dots at 0.04, 0.14, ... 0.94
    const idx = nextPayeeIndex(n, phase);
    expect(dotPosition(idx, n, phase)).toBeCloseTo(0.94, 9);
  });

  it('measures the approach to the gate', () => {
    expect(distanceToGate(0.9)).toBeCloseTo(0.1, 9);
    expect(distanceToGate(0)).toBe(0);
    expect(distanceToGate(0.01)).toBeCloseTo(0.99, 9);
  });
});

describe('fractions for DOM overlays', () => {
  it('puts every gate on the vertical axis, outer first', () => {
    const c = gateFraction('cumulus');
    const n = gateFraction('nimbus');
    const s = gateFraction('stratus');
    expect([c.x, n.x, s.x]).toEqual([0.5, 0.5, 0.5]);
    expect(c.y).toBeLessThan(n.y);
    expect(n.y).toBeLessThan(s.y);
    expect(s.y).toBeLessThan(0.5);
  });

  it('mirrors them for the chips on the bottom vertices', () => {
    for (const tier of ['cumulus', 'nimbus', 'stratus'] as const) {
      expect(chipFraction(tier).y).toBeCloseTo(1 - gateFraction(tier).y, 9);
    }
    expect(CENTER / VIEW).toBe(0.5);
  });
});
