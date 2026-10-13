// The stage engine: owns the renderer, the scene and the frame loop. It reads the stage bus every frame
// and writes only the `stage` slice back. No React in here, and no per-frame allocation in the hot path.
//
// Frame order: input and anchors, look easing, intro clock, camera, symbol placement, pulses and beams,
// uniforms, draw (post chain or straight to the canvas), governor and stats.

import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { type QualityTier, type StageBusState, useStageBus } from '../bus';
import { type ActiveTier, Governor, type TierPlan } from '../governor';
import { buildDisc, type Disc, discCentre, fogScaleFor, visibleCount, xzToAxial } from '../hexgrid';
import { StageInput } from '../input';
import {
  type EasedFocus,
  FocusEaser,
  INTRO_DURATION,
  introFrame,
  introSkipRate,
  makeIntroFrame,
  SymbolMotion,
} from '../interaction';
import { AMBIENT_LOOK, AMBIENT_STILL_LOOK, type Look, LookSmoother, lookFor } from '../looks';
import { MARK_ASPECT } from '../mark';
import { clamp, DEG, damp, lerp, mulberry32, smoothDamp, smoothstep, type Velocity } from '../math';
import { AccentBlender } from '../palette';
import { type AcceptedPulse, PulseTracker, TINT } from '../pulses';
import {
  type Basis,
  basis,
  type CameraPose,
  fovForAspect,
  makePose,
  ndcRay,
  type PlaneHit,
  type Ray,
  rayPlane,
  unprojectAtDepth,
  worldSizeForPixels,
} from '../rig';
import { TIER_BUDGETS, type TierBudget } from '../tiers';
import { Beams, type Landing } from './beams';
import { Dust } from './dust';
import { GpuTimer } from './gpuTimer';
import { Lattice } from './lattice';
import { Post } from './post';
import { Sky } from './sky';
import { Symbol3D } from './symbol';
import { createSharedUniforms, type SharedUniforms } from './uniforms';

export class StageUnsupported extends Error {}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  plan: TierPlan;
  /** A tier forced by `?q=`. 0 never reaches the engine (the component shows the CSS fallback). */
  forcedTier: QualityTier | null;
  dprOverride: number | null;
}

export interface EngineStats {
  fps: number;
  tier: QualityTier;
  cells: number;
  dust: number;
  drawCalls: number;
  triangles: number;
  pulses: number;
  focus: number;
  dpr: number;
  width: number;
  height: number;
  gpu: string;
  frameMs: number;
  /** GPU time per frame in ms when the timer query extension is available (debug only), else null. */
  gpuMs: number | null;
}

export interface EngineEvents {
  /** The context was lost (the CSS fallback should show) or came back. */
  onContext(lost: boolean): void;
  /** The engine gave up: it could not hold even the lowest tier. */
  onGiveUp(): void;
}

const BASE_CAMERA_Z = 8;
const SYMBOL_DEPTH = 17;
/** Resting turn of the symbol so its thickness and chamfers read from the front. */
const BASE_YAW = -0.26;
const BASE_PITCH = 0.1;
const MAX_WAVES = 4;

