import { describe, expect, it } from 'vitest';
import { createScene, EXAMPLE_ADDRESS, SPEC_FIELDS, sceneAt, typedChars, updateScene } from './scene';
import { BEAT, DURATION, STILL_AT } from './timeline';

describe('spec card', () => {
  it('is an example: six fields, no prices', () => {
    expect(SPEC_FIELDS.map((f) => f.key)).toEqual(['name', 'image', 'cpu', 'ram', 'storage', 'instances']);
    for (const f of SPEC_FIELDS) {
      expect(f.value).not.toMatch(/\$|usd|eur|price|per month|\/mo/i);
    }
    expect(EXAMPLE_ADDRESS).toMatch(/^example-app\.app\.runonflux\.io$/);
  });

  it('types one field after another', () => {
    const early = sceneAt(BEAT.typeStart + BEAT.typeDur / 2);
    expect(early.fields[0]).toBeGreaterThan(0);
    expect(early.fields[0]).toBeLessThan(1);
    expect(early.fields[1]).toBe(0);
    expect(early.caretField).toBe(0);

    const later = sceneAt(BEAT.typeStart + BEAT.typeGap * 2 + 100);
    expect(later.fields[0]).toBe(1);
    expect(later.fields[1]).toBe(1);
    expect(later.fields[2]).toBeGreaterThan(0);
    expect(later.fields[3]).toBe(0);
    expect(later.caretField).toBe(2);
  });

  it('has typed everything by the time the deploy button arrives', () => {
    const s = sceneAt(BEAT.deployIn[0] + 10);
    expect(s.fields.every((f) => f === 1)).toBe(true);
    expect(s.caretField).toBe(-1);
    expect(s.deployIn).toBeGreaterThan(0);
  });

  it('presses the button once and lets go', () => {
    expect(sceneAt(BEAT.deployPress[0]).deployPress).toBe(0);
    expect(sceneAt((BEAT.deployPress[0] + BEAT.deployPress[1]) / 2).deployPress).toBeCloseTo(1, 5);
    expect(sceneAt(BEAT.deployPress[1] + 1).deployPress).toBeCloseTo(0, 2);
  });
});

