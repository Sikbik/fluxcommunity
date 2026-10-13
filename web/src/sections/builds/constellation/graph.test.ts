import { CATEGORIES, COMMUNITY_APPS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { CATEGORIES_SYNTH, makeApp, populated, SYNTH } from '../testkit';
import {
  angleDelta,
  DEFAULT_CAMERA,
  DISTANCE,
  fitUnit,
  PITCH_MAX,
  type Projected,
  pick,
  project,
  stretchFor,
  yawToFace,
} from './camera';
import { buildGraph, CENTER_ID, type Graph, hubId, positionAt, unit, type Vec3 } from './graph';

const graph = buildGraph(SYNTH, CATEGORIES_SYNTH);

/** How many builder arcs a catalog should produce: every pair of up to three builds, else a chain. */
function expectedBuilderArcs(apps: readonly { builder: string | null }[]): number {
  const counts = new Map<string, number>();
  for (const a of apps) if (a.builder) counts.set(a.builder, (counts.get(a.builder) ?? 0) + 1);
  let n = 0;
  for (const c of counts.values()) {
    if (c < 2) continue;
    n += c <= 3 ? (c * (c - 1)) / 2 : c - 1;
  }
  return n;
}

function checkShape(g: Graph, apps: typeof SYNTH, categories: typeof CATEGORIES_SYNTH): void {
  const hubs = populated(apps, categories);
  expect(g.nodes[0]?.id).toBe(CENTER_ID);
  expect(g.nodes.filter((n) => n.kind === 'hub')).toHaveLength(hubs.length);
  expect(g.nodes.filter((n) => n.kind === 'app')).toHaveLength(apps.length);
  expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
  expect(g.edges.filter((e) => e.kind === 'spoke')).toHaveLength(hubs.length);
  expect(g.edges.filter((e) => e.kind === 'tether')).toHaveLength(apps.length);
  expect(g.edges.filter((e) => e.kind === 'builder')).toHaveLength(expectedBuilderArcs(apps));
}

describe('buildGraph', () => {
  it('has a centre, a hub per populated category and a node per app', () => {
    checkShape(graph, SYNTH, CATEGORIES_SYNTH);
    expect(graph.nodes.filter((n) => n.kind === 'hub')).toHaveLength(5);
  });

  it('holds for the real catalog, whatever is in it', () => {
    const real = buildGraph(COMMUNITY_APPS, CATEGORIES);
    checkShape(real, COMMUNITY_APPS, CATEGORIES);
    const handovers = COMMUNITY_APPS.filter(
      (a) => a.replacedBy && COMMUNITY_APPS.some((b) => b.id === a.replacedBy),
    );
    expect(real.edges.filter((e) => e.kind === 'handover')).toHaveLength(handovers.length);
  });

  it('joins every hub to the centre and every app to its hub', () => {
    for (const t of graph.edges.filter((e) => e.kind === 'tether')) {
      const hub = graph.nodes[t.a];
      const app = graph.nodes[t.b];
      expect(hub?.kind).toBe('hub');
      expect(app?.kind).toBe('app');
      expect(hub?.id).toBe(hubId(app?.category as never));
    }
    for (const s of graph.edges.filter((e) => e.kind === 'spoke')) {
      expect(s.a).toBe(0);
      expect(graph.nodes[s.b]?.kind).toBe('hub');
    }
  });

  it('draws builder arcs only between apps of one builder', () => {
    const arcs = graph.edges.filter((e) => e.kind === 'builder');
    // Acme Labs has three builds (three pairs); no one else has two.
    expect(arcs).toHaveLength(3);
    for (const arc of arcs) {
      const a = SYNTH.find((x) => x.id === graph.nodes[arc.a]?.appId);
      const b = SYNTH.find((x) => x.id === graph.nodes[arc.b]?.appId);
      expect(a?.builder).toBeTruthy();
      expect(a?.builder).toBe(b?.builder);
      expect(arc.label).toBe(a?.builder);
    }
  });

  it('chains the builds of a builder with more than three', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => makeApp({ id, builder: 'Prolific' }));
    const g = buildGraph(many, CATEGORIES_SYNTH);
    const arcs = g.edges.filter((e) => e.kind === 'builder');
    expect(arcs).toHaveLength(4);
    expect(arcs.map((e) => [g.nodes[e.a]?.id, g.nodes[e.b]?.id])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
    ]);
  });

  it('draws one handover from the retiring app to its replacement', () => {
    const handovers = graph.edges.filter((e) => e.kind === 'handover');
    expect(handovers).toHaveLength(1);
    const h = handovers[0];
    expect(graph.nodes[h?.a ?? -1]?.id).toBe('old-ledger');
    expect(graph.nodes[h?.b ?? -1]?.id).toBe('orbit-pay');
  });

  it('labels a handover when asked to', () => {
    const g = buildGraph(SYNTH, CATEGORIES_SYNTH, { handoverLabel: (a) => `Retiring ${a.retiresOn}` });
    expect(g.edges.find((e) => e.kind === 'handover')?.label).toBe('Retiring 2026-11-01');
  });

  it('ignores a handover to an app that is not in the catalog', () => {
    const dangling = makeApp({ id: 'x', lifecycle: 'retiring', replacedBy: 'nope', retiresOn: '2026-11-01' });
    const g = buildGraph([dangling], CATEGORIES_SYNTH);
    expect(g.edges.filter((e) => e.kind === 'handover')).toHaveLength(0);
  });

  it('places the hubs on a ring around the centre, evenly', () => {
    const hubs = graph.nodes.filter((n) => n.kind === 'hub');
    for (const h of hubs) expect(Math.hypot(h.p.x, h.p.z)).toBeCloseTo(1, 5);
    const angles = hubs.map((h) => Math.atan2(h.p.z, h.p.x)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) =>
      i === 0 ? a + Math.PI * 2 - (angles.at(-1) ?? 0) : a - (angles[i - 1] ?? 0),
    );
    for (const g of gaps) expect(g).toBeCloseTo((Math.PI * 2) / hubs.length, 5);
  });

  it('keeps each app near its own hub, alone in its category or not', () => {
    for (const n of graph.nodes.filter((x) => x.kind === 'app')) {
      const hub = graph.nodes[graph.index.get(hubId(n.category as never)) ?? -1];
      expect(hub).toBeDefined();
      if (!hub) continue;
      const d = Math.hypot(n.p.x - hub.p.x, n.p.y - hub.p.y, n.p.z - hub.p.z);
      expect(d).toBeLessThan(0.75);
      expect(d).toBeGreaterThan(0.1);
    }
  });

  it('lays out a category with a single app as well as a crowded one', () => {
    const one = buildGraph([makeApp({ id: 'solo', category: 'education' })], CATEGORIES_SYNTH);
    expect(one.nodes).toHaveLength(3);
    const solo = one.nodes.find((n) => n.id === 'solo');
    const hub = one.nodes.find((n) => n.kind === 'hub');
    expect(solo && hub).toBeTruthy();
    if (solo && hub) {
      expect(Math.hypot(solo.p.x - hub.p.x, solo.p.z - hub.p.z)).toBeGreaterThan(0.2);
      expect(Number.isFinite(solo.p.y)).toBe(true);
    }
    expect(one.extent).toBeGreaterThan(1);
    expect(one.extent).toBeLessThan(2);
  });

  it('is deterministic', () => {
    const again = buildGraph(SYNTH, CATEGORIES_SYNTH);
    expect(again.nodes.map((n) => n.p)).toEqual(graph.nodes.map((n) => n.p));
    expect(again.edges.map((e) => e.id)).toEqual(graph.edges.map((e) => e.id));
  });

  it('skips a category with no apps and copes with an empty catalog', () => {
    const some = buildGraph(
      SYNTH.filter((a) => a.category === 'nodes'),
      CATEGORIES_SYNTH,
    );
    expect(some.nodes.filter((n) => n.kind === 'hub')).toHaveLength(1);
    const none = buildGraph([], CATEGORIES_SYNTH);
    expect(none.nodes).toHaveLength(1);
    expect(none.edges).toHaveLength(0);
    expect(none.extent).toBe(0);
  });

  it('records neighbours both ways', () => {
    const a = graph.index.get('node-watch') ?? -1;
    const hub = graph.index.get('hub:nodes') ?? -1;
    expect(graph.neighbours[a]).toContain(hub);
    expect(graph.neighbours[hub]).toContain(a);
    for (const e of graph.edges) {
      expect(graph.neighbours[e.a]).toContain(e.b);
      expect(graph.neighbours[e.b]).toContain(e.a);
    }
  });

  it('moves orbiting nodes smoothly and returns them to rest at t = 0', () => {
    const node = graph.nodes.find((n) => n.id === 'grid-view');
    expect(node?.orbit).toBeTruthy();
    if (!node?.orbit) return;
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    positionAt(node.orbit, 0, out);
    expect(out).toEqual(node.p);
    positionAt(node.orbit, 30, out);
    expect(Math.hypot(out.x - node.p.x, out.y - node.p.y, out.z - node.p.z)).toBeGreaterThan(0);
  });
});

