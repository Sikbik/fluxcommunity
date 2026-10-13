import { CATEGORIES, COMMUNITY_APPS, GATEWAYS, NODE_HOSTS, SOCIALS } from '@shared/catalog';
import { useState } from 'react';
import { ART, GATEWAY_ART, PREVIEWS } from '@/content/art';
import { COPY } from '@/content/copy';
import { SECTION_META } from '@/content/sections';
import { useAppHealth } from '@/data';
import { formatDateShort } from '@/lib/format';
import type { SectionId } from '@/stage/bus';
import { isLightPreview } from '@/system/previews';
import { Glyph, type GlyphName, Kbd, Panel } from '@/ui';
import styles from './Deck.module.css';
import { type DeckItem, hostOf } from './items';
import { describeActions } from './run';

const STATE_WORD = { up: 'Up', degraded: 'Degraded', down: 'Down', unknown: COPY.unchecked } as const;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.pvFact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The live status line of an app: its own component so the health hook only runs for apps. */
function AppStatus({ id }: { id: string }) {
  const health = useAppHealth(id);
  const app = COMMUNITY_APPS.find((a) => a.id === id);
  if (app?.self) return <Fact label="Status">{COPY.youAreHere}</Fact>;
  if (!health) return <Fact label="Status">{COPY.unchecked}</Fact>;
  const latency =
    health.latencyMs !== null && health.state !== 'unknown' ? `, ${Math.round(health.latencyMs)} ms` : '';
  return (
    <Fact label="Status">
      {STATE_WORD[health.state]}
      {latency}
    </Fact>
  );
}

interface Shot {
  src: string;
  avif?: string;
  width: number;
  height: number;
  blend: 'screen' | 'normal';
  /** A light page that needs dimming so it does not blow out the dark UI. */
  light?: boolean;
}

function shotFor(item: DeckItem): Shot | null {
  if (item.kind === 'app' || item.kind === 'host') {
    const p = PREVIEWS[item.ref];
    return p ? { ...p, blend: 'normal', light: isLightPreview(item.ref) } : null;
  }
  if (item.kind === 'gateway') {
    const id = GATEWAY_ART[item.ref];
    const a = id ? ART[id] : null;
    return a ? { src: a.src, avif: a.avif, width: a.width, height: a.height, blend: a.blend } : null;
  }
  return null;
}

function ShotView({ shot, glyph }: { shot: Shot | null; glyph: GlyphName }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!shot || failed === shot.src) {
    return (
      <div className={styles.shot} aria-hidden="true">
        <span className={styles.shotGlyph}>
          <Glyph name={glyph} size={44} />
        </span>
      </div>
    );
  }
  return (
    <div
      className={styles.shot}
      data-blend={shot.blend}
      data-light={shot.light ? 'true' : undefined}
      aria-hidden="true"
    >
      <picture>
        {shot.avif ? <source srcSet={shot.avif} type="image/avif" /> : null}
        <img
          src={shot.src}
          width={shot.width}
          height={shot.height}
          alt=""
          decoding="async"
          onError={() => setFailed(shot.src)}
        />
      </picture>
    </div>
  );
}

export interface PreviewProps {
  item: DeckItem | null;
  open: boolean;
  id: string;
}

/**
 * The preview card: the active result in full, on a key. Catalog text only, plus the live status
 * of an app from the health hook (and "Not checked yet" until there is one).
 */
export function Preview({ item, open, id }: PreviewProps) {
  return (
    <Panel
      as="aside"
      variant="slab"
      size="md"
      padding="none"
      halo={false}
      hot="tl"
      pattern="tr"
      className={styles.preview}
      data-open={open && item ? 'true' : 'false'}
      aria-hidden={open && item ? undefined : true}
      aria-label="Preview"
      id={id}
    >
      {item ? <PreviewBody item={item} /> : null}
    </Panel>
  );
}

