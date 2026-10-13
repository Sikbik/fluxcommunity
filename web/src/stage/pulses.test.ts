import { describe, expect, it } from 'vitest';
import type { Pulse } from './bus';
import {
  MAX_BUS_RINGS,
  MAX_RINGS,
  PULSE_PARAMS,
  PulseTracker,
  pulseAge,
  pulseEnvelope,
  pulseStrength,
  ringRadius,
  ringTablesGlsl,
  ringValue,
  ringWidth,
} from './pulses';

const pulse = (
  id: number,
  kind: Pulse['kind'],
  at: number,
  x: number | null = 100,
  y: number | null = 100,
  strength = 1,
): Pulse => ({
  id,
  kind,
  at,
  x,
  y,
  strength,
});

const locate = (p: Pulse, out: [number, number]) => {
  out[0] = (p.x ?? 0) * 0.1;
  out[1] = (p.y ?? 0) * 0.1;
  return true;
};

describe('pulse maths', () => {
  it('measures age in seconds and never goes negative', () => {
    expect(pulseAge(2500, 1000)).toBeCloseTo(1.5, 9);
    expect(pulseAge(1000, 1500)).toBe(0);
  });

  it('normalises strength', () => {
    expect(pulseStrength(0.4)).toBe(0.4);
    expect(pulseStrength(-3)).toBe(0);
    expect(pulseStrength(9)).toBe(1.5);
    expect(pulseStrength(Number.NaN)).toBe(1);
  });

  it('expands the ring at its speed and widens the front', () => {
    const p = PULSE_PARAMS.block;
    expect(ringRadius(2, p)).toBe(2 * p.speed);
    expect(ringWidth(2, p)).toBeCloseTo(p.width + 2 * p.grow, 9);
  });

  it('has an envelope that is zero at the ends and bounded in between', () => {
    for (const k of ['block', 'click', 'success', 'warn', 'land'] as const) {
      const p = PULSE_PARAMS[k];
      expect(pulseEnvelope(0, p)).toBe(0);
      expect(pulseEnvelope(p.life, p)).toBe(0);
      expect(pulseEnvelope(p.life + 1, p)).toBe(0);
      for (let t = 0.01; t < p.life; t += p.life / 40) {
        const e = pulseEnvelope(t, p);
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThanOrEqual(1);
      }
      expect(pulseEnvelope(p.life * 0.3, p)).toBeGreaterThan(0.9);
    }
  });

  it('peaks at the wavefront and is quiet far ahead of it', () => {
    const p = PULSE_PARAMS.click;
    const age = 0.5;
    const r = ringRadius(age, p);
    const atFront = ringValue(r, age, p);
    expect(atFront).toBeGreaterThan(0.7);
    expect(ringValue(r + 12, age, p)).toBeLessThan(0.01);
    expect(ringValue(r + 1, age, p)).toBeLessThan(atFront);
    // The trailing ripple stays small.
    const behind = r - 3 * ringWidth(age, p);
    for (let d = 0; d < behind; d += 0.1) expect(Math.abs(ringValue(d, age, p))).toBeLessThan(0.5);
  });

  it('generates GLSL tables that match the TS params', () => {
    const g = ringTablesGlsl();
    expect(g).toContain('RING_K0[5]');
    expect(g).toContain(`vec4(${PULSE_PARAMS.block.speed}.0, ${PULSE_PARAMS.block.width}`);
    expect(g).toContain('RING_K1[5]');
  });
});

describe('PulseTracker', () => {
  it('consumes each pulse once and in order', () => {
    const t = new PulseTracker();
    const now = 10_000;
    const list = [pulse(1, 'click', now - 100), pulse(2, 'block', now - 50, null, null)];
    const a = t.ingest(list, now, locate);
    expect(a.map((p) => p.id)).toEqual([1, 2]);
    expect(t.ingest(list, now + 16, locate)).toHaveLength(0);
    expect(t.lastId).toBe(2);
    expect(t.activeCount()).toBe(2);
  });

  it('skips pulses that already ran their course', () => {
    const t = new PulseTracker();
    const a = t.ingest([pulse(1, 'click', 0)], 60_000, locate);
    expect(a).toHaveLength(0);
    expect(t.activeCount()).toBe(0);
    expect(t.lastId).toBe(1);
  });

  it('merges the same gesture reported twice and keeps the louder one', () => {
    const t = new PulseTracker();
    const now = 5000;
    const a = t.ingest(
      [pulse(1, 'click', now, 400, 300, 0.6), pulse(2, 'click', now + 30, 404, 302, 1)],
      now + 40,
      locate,
    );
    expect(a).toHaveLength(1);
    expect(t.activeCount()).toBe(1);
    const A = new Float32Array(MAX_RINGS * 4);
    const B = new Float32Array(MAX_RINGS * 4);
    expect(t.pack(now + 40, A, B)).toBe(1);
    expect(A[3]).toBe(1);
  });

  it('does not merge different kinds or distant clicks', () => {
    const t = new PulseTracker();
    const now = 5000;
    t.ingest(
      [
        pulse(1, 'click', now, 100, 100),
        pulse(2, 'success', now, 100, 100),
        pulse(3, 'click', now, 900, 700),
      ],
      now,
      locate,
    );
    expect(t.activeCount()).toBe(3);
  });

  it('packs ages and expires rings', () => {
    const t = new PulseTracker();
    const A = new Float32Array(MAX_RINGS * 4);
    const B = new Float32Array(MAX_RINGS * 4);
    t.ingest([pulse(1, 'click', 1000, 200, 100)], 1000, locate);
    expect(t.pack(1500, A, B)).toBe(1);
    expect(A[2]).toBeCloseTo(0.5, 6);
    expect(A[0]).toBeCloseTo(20, 6);
    expect(B[0]).toBe(1); // kind index of click
    expect(t.pack(1000 + PULSE_PARAMS.click.life * 1000 + 1, A, B)).toBe(0);
    expect(t.activeCount()).toBe(0);
  });

  it('reuses the oldest bus slot when more than eight arrive, and keeps landings separate', () => {
    const t = new PulseTracker();
    const now = 3000;
    const many: Pulse[] = [];
    for (let i = 1; i <= MAX_BUS_RINGS + 3; i++) many.push(pulse(i, 'success', now + i, i * 100, i * 90));
    t.ingest(many, now + 20, locate);
    expect(t.rings.slice(0, MAX_BUS_RINGS).every((r) => r.active)).toBe(true);
    t.addLanding(1, 2, now + 30, 3);
    t.addLanding(3, 4, now + 30, 4);
    expect(t.activeCount()).toBe(MAX_BUS_RINGS + 2);
  });

  it('exposes a beat flash that rises and decays after a block', () => {
    const t = new PulseTracker();
    expect(t.beat(1000)).toBe(0);
    t.ingest([pulse(1, 'block', 1000, null, null)], 1000, locate);
    expect(t.beat(1000)).toBeLessThan(0.05);
    expect(t.beat(1150)).toBeGreaterThan(0.6);
    expect(t.beat(9000)).toBeLessThan(0.001);
  });

  it('drops a pulse the locator cannot place', () => {
    const t = new PulseTracker();
    const a = t.ingest([pulse(1, 'click', 1000)], 1000, () => false);
    expect(a).toHaveLength(0);
    expect(t.activeCount()).toBe(0);
  });
});
