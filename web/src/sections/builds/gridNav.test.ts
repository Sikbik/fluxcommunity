import { describe, expect, it } from 'vitest';
import { type Box, nextIndex } from './gridNav';

/** A grid of `count` cells, `cols` per row, 100x80 each with a 10 px gap. */
function grid(count: number, cols: number): Box[] {
  return Array.from({ length: count }, (_, i) => ({
    left: (i % cols) * 110,
    top: Math.floor(i / cols) * 90,
    width: 100,
    height: 80,
  }));
}

describe('nextIndex', () => {
  const g = grid(10, 4); // rows of 4, 4, 2

  it('steps left and right through reading order, clamped at the ends', () => {
    expect(nextIndex(g, 5, 'right')).toBe(6);
    expect(nextIndex(g, 5, 'left')).toBe(4);
    expect(nextIndex(g, 0, 'left')).toBe(0);
    expect(nextIndex(g, 9, 'right')).toBe(9);
  });

  it('moves straight up and down a column', () => {
    expect(nextIndex(g, 1, 'down')).toBe(5);
    expect(nextIndex(g, 5, 'up')).toBe(1);
    expect(nextIndex(g, 5, 'down')).toBe(9);
  });

  it('lands on the nearest cell of a shorter last row', () => {
    expect(nextIndex(g, 7, 'down')).toBe(9);
    expect(nextIndex(g, 6, 'down')).toBe(9);
    expect(nextIndex(g, 4, 'down')).toBe(8);
  });

  it('stays put at the top and the bottom edge', () => {
    expect(nextIndex(g, 2, 'up')).toBe(2);
    expect(nextIndex(g, 9, 'down')).toBe(9);
  });

  it('jumps to the first and last cell', () => {
    expect(nextIndex(g, 5, 'home')).toBe(0);
    expect(nextIndex(g, 5, 'end')).toBe(9);
  });

  it('copes with a single column and with nothing at all', () => {
    const col = grid(3, 1);
    expect(nextIndex(col, 0, 'down')).toBe(1);
    expect(nextIndex(col, 2, 'up')).toBe(1);
    expect(nextIndex([], 0, 'down')).toBe(-1);
  });

  it('starts at the first cell when the current index is out of range', () => {
    expect(nextIndex(g, -1, 'down')).toBe(0);
    expect(nextIndex(g, 99, 'right')).toBe(0);
  });

  it('treats a full-width divider row as a row of its own', () => {
    // A spanning divider between two rows of two.
    const boxes: Box[] = [
      { left: 0, top: 0, width: 100, height: 80 },
      { left: 110, top: 0, width: 100, height: 80 },
      { left: 0, top: 90, width: 210, height: 20 },
      { left: 0, top: 120, width: 100, height: 80 },
      { left: 110, top: 120, width: 100, height: 80 },
    ];
    // Down from the right cell of the first row goes to the divider's row first.
    expect(nextIndex(boxes, 1, 'down')).toBe(2);
  });
});
