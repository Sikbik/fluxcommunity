// The Flux symbol, extruded from its four official shards into frosted glass with a Flux blue edge.
// The geometry is built in mark units (1 tall) and the group is scaled to match the DOM anchor.
// It never takes a tier colour: the edge is always the Flux blue, the faces white.

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  Mesh,
  RGBAFormat,
  ShaderMaterial,
  Shape,
  UnsignedByteType,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { bakeShardDistance, buildShards, SDF_EXTENT, SDF_RANGE } from '../mark';
import { SYMBOL_EDGE } from '../palette';
import { SYMBOL_FRAG, SYMBOL_VERT } from './shaders';
import type { SharedUniforms } from './uniforms';

/** Extrusion depth and bevel, in mark units (the mark is 1 tall). */
const DEPTH = 0.082;
const BEVEL = 0.0105;
const SDF_SIZE = 128;

export interface ShardView {
  id: string;
  mesh: Mesh;
  material: ShaderMaterial;
  /** Direction from the mark centre, used by the hover separation. */
  outward: [number, number];
  centroid: [number, number];
  uniforms: { uChannel: { value: number }; uSeed: { value: number }; uDissolve: { value: number } };
}

export class Symbol3D {
  readonly group = new Group();
  readonly shards: ShardView[] = [];
  readonly uniforms = {
    uBright: { value: 1 },
    uHover: { value: 0 },
    uPress: { value: 0 },
    uFlash: { value: 0 },
    uKeyDir: { value: new Vector3(-0.35, 0.62, 0.7) },
    uEdge: { value: new Vector3(...SYMBOL_EDGE) },
    uExtent: { value: new Vector2(SDF_EXTENT.x, SDF_EXTENT.y) },
    uRange: { value: SDF_RANGE },
    uHalfDepth: { value: DEPTH / 2 },
    uBevel: { value: BEVEL },
    uLite: { value: 0 },
  };
  readonly texture: DataTexture;
  private readonly geometries: ExtrudeGeometry[] = [];
  private readonly clearMesh: Mesh;
  private readonly clearMaterial: ShaderMaterial;

  constructor(shared: SharedUniforms) {
    this.texture = new DataTexture(
      bakeShardDistance(SDF_SIZE),
      SDF_SIZE,
      SDF_SIZE,
      RGBAFormat,
      UnsignedByteType,
    );
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    // The symbol is drawn over everything with a fresh depth buffer: a trivial mesh ahead of the shards
    // clears depth when it is reached in the render list.
    this.clearMaterial = new ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
    });
    this.clearMesh = new Mesh(fullscreenPoint(), this.clearMaterial);
    this.clearMesh.frustumCulled = false;
    this.clearMesh.renderOrder = 9;
    this.clearMesh.onBeforeRender = (renderer: WebGLRenderer) => renderer.clearDepth();
    this.group.add(this.clearMesh);

    const shards = buildShards();
    shards.forEach((s, i) => {
      const shape = new Shape();
      s.points.forEach((p, k) => {
        if (k === 0) shape.moveTo(p[0], p[1]);
        else shape.lineTo(p[0], p[1]);
      });
      shape.closePath();
      const geo = new ExtrudeGeometry(shape, {
        depth: DEPTH,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL,
        bevelOffset: -BEVEL,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 1,
      });
      geo.translate(0, 0, -DEPTH / 2);
      this.geometries.push(geo);
      const own = {
        uChannel: { value: i },
        uSeed: { value: i * 0.37 + 0.11 },
        uDissolve: { value: 0 },
      };
      const material = new ShaderMaterial({
        vertexShader: SYMBOL_VERT,
        fragmentShader: SYMBOL_FRAG,
        uniforms: { ...shared, ...this.uniforms, ...own, tDist: { value: this.texture } },
        depthTest: true,
        depthWrite: true,
      });
      const mesh = new Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10 + i;
      this.group.add(mesh);
      this.shards.push({
        id: s.id,
        mesh,
        material,
        outward: [s.outward[0], s.outward[1]],
        centroid: [s.centroid[0], s.centroid[1]],
        uniforms: own,
      });
    });
    this.group.visible = false;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const s of this.shards) s.material.dispose();
    this.clearMesh.geometry.dispose();
    this.clearMaterial.dispose();
    this.texture.dispose();
  }
}

function fullscreenPoint(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
  return g;
}
