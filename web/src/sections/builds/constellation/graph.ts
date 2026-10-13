/**
 * The constellation's layout: pure data, no canvas. A centre node (the Flux mark), one hub per
 * category on a hexagonal ring, and each app on a small orbit around its hub. Edges are the spokes
 * from the centre, the tethers from a hub to its apps, the arcs between apps by the same builder,
 * and a handover arc from a retiring app to the app that replaces it.
 *
 * The layout is deterministic: the same catalog always gives the same picture.
 */
import type { AppCategory, CategoryInfo, CommunityApp } from '@shared/catalog';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type NodeKind = 'center' | 'hub' | 'app';

export interface Orbit {
  /** The centre of the orbit (a point beyond the hub, away from the middle). */
  cx: number;
  cy: number;
  cz: number;
  /** Two perpendicular unit vectors spanning the orbit's plane. */
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  /** Radians at rest. */
  phase: number;
  /** Radians per second; the sign alternates by hub. */
  speed: number;
  /** A little depth wobble along the radial direction (dx, dz are that direction). */
  wobble: number;
  dx: number;
  dz: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  category: AppCategory | null;
  /** The catalog app id, for app nodes. */
  appId: string | null;
  /** Position at rest, world units. Apps move on their orbit; see `positionAt`. */
  p: Vec3;
  orbit: Orbit | null;
}

export type EdgeKind = 'spoke' | 'tether' | 'builder' | 'handover';

export interface GraphEdge {
  id: string;
  a: number;
  b: number;
  kind: EdgeKind;
  /** The builder handle for a builder arc; the date for a handover. */
  label: string | null;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Node id to index. */
  index: ReadonlyMap<string, number>;
  /** Indices of the neighbours of each node (every edge kind). */
  neighbours: ReadonlyArray<readonly number[]>;
  /** Largest horizontal distance of any node from the centre, orbit included, for fitting. */
  extent: number;
  /** Largest height of any node above or below the plane of the hubs, orbit included. */
  height: number;
}

export const CENTER_ID = 'flux';
export const HUB_RADIUS = 1.0;
/** The floor sits below the nodes. */
export const FLOOR_Y = -0.62;

const HUB_LIFT = [0.1, -0.08, 0.14, -0.12, 0.06, -0.1] as const;
/** The apps of a hub float this far above it, so a cluster never sits on top of its own hub. */
const CLUSTER_LIFT = 0.34;

export function hubId(category: AppCategory): string {
  return `hub:${category}`;
}

/** Deterministic pseudo-random in [0, 1) from a string, for small stable offsets. */
export function unit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface BuildOptions {
  /** Short date label for a handover arc, by retiring app id. */
  handoverLabel?: (app: CommunityApp) => string | null;
}

