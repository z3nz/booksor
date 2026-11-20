// Every menu language: book names, references, search words, menus and search quality.
// Spanish has its own file (spanish.test.ts); the checks that cover every language are here.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookAliases, bookName, homeUrl, messages, UI_LANGS, uiLang, type UiLang } from '../src/i18n/index.ts';
import { BOOKS } from '../src/lib/books.ts';
import { findBook, formatReference, parseReference } from '../src/lib/reference.ts';
import { buildIndex, search, verseKey } from '../src/lib/search.ts';
import { highlight, processTermFor } from '../src/lib/terms.ts';
import { defaultTranslationFor, TRANSLATION_LANGUAGES } from '../src/lib/translations.ts';
import type { SearchRow } from '../src/lib/types.ts';

describe('every language', () => {
  it('has a home page, a Bible, and every Bible language has menus', () => {
    for (const l of UI_LANGS) {
      expect(existsSync(l === 'en' ? 'src/pages/index.astro' : `src/pages/${l}/index.astro`), `${homeUrl(l)} page`).toBe(true);
      expect(TRANSLATION_LANGUAGES).toContain(l);
    }
    for (const l of TRANSLATION_LANGUAGES) expect(UI_LANGS).toContain(l);
  });

  it.each(UI_LANGS)('%s has every message', (l) => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(messages(l)).sort()).toEqual(keys(messages('en')).sort());
  });

  it.each(UI_LANGS)('%s: every book name and abbreviation finds its own book', (l) => {
    const wrong = bookAliases(l)
      .filter(([alias, book]) => findBook(alias, l) !== book)
      .map(([alias, book]) => `${alias} → ${findBook(alias, l)?.name} (want ${book.name})`);
    expect(wrong).toEqual([]);
    for (const b of BOOKS) expect(parseReference(`${bookName(b, l)} 1`, l)?.book).toBe(b);
  });

  it('picks the menu language from a browser language code', () => {
    expect(uiLang('pt-BR')).toBe('pt');
    expect(uiLang('fr-CA')).toBe('fr');
    expect(uiLang('de-AT')).toBe('de');
    expect(uiLang('it')).toBe('it');
    expect(uiLang('nl-NL')).toBe('en');
    expect(uiLang(undefined)).toBe('en');
  });
});

const REFERENCES: Record<Exclude<UiLang, 'en' | 'es'>, [string, string][]> = {
  pt: [
    ['jo 3:16', 'João 3:16'],
    ['João 3.16', 'João 3:16'],
    ['joao 3,16', 'João 3:16'],
    ['Jó 1', 'Jó 1'],
    ['jn 1', 'Jonas 1'],
    ['Gn 1', 'Gênesis 1'],
    ['sl 23', 'Salmos 23'],
    ['1 Co 13:4-7', '1 Coríntios 13:4-7'],
    ['primeira de coríntios 13', '1 Coríntios 13'],
    ['at 2:38', 'Atos 2:38'],
    ['ap 21', 'Apocalipse 21'],
  ],
  fr: [
    ['Jn 3:16', 'Jean 3:16'],
    ['jean 3.16', 'Jean 3:16'],
    ['genese 1', 'Genèse 1'],
    ['Ps 23', 'Psaumes 23'],
    ['Es 53', 'Ésaïe 53'],
    ['isaie 53', 'Ésaïe 53'],
    ['1 Co 13:4-7', '1 Corinthiens 13:4-7'],
    ['première aux corinthiens 13', '1 Corinthiens 13'],
    ['Ac 2:38', 'Actes 2:38'],
    ['Ap 21', 'Apocalypse 21'],
  ],
  de: [
    ['Joh 3,16', 'Johannes 3:16'],
    ['johannes 3:16', 'Johannes 3:16'],
    ['1. Mose 1', '1. Mose 1'],
    ['1 mo 1', '1. Mose 1'],
    ['1mose 1', '1. Mose 1'],
    ['Ps 23', 'Psalmen 23'],
    ['1. Kor 13,4-7', '1. Korinther 13:4-7'],
    ['erster korinther 13', '1. Korinther 13'],
    ['Röm 8,28', 'Römer 8:28'],
    ['roem 8,28', 'Römer 8:28'],
    ['Apg 2,38', 'Apostelgeschichte 2:38'],
    ['offb 21', 'Offenbarung 21'],
    ['matthaus 5', 'Matthäus 5'],
  ],
  it: [
    ['Gv 3:16', 'Giovanni 3:16'],
    ['giovanni 3,16', 'Giovanni 3:16'],
    ['Sal 23', 'Salmi 23'],
    ['giosue 1', 'Giosuè 1'],
    ['1 Cor 13:4-7', '1 Corinzi 13:4-7'],
    ['prima corinzi 13', '1 Corinzi 13'],
    ['At 2:38', 'Atti 2:38'],
    ['Ap 21', 'Apocalisse 21'],
  ],
};

describe.each(Object.entries(REFERENCES))('%s references', (lang, cases) => {
  const ref = (q: string) => {
    const r = parseReference(q, lang);
    return r && formatReference(r, lang);
  };
  it.each(cases)('%s → %s', (q, want) => expect(ref(q)).toBe(want));
  it('still understands English book names', () => expect(ref('john 3:16')).toBe(`${bookName(42, lang)} 3:16`));
});

