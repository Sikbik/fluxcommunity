import type { CommunityApp } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { describeHealth } from '../health';
import { lifecycleOf } from '../lifecycle';
import { type AppEntry, makeLookup } from '../model';
import { BEFORE, CATEGORIES_SYNTH, SYNTH } from '../testkit';
import { clampPan, DEFAULT_CAMERA, pitchFor, ZOOM_MAX, ZOOM_MIN, zoomAbout } from './camera';
import { buildGraph } from './graph';
import {
  emphasisTargets,
  type LabelRequest,
  layoutLabels,
  lookOf,
  makeEmphasis,
  mixRgb,
  parseColor,
  placeCard,
  pulsePlan,
  rgba,
  visibilityOf,
} from './look';

const graph = buildGraph(SYNTH, CATEGORIES_SYNTH);
const lookup = makeLookup(SYNTH);
const NOW = BEFORE;

const appOf = (id: string): CommunityApp => {
  const app = SYNTH.find((a) => a.id === id);
  if (!app) throw new Error(id);
  return app;
};

function entryOf(
  id: string,
  health: Parameters<typeof describeHealth>[0],
  fresh = true,
  loaded = true,
): AppEntry {
  const app = appOf(id);
  return {
    app,
    order: 0,
    lifecycle: lifecycleOf(app, NOW, lookup),
    health: describeHealth(health, { loaded, freshness: fresh ? 'live' : 'cached' }, app.self === true),
  };
}

const probe = (state: 'up' | 'degraded' | 'down' | 'unknown', latencyMs: number | null = 120) => ({
  id: 'x',
  state,
  httpStatus: state === 'down' ? null : 200,
  latencyMs,
  checkedAt: new Date(NOW - 20_000).toISOString(),
  since: new Date(NOW - 86_400_000).toISOString(),
});

describe('parseColor', () => {
  it('reads hex, token triples and rgb()', () => {
    expect(parseColor('#3fdc95')).toEqual([63, 220, 149]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor(' 79 122 212 ')).toEqual([79, 122, 212]);
    expect(parseColor('rgb(10 20 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
  });

  it('rejects what it cannot read', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor('tomato')).toBeNull();
  });
});

