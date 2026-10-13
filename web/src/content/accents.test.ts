import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCENT_SCALES } from './accents';

const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');

/** The declarations inside `html[data-accent="<name>"] { ... }`. */
function block(name: string): string {
  const start = css.indexOf(`html[data-accent="${name}"] {`);
  expect(start, `block for ${name}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('accent scales stay in step with tokens.css', () => {
  for (const [name, scale] of Object.entries(ACCENT_SCALES)) {
    it(name, () => {
      const b = block(name);
      for (const [step, hex] of Object.entries(scale)) {
        expect(b).toContain(`--accent-${step}: ${hex};`);
      }
    });
  }
});

describe('contrast of the accent text role on the darkest and lightest ink', () => {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  const textRole: Record<string, string> = {
    flux: '#86a1da',
    cumulus: '#36d3ff',
    nimbus: '#c77dff',
    stratus: '#ffc857',
  };
  const solid: Record<string, { bg: string; fg: string }> = {
    flux: { bg: '#2b61d1', fg: '#ffffff' },
    cumulus: { bg: '#36d3ff', fg: '#04101a' },
    nimbus: { bg: '#c77dff', fg: '#04101a' },
    stratus: { bg: '#ffc857', fg: '#04101a' },
  };

  for (const name of Object.keys(textRole)) {
    it(`${name}: accent text is at least 4.5:1 on ink-0 and ink-3, solid is at least 4.5:1 under its label`, () => {
      expect(ratio(textRole[name] as string, '#080a0f')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(textRole[name] as string, '#22272e')).toBeGreaterThanOrEqual(4.5);
      const s = solid[name] as { bg: string; fg: string };
      expect(ratio(s.bg, s.fg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
