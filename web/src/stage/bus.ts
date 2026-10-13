/**
 * The stage bus: the ONLY coupling between the DOM page and the WebGL stage.
 *
 * - Page sections (DOM) write what is happening: which section is in view, how
 *   far the page has scrolled, which card is hovered, that a block just landed.
 * - The stage (WebGL, `web/src/stage/`) reads this store every frame, never the
 *   other way round, and writes back only the `stage` slice (quality, fps).
 * - Sections never import three.js. The stage never imports section code.
 *
 * Read in the render loop with `useStageBus.getState()`. Subscribe in React with
 * `useStageBus((s) => s.section)`. Pulses and focus regions are transient inputs,
 * not app state; do not persist them.
 *
 * Anchors: a DOM element carrying `data-stage-anchor="symbol"` tells the stage
 * where on screen the Flux symbol should live (the stage reads its bounding rect
 * on resize and scroll). The hero places that element in its layout; the stage
 * sizes and positions the 3D symbol to match. If no anchor is mounted the symbol
 * is parked off-screen or hidden by the stage.
 */
import { create } from 'zustand';

export type SectionId = 'hero' | 'pulse' | 'gateways' | 'builds' | 'hosting' | 'play' | 'learn' | 'community';

export const SECTION_ORDER: readonly SectionId[] = [
  'hero',
  'pulse',
  'gateways',
  'builds',
  'hosting',
  'play',
  'learn',
  'community',
];

/** The page accent. `flux` is the brand blue; the others are the node tier colours. */
export type Accent = 'flux' | 'cumulus' | 'nimbus' | 'stratus';

/** 0 = no WebGL (CSS fallback is shown), 1 low, 2 medium, 3 high. Written by the stage. */
export type QualityTier = 0 | 1 | 2 | 3;

export type PulseKind =
  /** A new block landed. x/y null: the wave starts at the symbol or screen centre. */
  | 'block'
  /** The visitor pressed, clicked or tapped. x/y in viewport pixels. */
  | 'click'
  /** Something good happened (copied, submitted, launched). */
  | 'success'
  /** Something needs attention (offline, error). Rarely used. */
  | 'warn';

export interface Pulse {
  id: number;
  kind: PulseKind;
  /** Viewport pixels, or null for "from the stage's natural origin". */
  x: number | null;
  y: number | null;
  /** performance.now() when fired. */
  at: number;
  /** 0..1, how loud the wave should be. */
  strength: number;
}

/** A viewport rectangle the lattice should light up beneath (a hovered card, a focused field). */
export interface FocusRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 */
  strength: number;
}

/**
 * The first-visit intro. The page writes `pending` (play it) or `skip` (fast-forward / never play);
 * the stage writes `playing` and `done`. `off` means the intro is not wanted (reduced motion,
 * ?intro=0, or already seen this session).
 */
export type IntroState = 'off' | 'pending' | 'playing' | 'skip' | 'done';

export interface ChainClock {
  height: number;
  /** Epoch ms of the tip block. null before the first data arrives. */
  lastBlockAt: number | null;
  /** Expected interval between blocks, ms. 30 000 under Proof of Node. */
  intervalMs: number;
  /** True only when `height` and `lastBlockAt` come from the live API. */
  live: boolean;
}

export interface StageBusState {
  // ---- written by the page -------------------------------------------------
  /** The section dominating the viewport. */
  section: SectionId;
  /** 0..1 progress through the active section (0 as it enters, 1 as it leaves). */
  sectionProgress: number;
  /** 0..1 over the whole document. */
  pageProgress: number;
  /** Smoothed scroll velocity in px/s, signed (positive = scrolling down). */
  scrollVelocity: number;
  accent: Accent;
  /** Ambient (screensaver) mode: the stage switches to its cinematic preset. */
  ambient: boolean;
  /** prefers-reduced-motion, or the visitor's explicit choice. The stage must hold still. */
  reducedMotion: boolean;
  /** The tab is hidden or the page is behind an overlay; the stage should stop rendering. */
  paused: boolean;
  chain: ChainClock;
  intro: IntroState;
  /** Active hover or focus regions, newest last. Capped at 8 by the setter. */
  focus: FocusRegion[];
  /** Recent one-shot waves. The stage consumes by id; the setter keeps the last 16. */
  pulses: Pulse[];

  // ---- written by the stage ------------------------------------------------
  stage: {
    ready: boolean;
    quality: QualityTier;
    fps: number;
    /** Why the stage is not rendering, for the debug overlay and the fallback. */
    reason: 'ok' | 'no-webgl' | 'context-lost' | 'reduced-motion' | 'disabled';
  };

  // ---- actions ---------------------------------------------------------------
  setSection: (section: SectionId, progress: number) => void;
  setScroll: (pageProgress: number, velocity: number) => void;
  setAccent: (accent: Accent) => void;
  setAmbient: (ambient: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  setPaused: (paused: boolean) => void;
  setChain: (chain: Partial<ChainClock>) => void;
  setIntro: (intro: IntroState) => void;
  setFocus: (region: FocusRegion) => void;
  clearFocus: (id: string) => void;
  firePulse: (kind: PulseKind, x?: number | null, y?: number | null, strength?: number) => void;
  setStage: (stage: Partial<StageBusState['stage']>) => void;
}

let pulseSeq = 0;
const MAX_FOCUS = 8;
const MAX_PULSES = 16;

export const useStageBus = create<StageBusState>((set) => ({
  section: 'hero',
  sectionProgress: 0,
  pageProgress: 0,
  scrollVelocity: 0,
  accent: 'flux',
  ambient: false,
  reducedMotion: false,
  paused: false,
  chain: { height: 0, lastBlockAt: null, intervalMs: 30_000, live: false },
  intro: 'off',
  focus: [],
  pulses: [],
  stage: { ready: false, quality: 0, fps: 0, reason: 'ok' },

  setSection: (section, sectionProgress) => set({ section, sectionProgress }),
  setScroll: (pageProgress, scrollVelocity) => set({ pageProgress, scrollVelocity }),
  setAccent: (accent) => set({ accent }),
  setAmbient: (ambient) => set({ ambient }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setPaused: (paused) => set({ paused }),
  setChain: (chain) => set((s) => ({ chain: { ...s.chain, ...chain } })),
  setIntro: (intro) => set({ intro }),
  setFocus: (region) =>
    set((s) => {
      const rest = s.focus.filter((f) => f.id !== region.id);
      return { focus: [...rest, region].slice(-MAX_FOCUS) };
    }),
  clearFocus: (id) => set((s) => ({ focus: s.focus.filter((f) => f.id !== id) })),
  firePulse: (kind, x = null, y = null, strength = 1) =>
    set((s) => {
      const pulse: Pulse = { id: ++pulseSeq, kind, x, y, at: performance.now(), strength };
      return { pulses: [...s.pulses, pulse].slice(-MAX_PULSES) };
    }),
  setStage: (stage) => set((s) => ({ stage: { ...s.stage, ...stage } })),
}));
