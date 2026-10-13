/**
 * The constellation's imperative core: owns the canvas, the camera, the pointer and the frame loop.
 * React hands it data and flags and listens for hover and activation; nothing in the loop goes
 * through React state.
 *
 * Frame policy. A continuous loop runs only while the canvas is on screen, the tab is visible, motion
 * is allowed and nothing holds it (an open detail, ambient mode). Otherwise a frame is drawn on demand,
 * once, whenever something changes, so the canvas costs nothing at rest. With reduced motion the
 * world stands still on its resting layout and only the visitor moves it.
 */
import type { AppCategory } from '@shared/catalog';
import { clamp, damp, easeInOutCubic } from '@/lib/math';
import {
  angleDelta,
  type Camera,
  clampPan,
  DEFAULT_CAMERA,
  fitUnit,
  PITCH_MAX,
  PITCH_MIN,
  type Projected,
  pick,
  pitchFor,
  project,
  stretchFor,
  type Target,
  type Viewport,
  yawToFace,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAbout,
} from './camera';
import {
  type ActiveLeg,
  drawScene,
  FALLBACK_PALETTE,
  nodeRadius,
  type Palette,
  type Scene,
  Sprites,
} from './draw';
import { type Graph, positionAt, type Vec3 } from './graph';
import {
  emphasisTargets,
  type LabelSide,
  makeEmphasis,
  type NodeLook,
  parseColor,
  pulsePlan,
  type RGB,
  visibilityOf,
} from './look';

export interface HoverTarget {
  kind: 'center' | 'hub' | 'app';
  /** The graph node id. */
  id: string;
  /** The catalog id, for an app. */
  appId: string | null;
  category: AppCategory | null;
  index: number;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  graph: Graph;
  onHover: (target: HoverTarget | null) => void;
  /**
   * Every frame while something is hovered or selected: where it is on screen, and the circles of
   * the other nodes that are showing, so a floating card can stay off them.
   */
  onTrack: (
    x: number,
    y: number,
    r: number,
    others: ReadonlyArray<Obstacle>,
    labelSide: LabelSide | null,
  ) => void;
  onActivate: (target: HoverTarget) => void;
  /** The visitor took hold of the view (so a hint can step aside). */
  onInteract?: () => void;
}

export interface ConstellationEngine {
  setGraph(graph: Graph): void;
  setLooks(looks: ReadonlyMap<string, NodeLook>): void;
  setFilter(visible: ReadonlySet<string> | null): void;
  setCategory(category: string | null): void;
  setSelected(appId: string | null): void;
  /** false: a calm, still layout (reduced motion). */
  setMotion(on: boolean): void;
  /** false: the visitor stopped the slow turn. */
  setSpin(on: boolean): void;
  /** false: off screen or the tab is hidden; nothing is drawn. */
  setActive(active: boolean): void;
  /** true: stand still (an open detail, ambient mode) but still answer the pointer. */
  setHold(hold: boolean): void;
  /** The stage's quality tier (0 to 3). */
  setQuality(tier: number): void;
  /** Re-reads the colours (the accent changed). */
  restyle(): void;
  resize(width: number, height: number, dpr: number): void;
  /** A real block landed. */
  pulse(): void;
  /** Turns the world to bring a build to the front and rings it. */
  flyTo(appId: string): void;
  zoomBy(factor: number): void;
  reset(): void;
  dispose(): void;
}

const SPIN_RATE = 0.07;
const IDLE_MS = 2600;
const INERTIA = 3.8;
const HOVER_EASE = 11;
const PRESENCE_EASE = 6;
const TAP_SLOP = 6;
const PING_LIFE = 2.2;

