import { withUtm } from '@shared/catalog';

/** Link helpers shared by ExtLink, LinkButton and any anchor or `Panel as="a"` that leaves the site. */

export const EXTERNAL_REL = 'noopener noreferrer';

/** What assistive tech reads after a link that opens a new tab. */
export const NEW_TAB_HINT = '(Opens in a new tab)';

/** True for http(s) URLs that leave this origin. */
export function isExternalHref(href: string | undefined | null): boolean {
  if (!href || typeof window === 'undefined') return false;
  if (href.startsWith('#') || href.startsWith('/') || /^(mailto:|tel:)/i.test(href)) return false;
  try {
    const u = new URL(href, window.location.href);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export interface OutboundLinkOptions {
  /** Append `?utm_source=community` (shared/catalog `withUtm`) to external URLs. Default false. */
  withUtm?: boolean;
  /** Override the utm source. */
  utmSource?: string;
  /** Open in a new tab. Default: true for external URLs, false otherwise. */
  newTab?: boolean;
}

export interface OutboundLink {
  /** The destination leaves this origin (http or https, another origin). */
  external: boolean;
  /** The link opens a new tab, so it needs `target`, `rel` and the hint. */
  newTab: boolean;
  /**
   * Spread onto the anchor (or `Panel as="a"`): `href` with the utm applied, and `target` and `rel`
   * when the link opens a new tab. Keys that do not apply are absent, so a later explicit prop
   * still wins.
   */
  props: { href: string; target?: '_blank'; rel?: string };
}

/**
 * The attributes an outbound link needs, in one place: the utm on the URL, `target="_blank"` with
 * `rel="noopener noreferrer"`, and whether the link needs the hidden "Opens in a new tab" text.
 * `ExtLink` and `LinkButton` are built on it; use it directly when the link is something else (a
 * whole `Panel as="a"`, a tile, a table row).
 *
 *   const link = outboundLink(gateway.url, { withUtm: true });
 *   <Panel as="a" {...link.props} aria-labelledby={`${nameId} ${hintId}`}>
 *     ...
 *     {link.newTab ? <NewTabHint id={hintId} /> : null}
 *   </Panel>
 */
export function outboundLink(href: string, options: OutboundLinkOptions = {}): OutboundLink {
  const external = isExternalHref(href);
  const newTab = options.newTab ?? external;
  const final = options.withUtm && external ? withUtm(href, options.utmSource) : href;
  const props: OutboundLink['props'] = { href: final };
  if (newTab) {
    props.target = '_blank';
    props.rel = EXTERNAL_REL;
  }
  return { external, newTab, props };
}
