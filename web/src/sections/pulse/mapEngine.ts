/**
 * The world map's imperative core: owns the canvas, its size and pixel ratio, the scene, the frame
 * loop and the pointer. React hands it data and flags and listens for hover and layout; nothing in
 * the loop goes through React state.
 *
 * Frame policy: a continuous loop (capped near 30 fps) runs only while the map is on screen, the tab
 * is visible, the stage is not paused and motion is allowed. Otherwise a frame is drawn on demand, once,
 * whenever something changes, and the canvas costs nothing at rest.
 */
import type { GeoPoint } from '@shared/api';
import { mulberry32 } from '@/lib/rng';
import { buildClusters, type Placed, pickCluster, placeClusters, type TierFilter } from './clusters';
import { buildLattice, type Lattice, lightGain, lightLattice, pickTwinklers } from './lattice';
import {
  drawFrame,
  type FrameState,
  type MapColors,
  makeSprites,
  makeStyles,
  readMapColors,
  renderBase,
  type Scene,
  type SceneStyles,
  splitByTier,
  type Tween,
  type TweenFrom,
} from './mapDraw';
import { getLandMask } from './mask';
import { type MapView, makeView } from './projection';

export interface MapLayout {
  placed: Placed[];
  width: number;
  height: number;
  /** Clusters drawn (after the filter). */
  count: number;
}

export interface EngineOptions {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  onHover: (cluster: Placed | null) => void;
  onLayout: (layout: MapLayout) => void;
}

export interface MapEngine {
  setData(points: readonly GeoPoint[], filter: TierFilter): void;
  setHighlight(cc: string | null): void;
  setMuted(muted: boolean): void;
  setAnimate(animate: boolean): void;
  setPaused(paused: boolean): void;
  /** Redraws the static layer (accent change, fonts loaded). */
  restyle(): void;
  dispose(): void;
}

/** Ambient animation (twinkle, breathing) is slow, so it is drawn at about 15 fps. */
const AMBIENT_MS = 66;
const INTRO_MS = 1100;
const TWEEN_MS = 340;

