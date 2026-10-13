import type { CommunityApp } from '@shared/catalog';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { COPY } from '@/content/copy';
import { cn } from '@/lib/cn';
import { Glyph, LinkButton, Panel } from '@/ui';
import styles from './AppCell.module.css';
import { HealthPill } from './HealthPill';
import { playLaunch } from './launch';
import type { AppEntry } from './model';
import { categoryLabel } from './model';
import { Preview } from './Preview';
import { CATEGORY_GLYPH } from './presentation';
import { Ribbon } from './Ribbon';
import { appHash } from './route';
import { useBuilds } from './state';

export interface AppCellProps {
  entry: AppEntry;
  /** The one cell of the grid that is in the tab order (roving focus). */
  tabbable: boolean;
  onFocusCell: (id: string) => void;
  /** The builder has other builds here, so their name is a way to see them. */
  pivotable: boolean;
  onPivot: (builder: string) => void;
  /** Records which element opened the detail, so focus can come back to it. */
  onOpen: (id: string, from: HTMLElement) => void;
}

const HOT = ['tr', 'bl', 'tl', 'br'] as const;
const PATTERN = ['br', 'tl', 'bl', 'tr'] as const;

/** Varies the hot corner and the pattern corner between neighbours so a grid does not look stamped. */
function corners(order: number) {
  return { hot: HOT[order % HOT.length] ?? 'tr', pattern: PATTERN[(order + 1) % PATTERN.length] ?? 'br' };
}

function Credit({
  app,
  tabbable,
  pivotable,
  onPivot,
}: {
  app: CommunityApp;
  tabbable: boolean;
  pivotable: boolean;
  onPivot: AppCellProps['onPivot'];
}) {
  if (!app.builder) {
    return <span className={styles.credit}>Community build</span>;
  }
  const builder = app.builder;
  if (!pivotable) {
    return <span className={styles.credit}>{`Built by ${builder}`}</span>;
  }
  return (
    <span className={styles.credit}>
      Built by{' '}
      <button
        type="button"
        className={styles.pivot}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => onPivot(builder)}
        aria-label={`Built by ${builder}. Show all of their builds`}
      >
        {builder}
      </button>
    </span>
  );
}

/**
 * One app as a glass cell. The whole card opens the detail (a real link on the app's name,
 * stretched over the card); Launch and the builder pivot sit above it as their own controls.
 */
export const AppCell = memo(function AppCell({
  entry,
  tabbable,
  onFocusCell,
  pivotable,
  onPivot,
  onOpen,
}: AppCellProps) {
  const { app, lifecycle, health } = entry;
  const titleId = useId();
  const descId = useId();
  const metaId = useId();
  const panel = useRef<HTMLElement | null>(null);
  const [pinged, setPinged] = useState(false);

  // A "surprise me" or a pivot flashes the cell it chose.
  const ping = useBuilds((s) => (s.ping?.id === app.id ? s.ping.seq : 0));
  useEffect(() => {
    if (!ping) return;
    setPinged(true);
    const t = window.setTimeout(() => setPinged(false), 1700);
    return () => window.clearTimeout(t);
  }, [ping]);

  const { hot, pattern } = corners(entry.order);
  const retired = lifecycle.state === 'retired';
  const launchable = !app.self && !retired;
  const tab = tabbable ? 0 : -1;

  return (
    <Panel
      as="article"
      ref={panel}
      variant="slab"
      size="md"
      padding="none"
      interactive
      tilt={3.2}
      stageFocus={0.55}
      halo={false}
      hot={hot}
      pattern={pattern}
      className={styles.cell}
      aria-labelledby={titleId}
      data-health={health.kind}
      data-lifecycle={lifecycle.state}
      data-self={app.self ? 'true' : undefined}
      data-ping={pinged ? 'true' : undefined}
      data-app={app.id}
    >
      <div className={styles.inner}>
        <div className={cn('chamfer', styles.media)}>
          <Preview id={app.id} category={app.category} />
          <div className={styles.badges}>
            <Ribbon entry={entry} />
            {app.spotlight ? (
              <span className={styles.spot} role="img" aria-label={COPY.spotlight} title={COPY.spotlight}>
                <Glyph name="spark" size={13} />
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.text}>
          <h3 className={styles.name} id={titleId}>
            <Glyph name={CATEGORY_GLYPH[app.category]} size={15} className={styles.catGlyph} />
            <a
              className={styles.stretch}
              href={appHash(app.id)}
              tabIndex={tab}
              aria-describedby={`${descId} ${metaId}`}
              data-roving={app.id}
              onFocus={() => onFocusCell(app.id)}
              onClick={(e) => onOpen(app.id, e.currentTarget)}
            >
              {app.name}
            </a>
          </h3>
          <p className={styles.tagline} id={descId}>
            <span className="sr-only">{`${categoryLabel(app.category)}. ${app.self ? `${COPY.youAreHere}. ` : ''}`}</span>
            {app.tagline}
          </p>
        </div>

        {launchable ? (
          <div className={styles.launch}>
            <LinkButton
              href={app.url}
              withUtm
              size="sm"
              variant="secondary"
              magnetic={false}
              iconEnd="arrow-up-right"
              tabIndex={tab}
              aria-label={`Launch ${app.name}`}
              onClick={() => playLaunch(panel.current)}
            >
              <span className={styles.launchWord}>Launch</span>
            </LinkButton>
          </div>
        ) : null}
        {retired && lifecycle.successorId ? (
          <div className={styles.launch}>
            <LinkButton
              href={appHash(lifecycle.successorId)}
              size="sm"
              variant="secondary"
              magnetic={false}
              iconEnd="arrow-right"
              tabIndex={tab}
            >
              <span className={styles.launchWord}>See the replacement</span>
            </LinkButton>
          </div>
        ) : null}

        <div className={styles.meta} id={metaId}>
          <Credit app={app} tabbable={tabbable} pivotable={pivotable} onPivot={onPivot} />
          {app.self ? null : <HealthPill view={health} />}
        </div>
      </div>
      <span className={styles.ring} aria-hidden="true" />
    </Panel>
  );
});
