import { describe, expect, it } from 'vitest';
import {
  cleanLine,
  composeMessage,
  EMPTY_FIELDS,
  FIELD_LIMITS,
  messageLines,
  normalizeUrl,
  type SubmitFields,
  validateSubmit,
} from './submit';

const good: SubmitFields = {
  kind: 'app',
  name: 'Flux Compass',
  url: 'https://compass.example.com',
  what: 'Finds the nearest healthy node.',
  handle: 'CompassDev',
};

describe('cleanLine', () => {
  it('collapses whitespace, strips control characters and cuts to length', () => {
    expect(cleanLine('  a \n\n b\tc ', 20)).toBe('a b c');
    expect(cleanLine('abc\u0007def', 20)).toBe('abc def');
    expect(cleanLine('x'.repeat(100), 10)).toHaveLength(10);
  });
});

describe('normalizeUrl', () => {
  it('accepts https and normalises it', () => {
    expect(normalizeUrl('https://Example.com')).toEqual({ url: 'https://example.com', error: null });
    expect(normalizeUrl('  https://example.com/app?x=1#top ').url).toBe('https://example.com/app?x=1#top');
    expect(normalizeUrl('https://example.com:443/').url).toBe('https://example.com');
    expect(normalizeUrl('https://example.com:8443/a').url).toBe('https://example.com:8443/a');
  });

  it('adds https to a bare domain', () => {
    expect(normalizeUrl('example.com').url).toBe('https://example.com');
    expect(normalizeUrl('my-app.runonflux.io/path').url).toBe('https://my-app.runonflux.io/path');
    expect(normalizeUrl('example.com:8443').url).toBe('https://example.com:8443');
  });

  it('rejects every scheme but https', () => {
    for (const bad of [
      'http://example.com',
      'HTTP://example.com',
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://example.com',
      'mailto:a@example.com',
      'file:///etc/passwd',
      'ws://example.com',
    ]) {
      const r = normalizeUrl(bad);
      expect(r.url, bad).toBeNull();
      expect(r.error, bad).toBeTruthy();
    }
  });

  it('rejects addresses that cannot be a public app', () => {
    for (const bad of [
      'https://localhost',
      'https://localhost:3000',
      'https://192.168.1.10',
      'https://127.0.0.1',
      'https://[::1]',
      'https://printer.local',
      'https://intranet',
      'https://user:pass@example.com',
      'not a url',
      'https://',
      'example',
    ]) {
      const r = normalizeUrl(bad);
      expect(r.url, bad).toBeNull();
      expect(r.error, bad).toBeTruthy();
    }
  });

  it('treats empty input as not entered yet', () => {
    expect(normalizeUrl('')).toEqual({ url: null, error: null });
    expect(normalizeUrl('   ')).toEqual({ url: null, error: null });
  });

  it('rejects very long addresses', () => {
    expect(normalizeUrl(`https://example.com/${'a'.repeat(FIELD_LIMITS.url)}`).url).toBeNull();
  });
});

describe('validateSubmit', () => {
  it('passes a complete form and cleans it', () => {
    const check = validateSubmit({ ...good, name: '  Flux   Compass ', url: 'compass.example.com' });
    expect(check.ok).toBe(true);
    expect(check.errors).toEqual({});
    expect(check.clean.name).toBe('Flux Compass');
    expect(check.clean.url).toBe('https://compass.example.com');
  });

  it('names every missing field', () => {
    const check = validateSubmit(EMPTY_FIELDS);
    expect(check.ok).toBe(false);
    expect(Object.keys(check.errors).sort()).toEqual(['handle', 'name', 'url', 'what']);
  });

  it('flags a bad URL with a reason', () => {
    const check = validateSubmit({ ...good, url: 'http://compass.example.com' });
    expect(check.ok).toBe(false);
    expect(check.errors.url).toMatch(/https/);
    expect(check.clean.url).toBe('');
  });

  it('asks a host for an operator handle', () => {
    const check = validateSubmit({ ...EMPTY_FIELDS, kind: 'host' });
    expect(check.errors.handle).toMatch(/operator/i);
  });
});

describe('composeMessage', () => {
  it('uses the copy deck template for an app', () => {
    expect(composeMessage(good)).toBe(
      [
        'Hi @bigstache, please add my Flux app to the community portal.',
        'Name: Flux Compass',
        'URL: https://compass.example.com',
        'What it does: Finds the nearest healthy node.',
        'Built by: CompassDev',
      ].join('\n'),
    );
  });

  it('adapts the template for a node host', () => {
    expect(composeMessage({ ...good, kind: 'host', name: 'Orbit Nodes', handle: 'orbit' })).toBe(
      [
        'Hi @bigstache, please add my Flux node hosting service to the community portal.',
        'Name: Orbit Nodes',
        'URL: https://compass.example.com',
        'What it does: Finds the nearest healthy node.',
        'Operated by: orbit',
      ].join('\n'),
    );
  });

  it('keeps a multi-line paste to one line per field', () => {
    const msg = composeMessage({ ...good, what: 'Line one\nLine two\r\nLine three' });
    expect(msg.split('\n')).toHaveLength(5);
    expect(msg).toContain('What it does: Line one Line two Line three');
  });

  it('shows stand-ins for what is still empty', () => {
    const msg = composeMessage({ ...EMPTY_FIELDS, name: 'Compass' });
    expect(msg).toContain('Name: Compass');
    expect(msg).toContain('URL: <url>');
    expect(msg).toContain('Built by: <handle>');
  });
});

describe('messageLines', () => {
  it('marks placeholders so the preview can style them', () => {
    const lines = messageLines({ ...EMPTY_FIELDS, name: 'Compass' });
    expect(lines[0]).toMatchObject({ label: null, placeholder: false });
    expect(lines[1]).toMatchObject({ label: 'Name', value: 'Compass', placeholder: false });
    expect(lines[2]).toMatchObject({ label: 'URL', value: '<url>', placeholder: true });
  });
});