describe('English is unchanged', () => {
  it.each([
    ['jn 3:16', 'John 3:16'],
    ['job 1', 'Job 1'],
    ['1 cor 13:4-7', '1 Corinthians 13:4-7'],
    ['first john 4', '1 John 4'],
    ['ii tim 3:16', '2 Timothy 3:16'],
  ])('%s → %s', (q, want) => expect(formatReference(parseReference(q)!)).toBe(want));
});

describe('search words', () => {
  const same = (lang: string, a: string, b: string) => expect(processTermFor(lang)(a)).toBe(processTermFor(lang)(b));
  const skipped = (lang: string, w: string) => expect(processTermFor(lang)(w)).toBeNull();

  it('Portuguese: accents, plurals, -ões/-ão', () => {
    same('pt', 'coração', 'coracao');
    same('pt', 'corações', 'coração');
    same('pt', 'orações', 'oração');
    same('pt', 'pastores', 'pastor');
    same('pt', 'luzes', 'luz');
    same('pt', 'fontes', 'fonte');
    skipped('pt', 'de');
    skipped('pt', 'às');
  });

  it('French: accents, plurals, elisions', () => {
    same('fr', 'Éternel', 'eternel');
    same('fr', 'cieux', 'cieu');
    same('fr', 'brebis', 'brebi');
    same('fr', 'bergers', 'berger');
    skipped('fr', 'l');
    skipped('fr', 'qu');
    skipped('fr', 'les');
  });

  it('German: ß, umlauts, endings', () => {
    same('de', 'daß', 'dass');
    same('de', 'Hirte', 'Hirten');
    same('de', 'Liebe', 'lieben');
    same('de', 'Gottes', 'Gott');
    same('de', 'glauben', 'glaubet');
    same('de', 'mühselig', 'muhselig');
    skipped('de', 'der');
    skipped('de', 'und');
  });

  it('Italian: accents, singular and plural, elisions', () => {
    same('it', 'carità', 'carita');
    same('it', 'cielo', 'cieli');
    same('it', 'parola', 'parole');
    skipped('it', 'dell');
    skipped('it', 'il');
  });

  it('highlights with the original spelling kept', () => {
    expect(highlight('Der HERR ist mein Hirte', ['hirt'], 'de')).toBe('Der HERR ist mein <mark>Hirte</mark>');
    expect(highlight('Car Dieu a tant aimé le monde', ['aime'], 'fr')).toBe('Car Dieu a tant <mark>aimé</mark> le monde');
  });
});

// Search quality, when the data has been built (pnpm data). Queries use each translation's own wording.
const FAMOUS: Record<Exclude<UiLang, 'en' | 'es'>, [string, string][]> = {
  pt: [
    ['o SENHOR é meu pastor', 'Salmos 23:1'],
    ['Deus amou ao mundo de tal maneira', 'João 3:16'],
    ['posso todas as coisas em Cristo', 'Filipenses 4:13'],
    ['vinde a mim todos vós que estais cansados', 'Mateus 11:28'],
    ['o amor é paciente, é bondoso', '1 Coríntios 13:4'],
  ],
  fr: [
    ['le SEIGNEUR est mon berger', 'Psaumes 23:1'],
    ['Dieu a tant aimé le monde', 'Jean 3:16'],
    ['je peux tout par Christ qui me fortifie', 'Philippiens 4:13'],
    ['venez à moi vous tous qui êtes fatigués et chargés', 'Matthieu 11:28'],
    ['l’amour est patient', '1 Corinthiens 13:4'],
  ],
  de: [
    ['der HERR ist mein Hirte', 'Psalmen 23:1'],
    ['also hat Gott die Welt geliebt', 'Johannes 3:16'],
    ['ich vermag alles durch den der mich mächtig macht', 'Philipper 4:13'],
    ['kommet her zu mir alle die ihr mühselig und beladen seid', 'Matthäus 11:28'],
    ['die Liebe ist langmütig und freundlich', '1. Korinther 13:4'],
  ],
  it: [
    ['l’Eterno è il mio pastore', 'Salmi 23:1'],
    ['Iddio ha tanto amato il mondo', 'Giovanni 3:16'],
    ['io posso ogni cosa in Colui che mi fortifica', 'Filippesi 4:13'],
    ['venite a me voi tutti che siete travagliati', 'Matteo 11:28'],
    ['la carità è paziente, è benigna', '1 Corinzi 13:4'],
  ],
};

describe.each(Object.entries(FAMOUS))('%s search', (lang, cases) => {
  const tr = defaultTranslationFor(lang);
  const words = `public/search/words-${lang}.json`;
  it.skipIf(!existsSync(words)).each(cases)('“%s” finds %s', (q, want) => {
    const rows = loadRows(words);
    const display = new Map(loadRows(`public/search/${tr}.json`).map((r) => [verseKey(r[0], r[1], r[2]), r[3]]));
    const h = search(indexFor(lang, rows), rows, display, q, 5, lang).hits[0];
    expect(h && `${bookName(h.b, lang)} ${h.c}:${h.v}`).toBe(want);
  });
});

const rowCache = new Map<string, SearchRow[]>();
const loadRows = (file: string) => {
  if (!rowCache.has(file)) rowCache.set(file, JSON.parse(readFileSync(file, 'utf8')));
  return rowCache.get(file)!;
};
const indexCache = new Map<string, ReturnType<typeof buildIndex>>();
const indexFor = (lang: string, rows: SearchRow[]) => {
  if (!indexCache.has(lang)) indexCache.set(lang, buildIndex(rows, lang));
  return indexCache.get(lang)!;
};