/** Reads the palette from the canvas's own computed style, so the accent switch just works. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: RGB): RGB => parseColor(cs.getPropertyValue(name)) ?? fallback;
  const f = FALLBACK_PALETTE;
  const mono = cs.getPropertyValue('--font-mono').trim();
  return {
    accent: get('--accent-rgb', f.accent),
    accentStrong: get('--accent-strong', f.accentStrong),
    hot: get('--accent-hot-rgb', f.hot),
    deep: get('--accent-deep-rgb', f.deep),
    ok: get('--status-ok', f.ok),
    warn: get('--status-warn', f.warn),
    crit: get('--status-crit', f.crit),
    off: get('--status-off', f.off),
    pending: get('--status-pending', f.pending),
    ink: get('--ink-0', f.ink),
    ink1: get('--ink-1', f.ink1),
    text1: get('--text-1', f.text1),
    text2: get('--text-2', f.text2),
    text3: get('--text-3', f.text3),
    fluxBlue: get('--flux-blue', f.fluxBlue),
    mono: mono || f.mono,
  };
}

interface Tween {
  from: Camera;
  to: Camera;
  t0: number;
  dur: number;
}

interface Pointer {
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
  type: string;
}

export function createEngine(opts: EngineOptions): ConstellationEngine | null {
  const { canvas } = opts;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ctx: CanvasRenderingContext2D = context;

  let graph = opts.graph;
  let n = graph.nodes.length;
  let looks: Array<NodeLook | null> = new Array(n).fill(null);
  let visibility = visibilityOf(graph, null);
  let filter: ReadonlySet<string> | null = null;
  let lookMap: ReadonlyMap<string, NodeLook> | null = null;
  let selectedApp: string | null = null;
  let category: string | null = null;
  let selected = -1;
  let hover = -1;
  let pinned = -1;
  let ping: { index: number; t0: number } | null = null;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let quality = 2;
  let motion = true;
  let spinOn = true;
  let active = false;
  let hold = false;
  let disposed = false;
  let userPitch = false;
  let stretch = 1;

  let pal: Palette = FALLBACK_PALETTE;
  const sprites = new Sprites();

  const cam: Camera = { ...DEFAULT_CAMERA };
  const vp: Viewport = { width: 0, height: 0, unit: 160 };
  let tween: Tween | null = null;
  const vel = { yaw: 0 };
  let spinFactor = 0;
  let lastInteract = -1e9;
  let simT = 0;

  let proj: Projected[] = [];
  const probe: Projected = { x: 0, y: 0, scale: 1, depth: 0 };
  let pos: Vec3[] = [];
  let lit = new Float32Array(n);
  let presence = new Float32Array(n).fill(1);
  let flash = new Float32Array(n);
  let order: number[] = [];
  let targets: Array<Target | null> = [];
  let emphasis = makeEmphasis(n);
  const legs: ActiveLeg[] = [];
  const others: Obstacle[] = [];

  const pointers = new Map<number, Pointer>();
  const hoverPointer = { x: 0, y: 0, inside: false, type: 'mouse' };
  let pinch: { dist: number; cx: number; cy: number } | null = null;
  let gestured = false;
  let lastMoveAt = 0;
  let lastMoveEventAt = 0;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  let raf = 0;
  let lastNow = 0;
  let lastDraw = 0;
  let settled = false;

  const applyLooks = (): void => {
    for (let i = 0; i < n; i++) {
      const id = graph.nodes[i]?.appId;
      looks[i] = id && lookMap ? (lookMap.get(id) ?? null) : null;
    }
  };

  const alloc = (): void => {
    n = graph.nodes.length;
    looks = new Array(n).fill(null);
    applyLooks();
    visibility = visibilityOf(graph, filter);
    lit = new Float32Array(n);
    presence = new Float32Array(n).fill(1);
    flash = new Float32Array(n);
    emphasis = makeEmphasis(n);
    proj = graph.nodes.map(() => ({ x: 0, y: 0, scale: 1, depth: 0 }));
    pos = graph.nodes.map((nd) => ({ ...nd.p }));
    order = graph.nodes.map((_, i) => i);
    targets = new Array(n).fill(null);
    hover = -1;
    selected = selectedApp ? (graph.index.get(selectedApp) ?? -1) : -1;
    pinned = -1;
    ping = null;
    legs.length = 0;
  };
  alloc();

  const refit = (): number => {
    const pitch = userPitch ? cam.pitch : restPitch();
    vp.shiftY = 0;
    const unit = fitUnit(width, height, { extent: graph.extent, height: graph.height, stretch, pitch });
    // The field floats above the origin, so the picture's middle is a little above it: nudge it back.
    vp.shiftY = unit * 0.03;
    return unit;
  };

  const dprCap = (): number => (quality <= 1 ? 1.25 : quality === 2 ? 1.5 : 2);
  const isLow = (): boolean => quality <= 1;

  // ---- scheduling ---------------------------------------------------------------------------

  const busy = (): boolean =>
    tween !== null ||
    pointers.size > 0 ||
    Math.abs(vel.yaw) > 0.004 ||
    legs.length > 0 ||
    ping !== null ||
    !settled;

  const continuous = (): boolean => active && motion && !hold;

  function schedule(): void {
    if (raf !== 0 || disposed || !active) return;
    raf = requestAnimationFrame(frame);
  }

  function invalidate(): void {
    settled = false;
    schedule();
  }

  // ---- geometry -----------------------------------------------------------------------------

  function positionsAt(t: number): void {
    for (let i = 0; i < n; i++) {
      const nd = graph.nodes[i];
      const p = pos[i];
      if (!nd || !p) continue;
      if (nd.orbit) positionAt(nd.orbit, t, p);
      else {
        p.x = nd.p.x;
        p.y = nd.p.y;
        p.z = nd.p.z;
      }
      p.x *= stretch;
    }
  }

  function projectAll(): void {
    for (let i = 0; i < n; i++) {
      const p = pos[i];
      const q = proj[i];
      if (p && q) project(p, cam, vp, q);
    }
    order.sort((a, b) => (proj[b]?.depth ?? 0) - (proj[a]?.depth ?? 0));
  }

  function buildTargets(): void {
    const scale = vp.unit * cam.zoom;
    for (let i = 0; i < n; i++) {
      const q = proj[i];
      const nd = graph.nodes[i];
      if (!q || !nd) {
        targets[i] = null;
        continue;
      }
      let r: number;
      if (nd.kind === 'center') r = (30 + 0.1 * scale) * q.scale * 0.62;
      else if (nd.kind === 'hub') r = nodeRadius(scale, 1.55) * q.scale * 1.15;
      else r = nodeRadius(scale, looks[i]?.size ?? 1) * q.scale * 1.15;
      const t = targets[i] ?? { x: 0, y: 0, r: 0, depth: 0 };
      t.x = q.x;
      t.y = q.y;
      t.r = Math.max(r, coarse ? 20 : 12);
      t.depth = q.depth;
      targets[i] = t;
    }
  }

  function targetOf(i: number): HoverTarget | null {
    const nd = graph.nodes[i];
    if (!nd) return null;
    return { kind: nd.kind, id: nd.id, appId: nd.appId, category: nd.category, index: i };
  }

  function pickAt(x: number, y: number, touch: boolean): number {
    return pick(targets, x, y, touch ? 10 : 4);
  }

  function setHover(next: number): void {
    if (next === hover) return;
    hover = next;
    canvas.style.cursor = next >= 0 ? 'pointer' : pointers.size > 0 ? 'grabbing' : 'grab';
    opts.onHover(next >= 0 ? targetOf(next) : null);
  }

  // ---- camera -------------------------------------------------------------------------------

  function touch(now: number): void {
    lastInteract = now;
    opts.onInteract?.();
  }

  function startTween(to: Camera, ms: number): void {
    if (!motion) {
      Object.assign(cam, to);
      tween = null;
      invalidate();
      return;
    }
    tween = { from: { ...cam }, to, t0: performance.now(), dur: ms };
    vel.yaw = 0;
    invalidate();
  }

  function restPitch(): number {
    return pitchFor(width / Math.max(1, height));
  }

  // ---- frame --------------------------------------------------------------------------------

  function frame(now: number): void {
    raf = 0;
    if (disposed || !active) return;
    if (isLow() && now - lastDraw < 30 && lastDraw > 0) {
      schedule();
      return;
    }
    const dt = lastNow === 0 ? 0.016 : clamp((now - lastNow) / 1000, 0, 0.1);
    lastNow = now;
    lastDraw = now;
    if (width === 0 || height === 0) return;

    // Camera: a flight, else the glide after a throw, plus the slow turn when idle.
    if (tween) {
      const u = clamp((now - tween.t0) / tween.dur, 0, 1);
      const e = easeInOutCubic(u);
      cam.yaw = tween.from.yaw + (tween.to.yaw - tween.from.yaw) * e;
      cam.pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch) * e;
      cam.zoom = tween.from.zoom + (tween.to.zoom - tween.from.zoom) * e;
      cam.panX = tween.from.panX + (tween.to.panX - tween.from.panX) * e;
      cam.panY = tween.from.panY + (tween.to.panY - tween.from.panY) * e;
      if (u >= 1) tween = null;
    } else if (pointers.size === 0 && motion) {
      if (Math.abs(vel.yaw) > 0.004) {
        cam.yaw += vel.yaw * dt;
        vel.yaw *= Math.exp(-INERTIA * dt);
      } else {
        vel.yaw = 0;
      }
    }
    const idle = now - lastInteract > IDLE_MS;
    const wantSpin = continuous() && spinOn && idle && hover < 0 && !tween && pointers.size === 0 ? 1 : 0;
    spinFactor = damp(spinFactor, wantSpin, 1.6, dt);
    if (spinFactor > 0.001) cam.yaw += SPIN_RATE * spinFactor * dt;
    if (continuous()) simT += dt;

    positionsAt(motion ? simT : 0);
    projectAll();
    buildTargets();

    // What the pointer is over (a mouse or pen only; a finger has no hover).
    if (hoverPointer.inside && pointers.size === 0 && hoverPointer.type !== 'touch') {
      setHover(pickAt(hoverPointer.x, hoverPointer.y, false));
    }

    // Light from the blocks.
    for (let k = legs.length - 1; k >= 0; k--) {
      const leg = legs[k];
      if (leg && now >= leg.t0 + leg.dur) {
        flash[leg.to] = Math.max(flash[leg.to] ?? 0, leg.strength);
        legs.splice(k, 1);
      }
    }
    let age = 0;
    if (ping) {
      age = (now - ping.t0) / 1000;
      pinned = age < PING_LIFE ? ping.index : -1;
      if (age >= PING_LIFE) ping = null;
    }

    // Ease emphasis toward where hover, selection and the filters want it.
    emphasisTargets(graph, visibility, [hover, selected, pinned], emphasis);
    let moving = false;
    for (let i = 0; i < n; i++) {
      const tl = emphasis.lit[i] ?? 0;
      const tp = emphasis.presence[i] ?? 1;
      if (motion) {
        const l = damp(lit[i] ?? 0, tl, HOVER_EASE, dt);
        const p = damp(presence[i] ?? 1, tp, PRESENCE_EASE, dt);
        lit[i] = Math.abs(l - tl) < 0.004 ? tl : l;
        presence[i] = Math.abs(p - tp) < 0.004 ? tp : p;
        if (lit[i] !== tl || presence[i] !== tp) moving = true;
      } else {
        lit[i] = tl;
        presence[i] = tp;
      }
      const f = flash[i] ?? 0;
      if (f > 0) {
        flash[i] = Math.max(0, f - dt / 0.8);
        moving = true;
      }
    }

    const scene: Scene = {
      width,
      height,
      t: simT,
      now,
      motion,
      low: isLow(),
      pal,
      sprites,
      graph,
      cam,
      vp,
      proj,
      pos,
      looks,
      lit,
      presence,
      flash,
      visible: visibility,
      hover,
      selected,
      category,
      ping: ping ? { index: ping.index, age } : null,
      legs,
      order,
      scale: vp.unit * cam.zoom,
      stretch,
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const placed = drawScene(ctx, scene);

    const focus = hover >= 0 ? hover : selected >= 0 ? selected : pinned;
    const ft = focus >= 0 ? targets[focus] : null;
    if (ft) {
      others.length = 0;
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        if (i === focus || !t || (presence[i] ?? 0) < 0.4) continue;
        others.push({ x: t.x, y: t.y, r: t.r });
      }
      const label = placed.find((pl) => pl.index === focus);
      opts.onTrack(ft.x, ft.y, ft.r, others, label ? label.side : null);
    }

    if (import.meta.env.DEV && now - lastMoveAt > 250) {
      lastMoveAt = now;
      canvas.dataset.debug = JSON.stringify({
        yaw: Number(cam.yaw.toFixed(3)),
        pitch: Number(cam.pitch.toFixed(3)),
        zoom: Number(cam.zoom.toFixed(3)),
        spin: Number(spinFactor.toFixed(2)),
        legs: legs.length,
        hover: hover >= 0 ? graph.nodes[hover]?.id : null,
        selected: selected >= 0 ? graph.nodes[selected]?.id : null,
        motion,
        hold,
        nodes: graph.nodes.map((nd, i) => ({
          id: nd.id,
          x: Math.round(proj[i]?.x ?? 0),
          y: Math.round(proj[i]?.y ?? 0),
          r: Math.round(targets[i]?.r ?? 0),
        })),
      });
    }

    settled = !moving;
    if (continuous() || busy()) schedule();
  }

  // ---- pointer ------------------------------------------------------------------------------

  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onDown(e: PointerEvent): void {
    const { x, y } = local(e);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone: nothing to capture.
    }
    pointers.set(e.pointerId, { x, y, sx: x, sy: y, moved: false, type: e.pointerType });
    touch(performance.now());
    tween = null;
    vel.yaw = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (a && b)
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      gestured = true;
    } else if (pointers.size === 1) {
      gestured = false;
    }
    if (e.pointerType !== 'touch') canvas.style.cursor = 'grabbing';
    invalidate();
  }

  function onMove(e: PointerEvent): void {
    const { x, y } = local(e);
    const p = pointers.get(e.pointerId);
    if (!p) {
      hoverPointer.x = x;
      hoverPointer.y = y;
      hoverPointer.inside = true;
      hoverPointer.type = e.pointerType;
      if (e.pointerType !== 'touch' && !continuous()) {
        // No loop is running: answer the pointer now.
        invalidate();
      }
      return;
    }
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    const now = performance.now();
    touch(now);

    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      zoomAbout(cam, vp, cx, cy, dist / pinch.dist);
      cam.panX += cx - pinch.cx;
      cam.panY += cy - pinch.cy;
      clampPan(cam, vp);
      pinch = { dist, cx, cy };
      invalidate();
      return;
    }

    if (!p.moved) {
      if (Math.hypot(x - p.sx, y - p.sy) < (p.type === 'touch' ? TAP_SLOP * 1.6 : TAP_SLOP)) return;
      p.moved = true;
      setHover(-1);
    }
    const pan = e.shiftKey || (e.buttons & 4) !== 0;
    if (pan) {
      cam.panX += dx;
      cam.panY += dy;
      clampPan(cam, vp);
    } else {
      const d = dx * 0.0068;
      cam.yaw += d;
      vel.yaw = clamp(vel.yaw * 0.5 + (d / Math.max(0.008, (now - lastMoveEventAt) / 1000)) * 0.5, -3.2, 3.2);
      if (p.type !== 'touch') {
        cam.pitch = clamp(cam.pitch + dy * 0.0046, PITCH_MIN, PITCH_MAX);
        userPitch = true;
      }
    }
    lastMoveEventAt = now;
    invalidate();
  }

  function onUp(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    if (pointers.size < 2) pinch = null;
    const now = performance.now();
    touch(now);
    if (p && !p.moved && pointers.size === 0 && !gestured && e.type === 'pointerup') {
      // A tap or a click: activate what is under it.
      const hit = pickAt(p.x, p.y, p.type === 'touch');
      const target = hit >= 0 ? targetOf(hit) : null;
      if (target) opts.onActivate(target);
    }
    if (pointers.size === 0) {
      gestured = false;
      // A throw only carries if the pointer was still moving when it let go.
      if (now - lastMoveEventAt > 90 || !motion) vel.yaw = 0;
      canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
    }
    invalidate();
  }

  function onLeave(e: PointerEvent): void {
    if (pointers.has(e.pointerId)) return;
    hoverPointer.inside = false;
    setHover(-1);
    invalidate();
  }

  function onWheel(e: WheelEvent): void {
    // A plain wheel scrolls the page; the engine only takes pinch (which arrives with ctrl) and ctrl or cmd.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const { x, y } = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAbout(cam, vp, x, y, Math.exp(-delta * 0.0022));
    clampPan(cam, vp);
    tween = null;
    touch(performance.now());
    invalidate();
  }

  function onDouble(e: MouseEvent): void {
    const r = canvas.getBoundingClientRect();
    if (pickAt(e.clientX - r.left, e.clientY - r.top, false) >= 0) return;
    api.reset();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDouble);
  canvas.style.cursor = 'grab';

  // ---- API ----------------------------------------------------------------------------------

  const api: ConstellationEngine = {
    setGraph(next) {
      graph = next;
      alloc();
      vp.unit = refit();
      invalidate();
    },
    setLooks(map) {
      lookMap = map;
      applyLooks();
      invalidate();
    },
    setFilter(ids) {
      filter = ids;
      visibility = visibilityOf(graph, ids);
      invalidate();
    },
    setCategory(next) {
      category = next;
      invalidate();
    },
    setSelected(appId) {
      selectedApp = appId;
      selected = appId ? (graph.index.get(appId) ?? -1) : -1;
      invalidate();
    },
    setMotion(on) {
      motion = on;
      if (!on) {
        vel.yaw = 0;
        tween = null;
        legs.length = 0;
        simT = 0;
        spinFactor = 0;
      }
      invalidate();
    },
    setSpin(on) {
      spinOn = on;
      if (!on) spinFactor = 0;
      invalidate();
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      if (next) {
        lastNow = 0;
        invalidate();
      } else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    setHold(next) {
      hold = next;
      invalidate();
    },
    setQuality(tier) {
      quality = tier;
      if (width > 0) api.resize(width, height, window.devicePixelRatio || 1);
      invalidate();
    },
    restyle() {
      pal = readPalette(canvas);
      sprites.clear();
      invalidate();
    },
    resize(w, h, ratio) {
      width = Math.max(0, Math.round(w));
      height = Math.max(0, Math.round(h));
      dpr = Math.min(Math.max(1, ratio), dprCap());
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      vp.width = width;
      vp.height = height;
      stretch = stretchFor(width / Math.max(1, height));
      vp.unit = refit();
      if (!userPitch && width > 0) cam.pitch = restPitch();
      invalidate();
    },
    pulse() {
      if (!motion || disposed || !active || hold) return;
      const now = performance.now();
      if (legs.length > 80) return;
      for (const leg of pulsePlan(graph)) {
        legs.push({
          from: leg.from,
          to: leg.to,
          t0: now + leg.delay * 1000,
          dur: leg.dur * 1000,
          strength: leg.strength,
        });
      }
      flash[0] = 1;
      invalidate();
    },
    flyTo(appId) {
      const i = graph.index.get(appId);
      const p = i === undefined ? undefined : pos[i];
      if (i === undefined || !p) return;
      const now = performance.now();
      touch(now);
      ping = { index: i, t0: now };
      const to: Camera = {
        yaw: cam.yaw + angleDelta(cam.yaw, yawToFace(p)),
        pitch: clamp(restPitch() + 0.04, PITCH_MIN, PITCH_MAX),
        zoom: Math.max(cam.zoom, 1.2),
        panX: 0,
        panY: 0,
      };
      // Facing a node puts it on the near edge of the field, low in the frame (sometimes under the
      // legend). Slide the picture so it lands in the middle, where its card has room on every side.
      const at = project(p, to, vp, probe);
      to.panX = width / 2 - at.x;
      to.panY = height / 2 - at.y;
      clampPan(to, vp);
      startTween(to, 1000);
      userPitch = false;
    },
    zoomBy(factor) {
      touch(performance.now());
      zoomAbout(cam, vp, width / 2 + cam.panX, height / 2 + cam.panY, factor);
      cam.zoom = clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX);
      clampPan(cam, vp);
      invalidate();
    },
    reset() {
      touch(performance.now());
      userPitch = false;
      const to: Camera = {
        yaw: cam.yaw + angleDelta(cam.yaw, DEFAULT_CAMERA.yaw),
        pitch: restPitch(),
        zoom: 1,
        panX: 0,
        panY: 0,
      };
      startTween(to, 700);
    },
    dispose() {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDouble);
      sprites.clear();
    },
  };

  pal = readPalette(canvas);
  return api;
}
