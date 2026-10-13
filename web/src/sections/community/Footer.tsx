import { GATEWAYS, SOCIALS } from '@shared/catalog';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SECTION_META } from '@/content/sections';
import { useOverlays } from '@/lib/overlays';
import { fireClickPulse } from '@/lib/stage';
import { SECTION_ORDER } from '@/stage/bus';
import { Container, ExtLink, FluxMark, Glyph, LinkButton } from '@/ui';
// The official "Running on Flux" badge, variant 02 (white on transparent: the dark theme one) from
// web/public/brand/badges, trimmed of its transparent margin and resampled to 720 px wide. The artwork
// itself is untouched. The original is 4500 px square, which a browser must decode in full.
import badge from './assets/running-on-flux.png';
import styles from './footer.module.css';
import { StatusTicker } from './StatusTicker';

const FLUX_HOME = GATEWAYS.find((g) => g.id === 'flux')?.url ?? 'https://runonflux.com';

const EXPLORE = SECTION_ORDER.map((id) => ({ id, label: SECTION_META[id].label }));
const FLUX_LINKS = ['flux', 'docs', 'explorer', 'cloud'].flatMap((id) => GATEWAYS.filter((g) => g.id === id));

/** A link out of the site: quiet at rest, the arrow arrives on hover. */
function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ExtLink href={href} withUtm tone="bare" icon={false} className={styles.link}>
      {children}
      <Glyph name="arrow-up-right" size={13} className={styles.out} />
    </ExtLink>
  );
}

function FooterContent() {
  return (
    <footer className={styles.footer} data-site-footer="">
      <div className={styles.rule} aria-hidden="true" />
      <Container>
        <h2 className="sr-only">Footer</h2>
        <div className={styles.grid}>
          <div className={styles.brand}>
            <p className={styles.lockup}>
              <FluxMark variant="round" tone="blue" size={40} />
              <span className={styles.wordmark}>
                <b>Flux</b> Community
              </span>
            </p>
            <p className={styles.tagline}>
              Apps, tools, node hosts and guides from the people who build on Flux.
            </p>
            <ExtLink href={FLUX_HOME} withUtm tone="bare" icon={false} className={styles.badge}>
              <img
                src={badge}
                width={720}
                height={168}
                alt="Running on Flux"
                loading="lazy"
                decoding="async"
              />
              <span className="sr-only"> runonflux.com</span>
            </ExtLink>
          </div>

          <nav className={styles.cols} aria-label="Footer">
            <div className={styles.col}>
              <h3 className={styles.colTitle}>Explore</h3>
              {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
              <ul className={styles.links} role="list">
                {EXPLORE.map((s) => (
                  <li key={s.id}>
                    <a className={styles.link} href={`#${s.id}`}>
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.col}>
              <h3 className={styles.colTitle}>Flux</h3>
              {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
              <ul className={styles.links} role="list">
                {FLUX_LINKS.map((g) => (
                  <li key={g.id}>
                    <OutLink href={g.url}>{g.name}</OutLink>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.col}>
              <h3 className={styles.colTitle}>Community</h3>
              {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
              <ul className={styles.links} role="list">
                {SOCIALS.map((s) => (
                  <li key={s.id}>
                    <OutLink href={s.url}>{s.name}</OutLink>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => useOverlays.getState().openSubmit()}
                  >
                    Submit an app or host
                  </button>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className={styles.bottom}>
          <div className={styles.fine}>
            <p>
              Network data from the public Flux API. Price from CoinGecko. App previews are screenshots of the
              public apps they link to.
            </p>
            <p>Built by the Flux community. Flux and the Flux logo belong to their owners.</p>
          </div>
          <StatusTicker />
          <div className={styles.top}>
            <span className={styles.topLabel} aria-hidden="true">
              Back to top
            </span>
            <LinkButton
              variant="icon"
              shape="hex"
              icon="arrow-up"
              label="Back to top"
              href="#hero"
              onClick={(e) => {
                // A small wave from the button as the page starts back up.
                const r = e.currentTarget.getBoundingClientRect();
                fireClickPulse(r.left + r.width / 2, r.top + r.height / 2, 0.8);
              }}
            />
          </div>
        </div>
      </Container>
      {/* The sign-off: the official white symbol, oversized and ghosted, sinking under the page's edge. */}
      <div className={styles.signoff} aria-hidden="true">
        <FluxMark tone="white" size={500} />
      </div>
    </footer>
  );
}

/**
 * The page footer. The shell renders every section inside `<main>`, and a `<footer>` inside `<main>`
 * is not the page's contentinfo landmark, so it is placed right after `<main>` instead (a portal into a
 * host that follows it), which also keeps it inside the page layer that goes inert in ambient mode.
 * If there is no `<main>` to follow (a harness, the kit) it renders in place.
 */
export function SiteFooter() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [inline, setInline] = useState(false);

  useLayoutEffect(() => {
    const main = document.getElementById('main');
    if (!main?.parentElement) {
      setInline(true);
      return;
    }
    const el = document.createElement('div');
    el.dataset.siteFooterHost = '';
    el.style.display = 'contents';
    main.after(el);
    setHost(el);
    return () => el.remove();
  }, []);

  if (inline) return <FooterContent />;
  return host ? createPortal(<FooterContent />, host) : null;
}
