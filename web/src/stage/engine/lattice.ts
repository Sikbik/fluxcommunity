// The Lattice: instanced bevelled hex prisms. All motion is in the vertex shader, driven by a handful of
// uniforms, so a frame costs no per-cell CPU work. The instance order is nearest-first, so trimming the
// draw range (a tier change, thicker fog) shrinks the disc without a hitch.

import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { buildDisc, buildPrism, type Disc, SQRT3 } from '../hexgrid';
import { SDF_EXTENT } from '../mark';
import { MAX_CELLS } from '../tiers';
import { LATTICE_FRAG, LATTICE_VERT } from './shaders';
import type { SharedUniforms } from './uniforms';

/** Gap between neighbouring prisms, world units (the light that bleeds up through it). */
export const GAP = 0.085;
export const PRISM_RADIUS = 1 - GAP / SQRT3;
const BEVEL = 0.062;
const BEVEL_DROP = 0.058;
const DEPTH = 2.6;

export class Lattice {
  readonly mesh: Mesh;
  readonly disc: Disc;
  readonly uniforms: {
    uOrigin: { value: Vector2 };
    uLift: { value: number };
    uRelief: { value: number };
    uIgnite: { value: number };
    uIgniteC: { value: Vector3 };
    uSink: { value: number };
    uChainPhase: { value: number };
    uChainAmp: { value: number };
    uCursor: { value: Vector4 };
    uRingCount: { value: number };
    uRingA: { value: Float32Array };
    uRingB: { value: Float32Array };
    uFocusCount: { value: number };
    uFocusA: { value: Float32Array };
    uFocusB: { value: Float32Array };
    uHexApothem: { value: number };
    tDist: { value: Texture | null };
    uSymRight: { value: Vector3 };
    uSymUp: { value: Vector3 };
    uSymFwd: { value: Vector3 };
    uSymExtent: { value: Vector2 };
  };
  private readonly geometry: InstancedBufferGeometry;
  private readonly material: ShaderMaterial;

  constructor(shared: SharedUniforms) {
    this.disc = buildDisc(MAX_CELLS);
    const prism = buildPrism({ radius: PRISM_RADIUS, bevel: BEVEL, bevelDrop: BEVEL_DROP, depth: DEPTH });
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(prism.position, 3));
    g.setAttribute('normal', new BufferAttribute(prism.normal, 3));
    g.setAttribute('aMeta', new BufferAttribute(prism.meta, 4));
    g.setIndex(new BufferAttribute(prism.index, 1));
    g.setAttribute('aCell', new InstancedBufferAttribute(this.disc.cells, 2));
    g.instanceCount = 0;
    this.geometry = g;

    const topApothem = PRISM_RADIUS * (SQRT3 / 2) - BEVEL;
    this.uniforms = {
      uOrigin: { value: new Vector2() },
      uLift: { value: 1 },
      uRelief: { value: 1 },
      uIgnite: { value: 1 },
      uIgniteC: { value: new Vector3(0, 0, 40) },
      uSink: { value: 0 },
      uChainPhase: { value: 0 },
      uChainAmp: { value: 0 },
      uCursor: { value: new Vector4(0, 0, 0, 3) },
      uRingCount: { value: 0 },
      uRingA: { value: new Float32Array(14 * 4) },
      uRingB: { value: new Float32Array(14 * 4) },
      uFocusCount: { value: 0 },
      uFocusA: { value: new Float32Array(8 * 4) },
      uFocusB: { value: new Float32Array(8 * 4) },
      uHexApothem: { value: topApothem },
      tDist: { value: null },
      uSymRight: { value: new Vector3(1, 0, 0) },
      uSymUp: { value: new Vector3(0, 1, 0) },
      uSymFwd: { value: new Vector3(0, 0, 1) },
      uSymExtent: { value: new Vector2(SDF_EXTENT.x, SDF_EXTENT.y) },
    };

    this.material = new ShaderMaterial({
      vertexShader: LATTICE_VERT,
      fragmentShader: LATTICE_FRAG,
      uniforms: { ...shared, ...this.uniforms },
      depthTest: true,
      depthWrite: true,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
  }

  /** Number of instances drawn. */
  get count(): number {
    return this.geometry.instanceCount;
  }

  setCount(n: number): void {
    this.geometry.instanceCount = Math.max(0, Math.min(this.disc.count, Math.floor(n)));
  }

  get triangles(): number {
    return this.count * 28;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
