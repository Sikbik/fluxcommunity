/**
 * The Flux Community catalog: every app, node host, gateway and social link the
 * site presents. One source of truth for BOTH `web/` (display) and `server/`
 * (health probes), so the two can never drift.
 *
 * Sources: the Flux team's community posts (apps and node hosting services),
 * each project's own published page title and description, and the official
 * Flux properties. Copy here is plain and factual; presentation-only
 * extras (glyphs, art, accents) live in `web/src/content/`, keyed by `id`.
 *
 * ERASABLE TYPESCRIPT ONLY (see shared/api.ts). No enums, no runtime imports.
 */

export type AppCategory = 'network' | 'nodes' | 'rewards' | 'onboarding' | 'education';

export type Lifecycle = 'live' | 'new' | 'retiring';

export interface CommunityApp {
  /** Stable kebab-case key. Used in URLs (#builds/atlas) and as the health key. */
  id: string;
  name: string;
  /** One short line. Shown on cells. */
  tagline: string;
  /** One or two plain sentences. Shown in the detail view. */
  description: string;
  category: AppCategory;
  /** Builder handle as the Flux team credited them. null = unattributed community build. */
  builder: string | null;
  /** Canonical launch URL, no tracking parameters. */
  url: string;
  /** Display host, e.g. noxide.app.runonflux.io */
  host: string;
  /**
   * URL the server probes for health. Defaults to `url` when omitted.
   * false = never probe (for example the site itself).
   */
  probe?: string | false;
  lifecycle: Lifecycle;
  /** ISO date (UTC) the app is retired, for lifecycle 'retiring'. */
  retiresOn?: string;
  /** id of the app that takes over, for lifecycle 'retiring'. */
  replacedBy?: string;
  /** id of the app this one takes over from, for lifecycle 'new'. */
  replaces?: string;
  /** This very site. Rendered as "you are here". */
  self?: boolean;
}

export interface NodeHost {
  id: string;
  name: string;
  /** Operator handle as the Flux team credited them. */
  operator: string;
  /** null when the host is reached by direct message only. */
  url: string | null;
  host: string | null;
  blurb: string;
  contact: 'web' | 'discord';
}

export type GatewayKind =
  | 'cloud'
  | 'compute'
  | 'ai'
  | 'games'
  | 'docs'
  | 'explorer'
  | 'learn'
  | 'wallet'
  | 'site'
  | 'nodes';

export interface Gateway {
  id: string;
  name: string;
  tagline: string;
  description: string;
  kind: GatewayKind;
  url: string;
  host: string;
}

export interface SocialLink {
  id: string;
  name: string;
  url: string;
  /** Shown under the name. Empty when the channel needs no handle line (for example Discord). */
  handle: string;
}

export interface CategoryInfo {
  id: AppCategory;
  label: string;
  blurb: string;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'network', label: 'Network', blurb: 'Watch the whole network: blocks, nodes, apps and revenue.' },
  { id: 'nodes', label: 'Nodes', blurb: 'Track your own nodes, payouts and benchmarks.' },
  { id: 'rewards', label: 'Rewards', blurb: 'Reductions, claims and what your nodes will earn.' },
  { id: 'onboarding', label: 'Start here', blurb: 'Hubs that help you find your way around Flux.' },
  { id: 'education', label: 'Learn', blurb: 'Learn to deploy and operate on Flux.' },
];

// ---------------------------------------------------------------------------
// Community apps
// ---------------------------------------------------------------------------

