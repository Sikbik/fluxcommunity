import { COMMUNITY_APPS, NODE_HOSTS } from '@shared/catalog';
import { HexBullet, Marquee, Panel, Reveal } from '@/ui';
import { collectCredits } from './credits';
import styles from './credits.module.css';

/** The catalog is static, so the credits are worked out once. */
const CREDITS = collectCredits(COMMUNITY_APPS, NODE_HOSTS);

/**
 * The credits strip: every builder and node host operator the catalog names, once, in a slow ticker
 * that pauses on hover and focus and has a pause button. Under reduced motion it is the same names as a
 * static wrapped list. Names are plain text: there is no builder filter in the hash route to send them to.
 */
export function Credits() {
  return (
    <div className={styles.root}>
      <h3 className="sr-only">Who built what</h3>
      <Reveal className={styles.reveal}>
        <Panel
          variant="slab"
          halo={false}
          size="sm"
          padding="none"
          hot="tl"
          pattern="tr"
          contentClassName={styles.strip}
        >
          <p className={styles.label}>
            <HexBullet size={9} />
            <span>Built by</span>
          </p>
          <div className={styles.ticker}>
            <Marquee label="Builders and node host operators credited in this portal" speed={32} gap={34}>
              {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
              <ul className={styles.list} role="list">
                {CREDITS.map((credit) => (
                  <li key={credit.key} className={styles.item}>
                    <span className={styles.name}>{credit.handle}</span>
                    <span className={styles.works}>{credit.works.map((w) => w.name).join(', ')}</span>
                    <HexBullet size={7} filled={false} className={styles.sep} />
                  </li>
                ))}
              </ul>
            </Marquee>
          </div>
        </Panel>
      </Reveal>
    </div>
  );
}
