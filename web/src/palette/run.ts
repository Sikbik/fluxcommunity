/**
 * What a deck item does when it is run. The effects are injected (`RunEnv`) so the decisions can
 * be tested without a browser; `runEnv.ts` wires the real stores and the window.
 *
 *   Enter           section    scroll there
 *                   app        open its detail (#builds/<id>)
 *                   host       open the site in a new tab (MCB: copy the handle, open Discord)
 *                   gateway    open it in a new tab
 *                   community  open it in a new tab
 *                   action     run it
 *   Shift+Enter     app        launch it in a new tab (DESIGN 4: flash the lattice, never wait)
 *                   host       show it in the Run a node section
 *                   gateway    show it in Start here
 *                   community  copy its link
 */

import { COMMUNITY_APPS, GATEWAYS, NODE_HOSTS, SITE, SOCIALS, withUtm } from '@shared/catalog';
import type { Accent, SectionId } from '@/stage/bus';
import { ACTION_IDS, type DeckItem } from './items';

export interface RunEnv {
  openApp(id: string): void;
  goToSection(id: SectionId): void;
  /** Opens a URL in a new tab and flashes the lattice. Never waits. */
  launch(url: string): void;
  copy(text: string): Promise<boolean>;
  toast: {
    success(message: string): void;
    error(message: string): void;
    info(message: string): void;
  };
  prefs: {
    get(): { sound: boolean; autoAmbient: boolean };
    set(patch: {
      accent?: Accent;
      sound?: boolean;
      autoAmbient?: boolean;
      reducedMotionOverride?: boolean | null;
    }): void;
  };
  effectiveReducedMotion(): boolean;
  enterAmbient(): void;
  openSubmit(): void;
  openShortcuts(): void;
  /** The address of this page without dev flags: origin, path and hash. */
  pageLink(): string;
  /** A short confirmation blip, if sound is on. */
  confirm(): void;
  /** The sound turned on: play the preview. */
  previewSound(): void;
}

export interface RunResult {
  /** Close the deck. */
  close: boolean;
  /** Enter terminal mode instead of running something. */
  terminal?: boolean;
  /** Announce this to screen readers (a setting changed and the deck stays open). */
  announce?: string;
  /** The run opens another overlay or moves focus: let the deck return focus first. */
  deferred?: boolean;
}

const STAY: RunResult = { close: false };
const CLOSE: RunResult = { close: true, deferred: true };

function runApp(item: DeckItem, how: 'primary' | 'secondary', env: RunEnv): RunResult {
  const app = COMMUNITY_APPS.find((a) => a.id === item.ref);
  if (!app) return STAY;
  if (how === 'primary') {
    env.openApp(app.id);
    return CLOSE;
  }
  if (app.self) {
    env.toast.info('You are here');
    return STAY;
  }
  env.launch(withUtm(app.url));
  return { close: true };
}

function runHost(item: DeckItem, how: 'primary' | 'secondary', env: RunEnv): RunResult {
  const host = NODE_HOSTS.find((h) => h.id === item.ref);
  if (!host) return STAY;
  if (how === 'secondary') {
    env.goToSection('hosting');
    return CLOSE;
  }
  if (host.url) {
    env.launch(withUtm(host.url));
    return { close: true };
  }
  // Reached by direct message only: copy the handle, then open the Flux Discord.
  void env.copy(host.operator).then((ok) => {
    if (ok) env.toast.success(`Copied ${host.operator}. Message them on Discord`);
  });
  env.launch(SITE.submitUrl);
  return { close: true };
}

function runGateway(item: DeckItem, how: 'primary' | 'secondary', env: RunEnv): RunResult {
  const gateway = GATEWAYS.find((g) => g.id === item.ref);
  if (!gateway) return STAY;
  if (how === 'secondary') {
    env.goToSection('gateways');
    return CLOSE;
  }
  env.launch(withUtm(gateway.url));
  return { close: true };
}