describe('typedChars', () => {
  it('counts characters from zero up to the whole value', () => {
    expect(typedChars('nginx', 0)).toBe(0);
    expect(typedChars('nginx', 1)).toBe(5);
    expect(typedChars('nginx', 0.5)).toBe(3);
    expect(typedChars('nginx', 5)).toBe(5);
    expect(typedChars('', 0.5)).toBe(0);
  });

  it('never goes backwards', () => {
    let prev = 0;
    for (let i = 0; i <= 40; i++) {
      const n = typedChars('0.5 cores', i / 40);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('place', () => {
  it('docks the card and reveals the map', () => {
    expect(sceneAt(BEAT.glide[0] - 1).cardPos).toBe(0);
    expect(sceneAt(BEAT.glide[1] + 1).cardPos).toBe(1);
    expect(sceneAt(BEAT.mapReveal[0] - 1).mapReveal).toBe(0);
    expect(sceneAt(BEAT.mapReveal[1] + 1).mapReveal).toBe(1);
  });

  it('sweeps a line across the map, then settles on the picks', () => {
    expect(sceneAt(BEAT.scan[0]).scan).toBe(0);
    expect(sceneAt((BEAT.scan[0] + BEAT.scan[1]) / 2).scan).toBeCloseTo(0.5, 5);
    expect(sceneAt(BEAT.scan[1]).scan).toBe(1);
    expect(sceneAt(BEAT.settle[0]).settle).toBe(0);
    expect(sceneAt((BEAT.settle[0] + BEAT.settle[1]) / 2).settle).toBeCloseTo(0.5, 5);
    expect(sceneAt(BEAT.settle[1]).settle).toBe(1);
    // Nothing is picked until the sweep is over.
    expect(sceneAt(BEAT.scan[1]).nodes[0]?.pick).toBe(0);
  });

  it('only ever moves forward through the scan and the settle (nothing blinks)', () => {
    const s = createScene();
    let scan = 0;
    let settle = 0;
    for (let t = 0; t <= STILL_AT.place; t += 25) {
      updateScene(s, t);
      expect(s.scan).toBeGreaterThanOrEqual(scan);
      expect(s.settle).toBeGreaterThanOrEqual(settle);
      scan = s.scan;
      settle = s.settle;
    }
    expect(scan).toBe(1);
    expect(settle).toBe(1);
  });

  it('has a steady caret: the scene carries no blink state', () => {
    const s = sceneAt(1_000) as unknown as Record<string, unknown>;
    expect('caretOn' in s).toBe(false);
    expect('search' in s).toBe(false);
  });

  it('picks three nodes one after another, with their deploy lines', () => {
    const t = BEAT.pick[1] + BEAT.pickDur / 2;
    const s = sceneAt(t);
    expect(s.nodes[0]?.pick).toBe(1);
    expect(s.nodes[1]?.pick).toBeGreaterThan(0);
    expect(s.nodes[1]?.pick).toBeLessThan(1);
    expect(s.nodes[2]?.pick).toBe(0);
    const done = sceneAt(BEAT.pick[2] + BEAT.arcDur + 10);
    expect(done.nodes.slice(0, 3).every((n) => n.pick === 1 && n.arc === 1)).toBe(true);
    expect(done.nodes[3]?.pick).toBe(0);
  });
});

describe('run', () => {
  it('brings the instances online in turn', () => {
    const s = sceneAt(BEAT.install[1] + 10);
    expect(s.nodes[0]?.status).toBe('installing');
    expect(s.nodes[1]?.status).toBe('installing');
    const later = sceneAt(BEAT.install[2] + BEAT.installDur + 10);
    expect(later.nodes.slice(0, 3).map((n) => n.status)).toEqual(['running', 'running', 'running']);
    expect(later.running).toBe(3);
  });

  it('lights a running copy steadily: the light only rises, once', () => {
    const s = createScene();
    const prev = [0, 0, 0, 0];
    for (let t = BEAT.install[0]; t < DURATION; t += 25) {
      updateScene(s, t);
      s.nodes.forEach((n, i) => {
        expect(n.online).toBeGreaterThanOrEqual((prev[i] as number) - 1e-12);
        prev[i] = n.online;
      });
    }
    expect(prev.every((v) => v === 1)).toBe(true);
    // The one-shot ring is finished well before the still of the Run step.
    expect(sceneAt(STILL_AT.run).nodes.every((n) => n.online === 1)).toBe(true);
  });

  it('serves traffic, then loses Virginia and says so', () => {
    const before = sceneAt(BEAT.drop[0] - 10);
    expect(before.flowA).toBe(1);
    expect(before.badge).toBe('serving');
    expect(before.nodes[1]?.status).toBe('running');
    expect(before.running).toBe(3);

    const during = sceneAt(BEAT.drop[1] + 10);
    expect(during.nodes[1]?.status).toBe('offline');
    expect(during.nodes[1]?.down).toBe(1);
    expect(during.flowA).toBe(0);
    expect(during.badge).toBe('offline');
    expect(during.running).toBe(2);
  });

  it('reroutes along a new path and is still up', () => {
    const mid = sceneAt((BEAT.reroute[0] + BEAT.reroute[1]) / 2);
    expect(mid.drawB).toBeGreaterThan(0);
    expect(mid.drawB).toBeLessThan(1);
    const after = sceneAt(BEAT.reroute[1] + 10);
    expect(after.drawB).toBe(1);
    expect(after.flowB).toBeGreaterThan(0);
    expect(after.badge).toBe('still-up');
  });

  it('starts a fresh copy elsewhere and ends with three running', () => {
    const placing = sceneAt(BEAT.replace[0] + 100);
    expect(placing.nodes[3]?.status).toBe('placing');
    expect(placing.running).toBe(2);
    const end = sceneAt(STILL_AT.run);
    expect(end.nodes[3]?.status).toBe('running');
    expect(end.nodes[1]?.status).toBe('offline');
    expect(end.running).toBe(3);
    expect(end.badge).toBe('still-up');
    expect(end.swapRow).toBe(1);
  });
});

describe('the seam', () => {
  it('fades in at the start and out at the end of the loop', () => {
    expect(sceneAt(0).fade).toBe(0);
    expect(sceneAt(BEAT.fadeIn[1]).fade).toBe(1);
    expect(sceneAt(STILL_AT.run).fade).toBe(1);
    expect(sceneAt(DURATION - 1).fade).toBeLessThan(0.01);
  });

  it('shows every still as a fully formed frame', () => {
    expect(sceneAt(STILL_AT.describe).fade).toBe(1);
    expect(sceneAt(STILL_AT.place).fade).toBe(1);
    expect(sceneAt(STILL_AT.run).fade).toBe(1);
    expect(
      sceneAt(STILL_AT.place)
        .nodes.slice(0, 3)
        .every((n) => n.pick === 1),
    ).toBe(true);
  });
});

describe('purity', () => {
  it('gives the same answer for the same time, in any order', () => {
    const s = createScene();
    const a = JSON.stringify(updateScene(s, 15_000));
    updateScene(s, 3_000);
    updateScene(s, 21_000);
    expect(JSON.stringify(updateScene(s, 15_000))).toBe(a);
    expect(JSON.stringify(sceneAt(15_000))).toBe(a);
  });

  it('keeps every progress value in range at every time', () => {
    const s = createScene();
    for (let t = 0; t < DURATION; t += 137) {
      updateScene(s, t);
      const nums = [
        s.fade,
        s.cardIn,
        s.cardPos,
        s.specOut,
        s.deployIn,
        s.deployPress,
        s.mapReveal,
        s.scan,
        s.settle,
        s.address,
        s.visitor,
        s.flowA,
        s.drawB,
        s.flowB,
        s.swapRow,
        ...s.fields,
        ...s.nodes.flatMap((n) => [n.pick, n.arc, n.online, n.down]),
      ];
      for (const v of nums) {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});
