import { useId, useRef } from 'react';
import { ExtLink, Glyph, HexBullet, Panel, useStageFocus } from '@/ui';
import { buildResourceGroups, type Resource } from './resources';
import styles from './resources.module.css';

const GROUPS = buildResourceGroups();

function Row({ resource }: { resource: Resource }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useStageFocus(ref, 0.35);
  return (
    <ExtLink ref={ref} href={resource.url} withUtm tone="bare" icon={false} className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        <Glyph name={resource.glyph} size={22} />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowName}>{resource.name}</span>
        <span className={styles.rowBlurb}>{resource.blurb}</span>
        <span className={styles.rowWhere}>{resource.where}</span>
      </span>
      <Glyph name="arrow-up-right" size={18} className={styles.rowArrow} />
    </ExtLink>
  );
}

/** The reading list: an index with arrows, in three groups. Every row is one outbound link. */
export function Resources() {
  const uid = useId();
  return (
    <Panel size="lg" padding="lg" hot="bl" pattern="tr" stageFocus={0.25}>
      <div className={styles.columns}>
        {GROUPS.map((group, i) => (
          <section key={group.id} className={styles.group} aria-labelledby={`${uid}-${group.id}`}>
            <header className={styles.groupHead}>
              <p className={styles.groupIndex}>
                <HexBullet size={9} />
                {String(i + 1).padStart(2, '0')}
              </p>
              <h4 id={`${uid}-${group.id}`} className={styles.groupTitle}>
                {group.title}
              </h4>
              <p className={styles.groupLead}>{group.lead}</p>
            </header>
            <ul className={styles.list}>
              {group.items.map((item) => (
                <li key={item.id}>
                  <Row resource={item} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}
