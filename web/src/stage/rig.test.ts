import { describe, expect, it } from 'vitest';
import { DEG } from './math';
import {
  basis,
  type CameraPose,
  fovForAspect,
  horizonRow,
  ndcRay,
  project,
  rayPlane,
  unprojectAtDepth,
  worldSizeForPixels,
} from './rig';

const pose = (over: Partial<CameraPose> = {}): CameraPose => ({
  x: 0,
  y: 2.5,
  z: 8,
  yaw: 0,
  pitch: 3.4 * DEG,
  fov: 36 * DEG,
  aspect: 1.6,
  ...over,
});

describe('camera basis', () => {
  it('looks down -z at yaw 0 and is orthonormal', () => {
    const b = basis(pose({ pitch: 0 }));
    expect(b.fx).toBeCloseTo(0, 9);
    expect(b.fz).toBeCloseTo(-1, 9);
    expect(b.rx).toBeCloseTo(1, 9);
    expect(b.uy).toBeCloseTo(1, 9);
    const p = pose({ yaw: 0.7, pitch: -0.4 });
    const o = basis(p);
    expect(o.fx * o.rx + o.fy * o.ry + o.fz * o.rz).toBeCloseTo(0, 9);
    expect(o.fx * o.ux + o.fy * o.uy + o.fz * o.uz).toBeCloseTo(0, 9);
    expect(Math.hypot(o.ux, o.uy, o.uz)).toBeCloseTo(1, 9);
  });
});

describe('rays and the lattice plane', () => {
  it('hits the plane under a downward ray and clamps a sky ray', () => {
    const p = pose({ pitch: 0 });
    const down = ndcRay(p, 0, -0.5);
    const hit = rayPlane(down, 0, 200);
    expect(hit.hit).toBe(true);
    expect(hit.t).toBeGreaterThan(0);
    expect(hit.x).toBeCloseTo(0, 6);
    expect(hit.z).toBeLessThan(p.z);
    const sky = ndcRay(p, 0.3, 0.4);
    const far = rayPlane(sky, 0, 40);
    expect(far.hit).toBe(false);
    expect(Math.hypot(far.x - p.x, far.z - p.z)).toBeCloseTo(40, 6);
  });

  it('puts the horizon where rays parallel to the plane vanish', () => {
    const p = pose();
    const row = horizonRow(p);
    // A ray through that row is horizontal.
    const ny = 1 - row * 2;
    const r = ndcRay(p, 0, ny);
    expect(r.dy).toBeCloseTo(0, 6);
    // Pitching up moves the horizon down the screen.
    expect(row).toBeGreaterThan(0.5);
  });

  it('round trips project and unproject', () => {
    const p = pose({ yaw: 0.2, pitch: -0.15 });
    const vw = 1440;
    const vh = 900;
    const w = unprojectAtDepth(p, vw, vh, 1000, 300, 25);
    const s = project(p, vw, vh, w.x, w.y, w.z);
    expect(s).not.toBeNull();
    expect(s!.x).toBeCloseTo(1000, 3);
    expect(s!.y).toBeCloseTo(300, 3);
    expect(s!.depth).toBeCloseTo(25, 6);
  });

  it('does not project points behind the camera', () => {
    const p = pose({ pitch: 0 });
    expect(project(p, 1440, 900, 0, 2.5, 20)).toBeNull();
  });

  it('sizes the symbol so it spans the anchor height in pixels', () => {
    const p = pose({ pitch: 0 });
    const vh = 900;
    const size = worldSizeForPixels(p, vh, 520, 30);
    const top = unprojectAtDepth(p, 1440, vh, 720, 450 - 260, 30);
    const bottom = unprojectAtDepth(p, 1440, vh, 720, 450 + 260, 30);
    expect(top.y - bottom.y).toBeCloseTo(size, 6);
  });
});

describe('field of view for aspect', () => {
  it('keeps landscape and widens portrait', () => {
    expect(fovForAspect(36, 1.78)).toBe(36);
    expect(fovForAspect(36, 1.35)).toBe(36);
    expect(fovForAspect(36, 0.46)).toBeCloseTo(36 * 1.55, 5);
    expect(fovForAspect(36, 0.9)).toBeGreaterThan(36);
    expect(fovForAspect(36, 0.9)).toBeLessThan(36 * 1.55);
  });
});