export function createMapEngine(opts: EngineOptions): MapEngine {
  const { wrap, canvas } = opts;
  const ctx = canvas.getContext('2d');
  const mask = getLandMask();

  let points: readonly GeoPoint[] = [];
  let filter: TierFilter = 'all';
  let highlight: string | null = null;
  let muted = false;
  let animate = true;
  let paused = false;
  let onScreen = false;
  let docVisible = typeof document === 'undefined' ? true : !document.hidden;
  let disposed = false;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let colors: MapColors | null = null;
  let sprites: Scene['sprites'] | null = null;
  let styles: SceneStyles | null = null;
  let view: MapView | null = null;
  let lattice: Lattice | null = null;
  let base: HTMLCanvasElement | null = null;
  let twinkle: Scene['twinkle'] | null = null;
  let scene: Scene | null = null;
  let hover: number | null = null;
  let hoverCluster: Placed | null = null;
  let introStart: number | null = null;
  let tween: Tween | null = null;
  let raf = 0;
  let timer = 0;
  let layoutKey = '';

  // ---- scene ------------------------------------------------------------------------------------

  function ensureColors(): MapColors {
    if (!colors) colors = readMapColors(canvas);
    if (!sprites) sprites = makeSprites(colors);
    if (!styles) styles = makeStyles(colors);
    return colors;
  }

  /** The size-dependent layers: lattice, static bitmap, twinklers. Rebuilt on resize and restyle. */
  function buildStatic(): boolean {
    if (width < 48 || height < 24) return false;
    const c = ensureColors();
    view = makeView(width, height);
    lattice = buildLattice(view, mask);
    twinkle = pickTwinklers(lattice, mulberry32(0x5eed + Math.round(width)));
    base = document.createElement('canvas');
    const stub = { view, dpr, lattice, colors: c, base } as Scene;
    renderBase(stub);
    return true;
  }

  function buildScene(): void {
    if (!view || !lattice || !base || !twinkle || !colors || !sprites || !styles) return;
    const clusters = buildClusters(points, filter);
    const placed = placeClusters(clusters, view);
    const light = lightLattice(lattice, placed, lightGain(view.width));
    const previous = scene;
    scene = {
      view,
      dpr,
      lattice,
      light,
      placed,
      indexSet: new Set(placed.map((p) => p.index)),
      base,
      sprites,
      colors,
      twinkle,
      styles,
      byTier: splitByTier(placed),
    };
    // Crossfade from the previous filter's look when only the filter or the data changed.
    tween = null;
    if (previous && previous.view === view && previous.placed.length + placed.length > 0 && !prefersStill()) {
      const from = new Map<number, TweenFrom>();
      for (const p of previous.placed) {
        from.set(p.index, { x: p.x, y: p.y, halo: p.halo, core: p.core, tier: p.dominant });
      }
      tween = { startedAt: performance.now(), durationMs: TWEEN_MS, from, light: previous.light };
    }
    if (hoverCluster) {
      const still = placed.find((p) => p.index === hoverCluster?.index) ?? null;
      setHover(still);
    }
    const key = `${width}x${height}:${placed.length}:${filter}`;
    if (key !== layoutKey) {
      layoutKey = key;
      opts.onLayout({ placed, width, height, count: placed.length });
    }
  }

  function prefersStill(): boolean {
    return !animate;
  }

  // ---- frames --------------------------------------------------------------------------------------

  function continuous(): boolean {
    return animate && onScreen && docVisible && !paused;
  }

  function schedule(): void {
    if (raf || disposed || !scene) return;
    window.clearTimeout(timer);
    timer = 0;
    raf = requestAnimationFrame(frame);
  }

  /** The next ambient frame: wait out the rest of the ambient interval, then draw on a vsync. */
  function scheduleAmbient(now: number): void {
    if (raf || timer || disposed) return;
    const wait = Math.max(0, AMBIENT_MS - (performance.now() - now));
    timer = window.setTimeout(() => {
      timer = 0;
      schedule();
    }, wait);
  }

  function frameState(now: number): FrameState {
    let intro = 1;
    // The map comes online the first time it is actually on screen with something to show.
    if (animate && scene && scene.placed.length > 0) {
      if (introStart === null && onScreen) introStart = now;
      intro = introStart === null ? 0 : Math.min(1, (now - introStart) / INTRO_MS);
    }
    return { now, hover, highlight, intro, tween, muted, animate: animate && continuous() };
  }

  function frame(now: number): void {
    raf = 0;
    if (disposed || !scene || !ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const state = frameState(now);
    drawFrame(ctx, scene, state);
    const tweening = tween !== null && now - tween.startedAt < tween.durationMs;
    if (tween && !tweening) tween = null;
    const introducing = introStart !== null && animate && now - introStart < INTRO_MS;
    if (tweening || introducing) schedule();
    else if (continuous()) scheduleAmbient(now);
  }

  /** Draw at the next vsync (also cancels a waiting ambient tick). */
  function redraw(): void {
    schedule();
  }

  // ---- size ----------------------------------------------------------------------------------------------

  function resize(): void {
    const rect = wrap.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (w === width && h === height && ratio === dpr) return;
    width = w;
    height = h;
    dpr = ratio;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    scene = null;
    tween = null;
    layoutKey = '';
    if (buildStatic()) buildScene();
    redraw();
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(wrap);

  const intersection = new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      onScreen = e.isIntersecting;
      if (onScreen) redraw();
    },
    { rootMargin: '120px 0px' },
  );
  intersection.observe(wrap);

  const onVisibility = () => {
    docVisible = !document.hidden;
    if (docVisible) redraw();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---- pointer -------------------------------------------------------------------------------------------

  function setHover(next: Placed | null): void {
    const index = next ? next.index : null;
    if (index === hover) return;
    hover = index;
    hoverCluster = next;
    opts.onHover(next);
    redraw();
  }

  function localPoint(e: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const onMove = (e: PointerEvent) => {
    if (!scene) return;
    const { x, y } = localPoint(e);
    const hit = pickCluster(scene.placed, x, y, e.pointerType === 'touch' ? 16 : 10);
    setHover(hit);
    canvas.style.cursor = hit ? 'crosshair' : '';
  };
  const onLeave = () => setHover(null);
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !scene) return;
    const { x, y } = localPoint(e);
    setHover(pickCluster(scene.placed, x, y, 18));
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);

  // Fonts arrive after the first paint; the scale labels are drawn with the mono face.
  void document.fonts?.ready.then(() => {
    if (disposed) return;
    if (buildStatic()) buildScene();
    redraw();
  });

  resize();

  return {
    setData(next, nextFilter) {
      const changed = next !== points || nextFilter !== filter;
      points = next;
      filter = nextFilter;
      if (changed && view) buildScene();
      redraw();
    },
    setHighlight(cc) {
      if (cc === highlight) return;
      highlight = cc;
      redraw();
    },
    setMuted(next) {
      if (next === muted) return;
      muted = next;
      redraw();
    },
    setAnimate(next) {
      if (next === animate) return;
      animate = next;
      redraw();
    },
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      redraw();
    },
    restyle() {
      colors = null;
      sprites = null;
      styles = null;
      if (buildStatic()) buildScene();
      redraw();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    },
  };
}
