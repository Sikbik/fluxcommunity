import { COPY } from '@/content/copy';
import { Reveal, Section } from '@/ui';
import { DiyStrip } from './DiyStrip';
import styles from './hosting.module.css';
import { ProviderBays } from './ProviderBays';
import { TierExplainer } from './TierExplainer';

/**
 * 04 / Node hosting. Teaches how nodes earn (the tier explainer), then shows who will run one for
 * you (the provider bays), then points at the official guide for doing it yourself.
 */
export default function Hosting() {
  return (
    <Section
      id="hosting"
      title={
        <>
          Run a <b>node</b> without the <b>rack</b>.
        </>
      }
      lead="Community members built hosting services that let people around the world take part in keeping Flux healthy, and earn FLUX while doing so."
      actions={<p className={styles.fine}>{COPY.communityServices}</p>}
    >
      <div className={styles.stack}>
        <Reveal>
          <TierExplainer />
        </Reveal>

        <div>
          <Reveal>
            <header className={styles.hostsHead}>
              <h3 className={styles.hostsTitle}>Hosts who run it for you.</h3>
              <p className={styles.hostsLead}>
                Independent community services that run a node on your behalf. Compare what each one offers
                before you choose.
              </p>
            </header>
          </Reveal>
          <ProviderBays />
        </div>

        <Reveal>
          <DiyStrip />
        </Reveal>
      </div>
    </Section>
  );
}
