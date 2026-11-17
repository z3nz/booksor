import { BOOKS } from './books.ts';
import type { Book, Reference } from './types.ts';

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every exact name, slug and abbreviation -> book. */
const aliases = new Map<string, Book>();
for (const b of BOOKS) {
  for (const key of [b.name, b.slug, ...b.abbr]) aliases.set(squash(key), b);
}
const names = BOOKS.map((b) => [squash(b.name), b] as const);

const NUMBER_WORDS: Record<string, string> = {
  first: '1', '1st': '1', i: '1',
  second: '2', '2nd': '2', ii: '2',
  third: '3', '3rd': '3', iii: '3',
};

/** Find a book from what the user typed ("1 cor", "jn", "song of songs", "phil"). */
export function findBook(input: string): Book | null {
  let s = input.toLowerCase().replace(/\./g, ' ').trim().replace(/\s+/g, ' ');
  // "first john", "ii cor", "1st peter" -> "1 john", "2 cor", "1 peter"
  const word = s.match(/^(first|second|third|1st|2nd|3rd|iii|ii|i) (?=[a-z])/);
  if (word) s = NUMBER_WORDS[word[1]] + s.slice(word[0].length - 1);
  const key = squash(s);
  if (!key) return null;
  const exact = aliases.get(key);
  if (exact) return exact;
  // Prefix of a full name: "gene" -> Genesis, "1 thes" -> 1 Thessalonians
  if (key.replace(/^\d/, '').length < 2) return null;
  return names.find(([name]) => name.startsWith(key))?.[1] ?? null;
}

const TAIL = /^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/;

/**
 * Parse a Bible reference. Returns null if it isn't one.
 * Handles: "jn 3:16", "john 3 16", "1 cor 13:4-7", "rom 8:38-9:1", "ps 23", "jude 5", "genesis".
 */
export function parseReference(input: string): Reference | null {
  const s = input
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .trim()
    .replace(/[\s:.,-]+$/, ''); // forgive a half-typed "john 3:"
  // Book part may start with a number ("1 cor"); then letters/spaces; then an optional numeric tail.
  const m = s.match(/^((?:[1-3]\s*)?[a-z][a-z .]*?)\s*(\d[\d\s:.,-]*)?$/);
  if (!m) return null;
  const book = findBook(m[1]);
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

/** "John 3:16-18", "Romans 8:38-9:1", "Psalms 23" */
export function formatReference(ref: Reference): string {
  if (ref.bookOnly) return ref.book.name;
  let out = `${ref.book.name} ${ref.chapter}`;
  if (ref.verse) out += `:${ref.verse}`;
  if (ref.endChapter) out += `-${ref.endChapter}${ref.endVerse ? `:${ref.endVerse}` : ''}`;
  else if (ref.endVerse) out += `-${ref.endVerse}`;
  return out;
}
