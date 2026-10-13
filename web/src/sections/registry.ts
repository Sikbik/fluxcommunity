/**
 * The page, in order. Foundation owns this file and the shell that renders it.
 * Each section lives in `sections/<id>/index.tsx`, default-exports its component,
 * and is owned by exactly one agent. A section renders its own <section id={id}>.
 *
 * Labels, indices and eyebrows live in `@/content/sections` so ui/ can read them
 * without importing section code. The hero is imported eagerly (it is the LCP);
 * the rest are lazy chunks the shell prefetches when idle.
 */
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import { SECTION_META } from '@/content/sections';
import type { SectionId } from '@/stage/bus';
import Hero from './hero';

export interface SectionDef {
  id: SectionId;
  /** Short label for the nav and the command deck. */
  label: string;
  /** Zero-padded index shown in section eyebrows, e.g. "01". */
  index: string;
  /** Eyebrow text, e.g. "Network pulse". */
  eyebrow: string;
  /** The section component: the hero is a plain component, the rest are lazy. */
  Component: ComponentType | LazyExoticComponent<ComponentType>;
  /** Starts loading the chunk (idempotent). Absent for the eager hero. */
  load?: () => Promise<unknown>;
}

const loaders = {
  pulse: () => import('./pulse'),
  gateways: () => import('./gateways'),
  builds: () => import('./builds'),
  hosting: () => import('./hosting'),
  play: () => import('./play'),
  learn: () => import('./learn'),
  community: () => import('./community'),
} as const;

export const SECTIONS: readonly SectionDef[] = [
  { ...SECTION_META.hero, Component: Hero },
  { ...SECTION_META.pulse, Component: lazy(loaders.pulse), load: loaders.pulse },
  { ...SECTION_META.gateways, Component: lazy(loaders.gateways), load: loaders.gateways },
  { ...SECTION_META.builds, Component: lazy(loaders.builds), load: loaders.builds },
  { ...SECTION_META.hosting, Component: lazy(loaders.hosting), load: loaders.hosting },
  { ...SECTION_META.play, Component: lazy(loaders.play), load: loaders.play },
  { ...SECTION_META.learn, Component: lazy(loaders.learn), load: loaders.learn },
  { ...SECTION_META.community, Component: lazy(loaders.community), load: loaders.community },
];
