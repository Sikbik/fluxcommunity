import { COMMUNITY_APPS, type CommunityApp, GATEWAYS, NODE_HOSTS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { PREVIEWS } from '@/content/art';
import { LIGHT_PREVIEWS } from '@/system/previews';
import { buildPlaylist } from './captions';
import { CAPTION_MS, captionAt, driftOffset, nextStart } from './schedule';

describe('captionAt', () => {
  it('holds each caption for 8 seconds', () => {
    expect(CAPTION_MS).toBe(8000);
    expect(captionAt(0, 5).index).toBe(0);
    expect(captionAt(7999, 5).index).toBe(0);
    expect(captionAt(8000, 5).index).toBe(1);
    expect(captionAt(8 * 4 * 1000, 5).index).toBe(4);
  });

  it('loops', () => {
    expect(captionAt(5 * CAPTION_MS, 5).index).toBe(0);
    expect(captionAt(7 * CAPTION_MS + 1, 5).index).toBe(2);
  });

  it('reports progress and time to the next change', () => {
    const t = captionAt(2000, 5);
    expect(t.progress).toBeCloseTo(0.25, 5);
    expect(t.nextInMs).toBe(6000);
    expect(captionAt(7999.5, 5).nextInMs).toBeGreaterThanOrEqual(1);
  });

  it('starts anywhere', () => {
    expect(captionAt(0, 5, 3).index).toBe(3);
    expect(captionAt(CAPTION_MS * 2, 5, 3).index).toBe(0);
    expect(captionAt(0, 5, -1).index).toBe(4);
    expect(captionAt(0, 5, 12).index).toBe(2);
  });

  it('copes with nothing to show and with a clock that went backwards', () => {
    expect(captionAt(1000, 0)).toEqual({ index: 0, progress: 0, nextInMs: CAPTION_MS });
    expect(captionAt(-500, 3).index).toBe(0);
  });
});

describe('nextStart', () => {
  it('continues after the last caption shown', () => {
    expect(nextStart(null, 10)).toBe(0);
    expect(nextStart(0, 10)).toBe(1);
    expect(nextStart(9, 10)).toBe(0);
    expect(nextStart(3, 0)).toBe(0);
  });
});

describe('driftOffset', () => {
  it('stays within a few pixels and is deterministic', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 400; m++) {
      const d = driftOffset(m);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(4);
      expect(driftOffset(m)).toEqual(d);
      seen.add(`${d.x},${d.y}`);
    }
    // It really moves: many distinct positions over a few hours.
    expect(seen.size).toBeGreaterThan(20);
  });

  it('changes from one minute to the next most of the time', () => {
    let changed = 0;
    for (let m = 0; m < 200; m++) {
      const a = driftOffset(m);
      const b = driftOffset(m + 1);
      if (a.x !== b.x || a.y !== b.y) changed++;
    }
    expect(changed).toBeGreaterThan(150);
  });
});