// Preallocated scratch.
const ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
const hit: PlaneHit = { x: 0, z: 0, t: 0, hit: false };
const bs: Basis = { fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
const place = { x: 0, y: 0, z: 0 };

export class StageEngine {
  readonly renderer: WebGLRenderer;
  readonly stats: EngineStats;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly shared: SharedUniforms = createSharedUniforms();
  private readonly lattice: Lattice;
  private readonly sky: Sky;
  private readonly symbol: Symbol3D;
  private readonly dust: Dust;
  private readonly dustFg: Dust;
  private readonly beams: Beams;
  private readonly post: Post;
  private gpuTimer: GpuTimer | null = null;
  private readonly input: StageInput;
  private readonly pulses: PulseTracker;
  private readonly focusEase = new FocusEaser();
  private readonly accent: AccentBlender;
  private readonly looks: LookSmoother;
  private readonly motion = new SymbolMotion();
  private readonly governor: Governor | null;
  private readonly disc: Disc;
  private readonly pose: CameraPose = makePose();
  private readonly intro = makeIntroFrame();
  private readonly landings: Landing[] = [];
  private readonly waves: { at: number; strength: number }[] = [];
  private readonly rand = mulberry32(0xf1ac5);
  private readonly dprOverride: number | null;
  private readonly events: EngineEvents;

  private tier: ActiveTier;
  private budget: TierBudget;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private disposed = false;
  private running = false;
  private raf = 0;
  private timer = 0;
  private lastMs = 0;
  private t = 0;
  private wTime = 0;
  private tunnelTime = 0;
  private travel = 0;
  private revealT = 0;
  private lost = false;
  private ready = false;
  private frames = 0;

  // intro
  private debugIntroT: number | null = null;
  private introT = 0;
  private introPlaying = false;
  private introRate = 1;

  // smoothed input driven state
  private px = 0;
  private py = 0;
  private cursorX = 0;
  private cursorZ = 0;
  private cursorS = 0;
  private ambientMix = 0;
  private readonly ambientVel: Velocity = { v: 0 };
  private symPresence = 0;
  private symCx = 0;
  private symCy = 0;
  private symPx = 400;
  private chainAmp = 0;
  private chainPhase = 0;
  private ambientWas = false;

  // governor / stats
  private statAt = 0;
  private lastFps = -1;
  private slowSince = 0;
  private frameMsEma = 16;
  private unsubscribe: () => void;

  constructor(opts: EngineOptions, events: EngineEvents) {
    this.canvas = opts.canvas;
    this.events = events;
    this.dprOverride = opts.dprOverride;
    const startTier = (
      opts.forcedTier && opts.forcedTier > 0 ? opts.forcedTier : opts.plan.start
    ) as ActiveTier;
    const antialias = startTier <= 1;
    const gl = opts.canvas.getContext('webgl2', {
      antialias,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new StageUnsupported('WebGL2 is not available');
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, context: gl });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.info.autoReset = false;

    this.camera = new PerspectiveCamera(36, 1, 0.1, 400);
    this.camera.rotation.order = 'YXZ';

    this.disc = buildDisc(TIER_BUDGETS[3].cells);
    this.lattice = new Lattice(this.shared);
    this.sky = new Sky(this.shared);
    this.symbol = new Symbol3D(this.shared);
    this.lattice.uniforms.tDist.value = this.symbol.texture;
    this.dust = new Dust(this.shared, 5);
    this.dustFg = new Dust(this.shared, 20);
    this.dustFg.uniforms.uSize.value = 1.5;
    this.beams = new Beams(this.shared);
    this.scene.add(
      this.sky.mesh,
      this.lattice.mesh,
      this.dust.points,
      this.beams.points,
      this.symbol.group,
      this.dustFg.points,
    );
    this.post = new Post(this.renderer);

    const bus = useStageBus.getState();
    this.accent = new AccentBlender(bus.accent);
    this.looks = new LookSmoother(this.targetLook(bus));
    this.pulses = new PulseTracker(Math.max(0, ...bus.pulses.map((p) => p.id)));
    this.tier = startTier;
    this.budget = TIER_BUDGETS[startTier];
    this.governor =
      opts.forcedTier && opts.forcedTier > 0
        ? null
        : new Governor({ start: opts.plan.start, ceiling: opts.plan.ceiling });
    this.stats = {
      fps: 0,
      tier: startTier,
      cells: 0,
      dust: 0,
      drawCalls: 0,
      triangles: 0,
      pulses: 0,
      focus: 0,
      dpr: 1,
      width: 0,
      height: 0,
      gpu: gpuName(this.renderer),
      frameMs: 0,
      gpuMs: null,
    };

    this.input = new StageInput({
      onSymbolHover: () => {},
      onSymbolDown: () => this.motion.beginDrag(),
      onSymbolDrag: (dx, dy, dt) => this.motion.drag(dx, dy, dt),
      onSymbolUp: (wasClick) => {
        this.motion.endDrag();
        if (wasClick) {
          this.motion.kick(1);
          // The shockwave starts under the symbol, whatever the pointer position.
          useStageBus.getState().firePulse('click', null, null, 1);
        }
      },
    });

    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.unsubscribe = useStageBus.subscribe(this.onBus);
  }

  /** Compiles shaders off the main thread, then starts the loop. */
  async start(): Promise<void> {
    this.symbol.group.visible = true;
    this.beams.points.visible = true;
    this.applyTier(this.tier, true);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      await this.post.warm();
    } catch {
      // Compilation problems surface on the first real draw; keep going.
    }
    if (this.disposed) return;
    this.symbol.group.visible = false;
    this.beams.points.visible = false;
    this.input.attach();
    this.running = true;
    this.lastMs = performance.now();
    this.schedule();
  }

  get currentTier(): ActiveTier {
    return this.tier;
  }

  /** Forces a tier from outside (the lab); unlocks nothing: the governor still runs unless forced by URL. */
  setTier(tier: ActiveTier): void {
    if (this.disposed || tier === this.tier) return;
    this.tier = tier;
    this.governor?.force(tier);
    this.applyTier(tier, false);
  }

  // ---- loop control ------------------------------------------------------------------------------------

  private schedule(): void {
    if (!this.running || this.disposed || this.lost) return;
    if (this.raf || this.timer) return;
    const bus = useStageBus.getState();
    if (bus.paused || document.hidden) return;
    if (bus.reducedMotion) {
      // A single still frame and, at most, very slow breathing: about 8 frames a second.
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.tick(performance.now());
      }, 120);
    } else {
      this.raf = requestAnimationFrame((ts) => {
        this.raf = 0;
        this.tick(ts);
      });
    }
  }

  private cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
  }

  private tick(ts: number): void {
    if (this.disposed) return;
    try {
      this.frame(ts);
    } catch (err) {
      // A frame that throws must not kill the loop for good; log once and keep the page alive.
      console.error('stage frame failed', err);
      this.running = false;
      useStageBus.getState().setStage({ ready: false, quality: 0, reason: 'disabled' });
      this.events.onGiveUp();
      return;
    }
    this.schedule();
  }

  private onBus = (s: StageBusState, prev: StageBusState): void => {
    if (s.paused !== prev.paused || s.reducedMotion !== prev.reducedMotion) {
      this.cancel();
      this.lastMs = performance.now();
      this.schedule();
    }
  };

  private onVisibility = (): void => {
    this.cancel();
    this.lastMs = performance.now();
    if (!document.hidden) this.schedule();
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.lost = true;
    this.cancel();
    this.gpuTimer?.invalidate();
    useStageBus.getState().setStage({ ready: false, quality: 0, fps: 0, reason: 'context-lost' });
    this.events.onContext(true);
  };

  private onContextRestored = (): void => {
    this.lost = false;
    this.gpuTimer?.invalidate();
    this.ready = false;
    this.frames = 0;
    this.lastMs = performance.now();
    this.applyTier(this.tier, true);
    useStageBus.getState().setStage({ reason: 'ok' });
    this.events.onContext(false);
    this.schedule();
  };

  // ---- tiers and size ----------------------------------------------------------------------------------

  private applyTier(tier: ActiveTier, force: boolean): void {
    const b = TIER_BUDGETS[tier];
    this.budget = b;
    this.tier = tier;
    this.stats.tier = tier;
    this.dust.setCount(b.dust);
    this.dustFg.setCount(Math.round(b.dust * 0.04));
    this.shared.uDirect.value = b.post ? 0 : 1;
    this.symbol.uniforms.uLite.value = tier <= 1 ? 1 : 0;
    this.resize(force);
    useStageBus.getState().setStage({ quality: tier });
  }

  /** Reads the container size and applies buffer sizes for the current tier. */
  resize(force = false): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, Math.round(parent?.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.round(parent?.clientHeight || window.innerHeight));
    const native = window.devicePixelRatio || 1;
    const dpr = this.dprOverride ?? Math.min(native, this.budget.dprCap);
    if (!force && w === this.cssW && h === this.cssH && dpr === this.dpr) return;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.shared.uViewport.value.set(w, h);
    this.shared.uDpr.value = dpr;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const bw = Math.max(2, Math.round(w * dpr));
    const bh = Math.max(2, Math.round(h * dpr));
    if (this.budget.post) {
      this.post.configure({
        width: bw,
        height: bh,
        samples: this.budget.msaa,
        levels: this.budget.bloomLevels,
        quarter: this.budget.bloomQuarter,
      });
    }
    this.stats.width = bw;
    this.stats.height = bh;
    this.stats.dpr = dpr;
  }

  // ---- the frame ---------------------------------------------------------------------------------------

  private targetLook(bus: StageBusState): Look {
    if (bus.ambient) return bus.reducedMotion ? AMBIENT_STILL_LOOK : AMBIENT_LOOK;
    return lookFor(bus.section);
  }

  private frame(ts: number): void {
    const bus = useStageBus.getState();
    const rawDt = (ts - this.lastMs) / 1000;
    this.lastMs = ts;
    const reduced = bus.reducedMotion;
    const stalled = rawDt > 0.25;
    const dt = this.frames === 0 ? 1 / 60 : clamp(rawDt, 0, 0.05);
    this.frames++;
    this.resize();
    const vw = this.cssW;
    const vh = this.cssH;
    const nowMs = ts;

    // Clocks.
    this.t += dt;
    const look = reduced ? this.looks.snap(this.targetLook(bus)) : this.looks.step(this.targetLook(bus), dt);
    const timeScale = reduced ? 0.07 : 1;
    this.wTime += dt * Math.max(0.05, look.motion) * timeScale;
    this.tunnelTime += dt * (reduced ? 0 : 1);

    // Ambient mix: a smooth 0..1 for the tunnel pass, snapping under reduced motion.
    const ambientTarget = bus.ambient ? 1 : 0;
    this.ambientMix = reduced
      ? ambientTarget
      : clamp(smoothDamp(this.ambientMix, ambientTarget, this.ambientVel, 0.55, dt), 0, 1);
    if (this.ambientMix < 0.002 && !bus.ambient) this.ambientMix = 0;
    if (this.ambientMix > 0.998 && bus.ambient) this.ambientMix = 1;
    const amb = this.ambientMix;
    if (!reduced) this.travel += dt * 5.2 * amb;
    if (bus.ambient !== this.ambientWas) {
      this.ambientWas = bus.ambient;
      this.beams.clear();
    }

    // Accent crossfade.
    this.accent.setTarget(bus.accent);
    this.accent.step(dt, reduced);

    // Intro.
    this.updateIntro(bus, dt, reduced);

    // Input and the symbol anchor.
    this.input.measure(vw, vh, nowMs);
    this.input.step(dt);

    // Camera.
    this.updatePose(bus, look, vw, vh, dt, reduced, amb);
    basis(this.pose, bs);

    // Symbol placement.
    const symbolUp = this.placeSymbol(bus, look, vw, vh, dt, amb);

    // Pointer on the lattice plane.
    this.updateCursor(bus, vw, vh, dt, amb, look);

    // Pulses, beams and waves.
    this.updatePulses(bus, nowMs, vw, vh, look, amb, symbolUp);

    // Uniforms and instance ranges.
    this.updateUniforms(bus, look, nowMs, vw, vh, dt, amb, reduced);

    // Draw.
    this.draw(look, amb);

    // Governor and stats.
    this.afterFrame(rawDt, stalled, nowMs, reduced);
  }

  /** Debug only: measure GPU time per frame (needs EXT_disjoint_timer_query_webgl2). */
  enableGpuTiming(): boolean {
    if (!this.gpuTimer) this.gpuTimer = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
    return this.gpuTimer.supported;
  }

  /** Debug only: freeze the intro at `t` seconds (null releases it). Used by the lab for frame by frame checks. */
  setDebugIntroTime(t: number | null): void {
    this.debugIntroT = t;
  }

  private updateIntro(bus: StageBusState, dt: number, reduced: boolean): void {
    if (this.debugIntroT !== null) {
      introFrame(this.debugIntroT, this.intro);
      this.revealT = 1;
      return;
    }
    const state = bus.intro;
    if (!this.introPlaying) {
      if (state === 'pending') {
        if (reduced) {
          bus.setIntro('done');
        } else if (this.ready) {
          this.introPlaying = true;
          this.introT = 0;
          this.introRate = 1;
          bus.setIntro('playing');
        }
      } else if (state === 'skip') {
        bus.setIntro('done');
      }
    }
    if (this.introPlaying) {
      if (state === 'skip' && this.introRate === 1) this.introRate = introSkipRate(this.introT);
      this.introT += dt * this.introRate;
      if (this.introT >= INTRO_DURATION) {
        this.introPlaying = false;
        useStageBus.getState().setIntro('done');
      }
    }
    if (this.introPlaying) introFrame(this.introT, this.intro);
    else introFrame(INTRO_DURATION + 1, this.intro);
    // The canvas reveals itself: black while an intro is pending, a short fade-in otherwise.
    const waiting = state === 'pending' && !this.introPlaying;
    if (!waiting) this.revealT = Math.min(1, this.revealT + dt / (this.introPlaying ? 0.25 : 0.7));
  }

  private updatePose(
    bus: StageBusState,
    look: Look,
    vw: number,
    vh: number,
    dt: number,
    reduced: boolean,
    amb: number,
  ): void {
    const aspect = vw / vh;
    const par = reduced ? 0 : look.parallax;
    const nx = this.input.coarse ? this.input.tiltX : this.input.nx;
    const ny = this.input.coarse ? -this.input.tiltY : this.input.ny;
    const live = this.input.present || this.input.coarse;
    this.px = damp(this.px, live ? nx * par : 0, 3.2, dt);
    this.py = damp(this.py, live ? ny * par : 0, 3.2, dt);
    const sway = reduced ? 0 : 1;
    const t = this.t;
    const swayX = Math.sin(t * 0.13) * 0.14 * sway;
    const swayY = Math.sin(t * 0.1 + 1.3) * 0.05 * sway;
    const push = 1 - this.intro.camera;
    const p = this.pose;
    p.aspect = aspect;
    p.fov = (fovForAspect(look.fov, aspect) + push * 7) * DEG;
    p.x = this.px * 0.7 + swayX;
    p.y = look.height + this.py * 0.2 + swayY + push * 0.6;
    p.z = BASE_CAMERA_Z - look.travel * bus.pageProgress;
    p.yaw = (-this.px * 1.4 + Math.sin(t * 0.08) * 0.5 * sway) * DEG;
    p.pitch = (look.pitch + this.py * 0.9) * DEG;
    // Ambient: the camera sits in the tunnel, level, with a slow drift.
    if (amb > 0) {
      p.x = lerp(p.x, Math.sin(t * 0.17) * 0.25 * sway, amb);
      p.y = lerp(p.y, Math.sin(t * 0.13 + 0.7) * 0.12 * sway, amb);
      p.pitch = lerp(p.pitch, 0, amb);
      p.yaw = lerp(p.yaw, Math.sin(t * 0.07) * 0.012 * sway, amb);
    }
    const c = this.camera;
    c.position.set(p.x, p.y, p.z);
    c.rotation.set(p.pitch, p.yaw, 0);
    c.fov = p.fov / DEG;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  private placeSymbol(
    bus: StageBusState,
    look: Look,
    vw: number,
    vh: number,
    dt: number,
    amb: number,
  ): boolean {
    const cur = this.input.current;
    let want = 0;
    let cx = this.symCx;
    let cy = this.symCy;
    let px = this.symPx;
    if (cur && cur.visible > 0) {
      cx = cur.left + cur.width / 2;
      cy = cur.top + cur.height / 2;
      px = Math.min(cur.height, cur.width / MARK_ASPECT) * 0.94;
      want = 1;
    }
    if (amb > 0.001) {
      // Ambient: small and steady at the vanishing point.
      cx = lerp(cx, vw / 2, amb);
      cy = lerp(cy, vh * 0.47, amb);
      px = lerp(px, Math.min(vh * 0.22, vw * 0.4), amb);
      want = Math.max(want * (1 - amb), amb);
    }
    this.symCx = cx;
    this.symCy = cy;
    this.symPx = px;
    this.symPresence = damp(this.symPresence, want, want > this.symPresence ? 5 : 7, dt);
    const presence = this.symPresence;
    const up = presence > 0.01 && look.symbol > 0.01;
    this.symbol.group.visible = up;
    if (!up) return false;

    const depth = SYMBOL_DEPTH;
    unprojectAtDepth(this.pose, vw, vh, cx, cy, depth, place, bs);
    const scale = worldSizeForPixels(this.pose, vh, px, depth);
    const g = this.symbol.group;
    g.position.set(place.x, place.y, place.z);
    g.scale.setScalar(scale);

    const m = this.motion;
    m.step(dt, this.input.hover && !bus.ambient ? 1 : 0);
    const t = this.t;
    const calm = bus.reducedMotion ? 0 : 1;
    const idleYaw = Math.sin(t * 0.31) * 0.09 * calm;
    const idlePitch = Math.sin(t * 0.23 + 0.8) * 0.045 * calm;
    // Tilt toward the pointer (or the gyro).
    const lean = bus.ambient ? 0 : 1;
    const tx = (this.input.coarse ? this.input.tiltX : this.input.nx) * 0.26 * lean * calm;
    const ty = (this.input.coarse ? -this.input.tiltY : this.input.ny) * 0.17 * lean * calm;
    const base = 1 - this.ambientMix * 0.7;
    g.rotation.order = 'YXZ';
    g.rotation.set(
      this.pose.pitch + BASE_PITCH * base - (ty + idlePitch) + m.pitch,
      this.pose.yaw + BASE_YAW * base + tx + idleYaw + m.yaw,
      0,
    );
    g.position.y += Math.sin(t * 0.7) * 0.012 * scale * calm;
    g.scale.multiplyScalar(1 - m.press * 0.03);

    // Hover separates the shards a touch; the intro flies them in.
    const sep = 0.012 + m.hover * 0.026;
    const a = this.intro.assemble;
    let flight = 0;
    for (let i = 0; i < this.symbol.shards.length; i++) {
      const s = this.symbol.shards[i]!;
      const k = clamp(a[i] ?? 1, 0, 1);
      const far = (1 - k) * (1 - k);
      const ang = i * 1.7 + 0.6;
      const ox = s.outward[0] * (sep + far * 1.3) + Math.cos(ang) * far * 0.4;
      const oy = s.outward[1] * (sep + far * 1.3) + Math.sin(ang) * far * 0.4;
      const oz = far * 0.5 * (i % 2 === 0 ? 1 : -0.6);
      s.mesh.position.set(ox, oy, oz);
      s.mesh.rotation.set(
        far * (i % 2 === 0 ? 1.4 : -1.1),
        far * (1.8 - i * 0.7),
        far * (i % 2 === 0 ? -1.5 : 1.2),
      );
      s.uniforms.uDissolve.value = (1 - smoothstep(0, 0.5, k)) * 0.95;
      flight = Math.max(flight, far);
    }
    const u = this.symbol.uniforms;
    u.uBright.value = look.symbol * presence * (1 + flight * 0.5) * (1 + m.hover * 0.12);
    u.uHover.value = m.hover;
    u.uPress.value = m.press;
    u.uFlash.value = this.intro.flash * 0.35;
    return true;
  }

  private updateCursor(
    bus: StageBusState,
    vw: number,
    vh: number,
    dt: number,
    amb: number,
    look: Look,
  ): void {
    const lat = this.lattice.uniforms.uCursor.value;
    ndcRay(this.pose, this.input.nx, this.input.ny, ray, bs);
    rayPlane(ray, 0, 60, hit);
    const active = this.input.present && hit.hit && !this.input.dragging && amb < 0.5 && !bus.reducedMotion;
    const want = active ? 1 : 0;
    this.cursorS = damp(this.cursorS, want, want > this.cursorS ? 9 : 4.5, dt);
    if (this.cursorS < 0.03) {
      this.cursorX = hit.x;
      this.cursorZ = hit.z;
    } else {
      this.cursorX = damp(this.cursorX, hit.x, 15, dt);
      this.cursorZ = damp(this.cursorZ, hit.z, 15, dt);
    }
    const radius = clamp(0.09 * hit.t, 1.7, 6);
    lat.set(this.cursorX, this.cursorZ, this.cursorS * look.lift, radius);
    // The dust flows a little around the pointer.
    this.dust.uniforms.uPointer.value.set(this.cursorX, this.cursorZ);
    this.dust.uniforms.uPointerK.value = this.cursorS;
    void vw;
    void vh;
  }

  /** Maps a pulse to a lattice plane position (the locator for the tracker). */
  private locate = (p: { x: number | null; y: number | null }, out: [number, number]): boolean => {
    if (p.x === null || p.y === null) {
      if (this.symbol.group.visible) {
        out[0] = this.shared.uSymbol.value.x;
        out[1] = this.shared.uSymbol.value.z;
        return true;
      }
      ndcRay(this.pose, 0, -0.35, ray, bs);
    } else {
      ndcRay(this.pose, (p.x / this.cssW) * 2 - 1, 1 - (p.y / this.cssH) * 2, ray, bs);
    }
    rayPlane(ray, 0, 46, hit);
    out[0] = hit.x;
    out[1] = hit.z;
    return true;
  };

  private updatePulses(
    bus: StageBusState,
    nowMs: number,
    vw: number,
    vh: number,
    look: Look,
    amb: number,
    symbolUp: boolean,
  ): void {
    void vw;
    void vh;
    void look;
    const accepted = this.pulses.ingest(bus.pulses, nowMs, this.locate);
    for (const a of accepted) this.onAccepted(a, nowMs, amb, symbolUp);

    // Beam landings become small glows on the lattice.
    this.beams.update(nowMs / 1000, this.landings);
    for (const l of this.landings) this.pulses.addLanding(l.x, l.z, nowMs, l.tint);

    // Ambient waves ride the corridor.
    const sky = this.sky.uniforms.uWave.value;
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = this.waves[i];
      const age = w ? (nowMs - w.at) / 1000 : 99;
      if (w && age < 3.6) sky[i]!.set(age * 34, w.strength * (1 - age / 3.6), 0, 0);
      else sky[i]!.set(0, 0, 0, 0);
    }
  }

  private onAccepted(a: AcceptedPulse, nowMs: number, amb: number, symbolUp: boolean): void {
    if (a.kind !== 'block') return;
    if (amb > 0.5) {
      this.waves.unshift({ at: nowMs, strength: 1 });
      if (this.waves.length > MAX_WAVES) this.waves.length = MAX_WAVES;
      return;
    }
    if (!symbolUp || this.budget.tier < 1) return;
    // Three decorative sparks, one per tier, from the symbol to cells in the lower part of the view.
    const g = this.symbol.group.position;
    const sx = clamp((this.symCx / this.cssW) * 2 - 1, -0.7, 0.7);
    const tiers: [number, number, number, number, number][] = [
      // tint slot, hex colour, target ndc x offset, target ndc y base, jitter
      [TINT.cumulus, 0x36d3ff, -0.62, -0.42, 0.2],
      [TINT.nimbus, 0xc77dff, -0.05, -0.72, 0.14],
      [TINT.stratus, 0xffc857, 0.5, -0.5, 0.18],
    ];
    for (let i = 0; i < tiers.length; i++) {
      const [tint, hex, ox, oy, jit] = tiers[i]!;
      const nx = clamp(sx + ox + (this.rand() - 0.5) * jit, -0.92, 0.92);
      const ny = oy - this.rand() * jit;
      ndcRay(this.pose, nx, ny, ray, bs);
      rayPlane(ray, 0, 34, hit);
      this.beams.spawn(
        {
          sx: g.x,
          sy: g.y - 0.4,
          sz: g.z,
          ex: hit.x,
          ez: hit.z,
          r: srgb((hex >> 16) & 255),
          g: srgb((hex >> 8) & 255),
          b: srgb(hex & 255),
          duration: 0.8 + this.rand() * 0.25,
          delay: i * 0.16,
        },
        nowMs / 1000,
        tint,
      );
    }
  }

  private updateUniforms(
    bus: StageBusState,
    look: Look,
    nowMs: number,
    vw: number,
    vh: number,
    dt: number,
    amb: number,
    reduced: boolean,
  ): void {
    const S = this.shared;
    const L = this.lattice.uniforms;
    S.uTime.value = this.t;
    S.uWTime.value = this.wTime;
    const c = this.accent.current;
    S.uAccent.value.set(c.base[0], c.base[1], c.base[2]);
    S.uAccentHot.value.set(c.hot[0], c.hot[1], c.hot[2]);
    S.uAccentCore.value.set(c.core[0], c.core[1], c.core[2]);
    S.uHaze.value.set(c.haze[0], c.haze[1], c.haze[2]);
    // The first tint slot follows the live accent.
    S.uTints.value[0] = c.hot[0];
    S.uTints.value[1] = c.hot[1];
    S.uTints.value[2] = c.hot[2];

    S.uGlow.value = look.glow;
    S.uHazeAmt.value = look.haze;
    S.uExposure.value = look.exposure;
    // The intro flash also flares every edge in the field, so it reads as light rather than a veil.
    S.uBeat.value = reduced ? 0 : Math.max(this.pulses.beat(nowMs), this.intro.flash * 1.3);
    S.uSymbolGlow.value = look.pool * this.symPresence;
    S.uSymbolBoost.value = this.motion.hover;

    // The lattice disc, centred ahead of the camera and snapped to whole cells.
    const full = Math.min(this.budget.cells, this.disc.count);
    const R = this.disc.dist[Math.max(0, full - 1)] ?? 60;
    const reach = R * 0.4;
    const fog = fogScaleFor(R, reach) * look.fog;
    S.uFogScale.value = fog;
    const count = visibleCount(this.disc, reach, fog, full);
    this.lattice.setCount(this.budget.cells === 0 ? 0 : count);
    const [dcx, dcz] = discCentre(this.pose.x, this.pose.z, this.pose.yaw, reach);
    const [oq, or] = xzToAxial(dcx, dcz);
    L.uOrigin.value.set(oq, or);
    // The intro ignites from the middle of the view: the field point under the lower centre of the screen.
    ndcRay(this.pose, 0, -0.3, ray, bs);
    rayPlane(ray, 0, 38, hit);
    L.uIgniteC.value.set(hit.x, hit.z, R + reach + 24);
    L.uLift.value = look.lift;
    // Portrait screens see the field through a narrow window, so each cell is huge: calm the skyline there.
    const portrait = 1 - smoothstep(0.6, 1.2, this.pose.aspect);
    L.uRelief.value = look.relief * (1 - 0.5 * portrait);
    L.uIgnite.value = this.intro.ignite;
    L.uSink.value = amb;

    // Chain breathing: only when the clock is real.
    const ch = bus.chain;
    const live = ch.live && ch.lastBlockAt !== null && ch.intervalMs > 0;
    this.chainAmp = damp(this.chainAmp, live && !reduced ? 1 : 0, 1.5, dt);
    if (live) this.chainPhase = ((((Date.now() - (ch.lastBlockAt as number)) / ch.intervalMs) % 1) + 1) % 1;
    L.uChainAmp.value = this.chainAmp;
    L.uChainPhase.value = this.chainPhase;

    // Rings and focus regions.
    L.uRingCount.value = this.pulses.pack(nowMs, L.uRingA.value, L.uRingB.value);
    const eased: readonly EasedFocus[] = this.focusEase.update(bus.focus, dt);
    L.uFocusCount.value = this.focusEase.pack(L.uFocusA.value, L.uFocusB.value);
    this.stats.focus = eased.length;
    this.stats.pulses = L.uRingCount.value;

    // Sky and tunnel.
    const K = this.sky.uniforms;
    K.uFwd.value.set(bs.fx, bs.fy, bs.fz);
    K.uRight.value.set(bs.rx, bs.ry, bs.rz);
    K.uUp.value.set(bs.ux, bs.uy, bs.uz);
    const th = Math.tan(this.pose.fov / 2);
    K.uTan.value.set(th * this.pose.aspect, th);
    K.uSymNdc.value.set((this.symCx / vw) * 2 - 1, 1 - (this.symCy / vh) * 2);
    K.uSymR.value = Math.max(0.2, (2 * this.symPx) / vh) * 0.9;
    K.uAmbient.value = amb;
    K.uTravel.value = this.travel;
    K.uTunnelTime.value = this.tunnelTime;
    K.uSway.value.set(this.pose.x * 0.15, this.pose.y * 0.15);

    // Dust follows the camera; it streams past in the tunnel.
    const D = this.dust.uniforms;
    const dustFade = look.dust * (reduced ? 0.7 : 1);
    D.uCamera.value.set(this.pose.x, this.pose.y, this.pose.z);
    D.uFade.value = dustFade;
    D.uDrift.value.set(0.04, 0.15 * (1 - amb), amb * 4);
    const F = this.dustFg.uniforms;
    F.uCamera.value.set(this.pose.x, this.pose.y, this.pose.z);
    F.uFade.value = dustFade * 0.6;
    F.uDrift.value.set(0.03, 0.1 * (1 - amb), amb * 5);
    F.uPointer.value.set(this.cursorX, this.cursorZ);
    F.uPointerK.value = 0;

    // The symbol's pool: where it sits on the lattice and how wide its light spreads.
    const g = this.symbol.group;
    const sc = g.scale.x;
    this.shared.uSymbol.value.set(g.position.x, g.position.y, g.position.z, clamp(sc * 0.62, 3, 11));
    // The symbol plane (camera facing) for the mirror image the field shows of it.
    L.uSymRight.value.set(bs.rx * sc, bs.ry * sc, bs.rz * sc);
    L.uSymUp.value.set(bs.ux * sc, bs.uy * sc, bs.uz * sc);
    L.uSymFwd.value.set(-bs.fx, -bs.fy, -bs.fz);
  }

  private draw(look: Look, amb: number): void {
    const r = this.renderer;
    const b = this.budget;
    r.info.reset();
    this.gpuTimer?.begin();
    if (b.post && this.post.target) {
      r.setRenderTarget(this.post.target);
      r.clear(true, true, false);
      r.render(this.scene, this.camera);
      const flash = this.intro.flash;
      this.post.finish(
        {
          exposure: look.exposure * (1 + flash * 0.4),
          bloom: look.bloom * (b.tier === 3 ? 1 : 0.9) * (0.85 + 0.15 * (1 - amb)) * (1 + flash * 0.8),
          chroma: 0.007 * look.chroma * (b.chroma ? 1 : 0),
          grain: b.grain,
          vignette: Math.min(1.25, 0.72 * look.vignette),
          flash,
          flashX: this.symCx / this.cssW,
          flashY: 1 - this.symCy / this.cssH,
          fade: smoothstep(0, 1, this.revealT),
          time: this.t,
          threshold: 1.15,
        },
        this.stats.width,
        this.stats.height,
      );
    } else {
      r.setRenderTarget(null);
      r.clear(true, true, false);
      this.shared.uExposure.value =
        look.exposure * smoothstep(0, 1, this.revealT) * (1 + this.intro.flash * 0.6);
      r.render(this.scene, this.camera);
    }
    this.gpuTimer?.end();
    if (this.gpuTimer) this.stats.gpuMs = this.gpuTimer.ms;
    this.stats.drawCalls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
  }

  private afterFrame(rawDt: number, stalled: boolean, nowMs: number, reduced: boolean): void {
    const bus = useStageBus.getState();
    if (!this.ready && this.frames >= 2) {
      this.ready = true;
      bus.setStage({ ready: true, quality: this.tier, reason: reduced ? 'reduced-motion' : 'ok' });
    }
    this.stats.cells = this.lattice.count;
    this.stats.dust = this.dust.count;
    if (stalled || this.frames < 3) return;
    this.frameMsEma += (rawDt * 1000 - this.frameMsEma) * 0.08;
    this.stats.frameMs = this.frameMsEma;

    if (!reduced && this.governor) {
      const changed = this.governor.frame(rawDt);
      if (changed !== null) this.applyTier(changed, false);
      this.stats.fps = this.governor.fps;
      // Not even the lowest tier holds: hand the page to the CSS fallback.
      if (this.tier === 1 && this.governor.fps > 0 && this.governor.fps < 16) {
        if (!this.slowSince) this.slowSince = nowMs;
        else if (nowMs - this.slowSince > 8000) {
          this.events.onGiveUp();
          return;
        }
      } else {
        this.slowSince = 0;
      }
    } else if (!this.governor) {
      this.stats.fps = this.frameMsEma > 0 ? 1000 / this.frameMsEma : 0;
    }

    if (nowMs - this.statAt > 500) {
      this.statAt = nowMs;
      const fps = Math.round(this.stats.fps);
      if (fps !== this.lastFps) {
        this.lastFps = fps;
        bus.setStage({ fps });
      }
      const wantReason = reduced ? 'reduced-motion' : 'ok';
      if (
        bus.stage.reason !== wantReason &&
        (bus.stage.reason === 'ok' || bus.stage.reason === 'reduced-motion')
      ) {
        bus.setStage({ reason: wantReason });
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.cancel();
    this.unsubscribe();
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.lattice.dispose();
    this.sky.dispose();
    this.symbol.dispose();
    this.dust.dispose();
    this.dustFg.dispose();
    this.beams.dispose();
    this.post.dispose();
    this.gpuTimer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

function gpuName(r: WebGLRenderer): string {
  try {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'webgl2';
  } catch {
    return 'webgl2';
  }
}

function srgb(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
