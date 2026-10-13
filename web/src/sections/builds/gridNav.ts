/**
 * Arrow-key travel across a visual grid, from the cells' rectangles. Pure and framework-free.
 *
 * Left and right step through reading order. Up and down move to the nearest row above or below and
 * pick the cell whose centre is closest to the current one, so a ragged last row behaves.
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

const cx = (b: Box) => b.left + b.width / 2;
const cy = (b: Box) => b.top + b.height / 2;

/**
 * The index to move to from `current`, or `current` itself when there is nowhere to go.
 * `boxes` are in reading order (DOM order).
 */
export function nextIndex(boxes: readonly Box[], current: number, dir: Direction): number {
  const n = boxes.length;
  if (n === 0) return -1;
  if (current < 0 || current >= n) return 0;
  switch (dir) {
    case 'home':
      return 0;
    case 'end':
      return n - 1;
    case 'left':
      return Math.max(0, current - 1);
    case 'right':
      return Math.min(n - 1, current + 1);
    default:
      break;
  }

  const from = boxes[current];
  if (!from) return current;
  const down = dir === 'down';
  // Candidate rows lie wholly beyond the current cell's centre line in the direction of travel.
  const tolerance = Math.min(from.height * 0.3, 24);
  let rowTop = Number.NaN;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    if (!b || i === current) continue;
    const beyond = down ? cy(b) > cy(from) + tolerance : cy(b) < cy(from) - tolerance;
    if (!beyond) continue;
    const better = Number.isNaN(rowTop) || (down ? b.top < rowTop : b.top > rowTop);
    if (better) rowTop = b.top;
  }
  if (Number.isNaN(rowTop)) return current;

  let best = current;
  let bestDx = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    if (!b || i === current) continue;
    if (Math.abs(b.top - rowTop) > tolerance) continue;
    const dx = Math.abs(cx(b) - cx(from));
    if (dx < bestDx) {
      bestDx = dx;
      best = i;
    }
  }
  return best;
}
