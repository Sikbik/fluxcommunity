import { useState } from 'react';
import {
  Button,
  Dialog,
  Drawer,
  GLYPH_GROUPS,
  Glyph,
  type GlyphName,
  Kbd,
  Panel,
  SearchField,
  SegmentedControl,
  Select,
  Switch,
  TabPanel,
  Tabs,
  Tooltip,
  toast,
} from '@/ui';
import styles from './kit.module.css';
import { Col, Grid, Group, Row, Spec } from './parts';

export function OverlayKit() {
  const [drawer, setDrawer] = useState<null | 'right' | 'bottom'>(null);
  const [dialog, setDialog] = useState(false);
  const [view, setView] = useState<'cells' | 'constellation'>('cells');
  const [tab, setTab] = useState<'describe' | 'place' | 'run'>('describe');
  const [on, setOn] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'spotlight' | 'az' | 'status'>('spotlight');

  return (
    <>
      <Group
        id="controls"
        title="Controls"
        lead="Segmented control, tabs, switch, search field, select. All keyboard complete."
      >
        <Grid min={340}>
          <Spec label="SegmentedControl" note="Arrow keys move and select; one tab stop.">
            <SegmentedControl
              aria-label="View"
              value={view}
              onValueChange={setView}
              options={[
                { value: 'cells', label: 'Cells', icon: 'cells' },
                { value: 'constellation', label: 'Constellation', icon: 'constellation' },
              ]}
            />
          </Spec>
          <Spec label="Tabs + TabPanel">
            <Col>
              <Tabs
                idBase="kit"
                aria-label="How an app runs"
                value={tab}
                onValueChange={setTab}
                items={[
                  { value: 'describe', label: 'Describe' },
                  { value: 'place', label: 'Place' },
                  { value: 'run', label: 'Run', count: 3 },
                ]}
              />
              <TabPanel idBase="kit" value="describe" active={tab === 'describe'}>
                <p className="t-small">A spec panel types itself: name, image, cpu, ram.</p>
              </TabPanel>
              <TabPanel idBase="kit" value="place" active={tab === 'place'}>
                <p className="t-small">Independent nodes in different regions are chosen.</p>
              </TabPanel>
              <TabPanel idBase="kit" value="run" active={tab === 'run'}>
                <p className="t-small">Instances come online and traffic reroutes.</p>
              </TabPanel>
            </Col>
          </Spec>
          <Spec label="Switch">
            <Col>
              <Switch checked={on} onCheckedChange={setOn}>
                Auto ambient mode
              </Switch>
              <Switch checked={false} onCheckedChange={() => {}} disabled>
                Disabled
              </Switch>
            </Col>
          </Spec>
          <Spec label="SearchField + Select">
            <Col>
              <SearchField
                aria-label="Search community builds"
                placeholder="Search builds"
                shortcut="/"
                value={query}
                onValueChange={setQuery}
              />
              <Select
                label="Sort"
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: 'spotlight', label: 'Spotlight' },
                  { value: 'az', label: 'A to Z' },
                  { value: 'status', label: 'Status' },
                ]}
              />
            </Col>
          </Spec>
          <Spec label="Tooltip" note="Hover or tab. Escape dismisses.">
            <Row>
              <Tooltip content="Copy link" shortcut="c">
                <Button variant="icon" icon="copy" label="Copy link" />
              </Tooltip>
              <Tooltip content="Bottom placement" placement="bottom">
                <Button variant="secondary" size="sm">
                  Hover me
                </Button>
              </Tooltip>
              <Tooltip content="Flux blue, the brand colour" placement="right">
                <Button variant="ghost" size="sm" icon="info">
                  Right
                </Button>
              </Tooltip>
            </Row>
          </Spec>
        </Grid>
      </Group>

      <Group
        id="overlays"
        title="Drawer, Dialog, Toast"
        lead="Modal surfaces: focus trapped, the page inert and scroll-locked, Escape closes, focus returns. Drawer is a side panel on desktop and a bottom sheet on phones."
      >
        <Row>
          <Button variant="secondary" onClick={() => setDrawer('right')}>
            Open drawer (right)
          </Button>
          <Button variant="secondary" onClick={() => setDrawer('bottom')}>
            Open bottom sheet
          </Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
          <Button variant="ghost" onClick={() => toast('Link copied')}>
            Toast
          </Button>
          <Button variant="ghost" onClick={() => toast.success('Copied the message', { id: 'copy' })}>
            Success
          </Button>
          <Button variant="ghost" onClick={() => toast.warn('Showing the last known numbers')}>
            Warn
          </Button>
          <Button variant="ghost" onClick={() => toast.error('Could not reach the API')}>
            Error
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast('Removed', { action: { label: 'Undo', onClick: () => toast('Restored') } })}
          >
            With action
          </Button>
        </Row>
      </Group>

      <Group id="glyphs" title="Glyph set" lead="Custom, hex-derived. Names are the `name` prop of <Glyph>.">
        <Col>
          {Object.entries(GLYPH_GROUPS).map(([group, names]) => (
            <div key={group} className={styles.stack}>
              <span className={styles.specLabel}>{group}</span>
              <div className={styles.glyphGrid}>
                {names.map((n: GlyphName) => (
                  <div key={n} className={styles.glyph}>
                    <Glyph name={n} size={28} />
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Col>
      </Group>

      <Drawer
        open={drawer === 'right' || drawer === 'bottom'}
        onClose={() => setDrawer(null)}
        side={drawer === 'bottom' ? 'bottom' : 'right'}
        title="Flux Atlas"
        description="By Little Stache"
        actions={
          <Button
            variant="icon"
            size="sm"
            icon="copy"
            label="Copy link"
            magnetic={false}
            onClick={() => toast('Link copied')}
          />
        }
        footer={
          <Button variant="primary" iconEnd="arrow-up-right" fullWidth>
            Launch app
          </Button>
        }
      >
        <Col>
          <p className="t-lead">
            Watch every node, app and block on the Proof of Node chain as it happens, on a live 3D globe.
          </p>
          <Panel padding="md">
            <p className="t-small">Health: up, 142 ms, since 3 days.</p>
          </Panel>
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static demo content
            <Panel key={i} variant="slab" padding="md">
              <p className="t-small">Scrolling content block {i + 1}</p>
            </Panel>
          ))}
          <Button variant="secondary" data-autofocus>
            First focus target
          </Button>
        </Col>
      </Drawer>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Add your app"
        description="Compose a message for the Flux Discord. Nothing is stored."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                toast.success('Copied the message');
                setDialog(false);
              }}
            >
              Copy message
            </Button>
          </>
        }
      >
        <Col>
          <SearchField
            aria-label="App name"
            prompt="$"
            placeholder="App name"
            value=""
            onValueChange={() => {}}
            autoFocus
          />
          <p className="t-small">
            Press <Kbd size="sm">Esc</Kbd> to close.
          </p>
        </Col>
      </Dialog>
    </>
  );
}
