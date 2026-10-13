import { GATEWAYS } from '@shared/catalog';
import { type MouseEvent, useRef } from 'react';
import { ArtLayer } from '@/sections/gateways/art/ArtLayer';
import { useParallax } from '@/sections/gateways/art/useParallax';
import { Glint, Sheen } from '@/sections/gateways/Fx';
import { playLaunch } from '@/sections/gateways/launch';
import { Glyph, LinkButton, Panel, Reveal, useInView } from '@/ui';
import styles from './play.module.css';

const games = GATEWAYS.find((g) => g.id === 'games');

/**
 * The large glass panel: the glass tunnel racing toward the viewer behind, the controller
 * floating in front of it on a deeper parallax, and the one call to action. The panel is
 * not a link (the button is), so leaving for Flux Games is a deliberate press, which plays
 * the same launch warp as the gateway tiles.
 */
export function FeaturePanel() {
  const host = useRef<HTMLElement>(null);
  const cell = useRef<HTMLElement>(null);
  // The idle float and sheen only run while the panel is on screen.
  const live = useInView(cell, { rootMargin: '160px' });
  useParallax(host);
  if (!games) return null;

  const onLaunch = (e: MouseEvent<HTMLElement>) => {
    if (host.current) playLaunch(host.current, e.clientX, e.clientY);
  };

  return (
    <Reveal ref={cell} className={styles.featureCell} data-art-live={live ? 'true' : 'false'}>
      <Panel
        ref={host}
        size="lg"
        interactive
        tilt={2.5}
        stageFocus={0.5}
        hot="tr"
        pattern="bl"
        padding="none"
        container
        className={styles.feature}
        contentClassName={styles.featureContent}
        data-art-host=""
      >
        <ArtLayer art="play-tunnel" className={styles.tunnel} floatSeconds={12} breath eager>
          <Sheen angle={102} delay={2} slow={1.1} />
          <Glint />
        </ArtLayer>
        <ArtLayer
          art="play-controller"
          className={styles.controller}
          floatSeconds={7}
          floatDelay={-2.5}
          fallbackGlyph="games"
        >
          <Sheen angle={116} delay={5} slow={0.9} />
          <Glint />
        </ArtLayer>
        <span className={styles.scrim} aria-hidden="true" />
        <div className={styles.copy}>
          <p className={styles.kind}>
            <Glyph name="games" size={18} />
            <span className={styles.kindLabel}>{games.name}</span>
          </p>
          <div className={styles.pitch}>
            <p className={styles.tagline}>{games.tagline}</p>
            <div className={styles.actions}>
              <LinkButton
                href={games.url}
                withUtm
                variant="primary"
                size="lg"
                iconEnd="arrow-up-right"
                onClick={onLaunch}
              >
                Browse games
              </LinkButton>
              <span className={styles.host}>{games.host}</span>
            </div>
          </div>
        </div>
      </Panel>
    </Reveal>
  );
}
