// What each quality tier costs and buys (docs/DESIGN.md section 10). The governor chooses the tier;
// the engine applies this table. Changing tier only resizes buffers and draw ranges.

import type { QualityTier } from './bus';

export interface TierBudget {
  tier: QualityTier;
  label: 'none' | 'low' | 'medium' | 'high';
  /** Lattice cells instanced (a draw range over the sorted disc). */
  cells: number;
  /** Dust sprites drawn. */
  dust: number;
  /** Cap on devicePixelRatio. */
  dprCap: number;
  /** MSAA samples on the HDR scene target. */
  msaa: number;
  /** Bloom, aberration, grain, tone mapping through the post chain. False draws straight to the canvas. */
  post: boolean;
  /** Levels in the bloom pyramid. */
  bloomLevels: number;
  /** The first bloom level is a quarter of the scene (true) or half (false). */
  bloomQuarter: boolean;
  chroma: boolean;
  grain: number;
}

export const TIER_BUDGETS: Record<QualityTier, TierBudget> = {
  0: {
    tier: 0,
    label: 'none',
    cells: 0,
    dust: 0,
    dprCap: 1,
    msaa: 0,
    post: false,
    bloomLevels: 0,
    bloomQuarter: true,
    chroma: false,
    grain: 0,
  },
  1: {
    tier: 1,
    label: 'low',
    cells: 1500,
    dust: 800,
    dprCap: 1,
    msaa: 0,
    post: false,
    bloomLevels: 0,
    bloomQuarter: true,
    chroma: false,
    grain: 0.5,
  },
  2: {
    tier: 2,
    label: 'medium',
    cells: 3500,
    dust: 2000,
    dprCap: 1.5,
    msaa: 2,
    post: true,
    bloomLevels: 4,
    bloomQuarter: true,
    chroma: true,
    grain: 0.7,
  },
  3: {
    tier: 3,
    label: 'high',
    cells: 6000,
    dust: 4000,
    dprCap: 2,
    msaa: 4,
    post: true,
    bloomLevels: 5,
    bloomQuarter: false,
    chroma: true,
    grain: 1,
  },
};

export const MAX_CELLS = TIER_BUDGETS[3].cells;
export const MAX_DUST = TIER_BUDGETS[3].dust;

export function budgetFor(tier: QualityTier): TierBudget {
  return TIER_BUDGETS[tier];
}
