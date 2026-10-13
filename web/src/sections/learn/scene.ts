/**
 * The scene as a pure function of time. `updateScene(scene, t)` writes every value the canvas
 * needs for time `t` into a reusable object; there is no state carried from one frame to the next,
 * so seeking anywhere on the timeline is exactly as cheap and exact as playing.
 */
import { BEAT, easeInOut, easeOut, type StepId, seg, stepAt } from './timeline';

export interface SpecField {
  key: string;
  value: string;
}

/** An invented example. The card says so. No prices anywhere. */
export const SPEC_FIELDS: readonly SpecField[] = [
  { key: 'name', value: 'example-app' },
  { key: 'image', value: 'nginx:stable' },
  { key: 'cpu', value: '0.5 cores' },
  { key: 'ram', value: '512 MB' },
  { key: 'storage', value: '2 GB' },
  { key: 'instances', value: '3' },
];

/** The address the app is reached at. A placeholder name on the real pattern. */
export const EXAMPLE_ADDRESS = 'example-app.app.runonflux.io';

export type InstanceStatus = 'queued' | 'installing' | 'running' | 'offline' | 'placing';
export type BadgeState = 'serving' | 'offline' | 'still-up';

export interface NodeScene {
  /** 0..1: the cell on the map lights. */
  pick: number;
  /** 0..1: the deploy line from the card is drawn. */
  arc: number;
  /** 0..1 over the moment the copy comes up: one ring leaves the cell, then its light is steady. */
  online: number;
  /** 0..1: how far a node has gone dark. */
  down: number;
  status: InstanceStatus;
}

export interface Scene {
  t: number;
  step: StepId;
  /** 0..1 at the loop seam. */
  fade: number;

  // The spec card
  cardIn: number;
  /** 0 centred (describe), 1 docked at the side (place and run). */
  cardPos: number;
  /** 0..1: the spec card gives way to the status card. */
  specOut: number;
  /** Typing progress per field, 0..1. */
  fields: number[];
  /** Index of the field with the caret, -1 for none. The caret is steady: it does not blink. */
  caretField: number;
  deployIn: number;
  deployPress: number;

  // The map
  mapReveal: number;
  /** 0..1: how far the scan line has travelled across the map. It only ever moves forward. */
  scan: number;
  /** 0..1: the cells that were considered and not chosen dim away. It only ever moves forward. */
  settle: number;
  /** Frankfurt, Virginia, Singapore, then the replacement in Sydney. */
  nodes: NodeScene[];

  // Run
  address: number;
  visitor: number;
  /** Strength of the traffic to Virginia. */
  flowA: number;
  /** 0..1 progress of the new path to Frankfurt being drawn. */
  drawB: number;
  flowB: number;
  badge: BadgeState;
  /** 0..1 crossfade of the third row's label from Virginia to Sydney. */
  swapRow: number;
  /** How many of the three instances are running right now. */
  running: number;
  /** The time itself, in ms: drives the packets along a path and the progress spinners. */
  clock: number;
}

function makeNode(): NodeScene {
  return { pick: 0, arc: 0, online: 0, down: 0, status: 'queued' };
}

export function createScene(): Scene {
  return {
    t: 0,
    step: 'describe',
    fade: 0,
    cardIn: 0,
    cardPos: 0,
    specOut: 0,
    fields: SPEC_FIELDS.map(() => 0),
    caretField: 0,
    deployIn: 0,
    deployPress: 0,
    mapReveal: 0,
    scan: 0,
    settle: 0,
    nodes: [makeNode(), makeNode(), makeNode(), makeNode()],
    address: 0,
    visitor: 0,
    flowA: 0,
    drawB: 0,
    flowB: 0,
    badge: 'serving',
    swapRow: 0,
    running: 0,
    clock: 0,
  };
}

/** A value that rises and falls once over 0..1. */
function bell(x: number): number {
  return Math.sin(Math.PI * x);
}

/** How many characters of `value` are on screen at typing progress `p`. */
export function typedChars(value: string, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return value.length;
  return Math.min(value.length, Math.floor(p * (value.length + 1)));
}

