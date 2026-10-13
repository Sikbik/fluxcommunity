import { COMMUNITY_APPS, GATEWAYS, NODE_HOSTS, SOCIALS } from '@shared/catalog';
import { describe, expect, it, vi } from 'vitest';
import { type ActionState, buildItems, type DeckItem } from './items';
import { describeActions, type RunEnv, runItem } from './run';

const STATE: ActionState = {
  accent: 'flux',
  sound: false,
  autoAmbient: true,
  reducedMotion: false,
  motionOverride: null,
};
const items = buildItems(STATE);
const get = (id: string): DeckItem => {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};

// Examples come from the catalog, so the checks hold whichever builds and hosts it lists.
const app = COMMUNITY_APPS.find((a) => !a.self) as (typeof COMMUNITY_APPS)[number];
const self = COMMUNITY_APPS.find((a) => a.self);
const siteHost = NODE_HOSTS.find((h) => h.url !== null);
const dmHost = NODE_HOSTS.find((h) => h.url === null);
const gateway = GATEWAYS[0] as (typeof GATEWAYS)[number];
const social = SOCIALS[0] as (typeof SOCIALS)[number];

function env(over: Partial<RunEnv> = {}) {
  const prefs = { sound: false, autoAmbient: true };
  const calls = {
    openApp: vi.fn(),
    goToSection: vi.fn(),
    launch: vi.fn(),
    copy: vi.fn(async () => true),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    set: vi.fn(),
    enterAmbient: vi.fn(),
    openSubmit: vi.fn(),
    openShortcuts: vi.fn(),
    confirm: vi.fn(),
    previewSound: vi.fn(),
  };
  const e: RunEnv = {
    openApp: calls.openApp,
    goToSection: calls.goToSection,
    launch: calls.launch,
    copy: calls.copy,
    toast: calls.toast,
    prefs: { get: () => prefs, set: calls.set },
    effectiveReducedMotion: () => false,
    enterAmbient: calls.enterAmbient,
    openSubmit: calls.openSubmit,
    openShortcuts: calls.openShortcuts,
    pageLink: () => 'https://example.test/#builds',
    confirm: calls.confirm,
    previewSound: calls.previewSound,
    ...over,
  };
  return { e, calls };
}

describe('sections', () => {
  it('scroll to the section and close the deck', () => {
    const { e, calls } = env();
    const r = runItem(get('section:builds'), 'primary', e);
    expect(calls.goToSection).toHaveBeenCalledWith('builds');
    expect(r.close).toBe(true);
  });
});

describe('apps', () => {
  it('Enter opens the detail through the hash route', () => {
    const { e, calls } = env();
    runItem(get(`app:${app.id}`), 'primary', e);
    expect(calls.openApp).toHaveBeenCalledWith(app.id);
    expect(calls.launch).not.toHaveBeenCalled();
  });

  it('Shift+Enter launches with the utm source', () => {
    const { e, calls } = env();
    runItem(get(`app:${app.id}`), 'secondary', e);
    expect(calls.launch).toHaveBeenCalledTimes(1);
    const expected = new URL(app.url);
    expected.searchParams.set('utm_source', 'community');
    expect(String(calls.launch.mock.calls[0]?.[0])).toBe(expected.toString());
  });

  it.skipIf(!self)('never launches this site from itself', () => {
    const { e, calls } = env();
    const r = runItem(get(`app:${self?.id}`), 'secondary', e);
    expect(calls.launch).not.toHaveBeenCalled();
    expect(calls.toast.info).toHaveBeenCalledWith('You are here');
    expect(r.close).toBe(false);
  });
});

describe('hosts, gateways and community links', () => {
  it.skipIf(!siteHost)('opens a host site, or points at it in the page', () => {
    const a = env();
    runItem(get(`host:${siteHost?.id}`), 'primary', a.e);
    expect(String(a.calls.launch.mock.calls[0]?.[0])).toContain(siteHost?.host ?? '');
    const b = env();
    runItem(get(`host:${siteHost?.id}`), 'secondary', b.e);
    expect(b.calls.goToSection).toHaveBeenCalledWith('hosting');
  });

  it.skipIf(!dmHost)('copies the handle and opens Discord for the host with no site', async () => {
    const { e, calls } = env();
    runItem(get(`host:${dmHost?.id}`), 'primary', e);
    expect(calls.copy).toHaveBeenCalledWith(dmHost?.operator);
    expect(String(calls.launch.mock.calls[0]?.[0])).toContain('discord.com');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.toast.success).toHaveBeenCalled();
  });

  it('opens a gateway, or shows the section', () => {
    const a = env();
    runItem(get(`gateway:${gateway.id}`), 'primary', a.e);
    expect(String(a.calls.launch.mock.calls[0]?.[0])).toContain(gateway.host);
    const b = env();
    runItem(get(`gateway:${gateway.id}`), 'secondary', b.e);
    expect(b.calls.goToSection).toHaveBeenCalledWith('gateways');
  });

  it('opens a community link, or copies it', () => {
    const a = env();
    runItem(get(`social:${social.id}`), 'primary', a.e);
    expect(String(a.calls.launch.mock.calls[0]?.[0])).toContain(new URL(social.url).host);
    const b = env();
    runItem(get(`social:${social.id}`), 'secondary', b.e);
    expect(b.calls.copy).toHaveBeenCalledWith(social.url);
  });
});

