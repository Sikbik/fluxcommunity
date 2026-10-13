import { withUtm } from '@shared/catalog';
import { type MouseEvent, useId } from 'react';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useOverlays } from '@/lib/overlays';
import { useStageBus } from '@/stage/bus';
import { Button, Glyph, LinkButton, Panel, Reveal, toast } from '@/ui';
import { type BayModel, bayModels } from './bays';
import styles from './bays.module.css';

const HOT = ['tr', 'bl', 'tl', 'br'] as const;
const PATTERN = ['br', 'tl', 'bl', 'tr'] as const;

/** A bay for a host that has no site: a lit lattice with the Discord mark. Nothing is faked. */
function ProceduralBay({ bay }: { bay: BayModel }) {
  return (
    <div className={styles.proc}>
      <span className={styles.procLattice} aria-hidden="true" />
      <span className={styles.procMark} aria-hidden="true">
        <span className={styles.procHex}>
          <Glyph name="discord" size={28} />
        </span>
      </span>
      <span className={styles.procLabel}>Direct message on the Flux Discord</span>
      <span className="sr-only">{bay.name} has no website. Reach them by direct message on Discord.</span>
    </div>
  );
}

function BayThumb({ bay }: { bay: BayModel }) {
  return (
    <div className={cn('chamfer', styles.thumb)} data-light={bay.lightPreview || undefined}>
      {bay.preview ? (
        <img
          className={styles.shot}
          src={bay.preview.src}
          width={bay.preview.width}
          height={bay.preview.height}
          alt={`Preview of the ${bay.name} website`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <ProceduralBay bay={bay} />
      )}
      <span className={styles.dim} aria-hidden="true" />
      <span className={styles.shade} aria-hidden="true" />
      <span className={styles.sheen} aria-hidden="true" />
      {bay.preview ? <span className={styles.tag}>Site preview</span> : null}
    </div>
  );
}

function Bay({ bay, index }: { bay: BayModel; index: number }) {
  const nameId = useId();

  const onDiscord = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!bay.handle) return;
    const { clientX, clientY } = e;
    // The link opens the Flux Discord as usual; the handle goes to the clipboard on the way.
    void copyText(bay.handle).then((ok) => {
      toast(
        ok
          ? `Copied ${bay.handle}. Paste it into a message on the Flux Discord.`
          : `Open the Flux Discord and message ${bay.handle}.`,
        { kind: ok ? 'success' : 'info', id: `bay-${bay.id}` },
      );
      if (ok) useStageBus.getState().firePulse('success', clientX, clientY, 0.7);
    });
  };

  // A bigger target for a pointer: the card opens the site like its Visit button does. The Visit
  // link inside is the keyboard and assistive-technology path, so this adds no new behaviour.
  const openSite = (e: MouseEvent<HTMLElement>) => {
    if (bay.action !== 'visit') return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    window.open(withUtm(bay.href), '_blank', 'noopener,noreferrer');
  };

  return (
    <Panel
      as="article"
      onClick={openSite}
      interactive
      stageFocus={0.55}
      padding="none"
      clip
      hot={HOT[index % HOT.length]}
      pattern={PATTERN[index % PATTERN.length]}
      className={styles.bay}
      contentClassName={styles.bayContent}
      aria-labelledby={nameId}
    >
      <span className={styles.rail} aria-hidden="true" />
      <BayThumb bay={bay} />
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h4 id={nameId} className={styles.name}>
            {bay.name}
          </h4>
        </div>
        <p className={styles.operator}>
          <span>Operator</span>
          {bay.operator}
        </p>
        <p className={styles.blurb}>{bay.blurb}</p>
        <div className={styles.foot}>
          <span className={styles.host}>
            {bay.host ? (
              <>
                <Glyph name="link" size={14} />
                {bay.host}
              </>
            ) : (
              <>
                <Glyph name="discord" size={14} />
                Discord message
              </>
            )}
          </span>
          {bay.action === 'visit' ? (
            <LinkButton
              href={bay.href}
              withUtm
              variant="secondary"
              size="sm"
              iconEnd="arrow-up-right"
              magnetic={false}
            >
              Visit
              <span className="sr-only"> {bay.name}</span>
            </LinkButton>
          ) : (
            <LinkButton
              href={bay.href}
              withUtm
              variant="secondary"
              size="sm"
              icon="discord"
              magnetic={false}
              onClick={onDiscord}
            >
              Message on Discord
              <span className="sr-only"> to reach {bay.name}</span>
            </LinkButton>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Six docking bays, one per community hosting service in the catalog. */
export function ProviderBays() {
  const bays = bayModels();
  return (
    <>
      <div className={styles.grid}>
        {bays.map((bay, i) => (
          <Reveal key={bay.id} index={i % 3}>
            <Bay bay={bay} index={i} />
          </Reveal>
        ))}
      </div>
      <div className={styles.add}>
        <p>Run a node hosting service for Flux?</p>
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => useOverlays.getState().openSubmit()}
          magnetic={false}
        >
          Add your hosting service
        </Button>
      </div>
    </>
  );
}