describe('rgba and mixRgb', () => {
  it('formats and clamps alpha', () => {
    expect(rgba([1, 2, 3], 0.5)).toBe('rgba(1,2,3,0.5)');
    expect(rgba([1, 2, 3], 4)).toBe('rgba(1,2,3,1)');
    expect(rgba([1, 2, 3], -1)).toBe('rgba(1,2,3,0)');
  });

  it('mixes channels', () => {
    expect(mixRgb([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
  });
});

describe('lookOf', () => {
  it('reads a fresh up result as live with a solid mark', () => {
    const look = lookOf(entryOf('grid-view', probe('up', 142)), NOW);
    expect(look.tone).toBe('ok');
    expect(look.mark).toBe('live');
    expect(look.word).toBe('Live');
    expect(look.detail).toBe('142 ms');
  });

  it('never calls a stale result live', () => {
    const look = lookOf(entryOf('grid-view', probe('up'), false), NOW);
    expect(look.tone).toBe('warn');
    expect(look.mark).toBe('clock');
    expect(look.word).not.toBe('Live');
  });

  it('gives each state its own shape', () => {
    expect(lookOf(entryOf('grid-view', probe('degraded')), NOW).mark).toBe('alert');
    expect(lookOf(entryOf('grid-view', probe('down', null)), NOW).mark).toBe('cross');
    expect(lookOf(entryOf('grid-view', probe('unknown', null)), NOW).mark).toBe('dash');
    expect(lookOf(entryOf('grid-view', undefined, true, false), NOW).mark).toBe('dots');
    const marks = new Set(
      [probe('up'), probe('degraded'), probe('down', null), probe('unknown', null)].map(
        (h) => lookOf(entryOf('grid-view', h), NOW).mark,
      ),
    );
    expect(marks.size).toBe(4);
  });

  it('does not claim a status the payload does not support', () => {
    const offline = lookOf(entryOf('grid-view', probe('up'), false, true), NOW);
    expect(offline.word).not.toBe('Live');
    const none = lookOf(entryOf('grid-view', undefined), NOW);
    expect(none.tone).toBe('off');
    expect(none.word).toBe('Not checked yet');
  });

  it('marks the site itself', () => {
    const self = SYNTH.find((a) => a.self);
    if (!self) throw new Error('no self app');
    const look = lookOf(entryOf(self.id, undefined), NOW);
    expect(look.tone).toBe('self');
    expect(look.mark).toBe('reticle');
    expect(look.word).toBe('You are here');
  });

  it('carries the lifecycle', () => {
    expect(lookOf(entryOf('old-ledger', probe('up')), NOW).lifecycle).toBe('retiring');
    expect(lookOf(entryOf('orbit-pay', probe('up')), NOW).lifecycle).toBe('new');
    expect(lookOf(entryOf('grid-view', probe('up')), NOW).lifecycle).toBe('live');
  });
});

describe('visibilityOf', () => {
  it('shows everything without a filter', () => {
    const v = visibilityOf(graph, null);
    expect(Array.from(v).every((x) => x === 1)).toBe(true);
  });

  it('hides what the filter hides and keeps a hub with a visible app', () => {
    const v = visibilityOf(graph, new Set(['node-watch']));
    const at = (id: string) => v[graph.index.get(id) ?? -1];
    expect(at('node-watch')).toBe(1);
    expect(at('node-sizer')).toBe(0);
    expect(at('grid-view')).toBe(0);
    expect(at('hub:nodes')).toBe(1);
    expect(at('hub:network')).toBe(0);
    expect(at('flux')).toBe(1);
  });

  it('hides every hub when nothing matches', () => {
    const v = visibilityOf(graph, new Set());
    expect(v[graph.index.get('hub:nodes') ?? -1]).toBe(0);
  });
});

describe('emphasisTargets', () => {
  const all = visibilityOf(graph, null);

  it('is calm with no focus', () => {
    const e = emphasisTargets(graph, all, [], makeEmphasis(graph.nodes.length));
    expect(e.any).toBe(false);
    expect(Array.from(e.presence).every((p) => p === 1)).toBe(true);
    expect(Array.from(e.lit).every((p) => p === 0)).toBe(true);
  });

  it('lights the focus and its neighbours and dims the rest', () => {
    const f = graph.index.get('node-watch') ?? -1;
    const e = emphasisTargets(graph, all, [f], makeEmphasis(graph.nodes.length));
    expect(e.any).toBe(true);
    expect(e.lit[f]).toBe(1);
    const hub = graph.index.get('hub:nodes') ?? -1;
    expect(e.lit[hub]).toBeCloseTo(0.6);
    const far = graph.index.get('hub:education') ?? -1;
    expect(e.lit[far]).toBe(0);
    expect(e.presence[far]).toBeLessThan(1);
    expect(e.presence[f]).toBe(1);
  });

  it('keeps a filtered-out node faint, and readable while it is focused', () => {
    const vis = visibilityOf(graph, new Set(['grid-view']));
    const hidden = graph.index.get('node-watch') ?? -1;
    const quiet = emphasisTargets(graph, vis, [], makeEmphasis(graph.nodes.length));
    expect(quiet.presence[hidden]).toBeLessThan(0.3);
    const focused = emphasisTargets(graph, vis, [hidden], makeEmphasis(graph.nodes.length));
    expect(focused.presence[hidden]).toBeGreaterThan(0.6);
  });

  it('ignores a missing focus', () => {
    const e = emphasisTargets(graph, all, [-1], makeEmphasis(graph.nodes.length));
    expect(e.any).toBe(false);
  });
});

describe('layoutLabels', () => {
  const req = (
    index: number,
    x: number,
    y: number,
    priority = 0,
    extra: Partial<LabelRequest> = {},
  ): LabelRequest => ({
    index,
    x,
    y,
    r: 8,
    w: 60,
    h: 14,
    priority,
    ...extra,
  });

  it('puts a label to the right of its node by default', () => {
    const [p] = layoutLabels([req(1, 100, 100)], 600, 400);
    expect(p?.side).toBe('right');
    expect(p?.x).toBeGreaterThan(100);
  });

  it('uses the left side near the right edge', () => {
    const [p] = layoutLabels([req(1, 560, 100)], 600, 400);
    expect(p?.side).toBe('left');
  });

  it('never overlaps labels and drops what cannot fit', () => {
    const many = Array.from({ length: 12 }, (_, i) => req(i, 200 + (i % 3) * 8, 150 + i * 2, i));
    const out = layoutLabels(many, 600, 400);
    expect(out.length).toBeLessThan(many.length);
    const rects = out.map((p) => {
      const r = many.find((m) => m.index === p.index) as LabelRequest;
      const x0 = p.side === 'right' ? p.x : p.side === 'left' ? p.x - r.w : p.x - r.w / 2;
      return { x0, x1: x0 + r.w, y0: p.y - r.h / 2, y1: p.y + r.h / 2 };
    });
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const A = rects[a];
        const B = rects[b];
        if (!A || !B) continue;
        const clash = A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0;
        expect(clash).toBe(false);
      }
    }
  });

  it('lets the higher priority win a contested spot', () => {
    const out = layoutLabels([req(1, 100, 100, 1), req(2, 100, 103, 9)], 600, 400);
    expect(out.find((p) => p.index === 2)?.side).toBe('right');
  });

  it('always places a forced label, even over others', () => {
    const crowded = [req(1, 100, 100, 5), req(2, 100, 100, 4), req(3, 100, 100, 3)];
    const forced = req(9, 100, 100, 0, { force: true });
    const out = layoutLabels([...crowded, forced], 600, 400);
    expect(out.some((p) => p.index === 9)).toBe(true);
  });

  it('keeps labels inside the frame', () => {
    const out = layoutLabels([req(1, 10, 10), req(2, 590, 390)], 600, 400);
    for (const p of out) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
    }
  });
});