export const COMMUNITY_APPS: readonly CommunityApp[] = [
  {
    id: 'noxide',
    name: 'Noxide',
    tagline: 'Your nodes, and when they get paid.',
    description:
      "Every node's next payout, earnings, benchmarks and apps, plus the live Flux network block by block.",
    category: 'nodes',
    builder: '2ndTL Mining',
    url: 'https://noxide.app.runonflux.io',
    host: 'noxide.app.runonflux.io',
    lifecycle: 'new',
  },
  {
    id: 'fluxtracker',
    name: 'Fluxtracker',
    tagline: 'Network revenue and usage.',
    description:
      'Live revenue, node counts, cloud resources and app deployments across the Flux decentralized cloud, with daily history.',
    category: 'network',
    builder: '2ndTL Mining',
    url: 'https://fluxtracker.app.runonflux.io',
    host: 'fluxtracker.app.runonflux.io',
    lifecycle: 'live',
  },
  {
    id: 'flux-tools-hub',
    name: 'Flux Tools Hub',
    tagline: 'Reduction and Potato Block tracker.',
    description: 'A hub of Flux tools, including a tracker for the reward reduction and for Potato Blocks.',
    category: 'rewards',
    builder: 'Physalis',
    url: 'https://node-flux-tools.app.runonflux.io',
    host: 'node-flux-tools.app.runonflux.io',
    lifecycle: 'live',
  },
  {
    id: 'atlas',
    name: 'Flux Atlas',
    tagline: 'The Flux network on a live 3D globe.',
    description:
      'Watch every node, app and block on the Proof of Node chain as it happens, on a live 3D globe.',
    category: 'network',
    builder: 'Little Stache',
    url: 'https://atlas.app.runonflux.io',
    host: 'atlas.app.runonflux.io',
    lifecycle: 'live',
  },
  {
    id: 'community',
    name: 'Flux Community',
    tagline: 'Gateway to the Flux decentralized world.',
    description: 'You are here. The community front door for apps, node hosts and guides.',
    category: 'onboarding',
    builder: 'Little Stache',
    url: 'https://community.app.runonflux.io',
    host: 'community.app.runonflux.io',
    probe: false,
    lifecycle: 'live',
    self: true,
  },
  {
    id: 'claimcalc',
    name: 'Flux Claim Calculator',
    tagline: 'Optimal parallel asset claim timing.',
    description: 'Work out the best time to claim your parallel assets.',
    category: 'rewards',
    builder: 'Method',
    url: 'https://claimcalc.app.runonflux.io',
    host: 'claimcalc.app.runonflux.io',
    lifecycle: 'live',
  },
  {
    id: 'flux-view',
    name: 'Flux View',
    tagline: 'Nodes, hashrate and apps in one view.',
    description: 'Monitor node status, mining hashrate and app deployment from a single application.',
    category: 'network',
    builder: 'CarRamRodB16_228',
    url: 'https://view.app.runonflux.io',
    host: 'view.app.runonflux.io',
    lifecycle: 'live',
  },
  {
    id: 'academy',
    name: 'Flux Academy',
    tagline: 'Learn to deploy on Flux.',
    description:
      'Interactive lessons, labs and live network data for deploying applications on Flux, the decentralized cloud.',
    category: 'education',
    builder: 'Little Stache',
    url: 'https://academy.app.runonflux.io',
    host: 'academy.app.runonflux.io',
    lifecycle: 'live',
  },
];

// ---------------------------------------------------------------------------
// Node hosting services
// ---------------------------------------------------------------------------

export const NODE_HOSTS: readonly NodeHost[] = [
  {
    id: 'goldietech',
    name: 'GoldieTech Nodes',
    operator: 'Goldie',
    url: 'https://goldietechnodes.com',
    host: 'goldietechnodes.com',
    blurb: 'The first Flux community member to build a node hosting service.',
    contact: 'web',
  },
  {
    id: 'nodeorbit',
    name: 'Node Orbit',
    operator: 'jonathan_nodeorbit.com',
    url: 'https://nodeorbit.com',
    host: 'nodeorbit.com',
    blurb: 'A distributed node hosting platform.',
    contact: 'web',
  },
  {
    id: 'hostmynode',
    name: 'HostMyNode',
    operator: 'hostmynode.net_69850',
    url: 'https://hostmynode.net',
    host: 'hostmynode.net',
    blurb: 'Fully managed nodes, benchmarked and kept running for you.',
    contact: 'web',
  },
  {
    id: 'datavex',
    name: 'DataVex',
    operator: 'DataVex',
    url: 'https://datavex.eu',
    host: 'datavex.eu',
    blurb: 'Node and server hosting built for blockchain, based in Poland.',
    contact: 'web',
  },
  {
    id: 'mcb',
    name: 'MCB',
    operator: 'MCB',
    url: null,
    host: null,
    blurb: 'Reach MCB by direct message on the Flux Discord server.',
    contact: 'discord',
  },
  {
    id: 'fluxhub',
    name: 'Flux Hub',
    operator: 'w2vy',
    url: 'https://fluxhub.moltentech.us',
    host: 'fluxhub.moltentech.us',
    blurb:
      'A marketplace by MoltenTech that connects FLUX collateral holders with independent operators who run the hardware.',
    contact: 'web',
  },
];

// ---------------------------------------------------------------------------
// Official Flux properties
// ---------------------------------------------------------------------------