describe('unit', () => {
  it('is stable and in range', () => {
    expect(unit('noxide')).toBe(unit('noxide'));
    expect(unit('noxide')).not.toBe(unit('atlas'));
    for (const id of ['a', 'b', 'noxide']) {
      expect(unit(id)).toBeGreaterThanOrEqual(0);
      expect(unit(id)).toBeLessThan(1);
    }
  });
});

describe('project', () => {
  const vp = { width: 1000, height: 600, unit: 200 };
  const out = (): Projected => ({ x: 0, y: 0, scale: 0, depth: 0 });

  it('puts the origin at the centre of the viewport', () => {
    const p = project({ x: 0, y: 0, z: 0 }, { ...DEFAULT_CAMERA }, vp, out());
    expect(p.x).toBeCloseTo(500, 5);
    expect(p.y).toBeCloseTo(300, 5);
    expect(p.scale).toBeCloseTo(1, 5);
  });

  it('makes nearer things bigger and farther things smaller', () => {
    const cam = { ...DEFAULT_CAMERA, yaw: 0, pitch: 0.4 };
    const near = project({ x: 0, y: 0, z: -1 }, cam, vp, out());
    const far = project({ x: 0, y: 0, z: 1 }, cam, vp, out());
    expect(near.scale).toBeGreaterThan(1);
    expect(far.scale).toBeLessThan(1);
    expect(near.depth).toBeLessThan(far.depth);
  });

  it('shows a farther point higher on the screen when looking down', () => {
    const cam = { ...DEFAULT_CAMERA, yaw: 0, pitch: 0.6 };
    const near = project({ x: 0, y: 0, z: -1 }, cam, vp, out());
    const far = project({ x: 0, y: 0, z: 1 }, cam, vp, out());
    expect(far.y).toBeLessThan(near.y);
  });

  it('turns about the vertical axis with yaw', () => {
    const a = project({ x: 1, y: 0, z: 0 }, { ...DEFAULT_CAMERA, yaw: 0, pitch: 0 }, vp, out());
    expect(a.x).toBeGreaterThan(500);
    const b = project({ x: 1, y: 0, z: 0 }, { ...DEFAULT_CAMERA, yaw: Math.PI, pitch: 0 }, vp, out());
    expect(b.x).toBeLessThan(500);
  });

  it('never divides by zero for a point at the eye', () => {
    const p = project({ x: 0, y: 0, z: -DISTANCE }, { ...DEFAULT_CAMERA, pitch: 0 }, vp, out());
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.scale)).toBe(true);
  });

  it('applies zoom and pan', () => {
    const base = project({ x: 1, y: 0, z: 0 }, { ...DEFAULT_CAMERA, yaw: 0, pitch: 0 }, vp, out());
    const zoomed = project({ x: 1, y: 0, z: 0 }, { ...DEFAULT_CAMERA, yaw: 0, pitch: 0, zoom: 2 }, vp, out());
    expect(zoomed.x - 500).toBeCloseTo((base.x - 500) * 2, 5);
    const panned = project({ x: 0, y: 0, z: 0 }, { ...DEFAULT_CAMERA, panX: 40, panY: -20 }, vp, out());
    expect(panned.x).toBeCloseTo(540, 5);
    expect(panned.y).toBeCloseTo(280, 5);
  });
});

