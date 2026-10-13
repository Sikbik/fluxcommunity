import { describe, expect, it } from 'vitest';
import { MAX_RECENTS, pushRecent, sanitizeRecents } from './recents';

describe('recents', () => {
  it('puts the newest first and removes duplicates', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(pushRecent([], 'x')).toEqual(['x']);
  });

  it('caps the list', () => {
    let list: string[] = [];
    for (let i = 0; i < 20; i++) list = pushRecent(list, `i${i}`);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]).toBe('i19');
  });

  it('cleans whatever was stored', () => {
    const valid = (id: string) => id.startsWith('app:');
    expect(sanitizeRecents(['app:a', 42, 'app:a', 'gone:b', null, 'app:c'], valid)).toEqual([
      'app:a',
      'app:c',
    ]);
    expect(sanitizeRecents('nope', valid)).toEqual([]);
    expect(sanitizeRecents(null, valid)).toEqual([]);
    expect(sanitizeRecents({ 0: 'app:a' }, valid)).toEqual([]);
  });
});
