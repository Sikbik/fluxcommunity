/**
 * The ambient tour's playlist: every community build, then every node host, then every gateway,
 * as captions. Catalog copy only (`shared/catalog`, the copy deck) and the generated art or
 * captured previews the manifest already knows. Pure.
 */

import {
  COMMUNITY_APPS,
  type CommunityApp,
  GATEWAYS,
  type Gateway,
  NODE_HOSTS,
  type NodeHost,
} from '@shared/catalog';
import { ART, GATEWAY_ART, PREVIEWS } from '@/content/art';
import { COPY } from '@/content/copy';
import { SECTION_META } from '@/content/sections';
import { formatDateShort } from '@/lib/format';
import { isLightPreview } from '@/system/previews';

export type CaptionGroup = 'apps' | 'hosts' | 'gateways';

export interface CaptionArt {
  src: string;
  avif?: string;
  width: number;
  height: number;
  /** `screen` for emissive art on black, `normal` for a captured page. */
  blend: 'screen' | 'normal';
  /** A light page that must be dimmed so it does not blow out the dark screen. */
  light?: boolean;
}

export interface Caption {
  /** `app:atlas`, `host:goldietech`, `gateway:cloud`. */
  id: string;
  group: CaptionGroup;
  /** The eyebrow label: "Community builds". */
  groupLabel: string;
  /** 1-based position inside its group, and the group's size. */
  position: number;
  total: number;
  name: string;
  /** "by Little Stache", or the host for a gateway. */
  byline: string | null;
  /** The tagline or blurb. */
  line: string;
  /** Spotlight, retiring or successor note from the copy deck. */
  note: string | null;
  art: CaptionArt | null;
}

function previewArt(id: string, light = false): CaptionArt | null {
  const p = PREVIEWS[id];
  return p ? { src: p.src, width: p.width, height: p.height, blend: 'normal', light } : null;
}

function gatewayArt(id: string): CaptionArt | null {
  const key = GATEWAY_ART[id];
  const a = key ? ART[key] : undefined;
  return a ? { src: a.src, avif: a.avif, width: a.width, height: a.height, blend: a.blend } : null;
}

export interface PlaylistSource {
  apps: readonly CommunityApp[];
  hosts: readonly NodeHost[];
  gateways: readonly Gateway[];
}

const CATALOG: PlaylistSource = { apps: COMMUNITY_APPS, hosts: NODE_HOSTS, gateways: GATEWAYS };

/**
 * The whole tour, in order. Stable between calls. The source is the catalog; a test can hand in
 * its own so the checks do not depend on which builds happen to be listed today.
 */
export function buildPlaylist(source: PlaylistSource = CATALOG): Caption[] {
  const { hosts, gateways } = source;
  const allApps = source.apps;
  const apps = allApps.filter((a) => !a.self);
  const out: Caption[] = [];

  apps.forEach((app, i) => {
    let note: string | null = null;
    if (app.lifecycle === 'retiring' && app.retiresOn) {
      const successor = allApps.find((a) => a.id === app.replacedBy)?.name ?? 'its successor';
      note = COPY.retiring(formatDateShort(app.retiresOn), successor);
    } else if (app.lifecycle === 'new' && app.replaces) {
      const before = allApps.find((a) => a.id === app.replaces);
      note = before?.retiresOn ? COPY.successor(before.name, formatDateShort(before.retiresOn)) : 'New';
    } else if (app.spotlight) {
      note = COPY.spotlight;
    }
    out.push({
      id: `app:${app.id}`,
      group: 'apps',
      groupLabel: SECTION_META.builds.eyebrow,
      position: i + 1,
      total: apps.length,
      name: app.name,
      byline: app.builder ? `by ${app.builder}` : null,
      line: app.tagline,
      note,
      art: previewArt(app.id),
    });
  });

  hosts.forEach((host, i) => {
    out.push({
      id: `host:${host.id}`,
      group: 'hosts',
      groupLabel: SECTION_META.hosting.eyebrow,
      position: i + 1,
      total: hosts.length,
      name: host.name,
      byline: `by ${host.operator}`,
      line: host.blurb,
      note: null,
      art: previewArt(host.id, isLightPreview(host.id)),
    });
  });

  gateways.forEach((g, i) => {
    out.push({
      id: `gateway:${g.id}`,
      group: 'gateways',
      groupLabel: SECTION_META.gateways.eyebrow,
      position: i + 1,
      total: gateways.length,
      name: g.name,
      byline: g.host,
      line: g.tagline,
      note: null,
      art: gatewayArt(g.id),
    });
  });

  return out;
}
