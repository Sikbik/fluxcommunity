import { useEffect, useState } from 'react';
import { useStageBus } from '@/stage/bus';
import {
  Button,
  Chip,
  CountUp,
  ExtLink,
  FreshnessChip,
  HexBullet,
  HexRing,
  Kbd,
  Marquee,
  Meter,
  Odometer,
  Panel,
  Reveal,
  Skeleton,
  Sparkline,
  SplitReveal,
  Stat,
  StatusDot,
} from '@/ui';
import { Col, Grid, Group, Row, Spec } from './parts';

const GAMES = [
  'Minecraft',
  'Valheim',
  'Rust',
  'Palworld',
  'Project Zomboid',
  'FiveM',
  'ARK: Survival Ascended',
  'Terraria',
  'Factorio',
  "Don't Starve Together",
] as const;

function useFakeIntervals(): number[] {
  const [values, setValues] = useState<number[]>(() =>
    Array.from({ length: 40 }, (_, i) => 30 + Math.sin(i / 3) * 4 + ((i * 37) % 7) - 3),
  );
  useEffect(() => {
    const t = window.setInterval(() => {
      setValues((v) => [...v.slice(1), 30 + (Math.random() - 0.5) * 14]);
    }, 2500);
    return () => window.clearInterval(t);
  }, []);
  return values;
}

