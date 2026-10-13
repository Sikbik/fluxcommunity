import { CATEGORIES, COMMUNITY_APPS, type CommunityApp } from '@shared/catalog';
import { describe, expect, it } from 'vitest';
import {
  indexDoc,
  indexField,
  matchesBuilder,
  osaDistance,
  parseQuery,
  scoreDoc,
  scoreTerm,
  splitWords,
} from './search';
import { SYNTH } from './testkit';

const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

function indexApps(apps: readonly CommunityApp[]) {
  return apps.map((app) => ({
    app,
    doc: indexDoc({
      name: app.name,
      tagline: app.tagline,
      description: app.description,
      builder: app.builder,
      host: app.host,
      category: `${label(app.category)} ${app.category}`,
    }),
  }));
}

type Indexed = ReturnType<typeof indexApps>;

/** Ids that match, best first. */
function searchIn(docs: Indexed, raw: string): string[] {
  const q = parseQuery(raw);
  return docs
    .map(({ app, doc }) => ({ id: app.id, score: scoreDoc(q.terms, q.text, doc) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.id);
}

const synth = indexApps(SYNTH);
const real = indexApps(COMMUNITY_APPS);
const search = (raw: string) => searchIn(synth, raw);

describe('splitWords', () => {
  it('splits camelCase, digits and punctuation', () => {
    expect(splitWords('FluxNode Monitor')).toEqual(['flux', 'node', 'monitor']);
    expect(splitWords('2ndTL Mining')).toEqual(['2nd', 'tl', 'mining']);
    expect(splitWords('CarRamRodB16_228')).toEqual(['car', 'ram', 'rod', 'b16', '228']);
    expect(splitWords('view.app.example.io')).toEqual(['view', 'app', 'example', 'io']);
  });

  it('strips diacritics', () => {
    expect(splitWords('Café Düsseldorf')).toEqual(['cafe', 'dusseldorf']);
  });
});

describe('parseQuery', () => {
  it('separates words from operators', () => {
    const q = parseQuery('node is:new by:2ndtl');
    expect(q.terms).toEqual(['node']);
    expect(q.operators).toEqual([
      { key: 'is', value: 'new' },
      { key: 'by', value: '2ndtl' },
    ]);
    expect(q.empty).toBe(false);
  });

  it('keeps quoted values together', () => {
    const q = parseQuery('by:"2ndTL Mining"');
    expect(q.operators).toEqual([{ key: 'by', value: '2ndtl mining' }]);
  });

  it('ignores an operator that is still being typed', () => {
    const q = parseQuery('is:');
    expect(q.terms).toEqual([]);
    expect(q.operators).toEqual([]);
    expect(q.empty).toBe(true);
  });

  it('treats an unknown key as plain words', () => {
    const q = parseQuery('foo:bar');
    expect(q.terms).toEqual(['foo', 'bar']);
    expect(q.operators).toEqual([]);
  });

  it('is empty for whitespace', () => {
    expect(parseQuery('   ').empty).toBe(true);
    expect(parseQuery('').terms).toEqual([]);
  });
});

describe('osaDistance', () => {
  it('counts an adjacent swap as one edit', () => {
    expect(osaDistance('trakcer', 'tracker', 2)).toBe(1);
    expect(osaDistance('noxdie', 'noxide', 2)).toBe(1);
  });

  it('counts inserts, deletes and substitutions', () => {
    expect(osaDistance('atlas', 'atlass', 2)).toBe(1);
    expect(osaDistance('atlas', 'atls', 2)).toBe(1);
    expect(osaDistance('atlas', 'atlux', 2)).toBe(2);
  });

  it('stops early past the bound', () => {
    expect(osaDistance('atlas', 'completely', 1)).toBe(2);
    expect(osaDistance('abc', 'abcdefgh', 2)).toBe(3);
  });
});

describe('scoreTerm', () => {
  it('ranks whole word over prefix over substring over typo', () => {
    const f = indexField('FluxNode Monitor');
    const whole = scoreTerm('monitor', f);
    const prefix = scoreTerm('moni', f);
    const sub = scoreTerm('onit', f);
    const typo = scoreTerm('monitro', f);
    expect(whole).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('matches initials', () => {
    expect(scoreTerm('fnm', indexField('FluxNode Monitor'))).toBeGreaterThan(0);
    expect(scoreTerm('fth', indexField('Flux Tools Hub'))).toBeGreaterThan(0);
  });

  it('does not match unrelated words', () => {
    expect(scoreTerm('zebra', indexField('FluxNode Monitor'))).toBe(0);
  });
});

describe('search over a catalog', () => {
  it('finds an app by its name', () => {
    expect(search('orbit')[0]).toBe('orbit-pay');
    expect(search('north star')[0]).toBe('north-star');
    expect(search('grid')[0]).toBe('grid-view');
  });

  it('ranks a name hit above a tagline hit', () => {
    const r = search('node');
    expect(r.slice(0, 2).sort()).toEqual(['node-sizer', 'node-watch']);
    expect(r).toContain('grid-view');
    expect(r.indexOf('grid-view')).toBeGreaterThan(1);
  });

  it('tolerates typos and spacing', () => {
    expect(search('orbti')[0]).toBe('orbit-pay');
    expect(search('nodewatch')[0]).toBe('node-watch');
    expect(search('node watch')[0]).toBe('node-watch');
    expect(search('northstar')[0]).toBe('north-star');
    expect(search('grid-view')[0]).toBe('grid-view');
  });

  it('finds by builder, host and category words', () => {
    expect(search('acme').sort()).toEqual(['grid-view', 'old-ledger', 'orbit-pay']);
    expect(search('beta')).toEqual(['node-watch']);
    expect(search('sizer')).toEqual(['node-sizer']);
    expect(search('rewards').sort()).toEqual(['old-ledger', 'orbit-pay']);
  });

  it('requires every word to match', () => {
    expect(search('orbit pay')[0]).toBe('orbit-pay');
    expect(search('orbit zebra')).toEqual([]);
  });

  it('matches by initials', () => {
    // Two letters are too few to be initials; three are enough.
    expect(search('nw')).not.toContain('node-watch');
    expect(search('nsp')[0]).toBe('node-sizer');
  });

  it('returns everything for an empty query', () => {
    expect(search('')).toHaveLength(SYNTH.length);
  });

  it('gives an exact name the top score', () => {
    const q = parseQuery('node watch');
    const scored = synth
      .map(({ app, doc }) => ({ id: app.id, score: scoreDoc(q.terms, q.text, doc) }))
      .sort((a, b) => b.score - a.score);
    expect(scored[0]?.id).toBe('node-watch');
    expect(scored[0]?.score).toBeGreaterThan(scored[1]?.score ?? 0);
  });
});

describe('matchesBuilder', () => {
  it('matches a builder forgivingly and never an unattributed app', () => {
    const orbit = synth.find((d) => d.app.id === 'orbit-pay')?.doc;
    const unattributed = synth.find((d) => d.app.id === 'learn-lab')?.doc;
    expect(orbit && matchesBuilder('acme', orbit)).toBe(true);
    expect(orbit && matchesBuilder('acme labs', orbit)).toBe(true);
    expect(orbit && matchesBuilder('beta', orbit)).toBe(false);
    expect(unattributed && matchesBuilder('acme', unattributed)).toBe(false);
  });
});

// The real catalog: what must hold whatever is in it.
describe('search over the real catalog', () => {
  it('returns every app for an empty query', () => {
    expect(searchIn(real, '')).toHaveLength(COMMUNITY_APPS.length);
  });

  it('finds every app by its own name, with the exact name first', () => {
    for (const { app } of real) {
      const hits = searchIn(real, app.name);
      expect(hits[0], `searching "${app.name}"`).toBe(app.id);
    }
  });

  it('finds every app by its id, typed the way a person would', () => {
    for (const { app } of real) {
      expect(searchIn(real, app.id.replace(/-/g, ' ')), `searching "${app.id}"`).toContain(app.id);
    }
  });

  it('finds every attributed app by its builder, and never an unattributed one', () => {
    for (const { app, doc } of real) {
      if (app.builder) {
        expect(searchIn(real, app.builder)).toContain(app.id);
        expect(matchesBuilder(app.builder, doc)).toBe(true);
      } else {
        for (const other of real) {
          if (other.app.builder) expect(matchesBuilder(other.app.builder, doc)).toBe(false);
        }
      }
    }
  });

  it('finds every app by its category label', () => {
    for (const { app } of real) {
      expect(searchIn(real, label(app.category))).toContain(app.id);
    }
  });

  it('finds nothing for nonsense', () => {
    expect(searchIn(real, 'zzzzqqqq')).toEqual([]);
  });
});
