// The backdrop: horizon haze, the glow behind the symbol, and the ambient hexagonal tunnel, drawn as one
// full-screen triangle behind everything. The lattice fades into the same haze colour at distance.

import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { SYMBOL_EDGE } from '../palette';
import { FS_VERT, SKY_FRAG } from './shaders';
import type { SharedUniforms } from './uniforms';

export function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

export class Sky {
  readonly mesh: Mesh;
  readonly uniforms = {
    uFwd: { value: new Vector3(0, 0, -1) },
    uRight: { value: new Vector3(1, 0, 0) },
    uUp: { value: new Vector3(0, 1, 0) },
    uTan: { value: new Vector2(1, 1) },
    uSymNdc: { value: new Vector2(0, 0.2) },
    uSymR: { value: 0.4 },
    uAmbient: { value: 0 },
    uTravel: { value: 0 },
    uTunnelTime: { value: 0 },
    uWave: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
    uSway: { value: new Vector2() },
    uBrand: { value: new Vector3(...SYMBOL_EDGE) },
  };
  private readonly geometry = fullscreenTriangle();
  private readonly material: ShaderMaterial;

  constructor(shared: SharedUniforms) {
    this.material = new ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { ...shared, ...this.uniforms },
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
