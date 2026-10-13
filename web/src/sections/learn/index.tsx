import { Reveal, Section } from '@/ui';
import { Explainer } from './Explainer';
import styles from './learn.module.css';
import { Resources } from './Resources';

/**
 * Learn and build: one sequence that says how an app runs on Flux (describe, place, run), then
 * the official places to go next. Concept only: nothing here is a price or a promise.
 */
export default function Learn() {
  return (
    <Section
      id="learn"
      title={
        <>
          How an <b>app</b> runs on <b>Flux</b>.
        </>
      }
      lead="Describe it once. The network places it, runs it and keeps it up."
    >
      <div className={styles.stack}>
        <Reveal>
          <Explainer />
        </Reveal>

        <div>
          <header className={styles.indexHead}>
            <h3 className={styles.indexTitle}>Take it from here.</h3>
            <p className={styles.indexLead}>
              Start with the docs, build against the API, or go deeper on the network.
            </p>
          </header>
          <Reveal>
            <Resources />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
