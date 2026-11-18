import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookBySlug, BOOKS } from '../src/lib/books.ts';
import { OSIS_BOOKS, parseOsisRange, parseOsisVerse } from '../src/lib/osis.ts';
import type { SearchRow } from '../src/lib/types.ts';
import {
  relatedTo,
  showsTarget,
  targetLabel,
  targetUrl,
  verseTexts,
  xrefUrl,
  type XrefFile,
  type XrefTarget,
} from '../src/lib/xref.ts';

const idx = (slug: string) => BOOKS.indexOf(bookBySlug.get(slug)!);

describe('OSIS references', () => {
  it('has a code for every book, in our order', () => {
    expect(OSIS_BOOKS).toHaveLength(66);
    expect(OSIS_BOOKS[idx('psalms')]).toBe('Ps');
    expect(OSIS_BOOKS[idx('1-corinthians')]).toBe('1Cor');
    expect(OSIS_BOOKS[idx('revelation')]).toBe('Rev');
  });

  it('parses verses and ranges', () => {
    expect(parseOsisVerse('John.3.16')).toEqual({ b: idx('john'), c: 3, v: 16 });
    expect(parseOsisRange('1John.4.9-1John.4.10')).toEqual({
      start: { b: idx('1-john'), c: 4, v: 9 },
      end: { b: idx('1-john'), c: 4, v: 10 },
    });
    expect(parseOsisRange('Heb.6.20-Heb.7.3')?.end).toEqual({ b: idx('hebrews'), c: 7, v: 3 });
    expect(parseOsisRange('Rom.5.8')?.end).toEqual({ b: idx('romans'), c: 5, v: 8 });
  });

  it('rejects nonsense', () => {
    expect(parseOsisVerse('Tob.1.1')).toBeNull();
    expect(parseOsisVerse('John.3')).toBeNull();
    expect(parseOsisRange('Rom.5.8-Rom.5.2')).toBeNull();
    expect(parseOsisRange('Rom.5.8-Gal.1.1')).toBeNull();
  });
});

describe('related passages', () => {
  const john = idx('john');
  const rom = idx('romans');
  // John 3: verse 16 → Romans 5:8 (995 votes), John 3:15 (508); verse 17 → Romans 5:8 (10), John 3:16 (40)
  const file: XrefFile = {
    refs: {
      16: [
        [0, 995],
        [1, 508],
      ],
      17: [
        [2, 40],
        [0, 10],
        [3, 0],
      ],
    },
    targets: [
      [rom, 5, 8, 5, 8],
      [john, 3, 15, 3, 15],
      [john, 3, 16, 3, 16],
      [idx('hebrews'), 6, 20, 7, 3],
    ],
  };

  it('ranks by votes', () => {
    expect(relatedTo(file, john, 3, [16]).map((r) => targetLabel(r.target))).toEqual(['Romans 5:8', 'John 3:15']);
    expect(relatedTo(file, john, 3, [17]).map((r) => targetLabel(r.target))).toEqual([
      'John 3:16',
      'Romans 5:8',
      'Hebrews 6:20–7:3',
    ]);
  });

  it('combines several verses and leaves out the verses themselves', () => {
    const both = relatedTo(file, john, 3, [16, 17]);
    expect(both.map((r) => targetLabel(r.target))).toEqual(['Romans 5:8', 'John 3:15', 'Hebrews 6:20–7:3']);
    expect(both[0].votes).toBe(1005);
    expect(relatedTo(file, john, 3, [99])).toEqual([]);
  });

  it('labels and links passages', () => {
    const range: XrefTarget = [idx('1-john'), 4, 9, 4, 10];
    expect(targetLabel(range)).toBe('1 John 4:9–10');
    expect(targetUrl('bsb', range)).toBe('/bsb/1-john/4#v9-10');
    expect(targetUrl('kjv', [idx('hebrews'), 6, 20, 7, 3])).toBe('/kjv/hebrews/6#v20');
    expect(showsTarget('bsb', '/bsb/1-john/4', '#v9-10', range)).toBe(true);
    expect(showsTarget('bsb', '/bsb/1-john/4', '#v9', range)).toBe(false);
    expect(xrefUrl('song-of-solomon', 2)).toBe('/xref/song-of-solomon/2.json');
  });

  it('shows passage text, across a chapter break and cut short when long', () => {
    const rows: SearchRow[] = [
      [rom, 5, 7, 'Very rarely will anyone die for a righteous man.'],
      [rom, 5, 8, 'But God proves His love for us in this.'],
      [rom, 5, 9, 'Therefore, since we have now been justified…'],
      [rom, 6, 1, 'What then shall we say?'],
      [rom, 6, 2, 'Certainly not!'],
    ];
    const t = verseTexts(rows);
    expect(t.passage([rom, 5, 8, 5, 8])).toBe('But God proves His love for us in this.');
    expect(t.passage([rom, 5, 9, 6, 1])).toBe('Therefore, since we have now been justified… What then shall we say?');
    expect(t.passage([rom, 5, 7, 6, 2], 2)).toBe(
      'Very rarely will anyone die for a righteous man. But God proves His love for us in this. …',
    );
    expect(t.passage([john, 3, 16, 3, 16])).toBe('');
  });
});

// Checks the exported data, when it's been built (pnpm data)
describe.skipIf(!existsSync('public/xref/john/3.json'))('exported cross-references', () => {
  it('has the best-known links for John 3:16, best first', () => {
    const file = JSON.parse(readFileSync('public/xref/john/3.json', 'utf8')) as XrefFile;
    const top = relatedTo(file, idx('john'), 3, [16]).slice(0, 3).map((r) => targetLabel(r.target));
    expect(top).toEqual(['Romans 5:8', '1 John 4:9–10', 'Romans 8:32']);
  });

  it('has a file for every chapter', () => {
    for (const b of BOOKS) expect(existsSync(`public/xref/${b.slug}/${b.chapters}.json`), b.name).toBe(true);
  });
});
