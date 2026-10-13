// Dust and bokeh: GPU point sprites drifting through a box that follows the camera. The hexagonal
// soft disc is generated in the fragment shader, so the stage needs no image to look right.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { mulberry32 } from '../math';
import { MAX_DUST } from '../tiers';
import { DUST_FRAG, DUST_VERT } from './shaders';
import type { SharedUniforms } from './uniforms';

export class Dust {
  readonly points: Points;
  readonly uniforms = {
    uBox: { value: new Vector3(70, 9, 90) },
    uCamera: { value: new Vector3() },
    uDrift: { value: new Vector3(0.05, 0.16, 0.0) },
    uPointer: { value: new Vector2(0, -20) },
    uPointerK: { value: 0 },
    uSize: { value: 1 },
    uFade: { value: 1 },
  };
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;

  constructor(shared: SharedUniforms, renderOrder = 5) {
    const rand = mulberry32(0x5eed);
    const a = new Float32Array(MAX_DUST * 4);
    for (let i = 0; i < MAX_DUST; i++) {
      a[i * 4] = rand();
      a[i * 4 + 1] = rand();
      a[i * 4 + 2] = rand();
      a[i * 4 + 3] = rand();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
    g.setAttribute('aDust', new BufferAttribute(a, 4));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = new ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: { ...shared, ...this.uniforms },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
  }

  setCount(n: number): void {
    this.geometry.setDrawRange(0, Math.max(0, Math.min(MAX_DUST, Math.floor(n))));
  }

  get count(): number {
    return this.geometry.drawRange.count;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