describe('yawToFace', () => {
  it('turns every node to the front', () => {
    for (const n of graph.nodes.filter((x) => x.kind === 'app')) {
      const cam = { ...DEFAULT_CAMERA, yaw: yawToFace(n.p), pitch: 0 };
      const p = project(n.p, cam, { width: 100, height: 100, unit: 50 }, { x: 0, y: 0, scale: 0, depth: 0 });
      expect(p.x).toBeCloseTo(50, 4);
      // It is the nearest side of its distance from the centre.
      expect(p.depth).toBeCloseTo(-Math.hypot(n.p.x, n.p.z), 4);
    }
  });
});

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(Math.PI * 2 - 0.1, 0.1)).toBeCloseTo(0.2);
  });
});

describe('fitUnit', () => {
  it('fits a graph inside the viewport and never collapses', () => {
    const g = { extent: 1.6, height: 0.8, stretch: 1, pitch: 0.55 };
    const u = fitUnit(1200, 620, g);
    expect(u * (1.6 + 0.42)).toBeLessThanOrEqual(600 + 1e-6);
    expect(u * (1.6 * Math.sin(0.55) + 0.8 * Math.cos(0.55) + 0.3)).toBeLessThanOrEqual(310 + 1e-6);
    expect(fitUnit(10, 10, { ...g, extent: 5 })).toBeGreaterThanOrEqual(40);
  });

  it('uses a wide frame by stretching the world, never by shrinking it', () => {
    const g = { extent: 1.6, height: 0.8, stretch: 1, pitch: 0.55 };
    const square = fitUnit(700, 700, g);
    const wide = fitUnit(1400, 700, { ...g, stretch: stretchFor(2) });
    expect(wide).toBeLessThanOrEqual(square * 2);
    expect(wide).toBeGreaterThan(0);
  });
});

describe('pick', () => {
  it('chooses the nearer of two overlapping targets', () => {
    const t = [
      { x: 100, y: 100, r: 14, depth: 0.5 },
      { x: 104, y: 100, r: 14, depth: -0.5 },
    ];
    expect(pick(t, 102, 100)).toBe(1);
  });

  it('returns -1 when nothing is within reach and honours slack', () => {
    const t = [{ x: 100, y: 100, r: 10, depth: 0 }];
    expect(pick(t, 140, 100)).toBe(-1);
    expect(pick(t, 116, 100)).toBe(-1);
    expect(pick(t, 116, 100, 8)).toBe(0);
  });

  it('skips missing targets', () => {
    expect(pick([null, { x: 5, y: 5, r: 9, depth: 0 }], 5, 5)).toBe(1);
  });
});

describe('camera limits', () => {
  it('keeps the pitch below straight down', () => {
    expect(PITCH_MAX).toBeLessThan(Math.PI / 2);
  });
});
