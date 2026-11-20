import { bookAliases, bookName, uiLang, type UiLang } from '../i18n/index.ts';
import { BOOKS } from './books.ts';
import type { Book, Reference } from './types.ts';

/** Lowercase, no accents: "Éxodo" → "exodo" */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const squash = (s: string) => fold(s).replace(/[^a-z0-9]/g, '');

/** Lowercase, accents kept, only letters and digits: "1 Jó" → "1jó" */
const tight = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

interface Names {
  /** Every exact name and abbreviation, accents kept -> book. Checked first: Portuguese "Jó" is Job, "Jo" is John. */
  accented: Map<string, Book>;
  /** Every exact name and abbreviation, without accents -> book */
  aliases: Map<string, Book>;
  /** Full names, for prefixes ("gene" -> Genesis) */
  names: (readonly [string, Book])[];
}
const byLang = new Map<UiLang, Names>();
function namesFor(lang: UiLang): Names {
  let n = byLang.get(lang);
  if (!n) {
    const accented = new Map<string, Book>();
    const aliases = new Map<string, Book>();
    for (const [alias, book] of bookAliases(lang)) {
      if (!accented.has(tight(alias))) accented.set(tight(alias), book);
      if (!aliases.has(squash(alias))) aliases.set(squash(alias), book);
    }
    n = { accented, aliases, names: BOOKS.map((b) => [squash(bookName(b, lang)), b] as const) };
    byLang.set(lang, n);
  }
  return n;
}

/** Ordinal words before a book name ("first john", "primera de corintios", "zweiter korinther"), without accents */
const NUMBER_WORDS: Record<string, string> = {
  first: '1', '1st': '1', i: '1', second: '2', '2nd': '2', ii: '2', third: '3', '3rd': '3', iii: '3',
  // Spanish, Portuguese
  primero: '1', primera: '1', primer: '1', primeiro: '1', primeira: '1',
  segundo: '2', segunda: '2', tercero: '3', tercera: '3', tercer: '3', terceiro: '3', terceira: '3',
  // French
  premier: '1', premiere: '1', deuxieme: '2', seconde: '2', troisieme: '3',
  // German
  erste: '1', erster: '1', ersten: '1', erstes: '1', zweite: '2', zweiter: '2', zweiten: '2', zweites: '2',
  dritte: '3', dritter: '3', dritten: '3', drittes: '3',
  // Italian
  primo: '1', prima: '1', secondo: '2', seconda: '2', terzo: '3', terza: '3',
};
const ORDINAL = new RegExp(
  `^(${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')}) (?:(?:de|aux?|ai|agli|an die) )?(?=[a-z])`,
);

/**
 * Find a book from what the user typed ("1 cor", "jn", "song of songs", "phil"; in other languages also
 * "Éxodo", "1 Co", "Hch", "1. Mose", "Jó"). Names in the page's language come first, then English.
 */
export function findBook(input: string, lang: string = 'en'): Book | null {
  const langs: UiLang[] = uiLang(lang) === 'en' ? ['en'] : [uiLang(lang), 'en'];
  const typed = tight(input);
  for (const l of langs) {
    const exact = namesFor(l).accented.get(typed);
    if (exact) return exact;
  }
  let s = fold(input).replace(/\./g, ' ').trim().replace(/\s+/g, ' ');
  // "first john", "ii cor", "1st peter", "primera de corintios" -> "1 john", "2 cor", "1 peter", "1 corintios"
  const word = s.match(ORDINAL);
  if (word) s = NUMBER_WORDS[word[1]] + ' ' + s.slice(word[0].length);
  const key = squash(s);
  if (!key) return null;
  for (const l of langs) {
    const exact = namesFor(l).aliases.get(key);
    if (exact) return exact;
  }
  // Prefix of a full name: "gene" -> Genesis, "1 thes" -> 1 Thessalonians
  if (key.replace(/^\d/, '').length < 2) return null;
  for (const l of langs) {
    const hit = namesFor(l).names.find(([name]) => name.startsWith(key));
    if (hit) return hit[1];
  }
  return null;
}

const TAIL = /^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/;

/**
 * Parse a Bible reference. Returns null if it isn't one.
 * Handles: "jn 3:16", "john 3 16", "1 cor 13:4-7", "rom 8:38-9:1", "ps 23", "jude 5", "genesis".
 */
export function parseReference(input: string, lang: string = 'en'): Reference | null {
  const s = input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .trim()
    .replace(/[\s:.,-]+$/, ''); // forgive a half-typed "john 3:"
  // Book part may start with a number ("1 cor", German "1. Mose"); then letters/spaces; then an optional numeric tail.
  const m = s.match(/^((?:[1-5]\.?\s*)?\p{L}[\p{L} .]*?)\s*(\d[\d\s:.,-]*)?$/u); // 1-5: German "5. Mose"
  if (!m) return null;
  const book = findBook(m[1], lang);
  if (!book) return null;
  if (!m[2]) return { book, chapter: 1, bookOnly: true };

  let tail = m[2].trim().replace(/\s*([:.,-])\s*/g, '$1').replace(/[.,]/g, ':');
  if (!tail.includes(':')) tail = tail.replace(/^(\d+)\s+(\d+)/, '$1:$2'); // "john 3 16"
  tail = tail.replace(/\s+/g, '');
  const t = tail.match(TAIL);
  if (!t) return null;
  const [a, b, c, d] = t.slice(1).map((x) => (x ? Number(x) : undefined));

  let ref: Reference;
  if (book.chapters === 1 && b === undefined && d === undefined) {
    // "jude 5" / "jude 3-5" mean verses in single-chapter books
    ref = { book, chapter: 1, verse: a, endVerse: c };
  } else if (b === undefined) {
    ref = { book, chapter: a!, endChapter: c };
  } else if (d === undefined) {
    ref = { book, chapter: a!, verse: b, endVerse: c };
  } else {
    ref = { book, chapter: a!, verse: b, endChapter: c, endVerse: d };
  }

  if (ref.chapter < 1 || ref.chapter > book.chapters) return null;
  if (ref.verse === 0) return null;
  if (ref.endChapter !== undefined) {
    if (ref.endChapter <= ref.chapter) {
      // "rom 8:38-8:39" -> same chapter range; "ps 23-22" -> ignore the end
      if (ref.endChapter === ref.chapter && ref.verse) ref.endChapter = undefined;
      else return { book, chapter: ref.chapter, verse: ref.verse };
    } else {
      ref.endChapter = Math.min(ref.endChapter, book.chapters);
    }
  }
  if (ref.endVerse !== undefined && ref.endChapter === undefined && ref.verse && ref.endVerse <= ref.verse) {
    ref.endVerse = undefined;
  }
  return ref;
}

/** "John 3:16-18", "Romans 8:38-9:1", "Psalms 23" (book names in `lang`) */
export function formatReference(ref: Reference, lang: string = 'en'): string {
  const name = bookName(ref.book, lang);
  if (ref.bookOnly) return name;
  let out = `${name} ${ref.chapter}`;
  if (ref.verse) out += `:${ref.verse}`;
  if (ref.endChapter) out += `-${ref.endChapter}${ref.endVerse ? `:${ref.endVerse}` : ''}`;
  else if (ref.endVerse) out += `-${ref.endVerse}`;
  return out;
}
