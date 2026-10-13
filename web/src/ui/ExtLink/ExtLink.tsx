import type { AnchorHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Glyph } from '../Glyph/Glyph';
import { outboundLink } from '../internal/links';
import styles from './ExtLink.module.css';
import { NewTabHint } from './NewTabHint';

export interface ExtLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  href: string;
  /** Append `?utm_source=community` (shared/catalog withUtm). Use for every outbound destination. Default false. */
  withUtm?: boolean;
  /** Override the utm source. */
  utmSource?: string;
  /** Show the trailing arrow glyph on external links. Default true. */
  icon?: boolean;
  /** `accent` (default), `plain` (inherits text colour), `bare` (no underline). */
  tone?: 'accent' | 'plain' | 'bare';
  children: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

/**
 * An inline text link. External links open in a new tab with `rel="noopener noreferrer"`
 * and carry a visually hidden "Opens in a new tab" so assistive tech says so. The same attributes
 * for a link that is not inline text come from `outboundLink` (see the README, "Outbound links").
 *
 *   <ExtLink href="https://docs.runonflux.com" withUtm>Flux Docs</ExtLink>
 */
export function ExtLink({
  href,
  withUtm = false,
  utmSource,
  icon = true,
  tone = 'accent',
  className,
  children,
  target,
  rel,
  ref,
  ...rest
}: ExtLinkProps) {
  // An explicit target decides the tab question; otherwise external links open a new one.
  const link = outboundLink(href, {
    withUtm,
    utmSource,
    newTab: target === undefined ? undefined : target === '_blank',
  });
  return (
    <a
      ref={ref}
      className={cn(styles.link, className)}
      data-tone={tone}
      {...link.props}
      target={target ?? link.props.target}
      rel={rel ?? link.props.rel}
      {...rest}
    >
      {children}
      {link.external && icon ? <Glyph name="arrow-up-right" size={14} className={styles.icon} /> : null}
      {link.newTab ? <NewTabHint /> : null}
    </a>
  );
}
