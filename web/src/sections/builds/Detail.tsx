import { useEffect, useRef } from 'react';
import { COPY } from '@/content/copy';
import { copyText } from '@/lib/clipboard';
import { countdownParts, formatDateShort, formatTimeUtc, pad2 } from '@/lib/format';
import { Button, Chip, FreshnessChip, Glyph, LinkButton, Panel, toast } from '@/ui';
import styles from './Detail.module.css';
import { formatLatency, pillCopy } from './health';
import { playLaunch } from './launch';
import { type AppEntry, builderProfile, categoryLabel, lifecycleLinks, relatedEntries } from './model';
import { Preview } from './Preview';
import { CATEGORY_GLYPH, previewOf } from './presentation';
import { Ribbon } from './Ribbon';
import { appHash, shareUrl } from './route';
import { useBuilds } from './state';
import { useClock } from './useClock';

export interface DetailProps {
  entry: AppEntry;
  entries: readonly AppEntry[];
  /** Show another app in the same drawer. */
  onNavigate: (id: string) => void;
  /** Close the drawer and show only this builder's apps. */
  onPivot: (builder: string) => void;
}

/** Apps on the Flux cloud get a subdomain of runonflux.io. */
const FLUX_HOST = /\.runonflux\.io$/i;

export async function copyAppLink(id: string): Promise<void> {
  const ok = await copyText(shareUrl(window.location.href, id));
  if (ok) toast('Link copied', { kind: 'success', id: 'builds-link', icon: 'link' });
  else toast.error('Could not copy the link. Copy it from the address bar.', { id: 'builds-link' });
}

// ---------------------------------------------------------------------------
// Live status
// ---------------------------------------------------------------------------

