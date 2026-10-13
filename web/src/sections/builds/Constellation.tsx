/**
 * The constellation: every build as a node in a slowly turning field, hubs for the categories, arcs
 * between builds by the same builder, light that travels when a real block lands. A canvas, so it is
 * hidden from assistive technology; the Cells list is the keyboard and screen reader path, and the
 * button that switches to it is the first thing in this region.
 *
 * This file is the React shell. The picture, the camera and the pointer live in `constellation/`.
 */
import { type AppCategory, CATEGORIES } from '@shared/catalog';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { hexVertices, pointsToPath } from '@/lib/hex';
import { useStageBus } from '@/stage/bus';
import { Button, Glyph, Panel, Tooltip, useReducedMotion } from '@/ui';
import styles from './Constellation.module.css';
import { type ConstellationEngine, createEngine, type HoverTarget } from './constellation/engine';
import { buildGraph } from './constellation/graph';
import { lookOf, type NodeLook, type NodeMark, type NodeTone, placeCard } from './constellation/look';
import { pillCopy } from './health';
import { type AppEntry, categoryLabel } from './model';
import { resolveAppId } from './route';
import { useBuilds } from './state';
import { useClock } from './useClock';

export interface ConstellationProps {
  /** Every app, with its health and lifecycle. */
  entries: readonly AppEntry[];
  /** Ids that pass the current filters; null means all of them. */
  visible: ReadonlySet<string> | null;
  /** The category chip in play, so its hub can read as selected. */
  category: AppCategory | 'all';
  /** The app whose detail is open. */
  selectedId: string | null;
  onOpenApp: (id: string, from: HTMLElement | null) => void;
  onToggleCategory: (category: AppCategory) => void;
  onShowCells: () => void;
}

// ---------------------------------------------------------------------------
// Legend shapes (the same marks the canvas draws)
// ---------------------------------------------------------------------------

const TONE_VAR: Readonly<Record<NodeTone, string>> = {
  ok: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  crit: 'var(--status-crit)',
  off: 'var(--status-off)',
  pending: 'var(--status-pending)',
  self: 'var(--accent-strong)',
};

const OUTLINE = pointsToPath(hexVertices(0, 0, 8.4), true);
const CORE = pointsToPath(hexVertices(0, 0, 4.2), true);
const RING = pointsToPath(hexVertices(0, 0, 8.6), true);

