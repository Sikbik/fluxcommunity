import { Section } from '@/ui';
import { Channels } from './Channels';
import { Credits } from './Credits';
import styles from './community.module.css';
import { SiteFooter } from './Footer';
import { SubmitBand } from './SubmitBand';

/**
 * 07 / Join in, and the footer. Warmth and momentum at the end of the page: the channels as a hex
 * honeycomb, the people credited by name, the invitation to add your own, and then the footer, which
 * is rendered after `<main>` so it is the page's real contentinfo landmark.
 */
export default function Community() {
  return (
    <>
      <Section
        id="community"
        align="center"
        title={
          <>
            The <b>people</b> behind the network.
          </>
        }
        lead={
          <>
            <span className={styles.sentence}>Flux is made by its community.</span>{' '}
            <span className={styles.sentence}>Come say hello, ask a question, or ship something.</span>
          </>
        }
      >
        <div className={styles.stack}>
          <div className={styles.channels}>
            <h3 className="sr-only">Channels</h3>
            <Channels />
          </div>
          <Credits />
          <SubmitBand />
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
