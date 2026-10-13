/**
 * The reading list under the explainer: official docs, the academy, the API reference, the blog,
 * the video channel and the code, grouped by what a visitor wants to do next. Everything comes from
 * the shared catalog except two facts it does not hold (the API reference address and one-line
 * descriptions of the three social channels), which live here as plain constants.
 */
import { appById, GATEWAYS, SOCIALS } from '@shared/catalog';
import type { GlyphName } from '@/ui';

export type ResourceGroupId = 'start' | 'build' | 'deeper';

export interface Resource {
  id: string;
  name: string;
  /** What it is, in a sentence. */
  blurb: string;
  url: string;
  /** Where it goes, for display: the host and at most the first path segment. */
  where: string;
  glyph: GlyphName;
}

export interface ResourceGroup {
  id: ResourceGroupId;
  title: string;
  lead: string;
  items: Resource[];
}

/** The Flux API reference. Checked to resolve (HTTP 200) when this section was built. */
export const API_DOCS_URL = 'https://docs.runonflux.io/fluxapi';

/** `docs.runonflux.com/fluxnodes/what-are-fluxnodes` becomes `docs.runonflux.com/fluxnodes`. */
export function displayWhere(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const first = u.pathname.split('/').filter(Boolean)[0];
    return first ? `${host}/${first}` : host;
  } catch {
    return url;
  }
}

function fromGateway(id: string, glyph: GlyphName, blurb?: string): Resource | null {
  const g = GATEWAYS.find((x) => x.id === id);
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    blurb: blurb ?? g.description,
    url: g.url,
    where: displayWhere(g.url),
    glyph,
  };
}

function fromSocial(id: string, glyph: GlyphName, blurb: string): Resource | null {
  const s = SOCIALS.find((x) => x.id === id);
  if (!s) return null;
  return { id: s.id, name: s.name, blurb, url: s.url, where: displayWhere(s.url), glyph };
}

function fromApp(id: string, glyph: GlyphName): Resource | null {
  const a = appById(id);
  if (!a) return null;
  return { id: a.id, name: a.name, blurb: a.tagline, url: a.url, where: displayWhere(a.url), glyph };
}

const present = (items: (Resource | null)[]): Resource[] => items.filter((r): r is Resource => r !== null);

export function buildResourceGroups(): ResourceGroup[] {
  return [
    {
      id: 'start',
      title: 'Start',
      lead: 'Begin with the official guides.',
      items: present([fromGateway('docs', 'docs'), fromApp('academy', 'learn')]),
    },
    {
      id: 'build',
      title: 'Build',
      lead: 'Reference material and source code.',
      items: present([
        {
          id: 'api-docs',
          name: 'Flux API docs',
          blurb: 'Reference for the Flux API, for building apps and tools that talk to the network.',
          url: API_DOCS_URL,
          where: displayWhere(API_DOCS_URL),
          glyph: 'terminal',
        },
        fromSocial('github', 'github', 'Public repositories from the RunOnFlux organization.'),
      ]),
    },
    {
      id: 'deeper',
      title: 'Go deeper',
      lead: 'How the network works, and what is new.',
      items: present([
        fromGateway('run-a-node', 'nodes'),
        fromSocial('blog', 'blog', 'Announcements and write-ups from Flux.'),
        fromSocial('youtube', 'youtube', 'Videos from the official Flux channel.'),
      ]),
    },
  ];
}