export function updateScene(s: Scene, t: number): Scene {
  s.t = t;
  s.clock = t;
  s.step = stepAt(t).id;
  s.fade = Math.min(seg(t, BEAT.fadeIn[0], BEAT.fadeIn[1]), 1 - seg(t, BEAT.fadeOut[0], BEAT.fadeOut[1]));

  // ---- 1 Describe ------------------------------------------------------------------------
  s.cardIn = easeOut(seg(t, BEAT.cardIn[0], BEAT.cardIn[1]));
  s.cardPos = easeInOut(seg(t, BEAT.glide[0], BEAT.glide[1]));
  s.specOut = easeInOut(seg(t, BEAT.statusIn[0], BEAT.statusIn[1]));

  let caret = -1;
  for (let i = 0; i < SPEC_FIELDS.length; i++) {
    const start = BEAT.typeStart + i * BEAT.typeGap;
    s.fields[i] = seg(t, start, start + BEAT.typeDur);
    if (t >= start) caret = i;
  }
  // The caret waits at the end of the last field, then leaves when the deploy button arrives.
  s.caretField = t >= BEAT.deployIn[0] ? -1 : caret;
  s.deployIn = easeOut(seg(t, BEAT.deployIn[0], BEAT.deployIn[1]));
  s.deployPress = bell(seg(t, BEAT.deployPress[0], BEAT.deployPress[1]));

  // ---- 2 Place ---------------------------------------------------------------------------
  s.mapReveal = easeInOut(seg(t, BEAT.mapReveal[0], BEAT.mapReveal[1]));
  s.scan = seg(t, BEAT.scan[0], BEAT.scan[1]);
  s.settle = easeInOut(seg(t, BEAT.settle[0], BEAT.settle[1]));

  // ---- 3 Run -----------------------------------------------------------------------------
  const picks = BEAT.pick;
  const installs = BEAT.install;
  let running = 0;
  for (let i = 0; i < 3; i++) {
    const n = s.nodes[i] as NodeScene;
    const pickAt = picks[i] as number;
    const installAt = installs[i] as number;
    n.pick = easeOut(seg(t, pickAt, pickAt + BEAT.pickDur));
    n.arc = easeInOut(seg(t, pickAt - 300, pickAt + 500));
    n.online = easeOut(seg(t, installAt + BEAT.installDur, installAt + BEAT.installDur + BEAT.onlineDur));
    n.down = 0;
    if (t < BEAT.statusIn[0]) n.status = 'queued';
    else if (t < installAt + BEAT.installDur) n.status = 'installing';
    else n.status = 'running';
  }
  // Virginia (index 1) is the one that drops.
  const iad = s.nodes[1] as NodeScene;
  iad.down = easeOut(seg(t, BEAT.drop[0], BEAT.drop[1]));
  if (t >= BEAT.drop[0]) iad.status = 'offline';

  // The replacement (index 3) is picked later and takes over the third row's slot.
  const syd = s.nodes[3] as NodeScene;
  syd.pick = easeOut(seg(t, BEAT.replace[0], BEAT.replace[0] + BEAT.pickDur));
  syd.arc = easeInOut(seg(t, BEAT.replace[0] - 200, BEAT.replace[0] + 600));
  syd.online = easeOut(seg(t, BEAT.replaceRunning, BEAT.replaceRunning + BEAT.onlineDur));
  syd.down = 0;
  if (t < BEAT.replace[0]) syd.status = 'queued';
  else if (t < BEAT.replaceRunning) syd.status = 'placing';
  else syd.status = 'running';

  for (const n of s.nodes) if (n.status === 'running') running++;
  s.running = running;
  s.swapRow = easeInOut(seg(t, BEAT.replace[0], BEAT.replace[0] + 400));

  s.address = easeOut(seg(t, BEAT.address[0], BEAT.address[1]));
  s.visitor = easeOut(seg(t, BEAT.visitor[0], BEAT.visitor[1]));
  s.flowA = seg(t, BEAT.flowA[0], BEAT.flowA[1]) * (1 - seg(t, BEAT.drop[0], BEAT.drop[0] + 300));
  s.drawB = easeInOut(seg(t, BEAT.reroute[0], BEAT.reroute[1]));
  s.flowB = seg(t, BEAT.reroute[0] + 300, BEAT.reroute[1] + 200);
  s.badge = t >= BEAT.stillUp[0] ? 'still-up' : t >= BEAT.drop[0] ? 'offline' : 'serving';
  return s;
}

/** A fresh scene at time `t`, for tests and one-off stills. */
export function sceneAt(t: number): Scene {
  return updateScene(createScene(), t);
}
