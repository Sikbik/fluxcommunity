import { useId, useRef, useState } from 'react';
import {
  Button,
  FluxMark,
  GATEWAY_GLYPH,
  Glyph,
  Lattice2D,
  LinkButton,
  Magnetic,
  NewTabHint,
  outboundLink,
  Panel,
  Spotlight,
  Tilt,
  useStageFocus,
} from '@/ui';
import styles from './kit.module.css';
import { Col, Grid, Group, Row, Spec } from './parts';

/** What `outboundLink` returns for three kinds of destination, printed as it is spread onto an anchor. */
const OUTBOUND_EXAMPLES = [
  ['https://cloud.runonflux.com', { withUtm: true }],
  ['#builds', {}],
  ['https://docs.runonflux.com', { newTab: false }],
] as const;

/** A Panel that is the whole link: the attributes and the hint come from `outboundLink`. */
function LinkPanel() {
  const uid = useId();
  const nameId = `${uid}n`;
  const hintId = `${uid}h`;
  const link = outboundLink('https://docs.runonflux.com', { withUtm: true });
  return (
    <Panel
      as="a"
      {...link.props}
      aria-labelledby={link.newTab ? `${nameId} ${hintId}` : nameId}
      interactive
      padding="lg"
    >
      <p className="t-label">docs.runonflux.com</p>
      <h4 className="t-h3" id={nameId} style={{ marginBlockStart: 8 }}>
        Flux Docs
      </h4>
      {link.newTab ? <NewTabHint id={hintId} /> : null}
    </Panel>
  );
}

/** A toggle that swaps its glyph and label, and a one-shot replay: the transport glyphs in use. */
function Transport() {
  const [playing, setPlaying] = useState(true);
  const [runs, setRuns] = useState(0);
  return (
    <Row>
      <Button
        variant="secondary"
        size="sm"
        icon={playing ? 'pause' : 'play'}
        aria-pressed={!playing}
        magnetic={false}
        onClick={() => setPlaying((p) => !p)}
      >
        {playing ? 'Pause motion' : 'Play motion'}
      </Button>
      <Button
        variant="icon"
        size="sm"
        icon="replay"
        label="Replay"
        magnetic={false}
        onClick={() => setRuns((n) => n + 1)}
      />
      <span className={styles.specNote}>{`Replayed ${runs} ${runs === 1 ? 'time' : 'times'}`}</span>
    </Row>
  );
}

function FocusProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useStageFocus(ref, 0.8);
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <Panel interactive tabIndex={0} padding="md">
        <p className="t-label">useStageFocus</p>
        <p className="t-small" style={{ marginBlockStart: 8 }}>
          Hover or tab to me: the lattice lights beneath this panel.
        </p>
      </Panel>
    </div>
  );
}