function MarkInner({ mark }: { mark: NodeMark }) {
  switch (mark) {
    case 'live':
      return <path d={CORE} fill="currentColor" />;
    case 'clock':
      return (
        <path
          d="M0 -3.9 L0 0 L2.8 1.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'alert':
      return (
        <>
          <path d="M0 -4 L0 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="0" cy="3.7" r="1" fill="currentColor" />
        </>
      );
    case 'cross':
      return (
        <path
          d="M-2.7 -2.7 L2.7 2.7 M2.7 -2.7 L-2.7 2.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      );
    case 'dots':
      return (
        <>
          <circle cx="-3" cy="0" r="1" fill="currentColor" />
          <circle cx="0" cy="0" r="1" fill="currentColor" />
          <circle cx="3" cy="0" r="1" fill="currentColor" />
        </>
      );
    case 'reticle':
      return (
        <>
          <circle cx="0" cy="0" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="0" cy="0" r="1" fill="currentColor" />
        </>
      );
    default:
      return <path d="M-2.8 0 L2.8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />;
  }
}

function MarkShape({ mark, tone, size = 16 }: { mark: NodeMark; tone: NodeTone; size?: number }) {
  return (
    <svg
      className={styles.shape}
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      aria-hidden="true"
      focusable="false"
      style={{ color: TONE_VAR[tone] }}
    >
      <path
        d={OUTLINE}
        fill="rgb(8 10 15)"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={mark === 'dash' ? '3 2.4' : undefined}
      />
      <MarkInner mark={mark} />
    </svg>
  );
}

const LEGEND: ReadonlyArray<{ mark: NodeMark; tone: NodeTone; label: string }> = [
  { mark: 'live', tone: 'ok', label: 'Live' },
  { mark: 'clock', tone: 'warn', label: 'Up, checked a while ago' },
  { mark: 'alert', tone: 'warn', label: 'Degraded' },
  { mark: 'cross', tone: 'crit', label: 'Offline' },
  { mark: 'dash', tone: 'off', label: 'Not checked yet' },
  { mark: 'dots', tone: 'pending', label: 'Checking' },
  { mark: 'reticle', tone: 'self', label: 'You are here' },
];

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

const coarsePointer = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export default function Constellation({
  entries,
  visible,
  category,
  selectedId,
  onOpenApp,
  onToggleCategory,
  onShowCells,
}: ConstellationProps) {
  const reduced = useReducedMotion();
  const nowMs = useClock(30_000);
  const quality = useStageBus((s) => s.stage.quality);
  const busHold = useStageBus((s) => s.paused || s.ambient);
  const [failed, setFailed] = useState(false);
  const [pointed, setPointed] = useState<HoverTarget | null>(null);
  // The build "Surprise me" flew to: its card shows for a moment, as if the pointer were on it.
  const [flown, setFlown] = useState<string | null>(null);
  const hover = useMemo<HoverTarget | null>(() => {
    if (pointed) return pointed;
    if (!flown) return null;
    return { kind: 'app', id: flown, appId: flown, category: null, index: -1 };
  }, [pointed, flown]);
  const [spin, setSpin] = useState(true);
  const [touched, setTouched] = useState(false);
  const coarse = useMemo(coarsePointer, []);

  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const aboutId = useId();
  const engineRef = useRef<ConstellationEngine | null>(null);
  const cardSize = useRef({ w: 0, h: 0 });

  const callbacks = useRef({ onOpenApp, onToggleCategory, onShowCells });
  callbacks.current = { onOpenApp, onToggleCategory, onShowCells };

  const apps = useMemo(() => entries.map((e) => e.app), [entries]);
  const signature = useMemo(() => apps.map((a) => a.id).join('|'), [apps]);
  // The layout depends on the catalog only: health arriving must not rebuild it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the ids, deliberately
  const graph = useMemo(() => buildGraph(apps, CATEGORIES), [signature]);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const looks = useMemo(() => {
    const m = new Map<string, NodeLook>();
    for (const e of entries) m.set(e.app.id, lookOf(e, nowMs));
    return m;
  }, [entries, nowMs]);

  const resolved = useMemo(() => {
    const r = resolveAppId(selectedId);
    return r.kind === 'app' ? r.app.id : null;
  }, [selectedId]);

  const hold = busHold || resolved !== null;

  // ---- engine lifecycle ---------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas || !view) return;

    const engine = createEngine({
      canvas,
      graph: graphRef.current,
      onHover: setPointed,
      onTrack: (x, y, r, others, labelSide) => {
        const card = cardRef.current;
        if (!card) return;
        const pos = placeCard(
          x,
          y,
          r,
          cardSize.current,
          view.clientWidth,
          view.clientHeight,
          others,
          labelSide,
        );
        card.style.transform = `translate3d(${Math.round(pos.left)}px, ${Math.round(pos.top)}px, 0)`;
      },
      onActivate: (target) => {
        if (target.kind === 'app' && target.appId) {
          callbacks.current.onOpenApp(target.appId, listButtonRef.current);
        } else if (target.kind === 'hub' && target.category) {
          callbacks.current.onToggleCategory(target.category);
        } else if (target.kind === 'center') {
          engineRef.current?.reset();
        }
      },
      onInteract: () => setTouched(true),
    });
    if (!engine) {
      setFailed(true);
      return;
    }
    engineRef.current = engine;

    let inView = false;
    let docVisible = !document.hidden;
    const sync = () => engine.setActive(inView && docVisible);

    const measure = () => {
      const r = view.getBoundingClientRect();
      engine.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(view);
    const io = new IntersectionObserver(
      (list) => {
        const last = list[list.length - 1];
        inView = last ? last.isIntersecting : false;
        sync();
      },
      { threshold: 0.01 },
    );
    io.observe(view);
    const onVisibility = () => {
      docVisible = !document.hidden;
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // The accent switch recolours the structure lines and glows.
    const mo = new MutationObserver(() => engine.restyle());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });

    return () => {
      mo.disconnect();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // ---- state into the engine ----------------------------------------------------------------

  // The engine keeps the looks, the filter and the selection across a new graph.
  useEffect(() => {
    engineRef.current?.setGraph(graph);
  }, [graph]);

  useEffect(() => {
    engineRef.current?.setLooks(looks);
  }, [looks]);

  useEffect(() => {
    engineRef.current?.setFilter(visible);
  }, [visible]);

  useEffect(() => {
    engineRef.current?.setCategory(category === 'all' ? null : category);
  }, [category]);

  useEffect(() => {
    engineRef.current?.setSelected(resolved);
  }, [resolved]);

  useEffect(() => {
    engineRef.current?.setMotion(!reduced);
  }, [reduced]);

  useEffect(() => {
    engineRef.current?.setSpin(spin);
  }, [spin]);

  useEffect(() => {
    engineRef.current?.setHold(hold);
  }, [hold]);

  useEffect(() => {
    engineRef.current?.setQuality(quality);
  }, [quality]);

  // A real block lights the field. The data layer fires the pulse only for live blocks.
  useEffect(() => {
    let last = useStageBus.getState().pulses.reduce((m, p) => Math.max(m, p.id), 0);
    return useStageBus.subscribe((s) => {
      for (const p of s.pulses) {
        if (p.id <= last) continue;
        last = p.id;
        if (p.kind === 'block') engineRef.current?.pulse();
      }
    });
  }, []);

  // "Surprise me" flies the camera to the build.
  const ping = useBuilds((s) => s.ping);
  const lastPing = useRef(ping?.seq ?? 0);
  useEffect(() => {
    if (!ping || ping.seq === lastPing.current) return;
    lastPing.current = ping.seq;
    engineRef.current?.flyTo(ping.id);
    setFlown(ping.id);
    const t = window.setTimeout(() => setFlown((id) => (id === ping.id ? null : id)), 2800);
    return () => window.clearTimeout(t);
  }, [ping]);

  // The hover card's size, measured once per target so tracking never reads layout twice.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !hover) return;
    cardSize.current = { w: card.offsetWidth, h: card.offsetHeight };
  }, [hover]);

  // ---- toolbar ------------------------------------------------------------------------------

  const zoomIn = useCallback(() => engineRef.current?.zoomBy(1.25), []);
  const zoomOut = useCallback(() => engineRef.current?.zoomBy(0.8), []);
  const resetView = useCallback(() => engineRef.current?.reset(), []);
  const toggleSpin = useCallback(() => setSpin((s) => !s), []);

  // ---- hover card ---------------------------------------------------------------------------

  const card = useMemo(() => {
    if (!hover) return null;
    if (hover.kind === 'app') {
      const e = entries.find((x) => x.app.id === hover.appId);
      if (!e) return null;
      const copy = pillCopy(e.health, nowMs);
      const look = looks.get(e.app.id);
      return {
        key: e.app.id,
        title: e.app.name,
        meta: `${categoryLabel(e.app.category)}${e.app.builder ? `. Built by ${e.app.builder}` : ''}`,
        status: look ? { mark: look.mark, tone: look.tone, word: copy.word, detail: copy.detail } : null,
        note: e.lifecycle.state === 'live' ? null : e.lifecycle.sentence,
        hint: 'Click to open the details',
      };
    }
    if (hover.kind === 'hub' && hover.category) {
      const inCat = entries.filter((x) => x.app.category === hover.category);
      const shown = visible ? inCat.filter((x) => visible.has(x.app.id)).length : inCat.length;
      const on = category === hover.category;
      return {
        key: hover.id,
        title: categoryLabel(hover.category),
        meta: `${inCat.length} ${inCat.length === 1 ? 'build' : 'builds'}${shown !== inCat.length ? `, ${shown} shown` : ''}`,
        status: null,
        note: null,
        hint: on ? 'Click to show every category' : 'Click to show only this category',
      };
    }
    return {
      key: 'center',
      title: 'Flux',
      meta: 'Every build here runs on the Flux network',
      status: null,
      note: null,
      hint: 'Click to reset the view',
    };
  }, [hover, entries, looks, nowMs, visible, category]);

  // What the legend needs to explain, so it never lists a shape that is not on screen.
  const legend = useMemo(() => {
    const marks = new Set<NodeMark>();
    for (const look of looks.values()) marks.add(look.mark);
    return LEGEND.filter((l) => marks.has(l.mark));
  }, [looks]);
  const hasBuilderArcs = useMemo(() => graph.edges.some((e) => e.kind === 'builder'), [graph]);
  const hasHandover = useMemo(() => graph.edges.some((e) => e.kind === 'handover'), [graph]);
  const hasNew = useMemo(() => [...looks.values()].some((l) => l.lifecycle === 'new'), [looks]);
  const hasRetiring = useMemo(() => [...looks.values()].some((l) => l.lifecycle === 'retiring'), [looks]);

  const hint = reduced
    ? 'Motion is reduced, so the view holds still. Drag to turn it.'
    : coarse
      ? 'Drag to turn, pinch to zoom, tap a build.'
      : 'Drag to turn. Hold Ctrl and scroll, or pinch, to zoom. Click a build to open it.';

  if (failed) {
    return (
      <Panel variant="slab" halo={false} className={styles.frame} contentClassName={styles.failed}>
        <p>
          The constellation could not start on this device.{' '}
          <button type="button" className={styles.link} onClick={onShowCells}>
            Show the list instead
          </button>
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      variant="slab"
      halo={false}
      padding="none"
      pattern="none"
      className={styles.frame}
      contentClassName={styles.stage}
      data-constellation=""
    >
      <p id={aboutId} className="sr-only">
        A visual map of the builds, for pointer and touch. Use Show as list for the same builds with full
        keyboard and screen reader support.
      </p>
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Constellation view"
        aria-describedby={aboutId}
      >
        <Button
          ref={listButtonRef}
          variant="secondary"
          size="sm"
          icon="cells"
          magnetic={false}
          onClick={onShowCells}
          className={styles.list}
        >
          Show as list
        </Button>
        <span className={styles.spacer} />
        {reduced ? null : (
          <Button
            variant="secondary"
            size="sm"
            icon={spin ? 'pause' : 'play'}
            aria-pressed={!spin}
            aria-label={spin ? 'Pause turn' : 'Resume turn'}
            magnetic={false}
            onClick={toggleSpin}
            className={styles.spin}
          >
            <span className={styles.spinLabel}>{spin ? 'Pause turn' : 'Resume turn'}</span>
          </Button>
        )}
        <Tooltip content="Zoom in">
          <Button variant="icon" size="sm" icon="plus" label="Zoom in" magnetic={false} onClick={zoomIn} />
        </Tooltip>
        <Tooltip content="Zoom out">
          <Button variant="icon" size="sm" icon="minus" label="Zoom out" magnetic={false} onClick={zoomOut} />
        </Tooltip>
        <Tooltip content="Reset the view">
          <Button
            variant="icon"
            size="sm"
            icon="expand"
            label="Reset the view"
            magnetic={false}
            onClick={resetView}
          />
        </Tooltip>
      </div>

      <div className={styles.view} ref={viewRef}>
        <div className={styles.plot} aria-hidden="true">
          <canvas ref={canvasRef} className={styles.canvas} />

          <div ref={cardRef} className={cn('chamfer', styles.card)} data-open={card ? 'true' : 'false'}>
            {card ? (
              <div key={card.key} className={styles.cardBody}>
                <span className={styles.cardTitle}>{card.title}</span>
                <span className={styles.cardMeta}>{card.meta}</span>
                {card.status ? (
                  <span className={styles.cardStatus}>
                    <MarkShape mark={card.status.mark} tone={card.status.tone} size={15} />
                    <span>{card.status.word}</span>
                    {card.status.detail ? (
                      <span className={styles.cardDetail}>{card.status.detail}</span>
                    ) : null}
                  </span>
                ) : null}
                {card.note ? <span className={styles.cardNote}>{card.note}</span> : null}
                <span className={styles.cardHint}>{card.hint}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.legend} aria-hidden="true">
        <ul className={styles.keys}>
          {legend.map((l) => (
            <li key={l.mark}>
              <MarkShape mark={l.mark} tone={l.tone} />
              {l.label}
            </li>
          ))}
          {hasBuilderArcs ? (
            <li>
              <span className={styles.arc} data-kind="builder" />
              Same builder
            </li>
          ) : null}
          {hasHandover ? (
            <li>
              <span className={styles.arc} data-kind="handover" />
              Handover
            </li>
          ) : null}
          {hasNew ? (
            <li>
              <Glyph name="spark" size={14} />
              New
            </li>
          ) : null}
          {hasRetiring ? (
            <li>
              <svg className={styles.ringKey} viewBox="-10 -10 20 20" aria-hidden="true" focusable="false">
                <path d={RING} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
              </svg>
              Retiring
            </li>
          ) : null}
        </ul>
        <p className={styles.hint} data-touched={touched ? 'true' : undefined}>
          {hint}
        </p>
      </div>
    </Panel>
  );
}
