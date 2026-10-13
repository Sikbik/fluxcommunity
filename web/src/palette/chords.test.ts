import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SECTION_ORDER } from '@/stage/bus';
import { createChordMachine } from './chords';
import {
  CHORD_PREFIX,
  CHORD_TIMEOUT_MS,
  columnsFor,
  SECTION_CHORDS,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  sectionForChord,
  shortcutsIn,
} from './shortcuts';

describe('chord machine', () => {
  it('arms on g and jumps on a section letter', () => {
    const m = createChordMachine();
    expect(m.press('g', 0)).toEqual({ type: 'armed' });
    expect(m.armed(100)).toBe(true);
    expect(m.press('b', 200)).toEqual({ type: 'jump', section: 'builds' });
    expect(m.armed(300)).toBe(false);
  });

  it('maps every letter in the brief', () => {
    const expected: Record<string, string> = {
      h: 'hero',
      n: 'pulse',
      s: 'gateways',
      b: 'builds',
      r: 'hosting',
      p: 'play',
      l: 'learn',
      c: 'community',
    };
    for (const [key, section] of Object.entries(expected)) {
      const m = createChordMachine();
      m.press('g', 0);
      expect(m.press(key, 10)).toEqual({ type: 'jump', section });
    }
  });

  it('ignores a letter that was not preceded by g', () => {
    const m = createChordMachine();
    expect(m.press('b', 0)).toEqual({ type: 'ignored' });
  });

  it('times out', () => {
    const m = createChordMachine(1000);
    m.press('g', 0);
    expect(m.armed(1001)).toBe(false);
    expect(m.press('b', 1001)).toEqual({ type: 'ignored' });
  });

  it('is cancelled by any other key', () => {
    const m = createChordMachine();
    m.press('g', 0);
    expect(m.press('x', 100)).toEqual({ type: 'ignored' });
    expect(m.press('b', 200)).toEqual({ type: 'ignored' });
  });

  it('g g re-arms instead of jumping', () => {
    const m = createChordMachine();
    m.press('g', 0);
    expect(m.press('g', 100)).toEqual({ type: 'armed' });
    expect(m.press('c', 200)).toEqual({ type: 'jump', section: 'community' });
  });

  it('is case insensitive (caps lock, shift)', () => {
    const m = createChordMachine();
    m.press('G', 0);
    expect(m.press('B', 10)).toEqual({ type: 'jump', section: 'builds' });
  });

  it('can be reset', () => {
    const m = createChordMachine();
    m.press('g', 0);
    m.reset();
    expect(m.press('b', 10)).toEqual({ type: 'ignored' });
  });

  it('uses the shared timeout by default', () => {
    const m = createChordMachine();
    m.press('g', 0);
    expect(m.armed(CHORD_TIMEOUT_MS)).toBe(true);
    expect(m.armed(CHORD_TIMEOUT_MS + 1)).toBe(false);
  });
});

describe('the shortcut registry', () => {
  it('gives every section exactly one chord letter', () => {
    const sections = SECTION_CHORDS.map((c) => c.section);
    expect([...sections].sort()).toEqual([...SECTION_ORDER].sort());
    const keys = SECTION_CHORDS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Never the keys the shell owns.
    for (const k of keys) expect(['a', 'g']).not.toContain(k);
    expect(sectionForChord('b')).toBe('builds');
    expect(sectionForChord('z')).toBeNull();
  });

  it('documents a navigation shortcut for every chord', () => {
    const nav = SHORTCUTS.filter((s) => s.group === 'Navigation');
    expect(nav).toHaveLength(SECTION_CHORDS.length);
    for (const s of nav) {
      expect(s.keys[0]?.[0]).toBe(CHORD_PREFIX);
    }
  });

  it('lays the sheet out in columns of about equal height', () => {
    const two = columnsFor(2);
    expect(two).toHaveLength(2);
    expect(two.flat().sort()).toEqual([...SHORTCUT_GROUPS].sort());
    const heights = two.map((groups) => groups.reduce((n, g) => n + shortcutsIn(g).length + 1, 0));
    expect(Math.abs((heights[0] ?? 0) - (heights[1] ?? 0))).toBeLessThanOrEqual(3);
    // Each column keeps the groups in their reading order.
    for (const groups of two) {
      const at = groups.map((g) => SHORTCUT_GROUPS.indexOf(g));
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
    expect(columnsFor(1)[0]).toEqual([...SHORTCUT_GROUPS]);
  });

  it('has unique ids', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The shell registers the global hotkeys; this table documents them. If either side changes
  // without the other, this fails, so the sheet cannot drift from what the keys really do.
  it('matches the global hotkeys the shell registers', () => {
    const source = readFileSync(fileURLToPath(new URL('../app/shell.ts', import.meta.url)), 'utf8');
    const start = source.indexOf('export function useGlobalHotkeys');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('{ priority: 0 }', start));
    const registered = [...body.matchAll(/^\s+(?:'([^']+)'|([a-z]+)):\s*\(\)/gm)].map(
      (m) => m[1] ?? (m[2] as string),
    );
    expect(registered.length).toBeGreaterThanOrEqual(4);

    const documented = SHORTCUTS.filter((s) => s.owner === 'shell').flatMap((s) =>
      s.keys.map((k) => k.join(' ')),
    );
    expect([...documented].sort()).toEqual([...registered].sort());
  });
});
