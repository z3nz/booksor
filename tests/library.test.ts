import { describe, expect, it } from 'vitest';
import {
  chapterMarks,
  countSaved,
  emptyLibrary,
  highlightGroups,
  mergeLibraries,
  parseLibrary,
  passageKey,
  setHighlight,
  updatePassage,
} from '../src/lib/library.ts';

const john3 = (v: number) => ({ b: 42, c: 3, v, t: `verse ${v}` });

describe('highlights', () => {
  it('adds, recolors and removes highlights', () => {
    let lib = setHighlight(emptyLibrary(), [john3(16), john3(17)], 'yellow', 'kjv', 1);
    expect(Object.keys(lib.highlights)).toEqual(['42:3:16', '42:3:17']);
    lib = setHighlight(lib, [john3(17)], 'blue', 'kjv', 2);
    expect(lib.highlights['42:3:17'].color).toBe('blue');
    lib = setHighlight(lib, [john3(16)], null, 'kjv', 3);
    expect(Object.keys(lib.highlights)).toEqual(['42:3:17']);
  });

  it('does not change the library it was given', () => {
    const lib = emptyLibrary();
    setHighlight(lib, [john3(16)], 'green', 'kjv');
    expect(lib.highlights).toEqual({});
  });

  it('groups neighbouring verses of the same color, newest first', () => {
    let lib = setHighlight(emptyLibrary(), [john3(16), john3(17), john3(18)], 'yellow', 'kjv', 1);
    lib = setHighlight(lib, [john3(20)], 'yellow', 'kjv', 2); // gap -> separate
    lib = setHighlight(lib, [john3(18)], 'pink', 'kjv', 3); // different color -> separate
    const groups = highlightGroups(lib);
    expect(groups.map((g) => [g.from, g.to, g.color])).toEqual([
      [18, 18, 'pink'],
      [20, 20, 'yellow'],
      [16, 17, 'yellow'],
    ]);
    expect(groups[2].t).toBe('verse 16 verse 17');
    expect(groups[2].keys).toEqual(['42:3:16', '42:3:17']);
  });
});

describe('bookmarks and notes', () => {
  const ref = { b: 42, c: 3, from: 16, to: 18 };

  it('keeps a bookmark and a note on the same passage', () => {
    let lib = updatePassage(emptyLibrary(), ref, { bm: true }, 'text', 'kjv');
    lib = updatePassage(lib, ref, { note: '  God loves the world  ' }, 'text', 'kjv');
    expect(lib.passages[passageKey(ref)]).toMatchObject({ bm: true, note: 'God loves the world' });
  });

  it('removes the passage once it has neither', () => {
    let lib = updatePassage(emptyLibrary(), ref, { bm: true, note: 'x' }, 'text', 'kjv');
    lib = updatePassage(lib, ref, { note: '' }, 'text', 'kjv');
    expect(lib.passages[passageKey(ref)].note).toBeUndefined();
    lib = updatePassage(lib, ref, { bm: false }, 'text', 'kjv');
    expect(lib.passages).toEqual({});
  });

  it('counts what is saved', () => {
    let lib = updatePassage(emptyLibrary(), ref, { bm: true, note: 'x' }, 't', 'kjv');
    lib = updatePassage(lib, { ...ref, from: 1, to: 1 }, { bm: true }, 't', 'kjv');
    lib = setHighlight(lib, [john3(1), john3(2)], 'green', 'kjv');
    expect(countSaved(lib)).toEqual({ highlights: 1, notes: 1, bookmarks: 2 });
  });

  it('finds everything saved in one chapter', () => {
    let lib = updatePassage(emptyLibrary(), ref, { bm: true }, 't', 'kjv');
    lib = updatePassage(lib, { b: 42, c: 4, from: 1, to: 1 }, { bm: true }, 't', 'kjv');
    lib = setHighlight(lib, [john3(5), { b: 42, c: 30, v: 1, t: '' }], 'blue', 'kjv');
    const marks = chapterMarks(lib, 42, 3);
    expect([...marks.highlights]).toEqual([[5, 'blue']]);
    expect(marks.passages.map((p) => [p.from, p.to])).toEqual([[16, 18]]);
  });
});

describe('storage and backups', () => {
  it('drops malformed data instead of failing', () => {
    expect(parseLibrary(null)).toEqual(emptyLibrary());
    expect(parseLibrary('nope')).toEqual(emptyLibrary());
    const lib = parseLibrary({
      highlights: { '42:3:16': { color: 'yellow', t: 'a', tr: 'kjv', at: 1 }, bad: { color: 'yellow' }, '1:1:1': { color: 'red' } },
      passages: { '42:3:16-18': { bm: true, t: 'a', tr: 'kjv', at: 1 }, '42:3:1-1': { t: 'empty' } },
    });
    expect(Object.keys(lib.highlights)).toEqual(['42:3:16']);
    expect(Object.keys(lib.passages)).toEqual(['42:3:16-18']);
  });

  it('merges a backup, keeping the newer change for the same verse', () => {
    const mine = setHighlight(emptyLibrary(), [john3(16), john3(17)], 'yellow', 'kjv', 10);
    const backup = setHighlight(setHighlight(emptyLibrary(), [john3(16)], 'blue', 'kjv', 5), [john3(1)], 'pink', 'kjv', 20);
    const merged = mergeLibraries(mine, backup);
    expect(merged.highlights['42:3:16'].color).toBe('yellow'); // mine is newer
    expect(merged.highlights['42:3:1'].color).toBe('pink'); // only in the backup
    expect(Object.keys(merged.highlights)).toHaveLength(3);
  });

  it('round-trips through JSON', () => {
    const lib = updatePassage(setHighlight(emptyLibrary(), [john3(16)], 'purple', 'web'), { b: 0, c: 1, from: 1, to: 3 }, { note: 'hi' }, 't', 'web');
    expect(parseLibrary(JSON.parse(JSON.stringify(lib)))).toEqual(lib);
  });
});