function PreviewBody({ item }: { item: DeckItem }) {
  const keys = describeActions(item);
  const glyph: GlyphName = 'glyph' in item.tile ? item.tile.glyph : 'spark';
  const shot = shotFor(item);
  const app = item.kind === 'app' ? COMMUNITY_APPS.find((a) => a.id === item.ref) : undefined;
  const host = item.kind === 'host' ? NODE_HOSTS.find((h) => h.id === item.ref) : undefined;
  const gateway = item.kind === 'gateway' ? GATEWAYS.find((g) => g.id === item.ref) : undefined;
  const social = item.kind === 'social' ? SOCIALS.find((s) => s.id === item.ref) : undefined;
  const category = app ? CATEGORIES.find((c) => c.id === app.category)?.label : undefined;
  const sectionMeta = item.kind === 'section' ? SECTION_META[item.ref as SectionId] : undefined;

  return (
    <div className={styles.previewBody}>
      {item.kind === 'app' || item.kind === 'host' || item.kind === 'gateway' ? (
        <ShotView key={item.id} shot={shot} glyph={glyph} />
      ) : null}
      <div>
        <p className={styles.pvTitle}>{item.title}</p>
        {app?.builder ? <p className={styles.pvBy}>by {app.builder}</p> : null}
        {host ? <p className={styles.pvBy}>by {host.operator}</p> : null}
      </div>
      <p className={styles.pvText}>{item.description}</p>
      <dl className={styles.pvFacts}>
        {app ? (
          <>
            <AppStatus id={app.id} />
            <Fact label="Host">{app.host}</Fact>
            {category ? <Fact label="Category">{category}</Fact> : null}
            {app.lifecycle === 'retiring' && app.retiresOn ? (
              <Fact label="Lifecycle">
                {COPY.retiring(
                  formatDateShort(app.retiresOn),
                  COMMUNITY_APPS.find((a) => a.id === app.replacedBy)?.name ?? 'its successor',
                )}
              </Fact>
            ) : null}
            {app.lifecycle === 'new' ? (
              <Fact label="Lifecycle">
                {app.replaces && COMMUNITY_APPS.find((a) => a.id === app.replaces)
                  ? `New. Takes over from ${COMMUNITY_APPS.find((a) => a.id === app.replaces)?.name}.`
                  : 'New'}
              </Fact>
            ) : null}
          </>
        ) : null}
        {host ? <Fact label="Site">{host.host ?? 'Direct message on the Flux Discord'}</Fact> : null}
        {gateway ? <Fact label="Host">{gateway.host}</Fact> : null}
        {social ? (
          social.handle.trim() !== '' ? (
            <Fact label="Handle">{social.handle}</Fact>
          ) : hostOf(social.url) ? (
            <Fact label="Site">{hostOf(social.url)}</Fact>
          ) : null
        ) : null}
        {sectionMeta ? (
          <>
            <Fact label="Section">{`${sectionMeta.index} / ${sectionMeta.eyebrow}`}</Fact>
            {item.chord ? (
              <Fact label="Keys">
                <span className={styles.hintKeys}>
                  {item.chord.map((k) => (
                    <Kbd size="sm" key={k}>
                      {k}
                    </Kbd>
                  ))}
                </span>
              </Fact>
            ) : null}
          </>
        ) : null}
        {item.kind === 'action' && item.state ? (
          <Fact label="State">{item.state === 'on' ? 'On' : item.state === 'off' ? 'Off' : 'Current'}</Fact>
        ) : null}
      </dl>
      <div className={styles.pvKeys}>
        <span className={styles.hint}>
          <Kbd size="sm">↵</Kbd> {keys.primary}
        </span>
        {keys.secondary ? (
          <span className={styles.hint}>
            <span className={styles.hintKeys}>
              <Kbd size="sm">⇧</Kbd>
              <Kbd size="sm">↵</Kbd>
            </span>{' '}
            {keys.secondary}
          </span>
        ) : null}
      </div>
    </div>
  );
}
