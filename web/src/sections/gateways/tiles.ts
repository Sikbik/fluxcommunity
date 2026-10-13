/**
 * Presentation specs for the gateway tiles, keyed by catalog id. Facts (name, tagline, url,
 * host) stay in `shared/catalog`; this is only how each door is dressed: which corner is
 * hot, how hard the lattice lights, where its art sits in each tile shape, and which
 * micro animation it plays. Where the art sits in each tile shape is CSS (GatewayTile.module.css),
 * so media and container queries can retune it.
 */
import type { GatewayKind } from '@shared/catalog';
import type { PanelCorner } from '@/ui';

export type Tone = 'hero' | 'standard' | 'quiet';

export type FxId = 'cloud' | 'edge' | 'ai' | 'games' | 'docs' | 'explorer' | 'node' | 'site' | 'wallet';

export interface TileSpec {
  id: string;
  tone: Tone;
  fx: FxId;
  hot: PanelCorner | 'none';
  pattern: PanelCorner | 'none';
  /** Maximum tilt in degrees (the design says up to 5). */
  tilt: number;
  /** How brightly the lattice lights beneath the tile (0..1). */
  focus: number;
  /** Idle float: seconds per cycle and phase offset. */
  float: readonly [number, number];
}

/** The mono kind label above the name. Presentation only; the glyph comes from the kind. */
export const KIND_LABEL: Record<GatewayKind, string> = {
  cloud: 'Cloud',
  compute: 'Compute',
  ai: 'AI',
  games: 'Games',
  docs: 'Docs',
  explorer: 'Explorer',
  learn: 'Learn',
  wallet: 'Wallet',
  site: 'Home',
  nodes: 'Nodes',
};

export const TILES: Record<string, TileSpec> = {
  cloud: {
    id: 'cloud',
    tone: 'hero',
    fx: 'cloud',
    hot: 'tr',
    pattern: 'bl',
    tilt: 3.5,
    focus: 0.85,
    float: [10, 0],
  },
  games: {
    id: 'games',
    tone: 'standard',
    fx: 'games',
    hot: 'tl',
    pattern: 'br',
    tilt: 4,
    focus: 0.65,
    float: [8, -2],
  },
  docs: {
    id: 'docs',
    tone: 'standard',
    fx: 'docs',
    hot: 'br',
    pattern: 'tl',
    tilt: 5,
    focus: 0.6,
    float: [9, -4],
  },
  edge: {
    id: 'edge',
    tone: 'standard',
    fx: 'edge',
    hot: 'tr',
    pattern: 'bl',
    tilt: 5,
    focus: 0.6,
    float: [11, -1],
  },
  ai: {
    id: 'ai',
    tone: 'standard',
    fx: 'ai',
    hot: 'bl',
    pattern: 'tr',
    tilt: 4.5,
    focus: 0.7,
    float: [8.5, -3],
  },
  explorer: {
    id: 'explorer',
    tone: 'standard',
    fx: 'explorer',
    hot: 'br',
    pattern: 'tl',
    tilt: 4,
    focus: 0.6,
    float: [12, -5],
  },
  'run-a-node': {
    id: 'run-a-node',
    tone: 'standard',
    fx: 'node',
    hot: 'tr',
    pattern: 'bl',
    tilt: 4.5,
    focus: 0.65,
    float: [9.5, -6],
  },
  flux: {
    id: 'flux',
    tone: 'standard',
    fx: 'site',
    hot: 'tl',
    pattern: 'br',
    tilt: 5,
    focus: 0.55,
    float: [13, -2],
  },
  zelcore: {
    id: 'zelcore',
    tone: 'quiet',
    fx: 'wallet',
    hot: 'none',
    pattern: 'none',
    tilt: 3,
    focus: 0.35,
    float: [10, -1],
  },
  ssp: {
    id: 'ssp',
    tone: 'quiet',
    fx: 'wallet',
    hot: 'none',
    pattern: 'none',
    tilt: 3,
    focus: 0.35,
    float: [10, -5],
  },
};

/** "FluxCloud" becomes ["Flux", "Cloud"]; names without the Flux prefix come back whole. */
export function splitName(name: string): [lead: string, rest: string] {
  const m = /^(Flux)(.+)$/.exec(name);
  return m ? [m[1] as string, m[2] as string] : [name, ''];
}
