import { SITE } from '@shared/catalog';
import { useOverlays } from '@/lib/overlays';
import { Button, HexBullet, LinkButton, Panel, Reveal, SplitReveal } from '@/ui';
import styles from './submit.module.css';

type SubmitKind = 'app' | 'host';

/**
 * Opens the shared submit dialog through the overlays store. The dialog is owned by the builds overlay
 * and asks app or host itself; the store's `openSubmit` carries no kind yet, so both actions lead to the
 * same dialog today. The kind is passed along regardless: once `openSubmit` takes one, the buttons here
 * preselect it without a change.
 */
export function openSubmitDialog(kind: SubmitKind): void {
  const open: (kind?: SubmitKind) => void = useOverlays.getState().openSubmit;
  open(kind);
}

/**
 * The invitation: add your own app or node host. A glass panel with the two actions and the Discord
 * route, and beside it an empty anchor where the stage floats the 3D Flux symbol back to rest (the
 * hero's own anchor is far above by now, so this is the one the stage follows down here).
 */
export function SubmitBand() {
  return (
    <div className={styles.band}>
      <Reveal className={styles.reveal}>
        <Panel size="lg" padding="lg" hot="tr" pattern="br">
          <div className={styles.content}>
            <p className={styles.kicker}>
              <HexBullet size={9} />
              <span>Add yours</span>
            </p>
            <SplitReveal as="h3" className={styles.title}>
              Built something for Flux? <b>Add it here.</b>
            </SplitReveal>
            <p className={styles.body}>
              Submissions go through {SITE.submitVia}. Fill in a few details, copy the message and paste it in
              Discord. Nothing is sent from this page.
            </p>
            <div className={styles.actions}>
              <Button variant="primary" icon="plus" onClick={() => openSubmitDialog('app')}>
                Add an app
              </Button>
              <Button variant="secondary" icon="hosting" onClick={() => openSubmitDialog('host')}>
                Add a node host
              </Button>
              <LinkButton variant="ghost" href={SITE.submitUrl} withUtm iconEnd="arrow-up-right">
                Open the Flux Discord
              </LinkButton>
            </div>
          </div>
        </Panel>
      </Reveal>
      {/* Empty and decorative on purpose: the stage draws the symbol here and takes drags on it. */}
      <div className={styles.anchor} data-stage-anchor="symbol" aria-hidden="true" />
    </div>
  );
}
