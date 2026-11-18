import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKS } from '../src/lib/books.ts';
import { parseReference } from '../src/lib/reference.ts';
import { buildIndex, search, verseKey } from '../src/lib/search.ts';
import { combineWords, highlight, processTerm, stem } from '../src/lib/terms.ts';
import type { SearchRow } from '../src/lib/types.ts';

describe('word handling', () => {
  it.each([
    ['believeth', 'believes', 'believed', 'believe'],
    ['strengtheneth', 'strengthens', 'strengthened', 'strengthen'],
    ['loveth', 'loves', 'loved', 'love'],
    ['cometh', 'comes', 'come', 'come'],
  ])('%s, %s, %s and %s share a stem', (...forms) => {
    expect(new Set(forms.map(stem)).size).toBe(1);
  });

  it('maps KJV words to modern ones', () => {
    expect(processTerm('thee')).toBe(processTerm('you'));
    expect(processTerm('thy')).toBe(processTerm('your'));
    expect(processTerm('hath')).toBe(processTerm('has'));
  });

  it('skips very common words', () => {
    expect(processTerm('the')).toBeNull();
    expect(processTerm('Unto')).toBeNull();
    expect(processTerm('art')).toBeNull(); // "art" -> "are"
  });

  it('combines words from several translations without repeats', () => {
    const out = combineWords(['He that believeth', 'whoever believes in him']).split(' ');
    expect(out.filter((w) => stem(w) === 'believ')).toHaveLength(1);
    expect(out).toContain('whoever');
    expect(out).not.toContain('in');
  });

  it('highlights every form of a matched word and escapes HTML', () => {
    expect(highlight('He loveth <me>, and I love him', ['lov'])).toBe(
      'He <mark>loveth</mark> &lt;me&gt;, and I <mark>love</mark> him',
    );
  });
});

// Quality checks against the real Bible text. These run once `pnpm data` has generated the files.
const SEARCH = join(import.meta.dirname, '..', 'public', 'search');
const hasData = existsSync(join(SEARCH, 'words-en.json')) && existsSync(join(SEARCH, 'kjv.json'));

describe.skipIf(!hasData)('search quality (cross-translation)', () => {
  const load = (name: string) => JSON.parse(readFileSync(join(SEARCH, `${name}.json`), 'utf8')) as SearchRow[];
  const rows = hasData ? load('words-en') : [];
  const index = hasData ? buildIndex(rows) : null!;
  const display = (tr: string) => new Map(load(tr).map((r) => [verseKey(r[0], r[1], r[2]), r[3]]));
  const kjv = hasData ? display('kjv') : new Map<string, string>();

  const keyOf = (ref: string) => {
    const r = parseReference(ref)!;
    return verseKey(BOOKS.indexOf(r.book), r.chapter, r.verse!);
  };
  const top = (q: string, shown = kjv) =>
    search(index, rows, shown, q).hits.slice(0, 5).map((h) => verseKey(h.b, h.c, h.v));

  // Modern (NIV/NKJV/ESV-style) wording, searched while reading the KJV (old wording) and the BSB (default)
  const QUOTES: [string, string][] = [
    ['I can do all things through Christ who strengthens me', 'Philippians 4:13'],
    ['love is patient love is kind', '1 Corinthians 13:4'],
    ['trust in the lord with all your heart', 'Proverbs 3:5'],
    ['for I know the plans I have for you', 'Jeremiah 29:11'],
    ['all scripture is God breathed', '2 Timothy 3:16'],
    ['come to me all you who are weary and burdened', 'Matthew 11:28'],
    ['for God so loved the world', 'John 3:16'],
    ['the Lord is my shepherd', 'Psalms 23:1'],
    ['be still and know that I am God', 'Psalms 46:10'],
    ['the wages of sin is death', 'Romans 6:23'],
    ['love is patient', '1 Corinthians 13:4'],
  ];
  const bsb = hasData ? display('bsb') : new Map<string, string>();

  it.each(QUOTES)('KJV: "%s" finds %s in the top 5', (q, ref) => {
    expect(top(q)).toContain(keyOf(ref));
  });

  it.each(QUOTES)('BSB: "%s" finds %s in the top 5', (q, ref) => {
    expect(top(q, bsb)).toContain(keyOf(ref));
  });

  it('shows the verse in the reader’s translation and flags other wording', () => {
    const { hits } = search(index, rows, kjv, 'love is patient');
    const hit = hits.find((h) => verseKey(h.b, h.c, h.v) === keyOf('1 Corinthians 13:4'))!;
    expect(hit.t).toMatch(/^Charity suffereth long/);
    expect(hit.otherWording).toBe(true);
  });

  it('does not flag verses that match in the reader’s own wording', () => {
    const { hits } = search(index, rows, kjv, 'for God so loved the world');
    expect(hits[0].otherWording).toBe(false);
  });

  it('ranks verses that use the word itself above longer words that start with it', () => {
    const { hits } = search(index, rows, kjv, 'love');
    const usesLove = (text: string) => (text.match(/\p{L}+/gu) ?? []).some((w) => processTerm(w) === processTerm('love'));
    expect(hits.slice(0, 5).every((h) => usesLove(h.t))).toBe(true);
    expect(hits.slice(0, 5).every((h) => !h.otherWording)).toBe(true);
  });

  it('autocompletes the word being typed', () => {
    expect(top('the lord is my shep')).toContain(keyOf('Psalms 23:1'));
  });
});
