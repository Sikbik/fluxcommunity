/**
 * The submit helper's logic: field cleaning, https-only URL validation and the message template
 * (DESIGN 12, adapted for a node host). Nothing is sent and nothing is stored; the visitor copies
 * the message and pastes it to the Flux team on Discord.
 */
import { COPY } from '@/content/copy';

export type SubmitKind = 'app' | 'host';

export interface SubmitFields {
  kind: SubmitKind;
  name: string;
  url: string;
  /** One line: what it does. */
  what: string;
  /** Builder (app) or operator (host) handle. */
  handle: string;
}

export type SubmitField = 'name' | 'url' | 'what' | 'handle';

export const FIELD_LIMITS: Readonly<Record<SubmitField, number>> = {
  name: 60,
  url: 200,
  what: 140,
  handle: 60,
};

export const EMPTY_FIELDS: SubmitFields = { kind: 'app', name: '', url: '', what: '', handle: '' };

/** Collapses whitespace and line breaks to single spaces, trims, and cuts at `max` characters. */
export function cleanLine(input: string, max: number): string {
  let flat = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    // Control characters (a pasted tab, a stray escape) become spaces like any other whitespace.
    flat += code < 32 || code === 127 ? ' ' : ch;
  }
  return flat.replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface UrlCheck {
  /** The normalised https URL, or null when the input is empty or invalid. */
  url: string | null;
  /** A short, human reason. Null when the input is empty or valid. */
  error: string | null;
}

const BARE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?([/?#].*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Validates and normalises an address. https only: `http://`, `javascript:`, `data:` and friends
 * are rejected; a bare domain such as `example.com` is accepted and gets `https://`.
 */
export function normalizeUrl(input: string): UrlCheck {
  const raw = cleanLine(input, FIELD_LIMITS.url + 40);
  if (!raw) return { url: null, error: null };

  let candidate = raw;
  if (HAS_SCHEME.test(raw) && !/^[a-z0-9.-]+:\d{2,5}(\/|$)/i.test(raw)) {
    if (!/^https:\/\//i.test(raw)) {
      return { url: null, error: 'Use an https:// address. Plain http is not accepted.' };
    }
  } else if (BARE_HOST.test(raw)) {
    candidate = `https://${raw}`;
  } else {
    return { url: null, error: 'Enter a full address, for example https://example.com.' };
  }

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { url: null, error: 'That does not look like a valid address.' };
  }
  if (u.protocol !== 'https:') return { url: null, error: 'Use an https:// address.' };
  if (u.username || u.password) return { url: null, error: 'Remove the username and password.' };
  const host = u.hostname.toLowerCase();
  if (
    !host.includes('.') ||
    IPV4.test(host) ||
    host.startsWith('[') ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return { url: null, error: 'Use the public domain name of the app.' };
  }
  const tld = host.split('.').pop() ?? '';
  if (!/^([a-z]{2,}|xn--[a-z0-9-]+)$/.test(tld)) {
    return { url: null, error: 'That does not look like a valid address.' };
  }
  const path = u.pathname === '/' ? '' : u.pathname;
  const url = `${u.origin}${path}${u.search}${u.hash}`;
  if (url.length > FIELD_LIMITS.url) return { url: null, error: 'That address is too long.' };
  return { url, error: null };
}

export interface SubmitCheck {
  ok: boolean;
  errors: Partial<Record<SubmitField, string>>;
  /** The cleaned fields the message is composed from (url normalised, or empty when invalid). */
  clean: SubmitFields;
}

/** Cleans every field and reports what is missing or wrong. `ok` means the message can be copied. */
export function validateSubmit(fields: SubmitFields): SubmitCheck {
  const errors: Partial<Record<SubmitField, string>> = {};
  const name = cleanLine(fields.name, FIELD_LIMITS.name);
  const what = cleanLine(fields.what, FIELD_LIMITS.what);
  const handle = cleanLine(fields.handle, FIELD_LIMITS.handle);
  const checked = normalizeUrl(fields.url);

  if (!name) errors.name = 'Add the name people will see.';
  if (checked.error) errors.url = checked.error;
  else if (!checked.url) errors.url = 'Add the https address of the app.';
  if (!what) errors.what = 'Add one line about what it does.';
  if (!handle) {
    errors.handle = fields.kind === 'host' ? 'Add the operator handle.' : 'Add the builder handle.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    clean: { kind: fields.kind, name, url: checked.url ?? '', what, handle },
  };
}

export interface MessageLine {
  /** "Name", "URL" and so on; null for the greeting. */
  label: string | null;
  value: string;
  /** True when `value` is a stand-in for something the visitor has not entered yet. */
  placeholder: boolean;
}

const PLACEHOLDERS: Record<SubmitField, string> = {
  name: '<name>',
  url: '<url>',
  what: '<one line>',
  handle: '<handle>',
};

const GREETING: Record<SubmitKind, string> = {
  app: 'Hi @bigstache, please add my Flux app to the community portal.',
  host: 'Hi @bigstache, please add my Flux node hosting service to the community portal.',
};

const HANDLE_LABEL: Record<SubmitKind, string> = { app: 'Built by', host: 'Operated by' };

/** The message as lines, with placeholders for what is still empty. */
export function messageLines(fields: SubmitFields): MessageLine[] {
  const check = validateSubmit(fields);
  const c = check.clean;
  const line = (label: string, key: SubmitField): MessageLine => ({
    label,
    value: c[key] || PLACEHOLDERS[key],
    placeholder: !c[key],
  });
  return [
    { label: null, value: GREETING[fields.kind], placeholder: false },
    line('Name', 'name'),
    line('URL', 'url'),
    line('What it does', 'what'),
    line(HANDLE_LABEL[fields.kind], 'handle'),
  ];
}

/** The plain-text message. Apps use the copy deck's template verbatim. */
export function composeMessage(fields: SubmitFields): string {
  const c = validateSubmit(fields).clean;
  if (fields.kind === 'app') {
    return COPY.submission({
      name: c.name || PLACEHOLDERS.name,
      url: c.url || PLACEHOLDERS.url,
      what: c.what || PLACEHOLDERS.what,
      handle: c.handle || PLACEHOLDERS.handle,
    });
  }
  return messageLines(fields)
    .map((l) => (l.label ? `${l.label}: ${l.value}` : l.value))
    .join('\n');
}
