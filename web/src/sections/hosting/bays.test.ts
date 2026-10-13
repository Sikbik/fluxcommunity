import { NODE_HOSTS } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import { bayFor, bayModels, discordInvite } from './bays';

describe('bayModels', () => {
  const bays = bayModels();
  const byId = new Map(bays.map((b) => [b.id, b]));

  it('has one bay per catalog host, in catalog order', () => {
    expect(bays).toHaveLength(6);
    expect(bays.map((b) => b.id)).toEqual(NODE_HOSTS.map((h) => h.id));
  });

  it('presents every host the same way, GoldieTech included', () => {
    expect(byId.get('goldietech')?.name).toBe('GoldieTech Nodes');
    expect(byId.get('goldietech')?.blurb).not.toMatch(/\bOG\b/);
  });

  it('dims the one captured preview that is a light page', () => {
    expect(bays.filter((b) => b.lightPreview).map((b) => b.id)).toEqual(['goldietech']);
  });

  it('routes MCB to Discord and copies the handle', () => {
    const mcb = byId.get('mcb');
    expect(mcb?.action).toBe('discord');
    expect(mcb?.href).toBe(discordInvite());
    expect(mcb?.handle).toBe('MCB');
    expect(mcb?.host).toBeNull();
    expect(mcb?.preview).toBeNull();
  });

  it('gives every other host a real website and no clipboard side effect', () => {
    for (const b of bays.filter((x) => x.id !== 'mcb')) {
      expect(b.action).toBe('visit');
      expect(b.href).toMatch(/^https:\/\//);
      expect(b.handle).toBeNull();
      expect(b.host).not.toBeNull();
    }
  });

  it('never invents a preview: only captured ones are attached', () => {
    for (const b of bays) {
      if (b.preview) expect(b.preview.src).toBe(`/previews/${b.id}.webp`);
    }
  });

  it('keeps the credited operator handle verbatim', () => {
    expect(byId.get('nodeorbit')?.operator).toBe('jonathan_nodeorbit.com');
    expect(byId.get('hostmynode')?.operator).toBe('hostmynode.net_69850');
    expect(byId.get('fluxhub')?.operator).toBe('w2vy');
  });
});

describe('bayFor', () => {
  it('falls back to no preview when the manifest has none', () => {
    const host = NODE_HOSTS[0];
    expect(host).toBeDefined();
    if (!host) return;
    expect(bayFor(host, {}).preview).toBeNull();
  });

  it('uses the Discord invite from the socials', () => {
    expect(discordInvite()).toBe('https://discord.com/invite/runonflux');
  });
});
