// Payout beams (decorative). On every block, three short sparks in the tier colours leave the symbol and
// land on lattice cells: one node per tier is paid in every block. The landing cells are not real node
// locations and nothing here is labelled as data.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector4 } from 'three';
import { BEAM_FRAG, BEAM_VERT } from './shaders';
import type { SharedUniforms } from './uniforms';

export const MAX_BEAMS = 6;
const TRAIL = 30;

export interface BeamSpawn {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ez: number;
  r: number;
  g: number;
  b: number;
  /** Seconds the beam takes from the symbol to the cell. */
  duration: number;
  /** Seconds to wait before leaving (staggers the three sparks). */
  delay: number;
}

interface Beam {
  active: boolean;
  t0: number;
  duration: number;
  delay: number;
  landed: boolean;
  ex: number;
  ez: number;
  tint: number;
}

export interface Landing {
  x: number;
  z: number;
  tint: number;
}

export class Beams {
  readonly points: Points;
  readonly uniforms = {
    uBeamA: { value: Array.from({ length: MAX_BEAMS }, () => new Vector4(0, 0, 0, -1)) },
    uBeamB: { value: Array.from({ length: MAX_BEAMS }, () => new Vector4()) },
    uBeamC: { value: Array.from({ length: MAX_BEAMS }, () => new Vector4(1, 1, 1, 1)) },
  };
  private readonly beams: Beam[] = Array.from({ length: MAX_BEAMS }, () => ({
    active: false,
    t0: 0,
    duration: 1,
    delay: 0,
    landed: false,
    ex: 0,
    ez: 0,
    tint: 3,
  }));
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private next = 0;

  constructor(shared: SharedUniforms) {
    const n = MAX_BEAMS * TRAIL;
    const ids = new Float32Array(n * 2);
    for (let b = 0; b < MAX_BEAMS; b++) {
      for (let k = 0; k < TRAIL; k++) {
        ids[(b * TRAIL + k) * 2] = b;
        ids[(b * TRAIL + k) * 2 + 1] = k / (TRAIL - 1);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aBeam', new BufferAttribute(ids, 2));
    this.geometry = g;
    this.material = new ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { ...shared, ...this.uniforms },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
  }

  spawn(s: BeamSpawn, nowS: number, tint: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_BEAMS;
    const b = this.beams[i]!;
    b.active = true;
    b.t0 = nowS + s.delay;
    b.duration = s.duration;
    b.delay = s.delay;
    b.landed = false;
    b.ex = s.ex;
    b.ez = s.ez;
    b.tint = tint;
    this.uniforms.uBeamA.value[i]!.set(s.sx, s.sy, s.sz, -1);
    this.uniforms.uBeamB.value[i]!.set(s.ex, 0.12, s.ez, 0.9 + Math.hypot(s.ex - s.sx, s.ez - s.sz) * 0.04);
    this.uniforms.uBeamC.value[i]!.set(s.r, s.g, s.b, 1);
  }

  /** Advances the beams. Returns the landings that happened this frame. */
  update(nowS: number, out: Landing[]): void {
    out.length = 0;
    let any = false;
    for (let i = 0; i < MAX_BEAMS; i++) {
      const b = this.beams[i]!;
      const A = this.uniforms.uBeamA.value[i]!;
      if (!b.active) {
        A.w = -1;
        continue;
      }
      const t = (nowS - b.t0) / b.duration;
      if (t < 0) {
        A.w = -1;
        any = true;
        continue;
      }
      if (t > 1.35) {
        b.active = false;
        A.w = -1;
        continue;
      }
      any = true;
      A.w = t;
      if (t >= 1 && !b.landed) {
        b.landed = true;
        out.push({ x: b.ex, z: b.ez, tint: b.tint });
      }
    }
    this.points.visible = any;
  }

  /** Moves the origin of every active beam (the symbol may have moved since the spawn). */
  clear(): void {
    for (const b of this.beams) b.active = false;
    this.points.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
