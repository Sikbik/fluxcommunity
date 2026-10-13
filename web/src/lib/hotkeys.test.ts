import { describe, expect, it } from 'vitest';
import { comboLabels, matchCombo, parseCombo } from './hotkeys';

const ev = (
  key: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }> = {},
) => ({
  key,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe('parseCombo', () => {
  it('parses modifiers and keys', () => {
    expect(parseCombo('mod+k')).toMatchObject({ key: 'k', mod: true });
    expect(parseCombo('shift+/')).toMatchObject({ key: '/', shift: true });
    expect(parseCombo('Esc')).toMatchObject({ key: 'escape' });
    expect(parseCombo('?')).toMatchObject({ key: '?', shift: null });
    expect(parseCombo('ctrl+alt+d')).toMatchObject({ key: 'd', ctrl: true, alt: true });
    expect(parseCombo('+')).toMatchObject({ key: '+' });
  });
});

describe('matchCombo', () => {
  it('maps mod to Ctrl off Apple platforms and Command on them', () => {
    const c = parseCombo('mod+k');
    expect(matchCombo(ev('k', { ctrl: true }), c, false)).toBe(true);
    expect(matchCombo(ev('k', { meta: true }), c, false)).toBe(false);
    expect(matchCombo(ev('k', { meta: true }), c, true)).toBe(true);
    expect(matchCombo(ev('k', { ctrl: true }), c, true)).toBe(false);
  });

  it('is case-insensitive on the key', () => {
    expect(matchCombo(ev('K', { ctrl: true, shift: true }), parseCombo('mod+k'), false)).toBe(true);
  });

  it('rejects stray modifiers on plain keys', () => {
    const c = parseCombo('a');
    expect(matchCombo(ev('a'), c, false)).toBe(true);
    expect(matchCombo(ev('a', { ctrl: true }), c, false)).toBe(false);
    expect(matchCombo(ev('a', { alt: true }), c, false)).toBe(false);
  });

  it('lets punctuation ignore shift', () => {
    expect(matchCombo(ev('?', { shift: true }), parseCombo('?'), false)).toBe(true);
    expect(matchCombo(ev('/'), parseCombo('/'), false)).toBe(true);
  });

  it('requires shift when asked', () => {
    expect(matchCombo(ev('k', { ctrl: true }), parseCombo('mod+shift+k'), false)).toBe(false);
    expect(matchCombo(ev('k', { ctrl: true, shift: true }), parseCombo('mod+shift+k'), false)).toBe(true);
  });
});

describe('comboLabels', () => {
  it('labels per platform', () => {
    expect(comboLabels('mod+k', false)).toEqual(['Ctrl', 'K']);
    expect(comboLabels('mod+k', true)).toEqual(['⌘', 'K']);
    expect(comboLabels('escape', false)).toEqual(['Esc']);
    expect(comboLabels('?', false)).toEqual(['?']);
  });
});
