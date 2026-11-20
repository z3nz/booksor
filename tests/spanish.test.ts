import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookName, messages, uiLang } from '../src/i18n/index.ts';
import { BOOKS, bookBySlug } from '../src/lib/books.ts';
import { formatReference, parseReference } from '../src/lib/reference.ts';
import { buildIndex, search, verseKey } from '../src/lib/search.ts';
import { highlight, processTermEs } from '../src/lib/terms.ts';
import type { SearchRow } from '../src/lib/types.ts';

const ref = (q: string) => {
  const r = parseReference(q, 'es');
  return r && formatReference(r, 'es');
};

describe('Spanish references', () => {
  it.each([
    ['Juan 3:16', 'Juan 3:16'],
    ['Jn 3,16', 'Juan 3:16'],
    ['jn 3.16', 'Juan 3:16'],
    ['Éxodo 20', 'Éxodo 20'],
    ['exodo 20', 'Éxodo 20'],
    ['Sal 23', 'Salmos 23'],
    ['1 Co 13:4-7', '1 Corintios 13:4-7'],
    ['primera de corintios 13', '1 Corintios 13'],
    ['Hch 2:38', 'Hechos 2:38'],
    ['Apocalipsis 21', 'Apocalipsis 21'],
    ['Stg 1:5', 'Santiago 1:5'],
    ['cantares 2', 'Cantares 2'],
    ['gál 5:22', 'Gálatas 5:22'],
    ['Juda', 'Judas'],
  ])('%s → %s', (q, out) => expect(ref(q)).toBe(out));

  it('still understands English book names', () => {
    expect(ref('john 3:16')).toBe('Juan 3:16');
    expect(ref('1 cor 13')).toBe('1 Corintios 13');
  });

  it('leaves English pages alone', () => {
    expect(formatReference(parseReference('jn 3:16')!)).toBe('John 3:16');
    expect(parseReference('jue 5')).toBeNull();
  });

  it('has a name for every book', () => {
    for (const b of BOOKS) expect(bookName(b, 'es')).not.toBe('');
    expect(bookName(bookBySlug.get('song-of-solomon')!, 'es')).toBe('Cantares');
    expect(bookName(bookBySlug.get('john')!, 'en')).toBe('John');
  });
});

describe('Spanish words', () => {
  it('ignores accents, skips little words and matches plurals', () => {
    expect(processTermEs('corazón')).toBe(processTermEs('corazon'));
    expect(processTermEs('corazones')).toBe(processTermEs('corazón'));
    expect(processTermEs('á')).toBeNull();
    expect(processTermEs('de')).toBeNull();
    expect(processTermEs('Dios')).toBe('dios');
  });

  it('highlights matched words with their accents kept', () => {
    expect(highlight('Jehová es mi pastor', ['jehova'], 'es')).toBe('<mark>Jehová</mark> es mi pastor');
  });
});

describe('menus', () => {
  it('picks the language from a code', () => {
    expect(uiLang('es-MX')).toBe('es');
    expect(uiLang('nl')).toBe('en');
    expect(messages('es').tools.listen).toBe('Escuchar');
  });
});

// Search quality, when the data has been built (pnpm data)
describe.skipIf(!existsSync('public/search/words-es.json'))('Spanish search', () => {
  const rows = JSON.parse(readFileSync('public/search/words-es.json', 'utf8')) as SearchRow[];
  const display = new Map(
    (JSON.parse(readFileSync('public/search/rv1909.json', 'utf8')) as SearchRow[]).map((r) => [verseKey(r[0], r[1], r[2]), r[3]]),
  );
  const index = buildIndex(rows, 'es');
  const top = (q: string) => {
    const h = search(index, rows, display, q, 5, 'es').hits[0];
    return h && `${bookName(h.b, 'es')} ${h.c}:${h.v}`;
  };

  it.each([
    ['Jehová es mi pastor', 'Salmos 23:1'],
    ['jehova es mi pastor', 'Salmos 23:1'],
    ['de tal manera amó Dios al mundo', 'Juan 3:16'],
    ['la caridad es sufrida', '1 Corintios 13:4'],
    ['todo lo puedo en Cristo', 'Filipenses 4:13'],
  ])('“%s” finds %s', (q, want) => expect(top(q)).toBe(want));
});
