import { type CSSProperties, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useOverlays } from '@/lib/overlays';
import {
  Button,
  Container,
  Kbd,
  LinkButton,
  useInView,
  usePointerFine,
  useReducedMotion,
  useStageFocus,
} from '@/ui';
import { AnchorFrame } from './AnchorFrame';
import { Eyebrow } from './Eyebrow';
import { Headline } from './Headline';
import styles from './hero.module.css';
import { useHeadlineGlint, useHeroPhase } from './hooks';
import { LiveStrip } from './LiveStrip';

const rise = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

function Actions() {
  const ref = useRef<HTMLDivElement>(null);
  // The lattice lights beneath the buttons while one is hovered or focused.
  useStageFocus(ref, 0.7);
  return (
    <div ref={ref} className={styles.actions}>
      <span className={styles.rise} style={rise(10)}>
        <LinkButton href="#builds" variant="primary" size="lg" iconEnd="arrow-down">
          Explore community builds
        </LinkButton>
      </span>
      <span className={styles.rise} style={rise(11)}>
        <Button
          variant="secondary"
          size="lg"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => useOverlays.getState().openPalette()}
        >
          Open the command deck
          <span className={styles.deckKeys}>
            <Kbd combo="mod+k" size="sm" />
          </span>
        </Button>
      </span>
    </div>
  );
}

/**
 * The first screen: what this is, the live pulse of the network, and two clear paths. The stage
 * draws the lattice and the symbol behind this layer; the symbol lives in the frame on the right
 * (the element carrying `data-stage-anchor`). Every piece of copy is in the DOM and painted from
 * the first frame; the entrance only softens and resolves it (see hero.module.css).
 */
export default function Hero() {
  const titleId = useId();
  const root = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const phase = useHeroPhase();
  const reduced = useReducedMotion();
  const fine = usePointerFine();
  const inView = useInView(root);
  // The pointer's light is written on the headline itself, so each frame of it restyles a few words.
  useHeadlineGlint(title, fine && !reduced && inView);

  return (
    <section
      ref={root}
      id="hero"
      data-section="hero"
      aria-labelledby={titleId}
      className={styles.hero}
      data-phase={phase}
      data-inview={inView ? 'true' : 'false'}
    >
      <Container size="wide" className={styles.shell}>
        <div className={styles.row}>
          <div className={styles.copy}>
            <Eyebrow />
            <Headline id={titleId} ref={title} />
            <p className={cn(styles.sub, styles.rise)} style={rise(9)}>
              Apps, tools, node hosts and guides from the people who build on Flux, plus the live pulse of the
              network they run on.
            </p>
            <Actions />
          </div>
          <AnchorFrame />
        </div>
        <LiveStrip />
      </Container>
    </section>
  );
}
