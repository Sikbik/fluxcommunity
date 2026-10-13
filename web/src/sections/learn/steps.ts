/**
 * The words of the explainer: what each step is called, a one-sentence summary for sighted
 * visitors, and a plain description of what the picture shows for everyone else (the canvas itself
 * is decoration). Concept only: no prices, no promises, and the example says it is one.
 */
import type { StepId } from './timeline';

export interface StepCopy {
  id: StepId;
  /** "01": the mono index. */
  index: string;
  title: string;
  /** One sentence, shown beside the picture. */
  summary: string;
  /** What the picture shows during this step. */
  shows: string;
}

export const STEP_COPY: Readonly<Record<StepId, StepCopy>> = {
  describe: {
    id: 'describe',
    index: '01',
    title: 'Describe',
    summary: 'Write down what the app needs once: image, CPU, memory, storage and how many copies.',
    shows:
      'A panel types in the settings of an example app: the name example-app, the image nginx:stable, 0.5 cores, 512 MB of RAM, 2 GB of storage and 3 instances. A Deploy button appears and is pressed.',
  },
  place: {
    id: 'place',
    index: '02',
    title: 'Place',
    summary: 'The network picks independent nodes in different regions and starts a copy on each.',
    shows:
      'The panel docks to the side and a dot map of the world appears. A line sweeps across the map and lights the nodes the network is considering. Most of them dim, three stay lit in different regions, Frankfurt, Virginia and Singapore, and a copy of the app is sent to each. The regions are an example.',
  },
  run: {
    id: 'run',
    index: '03',
    title: 'Run',
    summary: 'Every copy comes online. If a node drops, traffic finds another path and the app stays up.',
    shows:
      'The three copies start and then run, and the app gets an address. A visitor reaches it through Virginia. Virginia goes offline, the traffic takes a new path to Frankfurt and the status reads Still up. The network then starts a replacement copy in Sydney.',
  },
} as const;

export const STEP_ORDER: readonly StepId[] = ['describe', 'place', 'run'];

/** Said under the picture: it is a drawing of the idea, not a recording of something real. */
export const EXAMPLE_NOTE = 'A concept sketch. The app, the regions and the values are an invented example.';