function runSocial(item: DeckItem, how: 'primary' | 'secondary', env: RunEnv): RunResult {
  const social = SOCIALS.find((s) => s.id === item.ref);
  if (!social) return STAY;
  if (how === 'secondary') {
    void env.copy(social.url).then((ok) => {
      if (ok) env.toast.success(`${social.name} link copied`);
      else env.toast.error('Could not copy the link');
    });
    return { close: true };
  }
  env.launch(withUtm(social.url));
  return { close: true };
}

function runAction(item: DeckItem, env: RunEnv): RunResult {
  const ref = item.ref;
  if (ref.startsWith('accent:')) {
    const accent = ref.slice('accent:'.length) as Accent;
    env.prefs.set({ accent });
    env.confirm();
    return { close: false, announce: `${item.title} on` };
  }
  switch (ref) {
    case ACTION_IDS.ambient:
      env.enterAmbient();
      return { close: true };
    case ACTION_IDS.sound: {
      const next = !env.prefs.get().sound;
      env.prefs.set({ sound: next });
      if (next) env.previewSound();
      return { close: false, announce: next ? 'Sound effects on' : 'Sound effects off' };
    }
    case ACTION_IDS.motion: {
      const next = !env.effectiveReducedMotion();
      env.prefs.set({ reducedMotionOverride: next });
      env.confirm();
      return { close: false, announce: next ? 'Reduced motion on' : 'Reduced motion off' };
    }
    case ACTION_IDS.motionSystem:
      env.prefs.set({ reducedMotionOverride: null });
      env.confirm();
      return { close: false, announce: 'Following the system motion setting' };
    case ACTION_IDS.autoAmbient: {
      const next = !env.prefs.get().autoAmbient;
      env.prefs.set({ autoAmbient: next });
      env.confirm();
      return { close: false, announce: next ? 'Ambient after idle on' : 'Ambient after idle off' };
    }
    case ACTION_IDS.copyLink:
      void env.copy(env.pageLink()).then((ok) => {
        if (ok) env.toast.success('Link copied');
        else env.toast.error('Could not copy the link');
      });
      return { close: true };
    case ACTION_IDS.submit:
      env.openSubmit();
      return CLOSE;
    case ACTION_IDS.shortcuts:
      env.openShortcuts();
      return CLOSE;
    case ACTION_IDS.top:
      env.goToSection('hero');
      return CLOSE;
    case ACTION_IDS.terminal:
      return { close: false, terminal: true };
    default:
      return STAY;
  }
}

export function runItem(item: DeckItem, how: 'primary' | 'secondary', env: RunEnv): RunResult {
  switch (item.kind) {
    case 'section':
      env.goToSection(item.ref as SectionId);
      return CLOSE;
    case 'app':
      return runApp(item, how, env);
    case 'host':
      return runHost(item, how, env);
    case 'gateway':
      return runGateway(item, how, env);
    case 'social':
      return runSocial(item, how, env);
    case 'action':
      return runAction(item, env);
  }
}

/** The key hints for the footer: what Enter and Shift+Enter will do for this item. */
export function describeActions(item: DeckItem): { primary: string; secondary: string | null } {
  switch (item.kind) {
    case 'section':
      return { primary: 'Go there', secondary: null };
    case 'app': {
      const self = COMMUNITY_APPS.find((a) => a.id === item.ref)?.self === true;
      return { primary: 'Open', secondary: self ? null : 'Launch' };
    }
    case 'host': {
      const noSite = NODE_HOSTS.find((h) => h.id === item.ref)?.url === null;
      return { primary: noSite ? 'Message' : 'Visit', secondary: 'Show' };
    }
    case 'gateway':
      return { primary: 'Open', secondary: 'Show' };
    case 'social':
      return { primary: 'Open', secondary: 'Copy link' };
    case 'action':
      if (item.ref === ACTION_IDS.terminal) return { primary: 'Start', secondary: null };
      return { primary: item.state ? 'Switch' : 'Run', secondary: null };
  }
}
