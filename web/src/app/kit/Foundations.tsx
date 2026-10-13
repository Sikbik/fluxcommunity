import { useState } from 'react';
import { ACCENT_LIST, ACCENT_SCALES } from '@/content/accents';
import { Button } from '@/ui';
import styles from './kit.module.css';
import { Col, Grid, Group, Row, Spec } from './parts';

const SURFACES = [
  ['--void', '#000000'],
  ['--ink-0', '#080a0f'],
  ['--ink-1', '#0f1319'],
  ['--ink-2', '#181c23'],
  ['--ink-3', '#22272e'],
  ['--ink-4', '#2f333a'],
  ['--ink-5', '#3f4249'],
] as const;

const TEXT = [
  ['--text-1', '#ffffff'],
  ['--text-2', '#d5d7db'],
  ['--text-3', '#a1a5ab'],
  ['--text-4', '#717171'],
] as const;

const STATUS = [
  ['--status-ok', '#3fdc95', 'Live, healthy'],
  ['--status-pending', '#86a1da', 'Syncing'],
  ['--status-warn', '#ff9a3d', 'Cached, retiring'],
  ['--status-crit', '#ff5470', 'Offline, down'],
  ['--status-off', '#717171', 'Not checked'],
] as const;

const TIERS = [
  ['cumulus', '#36d3ff'],
  ['nimbus', '#c77dff'],
  ['stratus', '#ffc857'],
] as const;

const DURATIONS = [
  ['--dur-1', 120, 'hover colour, focus rings'],
  ['--dur-2', 220, 'small UI transitions'],
  ['--dur-3', 380, 'panels, drawers, tooltips'],
  ['--dur-4', 700, 'section reveals, count-ups'],
  ['--dur-5', 1200, 'camera moves, intro beats'],
] as const;

const EASES = [
  ['--ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)', 'default entrance'],
  ['--ease-in-out', 'cubic-bezier(0.65, 0, 0.35, 1)', 'across the screen'],
  ['--ease-snap', 'cubic-bezier(0.2, 0.9, 0.2, 1.15)', 'press release'],
] as const;

function isDark(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const l = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return l < 140;
}

function MotionDemo({
  label,
  duration,
  ease,
  note,
}: {
  label: string;
  duration: number;
  ease: string;
  note?: string;
}) {
  const [go, setGo] = useState(false);
  return (
    <div className={styles.stack}>
      <Row>
        <code>{label}</code>
        <span className={styles.specNote}>{note}</span>
        <Button size="sm" variant="ghost" onClick={() => setGo((g) => !g)} magnetic={false}>
          Play
        </Button>
      </Row>
      <div
        className={styles.motionBar}
        data-go={go ? 'true' : 'false'}
        style={{ '--td': `${duration}ms`, '--tt': ease, '--span': '420px' } as React.CSSProperties}
      >
        <span className={styles.motionDot} />
      </div>
    </div>
  );
}