export function Surfaces() {
  return (
    <>
      <Group
        id="panels"
        title="Panel"
        lead="The glass slab: chamfered cuts, a gradient edge hot on one corner, hex pattern, grain, corner ticks, a spotlight under the cursor."
      >
        <Grid min={300}>
          <Spec label="glass, md (default)">
            <Panel padding="lg" style={{ minBlockSize: 160 }}>
              <p className="t-label">hot tr / pattern br</p>
              <h4 className="t-h3" style={{ marginBlockStart: 10 }}>
                Glass slab
              </h4>
              <p className="t-small" style={{ marginBlockStart: 6 }}>
                Backdrop blur over the lattice.
              </p>
            </Panel>
          </Spec>
          <Spec label="slab (no blur)">
            <Panel variant="slab" padding="lg" hot="bl" pattern="tl" style={{ minBlockSize: 160 }}>
              <p className="t-label">hot bl / pattern tl</p>
              <h4 className="t-h3" style={{ marginBlockStart: 10 }}>
                Opaque slab
              </h4>
              <p className="t-small" style={{ marginBlockStart: 6 }}>
                For long lists and stacks.
              </p>
            </Panel>
          </Spec>
          <Spec label="ghost">
            <Panel variant="ghost" padding="lg" hot="tl" pattern="none" style={{ minBlockSize: 160 }}>
              <p className="t-label">edge and ticks only</p>
              <h4 className="t-h3" style={{ marginBlockStart: 10 }}>
                Ghost
              </h4>
            </Panel>
          </Spec>
          <Spec label="size sm / md / lg">
            <Row>
              <Panel size="sm" padding="sm" style={{ inlineSize: 110, blockSize: 90 }} ticks={false} />
              <Panel size="md" padding="sm" style={{ inlineSize: 130, blockSize: 100 }} />
              <Panel size="lg" padding="sm" style={{ inlineSize: 150, blockSize: 110 }} />
            </Row>
          </Spec>
          <Spec
            label="interactive: spotlight, edge catch, press"
            note="Move the pointer over it. Press to compress."
          >
            <Panel interactive padding="lg" style={{ minBlockSize: 160 }}>
              <h4 className="t-h3">Interactive</h4>
              <p className="t-small" style={{ marginBlockStart: 6 }}>
                The edge catches the cursor.
              </p>
            </Panel>
          </Spec>
          <Spec
            label="interactive + tilt (5 deg) + parallax art"
            note="Fine pointers only. The glyph drifts opposite."
          >
            <Panel interactive tilt padding="lg" style={{ minBlockSize: 160 }}>
              <div
                className="parallax"
                style={{ '--depth': '16px', color: 'var(--accent-strong)' } as React.CSSProperties}
              >
                <Glyph name="cloud" size={56} strokeWidth={1.1} />
              </div>
              <h4 className="t-h3" style={{ marginBlockStart: 10 }}>
                Tilt card
              </h4>
            </Panel>
          </Spec>
          <Spec
            label="as a link: outboundLink + NewTabHint"
            note="The utm, target, rel and the hidden hint in the accessible name come from outboundLink."
          >
            <LinkPanel />
          </Spec>
          <Spec label="tier colour (data-tier)">
            <Row>
              {(['cumulus', 'nimbus', 'stratus'] as const).map((t) => (
                <Panel key={t} tier={t} interactive padding="sm" style={{ inlineSize: 112 }}>
                  <p className="t-label" style={{ color: 'var(--accent-text)' }}>
                    {t}
                  </p>
                  <Glyph
                    name={`tier-${t}`}
                    size={28}
                    style={{ color: 'var(--accent)', marginBlockStart: 10 }}
                  />
                </Panel>
              ))}
            </Row>
          </Spec>
          <Spec label="stage focus" note="Writes a FocusRegion to the stage bus on hover and focus.">
            <FocusProbe />
          </Spec>
          <Spec label="keyboard focus (tab to it)" note="A white-hot beam sweeps the chamfer.">
            <Panel interactive tabIndex={0} padding="lg">
              <p className="t-small">Tab to this panel.</p>
            </Panel>
          </Spec>
        </Grid>
      </Group>

      <Group
        id="buttons"
        title="Buttons and links"
        lead="Primary is a lit accent slab, secondary is glass, ghost is a sweeping underline, icon is square or hex. Magnetic drift on primary and icon."
      >
        <Grid min={360}>
          <Spec label="primary: sm / md / lg">
            <Row>
              <Button variant="primary" size="sm">
                Explore
              </Button>
              <Button variant="primary">Explore community builds</Button>
              <Button variant="primary" size="lg" iconEnd="arrow-right">
                Start here
              </Button>
            </Row>
          </Spec>
          <Spec label="secondary">
            <Row>
              <Button size="sm">Small</Button>
              <Button icon="command">Open the command deck</Button>
              <Button size="lg" iconEnd="arrow-up-right">
                Visit
              </Button>
            </Row>
          </Spec>
          <Spec label="ghost">
            <Row>
              <Button variant="ghost">Copy link</Button>
              <Button variant="ghost" iconEnd="arrow-right">
                Learn more
              </Button>
            </Row>
          </Spec>
          <Spec label="icon: chamfer and hex">
            <Row>
              <Button variant="icon" icon="copy" label="Copy" />
              <Button variant="icon" icon="share" label="Share" />
              <Button variant="icon" icon="menu" shape="hex" label="Menu" />
              <Button variant="icon" icon="sound-on" shape="hex" size="sm" label="Sound" />
              <Button variant="icon" icon="close" size="sm" label="Close" />
            </Row>
          </Spec>
          <Spec label="states: disabled, loading">
            <Row>
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <Button variant="primary" loading>
                Loading
              </Button>
              <Button variant="secondary" loading>
                Loading
              </Button>
            </Row>
          </Spec>
          <Spec label="LinkButton, external (utm, new tab, hint)">
            <Row>
              <LinkButton
                href="https://cloud.runonflux.com"
                withUtm
                variant="primary"
                iconEnd="arrow-up-right"
              >
                Open FluxCloud
              </LinkButton>
              <LinkButton href="#builds" variant="secondary" icon="cells">
                Jump to builds
              </LinkButton>
              <LinkButton href="https://docs.runonflux.com" variant="ghost" iconEnd="arrow-up-right">
                Docs
              </LinkButton>
            </Row>
          </Spec>
          <Spec
            label="outboundLink(href, options)"
            note="Spread .props onto any anchor or Panel as a link. newTab says whether it needs the hint."
          >
            <Col>
              {OUTBOUND_EXAMPLES.map(([href, options]) => {
                const link = outboundLink(href, options);
                return (
                  <p
                    key={`${href}${JSON.stringify(options)}`}
                    className="t-mono"
                    style={{ fontSize: '0.75rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}
                  >
                    <span style={{ color: 'var(--text-1)' }}>{`${href} ${JSON.stringify(options)}`}</span>
                    <br />
                    <span style={{ color: 'var(--text-3)' }}>
                      {`${JSON.stringify(link.props)}, newTab ${link.newTab}`}
                    </span>
                  </p>
                );
              })}
            </Col>
          </Spec>
          <Spec
            label="hiddenUntilFocus (tab into the box)"
            note="Clipped to nothing and out of the flow until it takes focus; then it shows where its style puts it. LinkButton takes it too."
          >
            <div className={styles.demoBox} style={{ position: 'relative' }}>
              <Row>
                <Button size="sm" variant="ghost" magnetic={false}>
                  Before
                </Button>
                <Button
                  hiddenUntilFocus
                  size="sm"
                  variant="primary"
                  magnetic={false}
                  style={{ insetBlockStart: 10, insetInlineStart: 10 }}
                >
                  Skip to content
                </Button>
                <Button size="sm" variant="ghost" magnetic={false}>
                  After
                </Button>
              </Row>
            </div>
          </Spec>
          <Spec
            label="play, pause, replay"
            note="A toggle that swaps glyph and label (aria-pressed), and a one-shot."
          >
            <Transport />
          </Spec>
          <Spec label="magnetic wrapper (any element)">
            <Row>
              <Magnetic>
                <Glyph name="bolt" size={40} style={{ color: 'var(--accent-strong)' }} />
              </Magnetic>
              <Magnetic strength={10} field={120}>
                <span className="t-label">strength 10, field 120</span>
              </Magnetic>
            </Row>
          </Spec>
          <Spec label="Spotlight + Tilt wrappers">
            <Row>
              <Spotlight style={{ padding: 24, border: '1px solid var(--line-2)', borderRadius: 8 }}>
                <span className="t-small">Spotlight</span>
              </Spotlight>
              <Tilt style={{ padding: 24, border: '1px solid var(--line-2)', borderRadius: 8 }}>
                <span className="t-small">Tilt</span>
              </Tilt>
            </Row>
          </Spec>
        </Grid>
      </Group>

      <Group
        id="lattice"
        title="Lattice2D"
        lead="The CSS lattice: the page backdrop until WebGL is ready and the no-WebGL fallback texture. Hairline grid, breathing lit cells, a seamless drift, a vignette."
      >
        <Grid min={420}>
          <Spec label="field" note="Move the pointer: interactive reveals a brighter lattice under it.">
            <div className={styles.artBox} style={{ background: '#000', minBlockSize: 280 }}>
              <Lattice2D intensity={0.8} interactive />
              <span className="t-label" style={{ position: 'relative' }}>
                field / interactive
              </span>
            </div>
          </Spec>
          <Spec label="floor">
            <div className={styles.artBox} style={{ background: '#000', minBlockSize: 280 }}>
              <Lattice2D variant="floor" intensity={0.9} glow="bottom" />
              <span className="t-label" style={{ position: 'relative' }}>
                floor
              </span>
            </div>
          </Spec>
          <Spec label="scale 1.6, speed 0.5, no vignette">
            <div className={styles.artBox} style={{ background: '#000', minBlockSize: 200 }}>
              <Lattice2D scale={1.6} speed={0.5} vignette={false} intensity={0.7} glow="center" />
            </div>
          </Spec>
          <Spec label="animate off (static)">
            <div className={styles.artBox} style={{ background: '#000', minBlockSize: 200 }}>
              <Lattice2D animate={false} intensity={0.7} />
            </div>
          </Spec>
        </Grid>
      </Group>

      <Group
        id="marks"
        title="Flux marks and glyphs"
        lead="The symbol is the official artwork in blue, white, black or gray only. Glyphs are 24 px grid, 1.5 px stroke, square caps, hex-derived."
      >
        <Grid min={360}>
          <Spec label="FluxMark: mark (blue, white, black on light, gray)">
            <Row>
              <FluxMark tone="blue" size={48} />
              <FluxMark tone="white" size={48} />
              <span style={{ background: '#fff', padding: 8, borderRadius: 6 }}>
                <FluxMark tone="black" size={32} />
              </span>
              <FluxMark tone="gray" size={48} />
            </Row>
          </Spec>
          <Spec label="FluxMark: round">
            <Row>
              <FluxMark variant="round" tone="blue" size={48} />
              <FluxMark variant="round" tone="white" size={48} />
              <FluxMark variant="round" tone="black" size={48} />
              <FluxMark variant="round" tone="gray" size={48} />
            </Row>
          </Spec>
          <Spec label="Gateway glyphs (GATEWAY_GLYPH)">
            <Row>
              {Object.values(GATEWAY_GLYPH).map((g) => (
                <Glyph key={g} name={g} size={32} />
              ))}
            </Row>
          </Spec>
        </Grid>
      </Group>
    </>
  );
}
