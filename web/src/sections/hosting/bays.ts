/**
 * The provider bays as plain data. Everything factual comes from the catalog (NODE_HOSTS) and the
 * art manifest (PREVIEWS); this module only decides what each bay offers the visitor.
 */
import { NODE_HOSTS, type NodeHost, SOCIALS } from '@shared/catalog';
import { PREVIEWS } from '@/content/art';

export interface BayPreview {
  src: string;
  width: number;
  height: number;
}

export interface BayModel {
  id: string;
  name: string;
  /** The operator handle as the Flux team credited it. */
  operator: string;
  blurb: string;
  /** Display host, or null when the service is reached by direct message. */
  host: string | null;
  /** `visit` opens the site; `discord` copies the handle and opens the Flux Discord. */
  action: 'visit' | 'discord';
  /** Outbound URL for the action. Never null: a direct-message host points at the Discord invite. */
  href: string;
  /** A captured preview of the host's site, when one exists. */
  preview: BayPreview | null;
  /** The preview is a light-theme page and must be dimmed to sit in the dark UI. */
  lightPreview: boolean;
  /** What to put on the clipboard for a direct-message host. */
  handle: string | null;
}

/** Previews that are light-theme pages (see web/public/art/README.md). */
const LIGHT_PREVIEWS: ReadonlySet<string> = new Set(['goldietech']);

export function discordInvite(): string {
  return SOCIALS.find((s) => s.id === 'discord')?.url ?? 'https://discord.com/invite/runonflux';
}

export function bayFor(
  host: NodeHost,
  previews: Record<string, BayPreview> = PREVIEWS,
  discordUrl: string = discordInvite(),
): BayModel {
  const direct = host.url === null;
  return {
    id: host.id,
    name: host.name,
    operator: host.operator,
    blurb: host.blurb,
    host: host.host,
    action: direct ? 'discord' : 'visit',
    href: host.url ?? discordUrl,
    preview: previews[host.id] ?? null,
    lightPreview: LIGHT_PREVIEWS.has(host.id),
    handle: direct ? host.operator : null,
  };
}

export function bayModels(hosts: readonly NodeHost[] = NODE_HOSTS): BayModel[] {
  return hosts.map((h) => bayFor(h));
}