describe('the playlist', () => {
  const list = buildPlaylist();

  // A small made-up catalog, so the notes and bylines are checked whatever the real one lists today.
  const app = (over: Partial<CommunityApp> & { id: string }): CommunityApp => ({
    name: over.id.toUpperCase(),
    tagline: `${over.id} tagline`,
    description: `${over.id} description`,
    category: 'network',
    builder: 'Someone',
    url: `https://${over.id}.example`,
    host: `${over.id}.example`,
    spotlight: false,
    lifecycle: 'live',
    ...over,
  });
  const fixture = buildPlaylist({
    apps: [
      app({ id: 'old', lifecycle: 'retiring', retiresOn: '2026-11-01', replacedBy: 'fresh', builder: null }),
      app({ id: 'fresh', lifecycle: 'new', replaces: 'old' }),
      app({ id: 'star', spotlight: true }),
      app({ id: 'plain' }),
      app({ id: 'here', self: true }),
    ],
    hosts: [
      {
        id: 'h1',
        name: 'H1',
        operator: 'Op',
        url: 'https://h1.example',
        host: 'h1.example',
        blurb: 'b',
        contact: 'web',
      },
      { id: 'h2', name: 'H2', operator: 'Op2', url: null, host: null, blurb: 'b2', contact: 'discord' },
    ],
    gateways: [
      {
        id: 'g1',
        name: 'G1',
        tagline: 't',
        description: 'd',
        kind: 'cloud',
        url: 'https://g1.example',
        host: 'g1.example',
      },
    ],
  });
  const note = (id: string) => fixture.find((c) => c.id === id)?.note;

  it('is apps first, then hosts, then gateways', () => {
    const groups = list.map((c) => c.group);
    const apps = COMMUNITY_APPS.filter((a) => !a.self).length;
    expect(groups.slice(0, apps).every((g) => g === 'apps')).toBe(true);
    expect(groups.slice(apps, apps + NODE_HOSTS.length).every((g) => g === 'hosts')).toBe(true);
    expect(groups.slice(apps + NODE_HOSTS.length).every((g) => g === 'gateways')).toBe(true);
    expect(list).toHaveLength(apps + NODE_HOSTS.length + GATEWAYS.length);
  });

  it('does not feature this site on its own tour', () => {
    const self = COMMUNITY_APPS.filter((a) => a.self);
    expect(self.length).toBeGreaterThan(0);
    for (const s of self) expect(list.some((c) => c.id === `app:${s.id}`)).toBe(false);
    expect(fixture.some((c) => c.id === 'app:here')).toBe(false);
  });

  it('uses catalog copy and credits the builder', () => {
    for (const a of COMMUNITY_APPS.filter((x) => !x.self)) {
      const c = list.find((x) => x.id === `app:${a.id}`);
      expect(c?.name).toBe(a.name);
      expect(c?.line).toBe(a.tagline);
      expect(c?.byline).toBe(a.builder ? `by ${a.builder}` : null);
    }
    for (const h of NODE_HOSTS) {
      expect(list.find((x) => x.id === `host:${h.id}`)?.byline).toBe(`by ${h.operator}`);
    }
  });

  it('puts the retiring and successor notes from the copy deck on the right apps', () => {
    expect(note('app:old')).toBe('Retiring Nov 1. FRESH takes over.');
    expect(note('app:fresh')).toBe('New. Takes over from OLD on Nov 1.');
    expect(note('app:star')).toBe('Spotlighted by the Flux team');
    expect(note('app:plain')).toBeNull();
  });

  it('gives every real app the note its lifecycle and spotlight call for', () => {
    for (const a of COMMUNITY_APPS.filter((x) => !x.self)) {
      const n = list.find((x) => x.id === `app:${a.id}`)?.note;
      if (a.lifecycle === 'retiring' && a.retiresOn) expect(n).toMatch(/^Retiring /);
      else if (a.lifecycle === 'new' && a.replaces) expect(n).toMatch(/^New/);
      else if (a.spotlight) expect(n).toBe('Spotlighted by the Flux team');
      else expect(n).toBeNull();
    }
  });

  it('leaves out a builder line for unattributed builds, never inventing one', () => {
    expect(fixture.find((c) => c.id === 'app:old')?.byline).toBeNull();
    expect(fixture.find((c) => c.id === 'app:plain')?.byline).toBe('by Someone');
  });

  it('counts positions within each group', () => {
    const hosts = list.filter((c) => c.group === 'hosts');
    expect(hosts.map((c) => c.position)).toEqual(hosts.map((_, i) => i + 1));
    expect(new Set(hosts.map((c) => c.total))).toEqual(new Set([NODE_HOSTS.length]));
    expect(fixture.filter((c) => c.group === 'apps').map((c) => `${c.position}/${c.total}`)).toEqual([
      '1/4',
      '2/4',
      '3/4',
      '4/4',
    ]);
  });

  it('attaches art exactly where the manifest has it', () => {
    for (const a of COMMUNITY_APPS.filter((x) => !x.self)) {
      const art = list.find((x) => x.id === `app:${a.id}`)?.art;
      expect(art?.src).toBe(PREVIEWS[a.id]?.src);
      if (!PREVIEWS[a.id]) expect(art).toBeNull();
    }
    for (const h of NODE_HOSTS) {
      const art = list.find((x) => x.id === `host:${h.id}`)?.art;
      expect(art?.src).toBe(PREVIEWS[h.id]?.src);
      if (!PREVIEWS[h.id]) expect(art).toBeNull();
    }
    const cloud = list.find((c) => c.id === 'gateway:cloud')?.art;
    expect(cloud?.blend).toBe('screen');
  });

  it('dims the captured pages that are light, and only those', () => {
    for (const c of list) {
      if (!c.art || c.art.blend === 'screen') continue;
      const id = c.id.split(':')[1] ?? '';
      expect(c.art.light ?? false).toBe(LIGHT_PREVIEWS.has(id));
    }
  });

  it('has no em dashes in what it would show', () => {
    for (const c of [...list, ...fixture]) {
      const text = [c.name, c.byline, c.line, c.note, c.groupLabel].filter(Boolean).join(' ');
      expect(text).not.toMatch(/—/);
    }
  });
});