describe('actions call the shell stores', () => {
  it('switches accent and stays open', () => {
    const { e, calls } = env();
    const r = runItem(get('action:accent:cumulus'), 'primary', e);
    expect(calls.set).toHaveBeenCalledWith({ accent: 'cumulus' });
    expect(r.close).toBe(false);
  });

  it('toggles sound and previews it when turning on', () => {
    const { e, calls } = env();
    const r = runItem(get('action:sound'), 'primary', e);
    expect(calls.set).toHaveBeenCalledWith({ sound: true });
    expect(calls.previewSound).toHaveBeenCalled();
    expect(r.announce).toBe('Sound effects on');
  });

  it('toggles sound off without a preview', () => {
    const { e, calls } = env({ prefs: { get: () => ({ sound: true, autoAmbient: true }), set: vi.fn() } });
    const r = runItem(get('action:sound'), 'primary', e);
    expect(calls.previewSound).not.toHaveBeenCalled();
    expect(r.announce).toBe('Sound effects off');
  });

  it('toggles the reduced motion override from the effective value', () => {
    const a = env({ effectiveReducedMotion: () => false });
    runItem(get('action:motion'), 'primary', a.e);
    expect(a.calls.set).toHaveBeenCalledWith({ reducedMotionOverride: true });
    const b = env({ effectiveReducedMotion: () => true });
    runItem(get('action:motion'), 'primary', b.e);
    expect(b.calls.set).toHaveBeenCalledWith({ reducedMotionOverride: false });
  });

  it('toggles auto ambient', () => {
    const { e, calls } = env();
    runItem(get('action:auto-ambient'), 'primary', e);
    expect(calls.set).toHaveBeenCalledWith({ autoAmbient: false });
  });

  it('enters ambient, opens submit and shortcuts, goes to top', () => {
    const { e, calls } = env();
    expect(runItem(get('action:ambient'), 'primary', e).close).toBe(true);
    expect(calls.enterAmbient).toHaveBeenCalled();
    runItem(get('action:submit'), 'primary', e);
    expect(calls.openSubmit).toHaveBeenCalled();
    runItem(get('action:shortcuts'), 'primary', e);
    expect(calls.openShortcuts).toHaveBeenCalled();
    runItem(get('action:top'), 'primary', e);
    expect(calls.goToSection).toHaveBeenCalledWith('hero');
  });

  it('copies the page link and says so', async () => {
    const { e, calls } = env();
    runItem(get('action:copy-link'), 'primary', e);
    expect(calls.copy).toHaveBeenCalledWith('https://example.test/#builds');
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.toast.success).toHaveBeenCalledWith('Link copied');
  });

  it('reports a failed copy', async () => {
    const { e, calls } = env({ copy: async () => false });
    runItem(get('action:copy-link'), 'primary', e);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.toast.error).toHaveBeenCalled();
  });

  it('terminal asks the deck to switch mode', () => {
    const { e } = env();
    expect(runItem(get('action:terminal'), 'primary', e)).toEqual({ close: false, terminal: true });
  });
});

describe('describeActions', () => {
  it('labels the keys per kind', () => {
    expect(describeActions(get(`app:${app.id}`))).toEqual({ primary: 'Open', secondary: 'Launch' });
    if (self) expect(describeActions(get(`app:${self.id}`)).secondary).toBeNull();
    if (dmHost) expect(describeActions(get(`host:${dmHost.id}`)).primary).toBe('Message');
    expect(describeActions(get(`gateway:${gateway.id}`))).toEqual({ primary: 'Open', secondary: 'Show' });
    expect(describeActions(get('section:play')).secondary).toBeNull();
  });
});
