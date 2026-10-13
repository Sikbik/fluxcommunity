import { describe, expect, it } from 'vitest';
import {
  advance,
  holdReason,
  INITIAL_PLAYER,
  isRunning,
  jumpToStep,
  MAX_FRAME_MS,
  type PlayerState,
  seek,
  setFocused,
  setHovering,
  setInView,
  setReduced,
  timelineText,
  toggleRunning,
} from './sequence';
import {
  BEAT,
  DURATION,
  easeInOut,
  easeOut,
  STEPS,
  STILL_AT,
  seg,
  stepAt,
  stepIndexAt,
  stepProgress,
} from './timeline';

const playing: PlayerState = { ...INITIAL_PLAYER, inView: true };

describe('timeline', () => {
  it('tiles the duration with three steps, in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['describe', 'place', 'run']);
    expect(STEPS[0]?.start).toBe(0);
    for (let i = 1; i < STEPS.length; i++) {
      expect(STEPS[i]?.start).toBe(STEPS[i - 1]?.end);
    }
    expect(STEPS[STEPS.length - 1]?.end).toBe(DURATION);
  });

  it('finds the step at a time, with the boundary belonging to the later step', () => {
    expect(stepAt(0).id).toBe('describe');
    expect(stepAt(6_399).id).toBe('describe');
    expect(stepAt(6_400).id).toBe('place');
    expect(stepAt(12_600).id).toBe('run');
    expect(stepAt(DURATION - 1).id).toBe('run');
    expect(stepIndexAt(-50)).toBe(0);
  });

  it('measures progress through a step', () => {
    expect(stepProgress(0)).toBe(0);
    expect(stepProgress(3_200)).toBeCloseTo(0.5, 5);
    expect(stepProgress(6_400)).toBe(0);
  });

  it('keeps every beat inside its own step', () => {
    const inStep = (id: 'describe' | 'place' | 'run', values: readonly number[]) => {
      const span = STEPS.find((s) => s.id === id);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(span?.start ?? 0);
        expect(v).toBeLessThanOrEqual(span?.end ?? 0);
      }
    };
    inStep('describe', [
      BEAT.cardIn[0],
      BEAT.cardIn[1],
      BEAT.typeStart + 5 * BEAT.typeGap + BEAT.typeDur,
      BEAT.deployIn[0],
      BEAT.deployPress[1],
    ]);
    inStep('place', [
      ...BEAT.glide,
      ...BEAT.mapReveal,
      ...BEAT.scan,
      ...BEAT.settle,
      BEAT.pick[0],
      BEAT.pick[2] + BEAT.pickDur,
      BEAT.pick[2] + BEAT.arcDur,
    ]);
    inStep('run', [
      ...BEAT.statusIn,
      BEAT.install[2] + BEAT.installDur,
      ...BEAT.visitor,
      ...BEAT.drop,
      ...BEAT.reroute,
      ...BEAT.stillUp,
      ...BEAT.replace,
      BEAT.replaceRunning,
      ...BEAT.fadeOut,
    ]);
  });

  it('orders the placement: scan the map, then settle on three, then send the copies', () => {
    expect(BEAT.scan[0]).toBeGreaterThanOrEqual(BEAT.mapReveal[0]);
    // The line has crossed every cell before the network decides anything.
    expect(BEAT.scan[1]).toBeLessThanOrEqual(BEAT.settle[0]);
    expect(BEAT.settle[0]).toBeLessThanOrEqual(BEAT.pick[0]);
    expect(BEAT.pick[0]).toBeLessThan(BEAT.pick[1]);
    expect(BEAT.pick[1]).toBeLessThan(BEAT.pick[2]);
    // The cells that were not chosen are gone before the last copy is picked.
    expect(BEAT.settle[1]).toBeLessThanOrEqual(BEAT.pick[2]);
    // And the whole placement is formed by the time of its still.
    expect(BEAT.pick[2] + BEAT.pickDur).toBeLessThanOrEqual(STILL_AT.place);
    expect(BEAT.pick[2] + BEAT.arcDur).toBeLessThanOrEqual(STILL_AT.place);
  });

  it('orders the story: install, drop, reroute, replace', () => {
    expect(BEAT.install[2] + BEAT.installDur).toBeLessThan(BEAT.flowA[1] + 1);
    expect(BEAT.drop[0]).toBeGreaterThan(BEAT.flowA[1]);
    expect(BEAT.reroute[0]).toBeGreaterThanOrEqual(BEAT.drop[1]);
    expect(BEAT.replace[0]).toBeGreaterThanOrEqual(BEAT.reroute[1]);
    expect(BEAT.replaceRunning).toBeGreaterThan(BEAT.replace[1]);
  });

  it('has a fully formed still for every step, inside that step', () => {
    for (const s of STEPS) {
      const t = STILL_AT[s.id];
      expect(t).toBeGreaterThanOrEqual(s.start);
      expect(t).toBeLessThan(s.end);
    }
  });

  it('seg and the easings are clamped and monotonic', () => {
    expect(seg(-5, 0, 10)).toBe(0);
    expect(seg(15, 0, 10)).toBe(1);
    expect(seg(5, 0, 10)).toBe(0.5);
    expect(seg(5, 10, 10)).toBe(0);
    expect(seg(10, 10, 10)).toBe(1);
    for (const f of [easeOut, easeInOut]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = f(i / 20);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe('isRunning', () => {
  it('runs when in view with nothing holding it', () => {
    expect(isRunning(playing)).toBe(true);
  });

  it('never runs off screen or under reduced motion', () => {
    expect(isRunning({ ...playing, inView: false })).toBe(false);
    expect(isRunning({ ...playing, reduced: true })).toBe(false);
    expect(isRunning({ ...playing, reduced: true, driven: true })).toBe(false);
  });

  it('holds while hovered or focused', () => {
    expect(isRunning({ ...playing, hovering: true })).toBe(false);
    expect(isRunning({ ...playing, focused: true })).toBe(false);
  });

  it('lets the visitor override hover and focus by driving it', () => {
    expect(isRunning({ ...playing, hovering: true, driven: true })).toBe(true);
    expect(isRunning({ ...playing, focused: true, driven: true })).toBe(true);
  });

  it('is stopped by a pause even when driven', () => {
    expect(isRunning({ ...playing, userPaused: true, driven: true })).toBe(false);
  });
});

describe('holdReason', () => {
  it('names what is holding the sequence, in order of precedence', () => {
    expect(holdReason(playing)).toBe('none');
    expect(holdReason({ ...playing, reduced: true, inView: false })).toBe('reduced');
    expect(holdReason({ ...playing, inView: false, userPaused: true })).toBe('offscreen');
    expect(holdReason({ ...playing, userPaused: true, hovering: true })).toBe('user');
    expect(holdReason({ ...playing, hovering: true, focused: true })).toBe('hover');
    expect(holdReason({ ...playing, focused: true })).toBe('focus');
  });

  it('is none whenever isRunning is true', () => {
    for (const s of [playing, { ...playing, hovering: true, driven: true }]) {
      expect(isRunning(s)).toBe(holdReason(s) === 'none');
    }
  });
});

describe('advance', () => {
  it('moves the playhead while running', () => {
    expect(advance(playing, 16).time).toBe(16);
  });

  it('does not move while held, and returns the same object', () => {
    const held = { ...playing, hovering: true };
    expect(advance(held, 16)).toBe(held);
  });

  it('ignores a zero, negative or NaN step', () => {
    expect(advance(playing, 0)).toBe(playing);
    expect(advance(playing, -4)).toBe(playing);
    expect(advance(playing, Number.NaN)).toBe(playing);
  });

  it('caps a long frame (a tab coming back) so it cannot skip ahead', () => {
    expect(advance(playing, 5_000).time).toBe(MAX_FRAME_MS);
  });

  it('loops at the end of the timeline', () => {
    const near = { ...playing, time: DURATION - 10 };
    const next = advance(near, 40);
    expect(next.time).toBe(30);
    expect(next.time).toBeLessThan(DURATION);
  });
});

describe('seek', () => {
  it('moves the playhead and holds it there', () => {
    const s = seek(playing, 9_000);
    expect(s.time).toBe(9_000);
    expect(s.userPaused).toBe(true);
    expect(isRunning(s)).toBe(false);
  });

  it('clamps into the timeline', () => {
    expect(seek(playing, -100).time).toBe(0);
    expect(seek(playing, DURATION * 3).time).toBe(DURATION - 1);
    expect(seek(playing, Number.NaN).time).toBe(0);
  });

  it('cancels an earlier drive', () => {
    expect(seek({ ...playing, driven: true }, 100).driven).toBe(false);
  });
});

describe('jumpToStep', () => {
  it('goes to the start of the step and plays', () => {
    const s = jumpToStep({ ...playing, userPaused: true, time: 100 }, 'place');
    expect(s.time).toBe(6_400);
    expect(s.userPaused).toBe(false);
    expect(s.driven).toBe(true);
    expect(stepAt(s.time).id).toBe('place');
  });

  it('keeps playing even while the pointer is still over it', () => {
    const s = jumpToStep({ ...playing, hovering: true }, 'run');
    expect(isRunning(s)).toBe(true);
  });
});

describe('toggleRunning', () => {
  it('pauses a running sequence, then plays and drives it', () => {
    const paused = toggleRunning(playing);
    expect(paused.userPaused).toBe(true);
    expect(isRunning(paused)).toBe(false);
    const resumed = toggleRunning({ ...paused, hovering: true });
    expect(resumed.userPaused).toBe(false);
    expect(resumed.driven).toBe(true);
    expect(isRunning(resumed)).toBe(true);
  });

  it('plays in one press when only a hover was holding it', () => {
    const held = { ...playing, hovering: true };
    expect(isRunning(held)).toBe(false);
    const next = toggleRunning(held);
    expect(next.userPaused).toBe(false);
    expect(isRunning(next)).toBe(true);
  });
});

describe('hover, focus and leaving', () => {
  it('ends the drive when the visitor leaves entirely', () => {
    let s: PlayerState = jumpToStep(setHovering(playing, true), 'place');
    expect(s.driven).toBe(true);
    s = setHovering(s, false);
    expect(s.driven).toBe(false);
    // Coming back, hover holds it again.
    s = setHovering(s, true);
    expect(isRunning(s)).toBe(false);
  });

  it('keeps the drive while focus is still inside', () => {
    let s: PlayerState = setFocused(setHovering(playing, true), true);
    s = jumpToStep(s, 'place');
    s = setHovering(s, false);
    expect(s.driven).toBe(true);
    s = setFocused(s, false);
    expect(s.driven).toBe(false);
  });

  it('returns the same object for a no-op', () => {
    expect(setHovering(playing, false)).toBe(playing);
    expect(setFocused(playing, false)).toBe(playing);
    expect(setInView(playing, true)).toBe(playing);
    expect(setReduced(playing, false)).toBe(playing);
  });

  it('forgets a drive when it scrolls out of view', () => {
    const s = setInView({ ...playing, driven: true }, false);
    expect(s.driven).toBe(false);
  });
});

describe('timelineText', () => {
  it('names the step for assistive tech', () => {
    expect(timelineText(0)).toBe('Step 1 of 3, Describe');
    expect(timelineText(7_000)).toBe('Step 2 of 3, Place');
    expect(timelineText(20_000)).toBe('Step 3 of 3, Run');
  });
});
