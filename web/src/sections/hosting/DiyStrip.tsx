import { GATEWAYS } from '@shared/catalog';
import { ART, GATEWAY_ART } from '@/content/art';
import { cn } from '@/lib/cn';
import { LinkButton, Panel } from '@/ui';
import styles from './hosting.module.css';

/**
 * The quiet alternative: run it yourself. Everything here is the catalog's own `run-a-node`
 * gateway (the official FluxNode guide), so the link and its description cannot drift.
 */
export function DiyStrip() {
  const guide = GATEWAYS.find((g) => g.id === 'run-a-node');
  if (!guide) return null;
  const art = ART[GATEWAY_ART[guide.id] ?? 'gateway-node'];
  return (
    <Panel variant="ghost" padding="md" hot="bl" pattern="tr" stageFocus={0.4} className={styles.diy}>
      <div className={styles.diyGrid}>
        <span className={cn('chamfer', styles.diyArt)} aria-hidden="true">
          <span className={styles.diyArtFill}>
            <picture>
              {art.avif ? <source srcSet={art.avif} type="image/avif" /> : null}
              <img
                src={art.src}
                width={art.width}
                height={art.height}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </picture>
          </span>
        </span>
        <div className={styles.diyText}>
          <p className={styles.diyLabel}>Do it yourself</p>
          <h4 className={styles.diyTitle}>{guide.name}</h4>
          <p className={styles.diyBody}>{guide.description}</p>
        </div>
        <LinkButton href={guide.url} withUtm variant="secondary" iconEnd="arrow-up-right" magnetic={false}>
          Read the guide
        </LinkButton>
      </div>
    </Panel>
  );
}