export const GATEWAYS: readonly Gateway[] = [
  {
    id: 'cloud',
    name: 'FluxCloud',
    tagline: 'Deploy on the decentralized cloud.',
    description:
      'Deploy Docker apps, game servers, WordPress sites and blockchain nodes on Flux, spread across independent nodes in dozens of countries.',
    kind: 'cloud',
    url: 'https://cloud.runonflux.com',
    host: 'cloud.runonflux.com',
  },
  {
    id: 'edge',
    name: 'FluxEdge',
    tagline: 'GPU compute without the hyperscaler.',
    description: 'Rent GPU compute from the Flux network, or contribute your own hardware through FluxCore.',
    kind: 'compute',
    url: 'https://console.fluxedge.ai',
    host: 'console.fluxedge.ai',
  },
  {
    id: 'ai',
    name: 'FluxAI',
    tagline: 'An AI assistant for Flux.',
    description: 'An AI assistant for the Flux ecosystem, built on decentralized infrastructure.',
    kind: 'ai',
    url: 'https://ai.runonflux.com',
    host: 'ai.runonflux.com',
  },
  {
    id: 'games',
    name: 'Flux Games',
    tagline: 'Dedicated game servers, no contract.',
    description:
      'Game servers that each run on their own independent node. Pick a game, pick a region, play. Pay by card or with FLUX.',
    kind: 'games',
    url: 'https://runonflux.com/games/',
    host: 'runonflux.com/games',
  },
  {
    id: 'docs',
    name: 'Flux Docs',
    tagline: 'Everything, documented.',
    description:
      'Guides for FluxCloud, FluxNodes, FluxEdge and FluxCore, from first deploy to running your own node.',
    kind: 'docs',
    url: 'https://docs.runonflux.com',
    host: 'docs.runonflux.com',
  },
  {
    id: 'explorer',
    name: 'Flux Explorer',
    tagline: 'Every block, every transaction.',
    description: 'Browse blocks, transactions and addresses on the Flux chain.',
    kind: 'explorer',
    url: 'https://explorer.runonflux.io',
    host: 'explorer.runonflux.io',
  },
  {
    id: 'run-a-node',
    name: 'Run a FluxNode',
    tagline: 'Earn by keeping the network healthy.',
    description:
      'The official guide to what FluxNodes are and how to run one at the Cumulus, Nimbus or Stratus tier.',
    kind: 'nodes',
    url: 'https://docs.runonflux.com/fluxnodes/what-are-fluxnodes',
    host: 'docs.runonflux.com',
  },
  {
    id: 'flux',
    name: 'runonflux.com',
    tagline: 'The Flux home page.',
    description: 'What decentralized cloud computing is, how Flux works and why it exists.',
    kind: 'site',
    url: 'https://runonflux.com',
    host: 'runonflux.com',
  },
  {
    id: 'zelcore',
    name: 'Zelcore',
    tagline: 'Wallet and Flux login.',
    description: 'A self-custodial wallet you can sign in to FluxCloud with and pay with in FLUX.',
    kind: 'wallet',
    url: 'https://zelcore.io',
    host: 'zelcore.io',
  },
  {
    id: 'ssp',
    name: 'SSP Wallet',
    tagline: 'Self-custodial multisig wallet.',
    description: 'A self-custodial multisig wallet you can sign in to FluxCloud with and pay with in FLUX.',
    kind: 'wallet',
    url: 'https://sspwallet.io',
    host: 'sspwallet.io',
  },
];

// ---------------------------------------------------------------------------
// Community channels
// ---------------------------------------------------------------------------

export const SOCIALS: readonly SocialLink[] = [
  // No handle line: the name says it all. Consumers show the handle only when it is non-empty.
  { id: 'discord', name: 'Discord', url: 'https://discord.com/invite/runonflux', handle: '' },
  { id: 'x', name: 'X', url: 'https://x.com/RunOnFlux', handle: '@RunOnFlux' },
  {
    id: 'x-community',
    name: 'X Community',
    url: 'https://x.com/i/communities/1783579310768411056',
    handle: 'Flux on X Communities',
  },
  { id: 'telegram', name: 'Telegram', url: 'https://t.me/runonflux', handle: 't.me/runonflux' },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com/@runonflux_official',
    handle: '@runonflux_official',
  },
  { id: 'github', name: 'GitHub', url: 'https://github.com/RunOnFlux', handle: 'RunOnFlux' },
  { id: 'blog', name: 'Blog', url: 'https://runonflux.com/blog/', handle: 'runonflux.com/blog' },
];

// ---------------------------------------------------------------------------
// Site constants and helpers
// ---------------------------------------------------------------------------

export const SITE = {
  name: 'Flux Community',
  url: 'https://community.app.runonflux.io',
  /** Where to send app and host submissions. */
  submitVia: 'the Flux Discord, to @bigstache',
  submitUrl: 'https://discord.com/invite/runonflux',
  /** Appended to outbound links so destinations can see where visitors came from. */
  utm: 'community',
} as const;

export function appById(id: string): CommunityApp | undefined {
  return COMMUNITY_APPS.find((app) => app.id === id);
}

/** Adds ?utm_source=community to an http(s) URL, leaving other schemes alone. */
export function withUtm(url: string, source: string = SITE.utm): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', source);
    return u.toString();
  } catch {
    return url;
  }
}

/** The URL the server should probe for an app, or null when it should not be probed. */
export function probeUrl(app: CommunityApp): string | null {
  if (app.probe === false) return null;
  return app.probe ?? app.url;
}