export function Foundations() {
  return (
    <>
      <Group
        id="colour"
        title="Colour"
        lead="Dark only. Elevation is lightness. Blue is structure, white-hot is attention, tier colours are for tiers, status colours always come with a word."
      >
        <Grid min={340}>
          <Spec label="Surfaces">
            <div className={styles.swatches}>
              {SURFACES.map(([name, hex]) => (
                <div key={name} className={styles.swatch}>
                  <div className={styles.chip} style={{ background: hex }} />
                  {name}
                  <br />
                  {hex}
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="Text">
            <div className={styles.swatches}>
              {TEXT.map(([name, hex]) => (
                <div key={name} className={styles.swatch}>
                  <div
                    className={styles.chip}
                    style={{
                      background: 'var(--ink-1)',
                      display: 'grid',
                      placeItems: 'center',
                      color: hex,
                      font: '600 1.125rem var(--font-display)',
                    }}
                  >
                    Aa
                  </div>
                  {name}
                  <br />
                  {hex}
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="Status (reserved)" note="Always an icon plus a word. Never reused as a chart series.">
            <div className={styles.swatches}>
              {STATUS.map(([name, hex, use]) => (
                <div key={name} className={styles.swatch}>
                  <div className={styles.chip} style={{ background: hex }} />
                  {name.replace('--status-', '')}
                  <br />
                  {use}
                </div>
              ))}
            </div>
          </Spec>
          <Spec label="Tiers" note="Tier colours belong to tiers only.">
            <div className={styles.swatches}>
              {TIERS.map(([name, hex]) => (
                <div key={name} className={styles.swatch}>
                  <div className={styles.chip} style={{ background: hex }} />
                  {name}
                  <br />
                  {hex}
                </div>
              ))}
            </div>
          </Spec>
        </Grid>

        <div style={{ marginBlockStart: 36 }}>
          <Col>
            <span className={styles.specLabel}>
              Accent scales (50 to 950). The header switcher re-points the live tokens.
            </span>
            {ACCENT_LIST.map((a) => (
              <div key={a.id} className={styles.stack}>
                <span className={styles.specNote}>{a.name}</span>
                <div className={styles.scale}>
                  {Object.entries(ACCENT_SCALES[a.id]).map(([step, hex]) => (
                    <span key={step} style={{ background: hex }} data-dark={isDark(hex) ? 'true' : undefined}>
                      {step}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Col>
        </div>
      </Group>

      <Group
        id="type"
        title="Type"
        lead="Montserrat leads, Open Sans carries text, Plex Mono is the instrument voice, Lora italic is the accent: one editorial line a section at most."
      >
        <Col>
          <Spec label="Display: clamp(2.75rem, 8vw, 8rem), 300 with 700 key words, -0.04em">
            <p className="t-display">
              Built by the <b className="t-grad">community</b> Ran by the <b className="t-grad">network</b>
            </p>
          </Spec>
          <Spec label="H2: clamp(1.875rem, 4.2vw, 3.75rem), 600, -0.03em">
            <h3 className="t-h2">What the community built.</h3>
          </Spec>
          <Grid min={320}>
            <Spec label="H3">
              <h4 className="t-h3">Start anywhere</h4>
            </Spec>
            <Spec label="Lead">
              <p className="t-lead">Apps, tools, node hosts and guides from the people who build on Flux.</p>
            </Spec>
            <Spec label="Body (62ch max)">
              <p className="t-body">
                Community members built node hosting services that let people around the world take part in
                keeping Flux healthy and earn FLUX while doing so.
              </p>
            </Spec>
            <Spec label="Label (mono, uppercase, tracked)">
              <p className="t-label">01 / Network pulse</p>
            </Spec>
            <Spec label="Stat (Montserrat 300, tabular)">
              <p className="t-stat">3,031,112</p>
            </Spec>
            <Spec label="Accent (Lora italic)">
              <p className="t-accent" style={{ fontSize: '1.5rem' }}>
                Every block is a heartbeat.
              </p>
            </Spec>
            <Spec label="Mono data">
              <p className="t-mono">t1cz5P2xqK...Dg9 / 12,500 FLUX</p>
            </Spec>
            <Spec label="Small">
              <p className="t-small">Community services. Fees and returns vary by provider.</p>
            </Spec>
          </Grid>
        </Col>
      </Group>

      <Group
        id="motion"
        title="Motion tokens"
        lead="Native scrolling, always. Everything interruptible. Every animation has a calm reduced-motion twin."
      >
        <Grid min={420}>
          {DURATIONS.map(([name, ms, note]) => (
            <MotionDemo
              key={name}
              label={`${name}  ${ms} ms`}
              duration={ms}
              ease="cubic-bezier(0.16, 1, 0.3, 1)"
              note={note}
            />
          ))}
          {EASES.map(([name, curve, note]) => (
            <MotionDemo key={name} label={name} duration={900} ease={curve} note={note} />
          ))}
        </Grid>
      </Group>

      <Group
        id="layout"
        title="Layout helpers"
        lead="Utilities from styles/utilities.css for the cases a CSS module should not re-derive."
      >
        <Spec
          label=".bleed and .bleed-pad"
          note="The band spans the page from inside the container, and .bleed-pad on the same element puts its content back on the container's edges. Nothing between it and #root may clip or scroll. Set --bleed-w (for example 100cqw inside a size container) where 100vw is wrong."
        >
          <div
            className="bleed bleed-pad"
            style={{
              paddingBlock: 20,
              background:
                'linear-gradient(180deg, transparent, rgb(8 10 15 / 0.6) 20%, rgb(8 10 15 / 0.6) 80%, transparent)',
              borderBlock: '1px solid var(--line-2)',
            }}
          >
            <span className="t-label">Full bleed band, content on the container edges</span>
          </div>
        </Spec>
      </Group>
    </>
  );
}
