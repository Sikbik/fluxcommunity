/**
 * The four page accents, for the switcher, the command deck and anything that needs a
 * name or a swatch. The CSS lives in styles/tokens.css (html[data-accent]).
 */
import type { Accent } from '@/stage/bus';

export interface AccentInfo {
  id: Accent;
  name: string;
  /** Swatch colour (the accent's structural colour). */
  swatch: string;
  /** What it stands for, for the tooltip. */
  note: string;
}

export const ACCENT_INFO: Record<Accent, AccentInfo> = {
  flux: { id: 'flux', name: 'Flux blue', swatch: '#2b61d1', note: 'The brand colour' },
  cumulus: { id: 'cumulus', name: 'Cumulus cyan', swatch: '#36d3ff', note: 'The Cumulus tier colour' },
  nimbus: { id: 'nimbus', name: 'Nimbus violet', swatch: '#c77dff', note: 'The Nimbus tier colour' },
  stratus: { id: 'stratus', name: 'Stratus amber', swatch: '#ffc857', note: 'The Stratus tier colour' },
};

export const ACCENT_LIST: readonly AccentInfo[] = [
  ACCENT_INFO.flux,
  ACCENT_INFO.cumulus,
  ACCENT_INFO.nimbus,
  ACCENT_INFO.stratus,
];

/**
 * The full 50..950 scale of each accent, as in styles/tokens.css. Used by the kit gallery
 * to show all four at once (the live tokens only hold the active one). A test keeps this
 * in step with the CSS.
 */
export const ACCENT_SCALES: Record<Accent, Record<string, string>> = {
  flux: {
    '50': '#f2f5fb',
    '100': '#e5ebf8',
    '200': '#cedaf0',
    '300': '#abbee4',
    '400': '#86a1da',
    '500': '#4f7ad4',
    '600': '#2b61d1',
    '700': '#1b44a3',
    '800': '#0e2c71',
    '900': '#061843',
    '950': '#030c26',
  },
  cumulus: {
    '50': '#f4fcff',
    '100': '#e7f8ff',
    '200': '#cef2ff',
    '300': '#a0e6ff',
    '400': '#36d3ff',
    '500': '#02b0d8',
    '600': '#0c8aaa',
    '700': '#02677f',
    '800': '#014557',
    '900': '#002934',
    '950': '#00141c',
  },
  nimbus: {
    '50': '#fbf7ff',
    '100': '#f5ecff',
    '200': '#ecd8ff',
    '300': '#ddb7ff',
    '400': '#c77dff',
    '500': '#a95fdf',
    '600': '#8942ba',
    '700': '#682991',
    '800': '#471567',
    '900': '#2a093e',
    '950': '#150322',
  },
  stratus: {
    '50': '#fffbf5',
    '100': '#fff7e8',
    '200': '#ffeed1',
    '300': '#ffe0a7',
    '400': '#ffc857',
    '500': '#daa42a',
    '600': '#ae8004',
    '700': '#835f00',
    '800': '#593f00',
    '900': '#352500',
    '950': '#1d1100',
  },
};