export function DataKit() {
  const [height, setHeight] = useState(3_031_112);
  const [replay, setReplay] = useState(0);
  const intervals = useFakeIntervals();
  const [pct, setPct] = useState(0.58);
  const [hover, setHover] = useState<string | null>(null);
  const [entered, setEntered] = useState<string | null>(null);

  return (
    <>
      <Group
        id="status"
        title="Status and freshness"
        lead="Honest data. A chip says LIVE, CACHED or OFFLINE and how old the number is. Colour is never the only carrier."
      >
        <Grid min={340}>
          <Spec label="FreshnessChip">
            <Col>
              <Row>
                <FreshnessChip freshness="live" ageMs={3000} />
                <FreshnessChip freshness="live" ageMs={9000} polling />
                <FreshnessChip freshness="cached" ageMs={125000} />
              </Row>
              <Row>
                <FreshnessChip freshness="offline" ageMs={null} />
                <FreshnessChip freshness="unknown" ageMs={null} />
                <FreshnessChip value={{ freshness: 'live', ageMs: 400 }} />
              </Row>
            </Col>
          </Spec>
          <Spec label="StatusDot and HexBullet">
            <Row>
              <StatusDot status="ok" pulse />
              <StatusDot status="pending" />
              <StatusDot status="warn" />
              <StatusDot status="crit" />
              <StatusDot status="off" />
              <HexBullet size={10} />
              <HexBullet size={14} filled={false} />
              <HexBullet size={12} pulse style={{ color: 'var(--status-ok)' }} />
            </Row>
          </Spec>
          <Spec label="Chip: label, status, tier, accent">
            <Row>
              <Chip>Label</Chip>
              <Chip tone="accent">Accent</Chip>
              <Chip status="ok" icon="status-ok">
                Live
              </Chip>
              <Chip status="warn" icon="status-warn">
                Retiring Nov 1
              </Chip>
              <Chip status="crit" icon="status-crit">
                Offline
              </Chip>
              <Chip status="off">Unchecked</Chip>
            </Row>
            <Row>
              <Chip tier="cumulus" icon="tier-cumulus">
                Cumulus
              </Chip>
              <Chip tier="nimbus" icon="tier-nimbus">
                Nimbus
              </Chip>
              <Chip tier="stratus" icon="tier-stratus">
                Stratus
              </Chip>
              <Chip size="sm">sm</Chip>
            </Row>
          </Spec>
          <Spec label="Chip: filter (selectable, with counts)">
            <Row>
              {['All', 'Network', 'Nodes', 'Rewards'].map((c, i) => (
                <Chip
                  key={c}
                  kind="filter"
                  count={[14, 3, 4, 3][i]}
                  selected={hover === c || (hover === null && i === 0)}
                  onClick={() => setHover(c)}
                >
                  {c}
                </Chip>
              ))}
            </Row>
          </Spec>
          <Spec label="Kbd">
            <Row>
              <Kbd combo="mod+k" />
              <Kbd>Esc</Kbd>
              <Kbd combo="shift+/" />
              <Kbd size="sm">/</Kbd>
            </Row>
          </Spec>
          <Spec label="ExtLink">
            <p className="t-body">
              Read the{' '}
              <ExtLink href="https://docs.runonflux.com" withUtm>
                Flux documentation
              </ExtLink>{' '}
              or{' '}
              <ExtLink href="https://runonflux.com" tone="plain">
                visit runonflux.com
              </ExtLink>
              .
            </p>
          </Spec>
        </Grid>
      </Group>

      <Group
        id="data"
        title="Numbers and gauges"
        lead="Odometer rolls digits when a value changes; CountUp counts up the first time it is seen; Sparkline draws a live series with a target line; HexRing is a segmented hex gauge."
      >
        <Grid min={320}>
          <Spec
            label="Odometer (block height)"
            note="Each press adds a block. Rolls digit by digit, wraps 9 to 0."
          >
            <Panel padding="md">
              <Stat
                label="Block height"
                value={<Odometer value={height} />}
                sub="Real blocks arrive about every 30 s."
                freshness={{ freshness: 'live', ageMs: 4000 }}
              />
              <Row>
                <Button size="sm" variant="secondary" onClick={() => setHeight((h) => h + 1)}>
                  +1
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setHeight((h) => h + 17)}>
                  +17
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHeight((h) => h - 1)}>
                  -1
                </Button>
              </Row>
            </Panel>
          </Spec>
          <Spec label="CountUp" note="Counts up when it scrolls into view.">
            <Panel padding="md" key={replay}>
              <Stat label="Nodes online" value={<CountUp value={7231} />} sub="Across 64 countries" />
              <Row align="end">
                <Stat
                  label="FLUX price"
                  value={<CountUp value={0.0746} decimals={4} prefix="$" />}
                  size="sm"
                />
                <Button size="sm" variant="ghost" onClick={() => setReplay((r) => r + 1)}>
                  Replay
                </Button>
              </Row>
            </Panel>
          </Spec>
          <Spec
            label="Sparkline: target line, live append"
            note="A new point arrives every 2.5 s. Hover for values."
          >
            <Panel padding="md">
              <Sparkline
                values={intervals}
                target={30}
                targetLabel="30 s"
                label="Block interval, seconds"
                height={96}
              />
            </Panel>
          </Spec>
          <Spec label="HexRing: tiers (hover one to dim the others)">
            <Panel padding="md">
              <Row>
                {(['cumulus', 'nimbus', 'stratus'] as const).map((t, i) => (
                  <div
                    key={t}
                    onPointerEnter={() => setHover(t)}
                    onPointerLeave={() => setHover(null)}
                    style={{ display: 'grid', justifyItems: 'center', gap: 8 }}
                  >
                    <HexRing
                      tier={t}
                      size={104}
                      value={[0.58, 0.31, 0.11][i] ?? 0}
                      dim={hover !== null && hover !== t && ['cumulus', 'nimbus', 'stratus'].includes(hover)}
                      label={`${t}: ${Math.round(([0.58, 0.31, 0.11][i] ?? 0) * 100)} percent of nodes`}
                    >
                      <span
                        className="t-num"
                        style={{ color: 'var(--text-1)', font: '600 1.125rem var(--font-display)' }}
                      >
                        {Math.round(([0.58, 0.31, 0.11][i] ?? 0) * 100)}%
                      </span>
                    </HexRing>
                    <span className="t-label" style={{ color: `var(--tier-${t})` }}>
                      {t}
                    </span>
                  </div>
                ))}
              </Row>
            </Panel>
          </Spec>
          <Spec label="HexRing: value, segments">
            <Panel padding="md">
              <Row>
                <HexRing value={pct} size={96} segments={6}>
                  <b>{Math.round(pct * 100)}</b>
                </HexRing>
                <HexRing value={pct} size={96} segments={24} stroke={4}>
                  <b>{Math.round(pct * 100)}</b>
                </HexRing>
                <Col>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPct((p) => (p >= 0.95 ? 0.1 : p + 0.17))}
                  >
                    Fill
                  </Button>
                </Col>
              </Row>
            </Panel>
          </Spec>
          <Spec label="Meter and Stat">
            <Panel padding="md">
              <Col>
                <Stat label="Storage" value="9.4" unit="PB" sub="of 21 PB provisioned" size="sm" />
                <Meter value={0.45} label="Storage in use" />
                <Meter value={0.78} label="Memory in use" size="lg" />
                <Meter value={0.3} label="Cumulus share" tier="cumulus" />
              </Col>
            </Panel>
          </Spec>
          <Spec label="Skeleton">
            <Col>
              <Skeleton height={36} width="60%" />
              <Skeleton height={14} />
              <Skeleton height={14} width="80%" />
            </Col>
          </Spec>
        </Grid>
      </Group>

      <Group
        id="motion-kit"
        title="Reveal, split, marquee, beat"
        lead="Reveal is opacity, 24 px rise and 8 px un-blur, once, staggered 60 ms. Reduced motion keeps only the fade."
      >
        <Grid min={340}>
          <Spec label="Reveal: staggered">
            <Col>
              {[0, 1, 2].map((i) => (
                <Reveal key={i} index={i}>
                  <Panel padding="sm">
                    <span className="t-small">
                      Item {i + 1}, index {i}
                    </span>
                  </Panel>
                </Reveal>
              ))}
            </Col>
          </Spec>
          <Spec label="SplitReveal: words, with emphasis">
            <SplitReveal as="h3" className="t-h2" immediate>
              What the <b className="t-grad">community</b> built.
            </SplitReveal>
          </Spec>
          <Spec label="SplitReveal: by line">
            <SplitReveal as="p" by="line" className="t-lead">
              Apps and tools from Flux community members, spotlighted by the Flux team. Every status is
              checked live.
            </SplitReveal>
          </Spec>
          <Spec
            label="The Beat"
            note="Fires a real-looking block pulse on the stage bus: ticks flare, hairlines brighten."
          >
            <Row>
              <Button
                variant="secondary"
                icon="bolt"
                onClick={() => useStageBus.getState().firePulse('block')}
              >
                Fire a block pulse
              </Button>
              <Button
                variant="ghost"
                onClick={() => useStageBus.getState().firePulse('success', null, null, 0.8)}
              >
                Success pulse
              </Button>
            </Row>
          </Spec>
        </Grid>
        <div style={{ marginBlockStart: 28 }}>
          <Spec label="Marquee: pausable, hover and focus pause, off-screen pause, reduced-motion list">
            <Marquee label="Games on Flux" speed={42}>
              {GAMES.map((g) => (
                <span key={g} className="t-label" style={{ fontSize: '1rem', color: 'var(--text-2)' }}>
                  {g}
                </span>
              ))}
            </Marquee>
            <Marquee label="Builders" speed={30} direction="right" control={false}>
              {['2ndTL Mining', 'Physalis', 'Little Stache', 'Method', 'CarRamRodB16_228', 'Goldie'].map(
                (g) => (
                  <span key={g} className="t-accent" style={{ fontSize: '1.25rem' }}>
                    Built by {g}
                  </span>
                ),
              )}
            </Marquee>
          </Spec>
        </div>
        <div style={{ marginBlockStart: 28 }}>
          <Spec
            label="Marquee: items + renderItem (per-item state, hoverCopies)"
            note={`Hover a name: it lights in every copy as it passes, and onItemEnter reports it. Last entered: ${entered ?? 'none yet'}.`}
          >
            <Marquee
              label="Games on Flux, data-driven"
              speed={36}
              items={GAMES}
              getKey={(g) => g}
              hoverCopies
              onItemEnter={(g) => setEntered(g)}
              renderItem={(g, state) => (
                <span
                  className="t-label"
                  data-lit={state.hovered || state.focused ? 'true' : undefined}
                  style={{
                    fontSize: '1rem',
                    color: state.hovered || state.focused ? 'var(--text-1)' : 'var(--text-3)',
                    transition: 'color var(--dur-2) var(--ease-out)',
                  }}
                >
                  {g}
                </span>
              )}
            />
          </Spec>
        </div>
      </Group>
    </>
  );
}
