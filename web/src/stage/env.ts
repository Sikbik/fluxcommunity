// Thin browser wrappers around the pure policy in governor.ts: what device is this, and did the URL
// force a tier. Everything is wrapped so a hostile or old browser can never throw from here.

import type { QualityTier } from './bus';
import { type DeviceHints, parseTierQuery } from './governor';

interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function readDeviceHints(): DeviceHints {
  try {
    const nav = navigator as Navigator & NavigatorExtras;
    const ua = nav.userAgent || '';
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const mobileUa =
      /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (nav.maxTouchPoints > 1 && /Macintosh/.test(ua));
    return {
      mobile: mobileUa || (coarse && Math.min(screen.width, screen.height) < 900),
      saveData: nav.connection?.saveData === true,
      deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
      cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    };
  } catch {
    return { mobile: false, saveData: false };
  }
}

export interface StageFlags {
  forcedTier: QualityTier | null;
  debug: boolean;
  /** Debug only: forces the device pixel ratio (to stress fill rate). */
  dpr: number | null;
}

export function readFlags(
  search: string = typeof location === 'undefined' ? '' : location.search,
): StageFlags {
  const params = new URLSearchParams(search);
  const dpr = Number(params.get('dpr'));
  return {
    forcedTier: parseTierQuery(search),
    debug: params.get('stage') === 'debug',
    dpr: Number.isFinite(dpr) && dpr > 0 && dpr <= 6 ? dpr : null,
  };
}

/** Whether a WebGL2 context can be created at all (cheap probe on a throwaway canvas). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