function StatusBlock({ entry }: { entry: AppEntry }) {
  const now = useClock(1000);
  const ctx = useBuilds((s) => s.health.ctx);
  const { health, app } = entry;
  const copy = pillCopy(health, now);
  const checked = health.checkedAt ? Date.parse(health.checkedAt) : Number.NaN;
  const since = health.since ? Date.parse(health.since) : Number.NaN;
  const ageMs = Number.isFinite(checked) ? Math.max(0, now - checked) : null;
  const latency = formatLatency(health.latencyMs);
  const sinceLabel =
    health.kind === 'up' ? 'Up since' : health.kind === 'down' ? 'Offline since' : 'Degraded since';

  if (health.kind === 'loading') {
    return (
      <Panel
        variant="slab"
        size="sm"
        padding="md"
        halo={false}
        hot="tl"
        pattern="br"
        className={styles.block}
      >
        <p className={styles.blockLabel}>Live status</p>
        <p className={styles.quiet}>Checking status</p>
      </Panel>
    );
  }

  if (health.kind === 'self') {
    return (
      <Panel
        variant="slab"
        size="sm"
        padding="md"
        halo={false}
        hot="tl"
        pattern="br"
        className={styles.block}
      >
        <p className={styles.blockLabel}>Status</p>
        <p className={styles.state} data-tone="pending">
          <Glyph name="status-pending" size={20} />
          <span>{COPY.youAreHere}</span>
        </p>
        <p className={styles.note}>
          This page is the community portal itself, so it is not probed. If you can read this, it is up.
        </p>
      </Panel>
    );
  }

  const known = health.kind === 'up' || health.kind === 'degraded' || health.kind === 'down';
  return (
    <Panel variant="slab" size="sm" padding="md" halo={false} hot="tl" pattern="br" className={styles.block}>
      <header className={styles.blockHead}>
        <p className={styles.blockLabel}>Live status</p>
        {known ? (
          <FreshnessChip
            freshness={health.fresh ? 'live' : ctx.freshness === 'offline' ? 'offline' : 'cached'}
            ageMs={ageMs}
          />
        ) : (
          <FreshnessChip freshness={ctx.freshness === 'offline' ? 'offline' : 'unknown'} ageMs={null} />
        )}
      </header>
      <p className={styles.state} data-tone={copy.tone}>
        <Glyph name={copy.glyph} size={22} />
        <span>{copy.word}</span>
        {/* A fresh result's detail is its latency, which the Response fact below already gives. */}
        {copy.detail && copy.detail !== latency ? (
          <span className={styles.stateDetail}>{copy.detail}</span>
        ) : null}
      </p>
      {known ? (
        <dl className={styles.facts}>
          <div>
            <dt>Response</dt>
            <dd>{latency ?? '--'}</dd>
          </div>
          <div>
            <dt>HTTP status</dt>
            <dd>{health.httpStatus ?? '--'}</dd>
          </div>
          <div>
            <dt>{sinceLabel}</dt>
            <dd>
              {Number.isFinite(since) ? `${formatDateShort(since)}, ${formatTimeUtc(since, false)}` : '--'}
            </dd>
          </div>
          <div>
            <dt>Last checked</dt>
            <dd>
              {Number.isFinite(checked) ? formatTimeUtc(checked) : '--'}
              {ageMs !== null ? (
                <span className={styles.sub}>{` (${Math.round(ageMs / 1000)} s ago)`}</span>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : (
        <p className={styles.note}>
          {ctx.freshness === 'offline'
            ? `Live status is unavailable right now. ${app.name} has not been checked from this page.`
            : `${app.name} has not been checked yet.`}
        </p>
      )}
      <p className={styles.note}>
        Checked from this site's server on a short schedule, not from your device.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle: the countdown and the handover
// ---------------------------------------------------------------------------

function Countdown({ target }: { target: number }) {
  const now = useClock(1000);
  const p = countdownParts(Math.max(0, target - now));
  const parts: Array<[string, string, string]> = [
    [String(p.days), 'days', 'd'],
    [pad2(p.hours), 'hours', 'h'],
    [pad2(p.minutes), 'minutes', 'm'],
    [pad2(p.seconds), 'seconds', 's'],
  ];
  return (
    <p className={styles.countdown}>
      <span className="sr-only">{`${p.days} days, ${p.hours} hours and ${p.minutes} minutes left`}</span>
      {parts.map(([n, , unit]) => (
        <span key={unit} className={styles.cd} aria-hidden="true">
          <b>{n}</b>
          <i>{unit}</i>
        </span>
      ))}
    </p>
  );
}

function LifecycleBlock({
  entry,
  entries,
  onNavigate,
}: {
  entry: AppEntry;
  entries: readonly AppEntry[];
  onNavigate: (id: string) => void;
}) {
  const { lifecycle } = entry;
  const links = lifecycleLinks(entries, entry.app.id);
  if (lifecycle.state === 'live') return null;
  const tone = lifecycle.state === 'retiring' ? 'warn' : lifecycle.state === 'retired' ? 'off' : 'accent';
  const successor = links.successor;
  const predecessor = links.predecessor;
  return (
    <Panel
      variant="slab"
      size="sm"
      padding="md"
      halo={false}
      hot="bl"
      pattern="tr"
      className={styles.block}
      data-tone={tone}
    >
      <p className={styles.blockLabel}>
        {lifecycle.state === 'new' ? 'New' : lifecycle.state === 'retiring' ? 'Retiring' : 'Retired'}
      </p>
      {lifecycle.sentence ? <p className={styles.lifeLine}>{lifecycle.sentence}</p> : null}
      {lifecycle.state === 'retiring' && lifecycle.retiresAtMs !== null ? (
        <Countdown target={lifecycle.retiresAtMs} />
      ) : null}
      <div className={styles.lifeActions}>
        {successor ? (
          <Button
            variant="secondary"
            size="sm"
            iconEnd="arrow-right"
            magnetic={false}
            onClick={() => onNavigate(successor.app.id)}
          >
            {lifecycle.state === 'retired'
              ? `Open ${successor.app.name}`
              : `Replaced by ${successor.app.name}`}
          </Button>
        ) : null}
        {predecessor ? (
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-left"
            magnetic={false}
            onClick={() => onNavigate(predecessor.app.id)}
          >
            {`Takes over from ${predecessor.app.name}`}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Related apps
// ---------------------------------------------------------------------------

function Related({
  entry,
  entries,
  onNavigate,
}: {
  entry: AppEntry;
  entries: readonly AppEntry[];
  onNavigate: (id: string) => void;
}) {
  const related = relatedEntries(entries, entry.app.id, 3);
  if (related.length === 0) return null;
  return (
    <section aria-labelledby={`related-${entry.app.id}`} className={styles.related}>
      <h3 className={styles.sectionLabel} id={`related-${entry.app.id}`}>
        Related builds
      </h3>
      {/* biome-ignore lint/a11y/noRedundantRoles: an explicit list role keeps list semantics in Safari when list-style is none */}
      <ul className={styles.relatedList} role="list">
        {related.map((r) => {
          const copy = pillCopy(r.health, 0);
          return (
            <li key={r.app.id}>
              <a
                className={styles.relatedItem}
                href={appHash(r.app.id)}
                onClick={(e) => {
                  // Stay in this drawer: a plain navigation would stack a history entry per hop.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onNavigate(r.app.id);
                }}
              >
                <span className={styles.relatedThumb}>
                  <Preview id={r.app.id} category={r.app.category} />
                </span>
                <span className={styles.relatedText}>
                  <span className={styles.relatedName}>{r.app.name}</span>
                  <span className={styles.relatedMeta}>
                    {r.app.builder ? COPY.builtBy(r.app.builder) : 'Community build'}
                  </span>
                </span>
                <span className={styles.relatedStatus} data-tone={copy.tone}>
                  <Glyph name={copy.glyph} size={14} />
                  <span className="sr-only">{copy.word}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The detail
// ---------------------------------------------------------------------------

/** What the drawer shows for one app. The header and the footer belong to the Drawer. */
export function Detail({ entry, entries, onNavigate, onPivot }: DetailProps) {
  const { app, lifecycle } = entry;
  const root = useRef<HTMLDivElement>(null);
  const profile = app.builder ? builderProfile(entries, app.builder) : null;
  const hasShot = previewOf(app.id) !== null;
  const flux = FLUX_HOST.test(app.host);

  // A different app starts at the top.
  useEffect(() => {
    void app.id;
    root.current?.parentElement?.scrollTo({ top: 0 });
  }, [app.id]);

  return (
    <div
      ref={root}
      className={styles.detail}
      data-health={entry.health.kind}
      data-lifecycle={lifecycle.state}
    >
      <div className={styles.top} tabIndex={-1} data-autofocus="">
        <div className={styles.hero} data-detail-hero="">
          <Preview id={app.id} category={app.category} alt={`Screenshot of ${app.name}`} eager />
          <div className={styles.heroBadges}>
            <Ribbon entry={entry} />
            {app.spotlight ? (
              <span className={styles.spot}>
                <Glyph name="spark" size={13} />
                {COPY.spotlight}
              </span>
            ) : null}
          </div>
        </div>
        {hasShot ? (
          <p className={styles.caption}>
            Screenshot taken when this page was built. The live app may look different.
          </p>
        ) : null}
      </div>

      <div className={styles.credit}>
        <div>
          <p className={styles.sectionLabel}>{app.builder ? 'Built by' : 'Credit'}</p>
          <p className={styles.creditName}>{app.builder ?? 'Community build'}</p>
        </div>
        {profile && profile.apps.length > 1 && app.builder ? (
          <Button
            variant="ghost"
            size="sm"
            iconEnd="arrow-right"
            magnetic={false}
            onClick={() => onPivot(app.builder as string)}
          >
            {`All ${profile.apps.length} builds by ${app.builder}`}
          </Button>
        ) : null}
      </div>

      <p className={styles.description}>{app.description}</p>

      <StatusBlock entry={entry} />
      <LifecycleBlock entry={entry} entries={entries} onNavigate={onNavigate} />

      {/* biome-ignore lint/a11y/noRedundantRoles: an explicit list role keeps list semantics in Safari when list-style is none */}
      <ul className={styles.tags} role="list" aria-label="About this build">
        <li>
          <Chip icon={CATEGORY_GLYPH[app.category]}>{categoryLabel(app.category)}</Chip>
        </li>
        {flux ? (
          <li>
            <Chip tone="accent" icon="nodes">
              Runs on Flux
            </Chip>
          </li>
        ) : null}
        <li>
          <Chip className={styles.hostChip}>{app.host}</Chip>
        </li>
      </ul>

      <Related entry={entry} entries={entries} onNavigate={onNavigate} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The footer: the primary action
// ---------------------------------------------------------------------------

export function DetailFooter({
  entry,
  entries,
  onNavigate,
}: {
  entry: AppEntry;
  entries: readonly AppEntry[];
  onNavigate: (id: string) => void;
}) {
  const { app, lifecycle } = entry;
  const links = lifecycleLinks(entries, app.id);
  const heroNode = () => document.querySelector<HTMLElement>('[data-detail-hero]');

  if (app.self) {
    return (
      <div className={styles.footer}>
        <Chip tone="accent" icon="status-pending">
          {COPY.youAreHere}
        </Chip>
        <p className={styles.footNote}>This is the portal you are using.</p>
      </div>
    );
  }

  if (lifecycle.state === 'retired' && links.successor) {
    const next = links.successor;
    return (
      <div className={styles.footer}>
        <Button variant="primary" size="lg" iconEnd="arrow-right" onClick={() => onNavigate(next.app.id)}>
          {`Open ${next.app.name}`}
        </Button>
        <LinkButton href={app.url} withUtm variant="ghost" size="lg" iconEnd="arrow-up-right">
          {`Visit ${app.name} anyway`}
        </LinkButton>
      </div>
    );
  }

  return (
    <div className={styles.footer}>
      <LinkButton
        href={app.url}
        withUtm
        variant="primary"
        size="lg"
        iconEnd="arrow-up-right"
        onClick={() => playLaunch(heroNode())}
      >
        Launch app
      </LinkButton>
      <p className={styles.footNote}>
        Opens <span className={styles.mono}>{app.host}</span> in a new tab.
      </p>
    </div>
  );
}
