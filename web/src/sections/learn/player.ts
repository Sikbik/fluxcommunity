/**
 * The canvas player: the glue between the pure sequence (state machine + scene) and a canvas.
 * No React in here. It owns one requestAnimationFrame loop that exists only while the sequence is
 * running (or one frame is owed after a seek or a resize), so a held or off-screen explainer costs
 * nothing.
 */
import { buildCache, type DrawContext, drawFrame, type Palette, readPalette, type SceneCache } from './draw';
import { computeLayout, type Layout } from './layout';
import { createScene, type Scene, updateScene } from './scene';
import {
  advance,
  type HoldReason,
  holdReason,
  INITIAL_PLAYER,
  isRunning,
  type PlayerState,
} from './sequence';
import { STILL_AT, type StepId, stepAt } from './timeline';

export interface PlayerHost {
  /** Every painted frame: the playhead time, and the step it is in. */
  onTime(time: number, step: StepId): void;
  /** When what is holding the sequence changes (`none` means it is playing). */
  onHold(reason: HoldReason): void;
}

/** What the canvas should render at: capped, and 1x on a low quality stage. */
export function pixelRatio(quality: number): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(dpr, quality > 0 && quality <= 1 ? 1 : 2);
}

/** Fonts the canvas draws in, requested up front so the first paint is not in a fallback face. */
function fontRequests(pal: Palette): string[] {
  return [`500 14px ${pal.mono}`, `600 14px ${pal.display}`, `300 14px ${pal.display}`];
}

/**
 * Calls `cb` when a web font the canvas draws in finishes loading, so text measured and drawn in a
 * fallback face is redrawn in the real one. It does nothing when the fonts are already there.
 */
function watchFonts(pal: Palette, cb: () => void): () => void {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts) return () => {};
  let live = true;
  const fire = () => {
    if (live) cb();
  };
  const wanted = fontRequests(pal);
  let present = true;
  try {
    present = wanted.every((f) => fonts.check(f));
  } catch {
    // An unparseable font string: the fallback face is good enough.
  }
  if (!present) {
    void Promise.all(wanted.map((f) => fonts.load(f)))
      .then(fire)
      .catch(() => {});
  }
  fonts.addEventListener?.('loadingdone', fire);
  return () => {
    live = false;
    fonts.removeEventListener?.('loadingdone', fire);
  };
}

export class Player {
  private readonly canvas: HTMLCanvasElement;
  private readonly host: PlayerHost;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly quality: number;
  private readonly scene: Scene = createScene();
  private layout: Layout | null = null;
  private cache: SceneCache | null = null;
  private pal: Palette | null = null;
  private cssWidth = 0;
  private cssHeight = 0;

  private state: PlayerState = INITIAL_PLAYER;
  private started = false;
  private raf = 0;
  private lastNow = 0;
  private hold: HoldReason | null = null;
  private fontsWatched = false;
  private stopFonts: () => void = () => {};
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, host: PlayerHost, quality = 0) {
    this.canvas = canvas;
    this.host = host;
    this.quality = quality;
    this.ctx = canvas.getContext('2d');
  }

  /** The playhead as the viewer sees it: a finished still of step one until it has ever played. */
  private get time(): number {
    return this.started ? this.state.time : STILL_AT.describe;
  }

  /** Applies a state transition (a hover, a seek, a step button) and makes the screen follow. */
  dispatch(fn: (s: PlayerState) => PlayerState): void {
    if (this.disposed) return;
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    if (!this.started && (isRunning(next) || next.time !== 0 || next.userPaused)) this.started = true;
    this.notifyHold();
    this.schedule();
  }

  /** The canvas box changed size (CSS px). */
  resize(cssWidth: number, cssHeight: number): void {
    if (this.disposed || !this.ctx || !(cssWidth > 0) || !(cssHeight > 0)) return;
    if (cssWidth === this.cssWidth && cssHeight === this.cssHeight) return;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.rebuild();
  }

  /** The accent changed under us: re-read the palette and redraw. */
  refresh(): void {
    if (this.disposed || !this.cssWidth || !this.cssHeight) return;
    this.rebuild(true);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stopFonts();
  }

  // ---- internals -------------------------------------------------------------------------------

  private rebuild(rereadPalette = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.cssWidth || !this.cssHeight) return;
    let pal = this.pal;
    if (!pal || rereadPalette) {
      pal = readPalette(this.canvas);
      this.pal = pal;
    }
    if (!this.fontsWatched) {
      this.fontsWatched = true;
      this.stopFonts = watchFonts(pal, () => this.rebuild());
    }
    const layout = computeLayout(this.cssWidth, this.cssHeight);
    const dpr = pixelRatio(this.quality);
    this.layout = layout;
    this.canvas.width = Math.max(1, Math.round(layout.w * dpr));
    this.canvas.height = Math.max(1, Math.round(layout.h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cache = buildCache(ctx, layout, pal, dpr, this.quality);
    this.paint();
  }

  private notifyHold(): void {
    const reason = holdReason(this.state);
    if (reason !== this.hold) {
      this.hold = reason;
      this.host.onHold(reason);
    }
  }

  private schedule(): void {
    if (this.raf || this.disposed) return;
    this.lastNow = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  private readonly loop = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.lastNow === 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    this.state = advance(this.state, dt);
    this.paint();
    if (isRunning(this.state)) this.raf = requestAnimationFrame(this.loop);
  };

  private paint(): void {
    const { ctx, cache, layout, pal } = this;
    if (!ctx || !cache || !layout || !pal) return;
    const t = this.time;
    updateScene(this.scene, t);
    const dc: DrawContext = { ctx, cache, pal, layout, quality: this.quality };
    drawFrame(dc, this.scene);
    this.host.onTime(t, stepAt(t).id);
  }
}

/**
 * One finished frame, drawn once: the reduced-motion triptych. Returns the layout used, or null
 * when there is nothing to draw on.
 */
export function paintStill(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  time: number,
  quality = 0,
): Layout | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || !(cssWidth > 0) || !(cssHeight > 0)) return null;
  const layout = computeLayout(cssWidth, cssHeight);
  const dpr = pixelRatio(quality);
  canvas.width = Math.max(1, Math.round(layout.w * dpr));
  canvas.height = Math.max(1, Math.round(layout.h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pal = readPalette(canvas);
  const cache = buildCache(ctx, layout, pal, dpr, quality);
  const scene = updateScene(createScene(), time);
  drawFrame({ ctx, cache, pal, layout, quality }, scene);
  return layout;
}
