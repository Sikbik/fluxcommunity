import { Fragment } from 'react';
import { useOverlays } from '@/lib/overlays';
import { Dialog, Kbd } from '@/ui';
import styles from './Shortcuts.module.css';
import { columnsFor, SHORTCUT_GROUPS, type Shortcut, shortcutsIn } from './shortcuts';

function Keys({ shortcut }: { shortcut: Shortcut }) {
  if (shortcut.keys.length === 0) {
    return <span className={styles.note}>{shortcut.note}</span>;
  }
  return (
    <>
      {shortcut.keys.map((seq, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the alternatives of one shortcut are static
        <Fragment key={i}>
          {i > 0 ? <span className={styles.sep}>or</span> : null}
          <span className={styles.seq}>
            {seq.map((combo, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a key sequence is static
              <Fragment key={j}>
                {j > 0 ? <span className={styles.sep}>then</span> : null}
                <Kbd combo={combo} size="sm" />
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * The shortcuts sheet (`?`): every binding in one place, generated from `SHORTCUTS`, the same
 * table the chord handler and the deck read, so it cannot drift from what the keys do.
 */
const COLUMNS = columnsFor(2);

export function ShortcutsSheet() {
  const open = useOverlays((s) => s.shortcuts);
  return (
    <Dialog
      open={open}
      onClose={() => useOverlays.getState().closeShortcuts()}
      title="Keyboard shortcuts"
      description="Everything on this site is reachable from the keyboard."
      size="lg"
    >
      <div className={styles.grid}>
        {COLUMNS.map((groups) => (
          <div className={styles.col} key={groups.join('|')}>
            {groups.map((group) => (
              <section
                className={styles.group}
                key={group}
                style={{ order: SHORTCUT_GROUPS.indexOf(group) }}
                aria-labelledby={`sc-${group.replace(/\s+/g, '-')}`}
              >
                <h3 className={styles.groupTitle} id={`sc-${group.replace(/\s+/g, '-')}`}>
                  {group}
                </h3>
                <dl className={styles.list}>
                  {shortcutsIn(group).map((s) => (
                    <div className={styles.row} key={s.id}>
                      <dt className={styles.label}>{s.label}</dt>
                      <dd className={styles.keys}>
                        <Keys shortcut={s} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
