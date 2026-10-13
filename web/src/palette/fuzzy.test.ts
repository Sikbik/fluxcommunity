import { describe, expect, it } from 'vitest';
import { highlightRanges, matchToken, prepare, scoreFields, segments, tokenize } from './fuzzy';

const match = (token: string, text: string) => matchToken(token, prepare(text));

describe('tokenize', () => {
  it('lower-cases, splits on whitespace and drops empties', () => {
    expect(tokenize('  Flux   ATLAS ')).toEqual(['flux', 'atlas']);
    expect(tokenize('')).toEqual([]);
  });
  it('caps the token count', () => {
    expect(tokenize('a b c d e f g h')).toHaveLength(6);
  });
});

describe('matchToken kinds', () => {
  it('finds exact, prefix, word, substring, acronym and fuzzy matches', () => {
    expect(match('atlas', 'Atlas')?.kind).toBe('exact');
    expect(match('atl', 'Flux Atlas')?.kind).toBe('word');
    expect(match('flu', 'Flux Atlas')?.kind).toBe('prefix');
    expect(match('too', 'Flux Tools Hub')?.kind).toBe('word');
    expect(match('rbi', 'Node Orbit')?.kind).toBe('substring');
    expect(match('fth', 'Flux Tools Hub')?.kind).toBe('acronym');
    expect(match('snd', 'Toggle sound')?.kind).toBe('fuzzy');
  });

  it('rejects text that does not contain the letters in order', () => {
    expect(match('xyz', 'Flux Atlas')).toBeNull();
    expect(match('sla', 'Atlas')).toBeNull();
    expect(match('atlasx', 'Atlas')).toBeNull();
  });

  it('only matches a single letter at the start of a word', () => {
    expect(match('a', 'Flux Atlas')?.kind).toBe('word');
    expect(match('t', 'Flux Atlas')).toBeNull();
    expect(match('f', 'Flux Atlas')?.kind).toBe('prefix');
  });

  it('keeps loose subsequences tight', () => {
    // 'fda' is an acronym of "Flux Deployment Academy" but spread-out letters are not a match.
    expect(match('fda', 'Flux Deployment Academy')?.kind).toBe('acronym');
    expect(match('fxy', 'Flux Deployment Academy')).toBeNull();
    expect(match('fy', 'Flux Deployment Academy')).toBeNull();
  });

  it('reports ranges in the original text', () => {
    const hit = match('atl', 'Flux Atlas');
    expect(hit?.ranges).toEqual([[5, 8]]);
    const acronym = match('fth', 'Flux Tools Hub');
    expect(acronym?.ranges).toEqual([
      [0, 1],
      [5, 6],
      [11, 12],
    ]);
  });

  it('ranks stronger kinds above weaker ones', () => {
    const s = (token: string, text: string) => match(token, text)?.score ?? -1;
    expect(s('atlas', 'Atlas')).toBeGreaterThan(s('atl', 'Atlas'));
    expect(s('atl', 'Atlas')).toBeGreaterThan(s('atl', 'Flux Atlas'));
    expect(s('atl', 'Flux Atlas')).toBeGreaterThan(s('tla', 'Flux Atlas'));
  });
});

describe('scoreFields', () => {
  const app = [
    { field: prepare('Flux Atlas'), weight: 1 },
    { field: prepare('The Flux network on a live 3D globe.'), weight: 0.4 },
    { field: prepare('Little Stache'), weight: 0.7 },
  ];

  it('requires every token to match some field', () => {
    expect(scoreFields(tokenize('flux atlas'), app)).toBeGreaterThan(0);
    expect(scoreFields(tokenize('atlas stache'), app)).toBeGreaterThan(0);
    expect(scoreFields(tokenize('atlas zebra'), app)).toBe(-1);
  });

  it('prefers the name over the tagline', () => {
    const named = scoreFields(tokenize('atlas'), app);
    const tagline = scoreFields(tokenize('globe'), app);
    expect(named).toBeGreaterThan(tagline);
  });

  it('only lets short fields match loosely', () => {
    const tagline = [{ field: prepare('Reduction and Potato Block tracker.'), weight: 1, loose: false }];
    expect(scoreFields(['atl'], tagline)).toBe(-1);
    expect(scoreFields(['pota'], tagline)).toBeGreaterThan(0);
    const name = [{ field: prepare('Flux Tools Hub'), weight: 1 }];
    expect(scoreFields(['fth'], name)).toBeGreaterThan(0);
  });

  it('scores an empty query as zero (everything matches)', () => {
    expect(scoreFields([], app)).toBe(0);
  });
});

describe('highlighting', () => {
  it('merges the ranges of all tokens', () => {
    const p = prepare('Flux Atlas');
    expect(highlightRanges(['flu', 'atl'], p)).toEqual([
      [0, 3],
      [5, 8],
    ]);
  });

  it('skips tokens that miss and loose scatter', () => {
    const p = prepare('Flux Deployment Academy');
    expect(highlightRanges(['zzz'], p)).toEqual([]);
  });

  it('splits text into segments', () => {
    expect(segments('Flux Atlas', [[5, 8]])).toEqual([
      { text: 'Flux ', hit: false },
      { text: 'Atl', hit: true },
      { text: 'as', hit: false },
    ]);
    expect(segments('Atlas', [])).toEqual([{ text: 'Atlas', hit: false }]);
  });
});
