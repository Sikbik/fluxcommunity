import { describe, expect, it } from 'vitest';
import {
  arcPath,
  circlePath,
  describeChange,
  digitCount,
  formatCoord,
  GLINT_REACH,
  glintTarget,
  type HeroPhase,
  litSegments,
  nextHeroPhase,
  polar,
  priceDecimals,
  RING_SEGMENTS,
  reticleAt,
  ringArcs,
  ringText,
  scanBlockPulses,
  stripTone,
} from './logic';

describe('litSegments', () => {
  it('is empty for no progress and for unknown values', () => {
    expect(litSegments(0)).toBe(0);
    expect(litSegments(-1)).toBe(0);
    expect(litSegments(Number.NaN)).toBe(0);
    // A non-finite progress is a broken clock, not a full ring.
    expect(litSegments(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('counts the cell being filled as lit', () => {
    expect(litSegments(0.001)).toBe(1);
    expect(litSegments(1 / RING_SEGMENTS)).toBe(1);
    expect(litSegments(1 / RING_SEGMENTS + 0.001)).toBe(2);
    expect(litSegments(0.5)).toBe(15);
  });

  it('holds full while a block is overdue', () => {
    expect(litSegments(1)).toBe(RING_SEGMENTS);
    expect(litSegments(1.7)).toBe(RING_SEGMENTS);
  });

  it('honours a custom segment count', () => {
    expect(litSegments(0.5, 12)).toBe(6);
  });
});

describe('scanBlockPulses', () => {
  it('reports a block pulse newer than the last one seen', () => {
    const pulses = [
      { id: 4, kind: 'click' },
      { id: 5, kind: 'block' },
    ];
    expect(scanBlockPulses(pulses, 3)).toEqual({ seen: 5, block: true });
  });

  it('ignores pulses it has already seen', () => {
    const pulses = [
      { id: 4, kind: 'block' },
      { id: 5, kind: 'click' },
    ];
    expect(scanBlockPulses(pulses, 4)).toEqual({ seen: 5, block: false });
    expect(scanBlockPulses(pulses, 5)).toEqual({ seen: 5, block: false });
  });

  it('advances past non-block pulses without flaring', () => {
    expect(scanBlockPulses([{ id: 9, kind: 'success' }], 0)).toEqual({ seen: 9, block: false });
  });

  it('is calm with nothing to scan', () => {
    expect(scanBlockPulses([], 7)).toEqual({ seen: 7, block: false });
  });
});

describe('describeChange', () => {
  it('signs gains and losses with the right direction', () => {
    expect(describeChange(1.954)).toMatchObject({ direction: 'up', text: '+1.95%' });
    expect(describeChange(-0.4)).toMatchObject({ direction: 'down', text: '−0.40%' });
  });

  it('calls a change that rounds to zero flat, not up or down', () => {
    expect(describeChange(0)).toMatchObject({ direction: 'flat', text: '0.00%' });
    expect(describeChange(0.004)).toMatchObject({ direction: 'flat', text: '0.00%' });
    expect(describeChange(-0.004)).toMatchObject({ direction: 'flat' });
    expect(describeChange(0.005).direction).toBe('up');
  });

  it('treats missing data as unknown, never as zero', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(describeChange(v)).toMatchObject({ direction: 'none', text: '--' });
    }
  });

  it('speaks the change in words', () => {
    expect(describeChange(2.5).spoken).toBe('Up 2.50 percent over 24 hours');
    expect(describeChange(-12.345).spoken).toBe('Down 12.35 percent over 24 hours');
    expect(describeChange(0).spoken).toBe('Unchanged over 24 hours');
  });

  it('respects the digits argument', () => {
    expect(describeChange(1.2345, 1).text).toBe('+1.2%');
  });
});

describe('priceDecimals and digitCount', () => {
  it('uses four decimals under a dollar and two above', () => {
    expect(priceDecimals(0.0746)).toBe(4);
    expect(priceDecimals(0.9999)).toBe(4);
    expect(priceDecimals(1)).toBe(2);
    expect(priceDecimals(12.5)).toBe(2);
  });

  it('counts integer digits', () => {
    expect(digitCount(0)).toBe(1);
    expect(digitCount(7)).toBe(1);
    expect(digitCount(8012)).toBe(4);
    expect(digitCount(3_031_112)).toBe(7);
    expect(digitCount(-250)).toBe(3);
    expect(digitCount(Number.NaN)).toBe(1);
  });
});

describe('stripTone', () => {
  it('is syncing until something arrives', () => {
    expect(stripTone(['unknown', 'unknown', 'unknown'])).toBe('syncing');
  });

  it('is live when everything that arrived is live', () => {
    expect(stripTone(['live', 'live', 'live'])).toBe('live');
    expect(stripTone(['live', 'unknown', 'live'])).toBe('live');
  });

  it('is cached when any number is stale', () => {
    expect(stripTone(['live', 'cached', 'live'])).toBe('cached');
  });

  it('is offline when any number is offline, even if others are cached', () => {
    expect(stripTone(['live', 'offline', 'live'])).toBe('offline');
    expect(stripTone(['cached', 'offline', 'unknown'])).toBe('offline');
  });
});

describe('nextHeroPhase', () => {
  const run = (steps: Array<[boolean, string, boolean]>, start: HeroPhase = 'hold'): HeroPhase[] => {
    const out: HeroPhase[] = [];
    let phase = start;
    for (const [decided, intro, reduced] of steps) {
      phase = nextHeroPhase(phase, {
        decided,
        intro: intro as Parameters<typeof nextHeroPhase>[1]['intro'],
        reduced,
      });
      out.push(phase);
    }
    return out;
  };

  it('holds until the first frame has decided', () => {
    expect(run([[false, 'off', false]])).toEqual(['hold']);
    expect(run([[false, 'pending', false]])).toEqual(['hold']);
  });

  it('plays a first visit in step with the stage and lands when it is done', () => {
    expect(
      run([
        [false, 'off', false],
        [true, 'pending', false],
        [true, 'playing', false],
        [true, 'done', false],
      ]),
    ).toEqual(['hold', 'hold', 'play', 'play']);
  });

  it('settles at once on skip', () => {
    expect(
      run([
        [true, 'pending', false],
        [true, 'playing', false],
        [true, 'skip', false],
        [true, 'done', false],
      ]),
    ).toEqual(['hold', 'play', 'settle', 'settle']);
  });

  it('does a quick resolve when there is no intro this visit', () => {
    expect(
      run([
        [false, 'off', false],
        [true, 'off', false],
      ]),
    ).toEqual(['hold', 'quick']);
  });

  it('settles when the intro finishes before the hero ever saw it play', () => {
    expect(run([[true, 'done', false]])).toEqual(['settle']);
  });

  it('is static under reduced motion whatever the intro says', () => {
    expect(
      run([
        [false, 'pending', true],
        [true, 'playing', true],
        [true, 'off', true],
      ]),
    ).toEqual(['static', 'static', 'static']);
  });

  it('is idempotent: feeding the result back returns it again', () => {
    const intros = ['off', 'pending', 'playing', 'skip', 'done'] as const;
    const prevs: HeroPhase[] = ['hold', 'play', 'quick', 'settle', 'static'];
    for (const intro of intros) {
      for (const prev of prevs) {
        for (const decided of [false, true]) {
          for (const reduced of [false, true]) {
            const input = { decided, intro, reduced };
            const once = nextHeroPhase(prev, input);
            expect(nextHeroPhase(once, input)).toBe(once);
          }
        }
      }
    }
  });
});

describe('reticleAt', () => {
  const rect = { left: 100, top: 50, width: 200, height: 400 };

  it('is zero at the centre, with y up', () => {
    expect(reticleAt(200, 250, rect)).toEqual({ x: 0, y: 0, inside: true });
    expect(reticleAt(300, 50, rect)).toEqual({ x: 1, y: 1, inside: true });
    expect(reticleAt(100, 450, rect)).toEqual({ x: -1, y: -1, inside: true });
  });

  it('knows when the pointer is outside, with optional padding', () => {
    expect(reticleAt(99, 250, rect).inside).toBe(false);
    expect(reticleAt(99, 250, rect, 4).inside).toBe(true);
    expect(reticleAt(500, 900, rect)).toMatchObject({ x: 1, y: -1, inside: false });
  });

  it('survives a frame with no size', () => {
    expect(reticleAt(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      inside: false,
    });
  });
});

describe('formatCoord', () => {
  it('signs and fixes two decimals', () => {
    expect(formatCoord(0.424)).toBe('+0.42');
    expect(formatCoord(-0.181)).toBe('−0.18');
    expect(formatCoord(1)).toBe('+1.00');
  });

  it('never prints a negative zero', () => {
    expect(formatCoord(-0)).toBe('+0.00');
    expect(formatCoord(-0.004)).toBe('+0.00');
    expect(formatCoord(Number.NaN)).toBe('+0.00');
  });
});

describe('glintTarget', () => {
  const box = { left: 100, top: 200, width: 400, height: 100 };

  it('is fully present over the box, with the pointer mapped across it', () => {
    expect(glintTarget(300, 250, box)).toEqual({ x: 0, y: 0, g: 1 });
    const left = glintTarget(100, 250, box);
    expect(left.x).toBe(-1);
    expect(left.g).toBe(1);
    const corner = glintTarget(500, 300, box);
    expect(corner.x).toBe(1);
    expect(corner.y).toBe(1);
  });

  it('fades to nothing at the reach and stays there', () => {
    const half = glintTarget(500 + GLINT_REACH / 2, 250, box);
    expect(half.g).toBeGreaterThan(0.4);
    expect(half.g).toBeLessThan(0.6);
    expect(glintTarget(500 + GLINT_REACH, 250, box).g).toBe(0);
    expect(glintTarget(5000, 5000, box).g).toBe(0);
  });

  it('measures the distance to the box, not to its centre', () => {
    // 90 px above the top edge versus 90 px to the right of the right edge: the same distance.
    expect(glintTarget(300, 110, box).g).toBeCloseTo(glintTarget(590, 250, box).g, 10);
  });

  it('clamps the position just outside the box and ignores unusable input', () => {
    const out = glintTarget(2000, 250, box, 5000);
    expect(out.x).toBe(1.5);
    expect(glintTarget(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0, g: 0 });
    expect(glintTarget(Number.NaN, 10, box)).toEqual({ x: 0, y: 0, g: 0 });
  });
});

describe('circlePath and ringText', () => {
  it('draws a closed clockwise circle from the top', () => {
    expect(circlePath(50, 50, 40)).toBe('M50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10Z');
  });

  it('repeats the phrases with a slash after each', () => {
    const one = ringText(1);
    expect(one).toBe('DECENTRALIZED CLOUD  /  BUILT BY ITS COMMUNITY  /  PROOF OF NODE  /  ');
    expect(ringText(3)).toBe(one.repeat(3));
    expect(ringText(0)).toBe(one);
  });
});

describe('polar and arcPath', () => {
  it('measures degrees clockwise from the top', () => {
    const top = polar(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polar(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
    const bottom = polar(100, 100, 50, 180);
    expect(bottom.x).toBeCloseTo(100);
    expect(bottom.y).toBeCloseTo(150);
  });

  it('draws a clockwise arc and flags the long way round', () => {
    expect(arcPath(100, 100, 50, 0, 90)).toBe('M100 50A50 50 0 0 1 150 100');
    expect(arcPath(100, 100, 50, 0, 270)).toBe('M100 50A50 50 0 1 1 50 100');
  });
});

describe('ringArcs', () => {
  const arcs = ringArcs(320, 320, 296, 3);

  it('cuts one arc per phrase, three laps of three phrases', () => {
    expect(arcs).toHaveLength(9);
    expect(arcs.map((a) => a.text.trim()).slice(0, 3)).toEqual([
      'DECENTRALIZED CLOUD  /',
      'BUILT BY ITS COMMUNITY  /',
      'PROOF OF NODE  /',
    ]);
  });

  it('gives every glyph the same share of the circle', () => {
    const per = arcs.map((a) => a.length / a.text.length);
    for (const p of per) expect(p).toBeCloseTo(per[0] ?? 0, 1);
    const sum = arcs.reduce((n, a) => n + a.length, 0);
    expect(sum).toBeCloseTo(2 * Math.PI * 296, 0);
  });

  it('keeps each arc short enough that its text box stays small', () => {
    // 296 radius: the longest phrase must stay well under a quarter of the circle.
    for (const a of arcs) expect(a.length).toBeLessThan((2 * Math.PI * 296) / 4);
  });

  it('closes the loop: the last arc ends where the first begins', () => {
    const last = arcs.at(-1)?.d ?? '';
    const first = arcs[0]?.d ?? '';
    const endOfLast = last.split(' ').slice(-2).join(' ');
    const startOfFirst = first.slice(1).split('A')[0];
    expect(endOfLast).toBe(startOfFirst);
  });
});