describe('pulsePlan', () => {
  const plan = pulsePlan(graph);

  it('lights every spoke and tether once', () => {
    const lit = graph.edges.filter((e) => e.kind === 'spoke' || e.kind === 'tether');
    expect(plan).toHaveLength(lit.length);
    expect(plan.filter((l) => l.from === 0)).toHaveLength(graph.nodes.filter((n) => n.kind === 'hub').length);
  });

  it('sends light out from the centre before it reaches the apps', () => {
    const spokes = plan.filter((l) => l.from === 0);
    for (const leg of plan.filter((l) => l.from !== 0)) {
      const arrival = spokes.find((s) => s.to === leg.from);
      expect(arrival).toBeDefined();
      expect(leg.delay).toBeGreaterThanOrEqual((arrival?.delay ?? 0) + (arrival?.dur ?? 0) - 1e-9);
    }
  });

  it('is over in about two seconds', () => {
    const end = Math.max(...plan.map((l) => l.delay + l.dur));
    expect(end).toBeLessThan(2.6);
  });
});

describe('camera helpers', () => {
  const vp = { width: 1000, height: 600, unit: 200 };

  it('picks a shallower pitch for wide frames', () => {
    expect(pitchFor(2)).toBeCloseTo(0.52);
    expect(pitchFor(0.6)).toBeGreaterThan(pitchFor(1.4));
    expect(pitchFor(0.2)).toBeCloseTo(pitchFor(0.6));
  });

  it('zooms about a point and keeps it still', () => {
    const cam = { ...DEFAULT_CAMERA };
    const px = 800;
    const py = 200;
    const before = {
      x: (px - vp.width / 2 - cam.panX) / cam.zoom,
      y: (py - vp.height / 2 - cam.panY) / cam.zoom,
    };
    zoomAbout(cam, vp, px, py, 1.5);
    const after = {
      x: (px - vp.width / 2 - cam.panX) / cam.zoom,
      y: (py - vp.height / 2 - cam.panY) / cam.zoom,
    };
    expect(cam.zoom).toBeCloseTo(1.5);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('bounds the zoom', () => {
    const cam = { ...DEFAULT_CAMERA };
    zoomAbout(cam, vp, 500, 300, 100);
    expect(cam.zoom).toBe(ZOOM_MAX);
    zoomAbout(cam, vp, 500, 300, 0.001);
    expect(cam.zoom).toBe(ZOOM_MIN);
  });

  it('keeps the pan within reach', () => {
    const cam = { ...DEFAULT_CAMERA, panX: 9999, panY: -9999 };
    clampPan(cam, vp);
    expect(Math.abs(cam.panX)).toBeLessThan(vp.width);
    expect(Math.abs(cam.panY)).toBeLessThan(vp.height);
  });
});

describe('placeCard', () => {
  const size = { w: 200, h: 80 };
  const vw = 1000;
  const vh = 600;

  it('goes beside the node, away from the middle of the picture', () => {
    const right = placeCard(600, 300, 14, size, vw, vh, []);
    expect(right.left).toBeGreaterThan(600);
    const left = placeCard(400, 300, 14, size, vw, vh, []);
    expect(left.left + size.w).toBeLessThan(400);
    // Near the right edge the card has to come back inside.
    const edge = placeCard(900, 300, 14, size, vw, vh, []);
    expect(edge.left + size.w).toBeLessThan(900);
  });

  it('stays inside the view', () => {
    for (const [x, y] of [
      [10, 10],
      [990, 10],
      [10, 590],
      [990, 590],
      [500, 300],
    ] as const) {
      const p = placeCard(x, y, 14, size, vw, vh, []);
      expect(p.left).toBeGreaterThanOrEqual(8);
      expect(p.top).toBeGreaterThanOrEqual(8);
      expect(p.left + size.w).toBeLessThanOrEqual(vw - 8 + 1e-6);
      expect(p.top + size.h).toBeLessThanOrEqual(vh - 8 + 1e-6);
    }
  });

  it('keeps off the other nodes when another side is free', () => {
    // A node sits where the preferred side would put the card.
    const others = [{ x: 860, y: 300, r: 16 }];
    const p = placeCard(800, 300, 14, size, vw, vh, others);
    const covers =
      others[0] !== undefined &&
      others[0].x > p.left &&
      others[0].x < p.left + size.w &&
      others[0].y > p.top &&
      others[0].y < p.top + size.h;
    expect(covers).toBe(false);
  });

  it("keeps off the side the node's own label is on", () => {
    // On the left of the picture the card prefers the right side; with the label there it goes left.
    const free = placeCard(300, 300, 14, size, vw, vh, []);
    expect(free.left).toBeLessThan(300);
    const clear = placeCard(300, 300, 14, size, vw, vh, [], 'left');
    expect(clear.left).toBeGreaterThan(300);
    // A label above or below does not push the card off its usual side.
    const same = placeCard(300, 300, 14, size, vw, vh, [], 'above');
    expect(same.left).toBe(free.left);
  });

  it('still returns a place when every side is crowded', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => ({
      x: 100 + (i % 10) * 90,
      y: 60 + Math.floor(i / 10) * 140,
      r: 20,
    }));
    const p = placeCard(500, 300, 14, size, vw, vh, crowd);
    expect(Number.isFinite(p.left)).toBe(true);
    expect(Number.isFinite(p.top)).toBe(true);
  });
});
