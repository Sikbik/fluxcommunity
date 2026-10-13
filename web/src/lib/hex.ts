/**
 * Hexagon geometry for the gauge, the bullets and the lattice patterns.
 * Pointy-top hexagons (a vertex at the top), matching the Flux symbol.
 */

export interface Point {
  x: number;
  y: number;
}

/** The six vertices of a pointy-top hexagon, clockwise from the top. */
export function hexVertices(cx: number, cy: number, r: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * (Math.PI / 180);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

const f = (n: number) => Number(n.toFixed(2));

export function pointsToPath(points: readonly Point[], close = false): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  const body = rest.map((p) => `L${f(p.x)} ${f(p.y)}`).join('');
  return `M${f(first.x)} ${f(first.y)}${body}${close ? 'Z' : ''}`;
}

export function hexPath(cx: number, cy: number, r: number): string {
  return pointsToPath(hexVertices(cx, cy, r), true);
}

/** Points along the closed polygon between normalised distances t0..t1 (0 = first vertex). */
export function polylineBetween(vertices: readonly Point[], t0: number, t1: number): Point[] {
  const n = vertices.length;
  if (n < 2 || t1 <= t0) return [];
  const edges: Array<{ a: Point; b: Point; len: number }> = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    edges.push({ a, b, len });
    total += len;
  }
  const d0 = Math.max(0, t0) * total;
  const d1 = Math.min(1, t1) * total;
  const out: Point[] = [];
  let acc = 0;
  const at = (edge: { a: Point; b: Point; len: number }, d: number): Point => {
    const k = edge.len === 0 ? 0 : (d - acc) / edge.len;
    return { x: edge.a.x + (edge.b.x - edge.a.x) * k, y: edge.a.y + (edge.b.y - edge.a.y) * k };
  };
  for (const edge of edges) {
    const start = acc;
    const end = acc + edge.len;
    if (end > d0 && start < d1) {
      if (out.length === 0) out.push(at(edge, Math.max(d0, start)));
      if (end >= d1) {
        out.push(at(edge, d1));
        break;
      }
      out.push({ x: edge.b.x, y: edge.b.y });
    }
    acc = end;
  }
  return out;
}

/**
 * Path data for `count` equal segments of a hexagon outline, each shortened by `gap`
 * (a fraction of the whole perimeter) so the ring reads as separate cells.
 */
export function hexSegments(cx: number, cy: number, r: number, count: number, gap = 0.012): string[] {
  const verts = hexVertices(cx, cy, r);
  const paths: string[] = [];
  const step = 1 / count;
  for (let i = 0; i < count; i++) {
    const t0 = i * step + gap / 2;
    const t1 = (i + 1) * step - gap / 2;
    paths.push(pointsToPath(polylineBetween(verts, t0, t1)));
  }
  return paths;
}