export function buildGraph(
  apps: readonly CommunityApp[],
  categories: readonly CategoryInfo[],
  options: BuildOptions = {},
): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const index = new Map<string, number>();

  const add = (n: GraphNode): number => {
    index.set(n.id, nodes.length);
    nodes.push(n);
    return nodes.length - 1;
  };

  add({
    id: CENTER_ID,
    kind: 'center',
    label: 'Flux',
    category: null,
    appId: null,
    p: { x: 0, y: 0, z: 0 },
    orbit: null,
  });

  const populated = categories.filter((c) => apps.some((a) => a.category === c.id));
  const n = populated.length;

  populated.forEach((cat, i) => {
    // Flat-top ring: with six hubs they sit on the vertices of a hexagon, one straight ahead.
    const theta = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    const dx = Math.cos(theta);
    const dz = Math.sin(theta);
    const lift = HUB_LIFT[i % HUB_LIFT.length] ?? 0;
    const hub: Vec3 = { x: dx * HUB_RADIUS, y: lift, z: dz * HUB_RADIUS };
    const hubIndex = add({
      id: hubId(cat.id),
      kind: 'hub',
      label: cat.label,
      category: cat.id,
      appId: null,
      p: hub,
      orbit: null,
    });
    edges.push({ id: `spoke:${cat.id}`, a: 0, b: hubIndex, kind: 'spoke', label: null });

    const members = apps.filter((a) => a.category === cat.id);
    const m = members.length;
    // The cluster floats above and beyond the hub, on a ring in the plane facing the middle: tangent
    // and up. One app has no ring to be on and simply hovers there.
    const tx = -dz;
    const tz = dx;
    const out = m === 1 ? 0.3 : 0.22;
    const centre: Vec3 = { x: hub.x + dx * out, y: hub.y + CLUSTER_LIFT, z: hub.z + dz * out };
    const radius = m === 1 ? 0 : 0.22 + 0.04 * (m - 1);
    const dir = i % 2 === 0 ? 1 : -1;
    members.forEach((app, j) => {
      const phase = i * 0.9 + (j * 2 * Math.PI) / m + unit(app.id) * 0.5;
      const orbit: Orbit = {
        cx: centre.x,
        cy: centre.y,
        cz: centre.z,
        ux: tx,
        uy: 0,
        uz: tz,
        vx: 0,
        vy: 1,
        vz: 0,
        radius,
        phase,
        speed: dir * (0.045 + unit(`${app.id}:s`) * 0.025),
        wobble: 0.06,
        dx,
        dz,
      };
      const p = positionAt(orbit, 0, { x: 0, y: 0, z: 0 });
      const idx = add({
        id: app.id,
        kind: 'app',
        label: app.name,
        category: app.category,
        appId: app.id,
        p,
        orbit,
      });
      edges.push({ id: `tether:${app.id}`, a: hubIndex, b: idx, kind: 'tether', label: null });
    });
  });

  // Arcs between apps by the same builder: every pair of up to three, else a chain.
  const byBuilder = new Map<string, string[]>();
  for (const app of apps) {
    if (!app.builder) continue;
    const list = byBuilder.get(app.builder) ?? [];
    list.push(app.id);
    byBuilder.set(app.builder, list);
  }
  for (const [builder, ids] of byBuilder) {
    if (ids.length < 2) continue;
    const pairs: Array<[string, string]> = [];
    if (ids.length <= 3) {
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) pairs.push([ids[a] as string, ids[b] as string]);
      }
    } else {
      for (let a = 1; a < ids.length; a++) pairs.push([ids[a - 1] as string, ids[a] as string]);
    }
    for (const [a, b] of pairs) {
      const ia = index.get(a);
      const ib = index.get(b);
      if (ia === undefined || ib === undefined) continue;
      edges.push({ id: `builder:${a}:${b}`, a: ia, b: ib, kind: 'builder', label: builder });
    }
  }

  // The handover: a retiring app to the one that takes over.
  for (const app of apps) {
    if (!app.replacedBy) continue;
    const ia = index.get(app.id);
    const ib = index.get(app.replacedBy);
    if (ia === undefined || ib === undefined) continue;
    edges.push({
      id: `handover:${app.id}:${app.replacedBy}`,
      a: ia,
      b: ib,
      kind: 'handover',
      label: options.handoverLabel ? options.handoverLabel(app) : null,
    });
  }

  const neighbours: number[][] = nodes.map(() => []);
  for (const e of edges) {
    neighbours[e.a]?.push(e.b);
    neighbours[e.b]?.push(e.a);
  }

  let extent = 0;
  let height = 0;
  for (const nd of nodes) {
    const r = nd.orbit ? nd.orbit.radius : 0;
    extent = Math.max(extent, Math.hypot(nd.p.x, nd.p.z) + r);
    height = Math.max(height, Math.abs(nd.orbit ? nd.orbit.cy : nd.p.y) + r);
  }
  return { nodes, edges, index, neighbours, extent, height };
}

/** Where an orbiting node is `t` seconds after rest, written into `out`. */
export function positionAt(orbit: Orbit, t: number, out: Vec3): Vec3 {
  const a = orbit.phase + orbit.speed * t;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = orbit.radius;
  const w = orbit.wobble * Math.sin(a * 2);
  out.x = orbit.cx + r * (c * orbit.ux + s * orbit.vx) + orbit.dx * w;
  out.y = orbit.cy + r * (c * orbit.uy + s * orbit.vy);
  out.z = orbit.cz + r * (c * orbit.uz + s * orbit.vz) + orbit.dz * w;
  return out;
}
