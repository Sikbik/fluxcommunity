// Uniform values shared by every material. Each material receives the same `{ value }` objects, so one
// write per frame updates the whole scene. Values that only one material needs live on that material.

import { Vector2, Vector3, Vector4 } from 'three';
import { ACCENTS, TINT_COLOURS } from '../palette';

export interface Uniform<T> {
  value: T;
}

export interface SharedUniforms {
  uTime: Uniform<number>;
  uWTime: Uniform<number>;
  uViewport: Uniform<Vector2>;
  uDirect: Uniform<number>;
  uExposure: Uniform<number>;
  uAccent: Uniform<Vector3>;
  uAccentHot: Uniform<Vector3>;
  uAccentCore: Uniform<Vector3>;
  uHaze: Uniform<Vector3>;
  uTints: Uniform<Float32Array>;
  uGlow: Uniform<number>;
  uHazeAmt: Uniform<number>;
  uFogScale: Uniform<number>;
  uSymbol: Uniform<Vector4>;
  uSymbolGlow: Uniform<number>;
  uSymbolBoost: Uniform<number>;
  uBeat: Uniform<number>;
  uDpr: Uniform<number>;
}

export function createSharedUniforms(): SharedUniforms {
  const f = ACCENTS.flux;
  const tints = new Float32Array(18);
  TINT_COLOURS.forEach((c, i) => {
    tints[i * 3] = c[0];
    tints[i * 3 + 1] = c[1];
    tints[i * 3 + 2] = c[2];
  });
  return {
    uTime: { value: 0 },
    uWTime: { value: 0 },
    uViewport: { value: new Vector2(1, 1) },
    uDirect: { value: 0 },
    uExposure: { value: 1 },
    uAccent: { value: new Vector3(...f.base) },
    uAccentHot: { value: new Vector3(...f.hot) },
    uAccentCore: { value: new Vector3(...f.core) },
    uHaze: { value: new Vector3(...f.haze) },
    uTints: { value: tints },
    uGlow: { value: 1 },
    uHazeAmt: { value: 1 },
    uFogScale: { value: 30 },
    uSymbol: { value: new Vector4(0, 4, -20, 6) },
    uSymbolGlow: { value: 1 },
    uSymbolBoost: { value: 0 },
    uBeat: { value: 0 },
    uDpr: { value: 1 },
  };
}
