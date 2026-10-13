/**
 * Section metadata: the single place the nav, the eyebrows and the command deck read
 * a section's label and index from. `sections/registry.ts` spreads these in, and the
 * `Section` and `SectionHeader` primitives read them directly (so ui/ never imports a
 * section's code).
 */
import type { SectionId } from '@/stage/bus';

export interface SectionMeta {
  id: SectionId;
  /** Short label for the nav and the command deck. */
  label: string;
  /** Zero-padded index shown in eyebrows. */
  index: string;
  /** Eyebrow text. */
  eyebrow: string;
}

export const SECTION_META: Record<SectionId, SectionMeta> = {
  hero: { id: 'hero', label: 'Home', index: '00', eyebrow: 'Flux Community' },
  pulse: { id: 'pulse', label: 'Network', index: '01', eyebrow: 'Network pulse' },
  gateways: { id: 'gateways', label: 'Start here', index: '02', eyebrow: 'Gateways' },
  builds: { id: 'builds', label: 'Builds', index: '03', eyebrow: 'Community builds' },
  hosting: { id: 'hosting', label: 'Run a node', index: '04', eyebrow: 'Node hosting' },
  play: { id: 'play', label: 'Games', index: '05', eyebrow: 'Play' },
  learn: { id: 'learn', label: 'Learn', index: '06', eyebrow: 'Learn and build' },
  community: { id: 'community', label: 'Community', index: '07', eyebrow: 'Join in' },
};
