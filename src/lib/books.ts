import type { Book, Testament } from './types.ts';

// [code, name, chapters, extra abbreviations]
const OT: [string, string, number, string[]][] = [
  ['GEN', 'Genesis', 50, ['gen', 'ge', 'gn']],
  ['EXO', 'Exodus', 40, ['ex', 'exo', 'exod']],
  ['LEV', 'Leviticus', 27, ['lev', 'le', 'lv']],
  ['NUM', 'Numbers', 36, ['num', 'nu', 'nm', 'nb']],
  ['DEU', 'Deuteronomy', 34, ['deut', 'dt', 'de']],
  ['JOS', 'Joshua', 24, ['josh', 'jos', 'jsh']],
  ['JDG', 'Judges', 21, ['judg', 'jdg', 'jg', 'jdgs']],
  ['RUT', 'Ruth', 4, ['rth', 'ru']],
  ['1SA', '1 Samuel', 31, ['1sam', '1sa', '1sm', '1s']],
  ['2SA', '2 Samuel', 24, ['2sam', '2sa', '2sm', '2s']],
  ['1KI', '1 Kings', 22, ['1kgs', '1ki', '1kin', '1k']],
  ['2KI', '2 Kings', 25, ['2kgs', '2ki', '2kin', '2k']],
  ['1CH', '1 Chronicles', 29, ['1chr', '1chron', '1ch']],
  ['2CH', '2 Chronicles', 36, ['2chr', '2chron', '2ch']],
  ['EZR', 'Ezra', 10, ['ezr']],
  ['NEH', 'Nehemiah', 13, ['neh', 'ne']],
  ['EST', 'Esther', 10, ['esth', 'est', 'es']],
  ['JOB', 'Job', 42, ['jb']],
  ['PSA', 'Psalms', 150, ['ps', 'psa', 'psalm', 'pss', 'psm']],
  ['PRO', 'Proverbs', 31, ['prov', 'pro', 'prv', 'pr']],
  ['ECC', 'Ecclesiastes', 12, ['eccl', 'ecc', 'ec', 'qoh', 'qoheleth']],
  ['SOL', 'Song of Solomon', 8, ['song', 'sos', 'songofsongs', 'canticles', 'ss', 'sng']],
  ['ISA', 'Isaiah', 66, ['isa', 'is']],
  ['JER', 'Jeremiah', 52, ['jer', 'je', 'jr']],
  ['LAM', 'Lamentations', 5, ['lam', 'la']],
  ['EZE', 'Ezekiel', 48, ['ezek', 'eze', 'ezk']],
  ['DAN', 'Daniel', 12, ['dan', 'da', 'dn']],
  ['HOS', 'Hosea', 14, ['hos', 'ho']],
  ['JOE', 'Joel', 3, ['jl', 'joe']],
  ['AMO', 'Amos', 9, ['am']],
  ['OBA', 'Obadiah', 1, ['obad', 'ob']],
  ['JON', 'Jonah', 4, ['jon', 'jnh']],
  ['MIC', 'Micah', 7, ['mic', 'mc']],
  ['NAH', 'Nahum', 3, ['nah', 'na']],
  ['HAB', 'Habakkuk', 3, ['hab', 'hb']],
  ['ZEP', 'Zephaniah', 3, ['zeph', 'zep', 'zp']],
  ['HAG', 'Haggai', 2, ['hag', 'hg']],
  ['ZEC', 'Zechariah', 14, ['zech', 'zec', 'zc']],
  ['MAL', 'Malachi', 4, ['mal', 'ml']],
];

const NT: [string, string, number, string[]][] = [
  ['MAT', 'Matthew', 28, ['matt', 'mt', 'mat']],
  ['MAR', 'Mark', 16, ['mk', 'mrk', 'mr']],
  ['LUK', 'Luke', 24, ['lk', 'luk']],
  ['JOH', 'John', 21, ['jn', 'jhn', 'joh']],
  ['ACT', 'Acts', 28, ['ac', 'act']],
  ['ROM', 'Romans', 16, ['rom', 'ro', 'rm']],
  ['1CO', '1 Corinthians', 16, ['1cor', '1co']],
  ['2CO', '2 Corinthians', 13, ['2cor', '2co']],
  ['GAL', 'Galatians', 6, ['gal', 'ga']],
  ['EPH', 'Ephesians', 6, ['eph', 'ephes']],
  ['PHI', 'Philippians', 4, ['phil', 'php', 'pp']],
  ['COL', 'Colossians', 4, ['col']],
  ['1TH', '1 Thessalonians', 5, ['1thess', '1thes', '1th']],
  ['2TH', '2 Thessalonians', 3, ['2thess', '2thes', '2th']],
  ['1TI', '1 Timothy', 6, ['1tim', '1ti', '1tm']],
  ['2TI', '2 Timothy', 4, ['2tim', '2ti', '2tm']],
  ['TIT', 'Titus', 3, ['tit']],
  ['PHM', 'Philemon', 1, ['philem', 'phm', 'phlm']],
  ['HEB', 'Hebrews', 13, ['heb']],
  ['JAM', 'James', 5, ['jas', 'jm', 'jam']],
  ['1PE', '1 Peter', 5, ['1pet', '1pe', '1pt', '1p']],
  ['2PE', '2 Peter', 3, ['2pet', '2pe', '2pt', '2p']],
  ['1JO', '1 John', 5, ['1jn', '1jo', '1jhn', '1j']],
  ['2JO', '2 John', 1, ['2jn', '2jo', '2jhn', '2j']],
  ['3JO', '3 John', 1, ['3jn', '3jo', '3jhn', '3j']],
  ['JUD', 'Jude', 1, ['jud', 'jd']],
  ['REV', 'Revelation', 22, ['rev', 're', 'rv', 'revelations', 'apocalypse']],
];

const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

const build = (list: typeof OT, testament: Testament): Book[] =>
  list.map(([code, name, chapters, abbr]) => ({
    code,
    slug: slugify(name),
    name,
    chapters,
    testament,
    abbr,
  }));

export const BOOKS: Book[] = [...build(OT, 'OT'), ...build(NT, 'NT')];

export const bookBySlug = new Map(BOOKS.map((b) => [b.slug, b]));
export const bookByCode = new Map(BOOKS.map((b) => [b.code, b]));
export const bookIndex = new Map(BOOKS.map((b, i) => [b.code, i]));

/** Same verse in every translation: book index, chapter, verse. */
export const verseKey = (b: number, c: number, v: number) => `${b}:${c}:${v}`;

/** URL for a chapter, with an optional verse (or verse range) anchor. */
export function chapterUrl(
  translation: string,
  book: Book,
  chapter: number,
  verse?: number,
  endVerse?: number,
): string {
  const hash = verse ? `#v${verse}${endVerse && endVerse !== verse ? `-${endVerse}` : ''}` : '';
  return `/${translation}/${book.slug}/${chapter}${hash}`;
}

/** The chapter before/after this one, crossing book boundaries. */
export function adjacentChapter(book: Book, chapter: number, step: 1 | -1) {
  const i = BOOKS.indexOf(book);
  const next = chapter + step;
  if (next >= 1 && next <= book.chapters) return { book, chapter: next };
  const other = BOOKS[i + step];
  if (!other) return null;
  return { book: other, chapter: step === 1 ? 1 : other.chapters };
}
