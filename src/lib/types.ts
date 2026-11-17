export type Testament = 'OT' | 'NT';

export interface Book {
  /** Book code used by eBible.org verse-per-line files, e.g. "JOH" */
  code: string;
  /** URL segment, e.g. "1-corinthians" */
  slug: string;
  name: string;
  chapters: number;
  testament: Testament;
  /** Extra short forms people type, e.g. ["jn", "jhn"] */
  abbr: string[];
}

export interface Translation {
  /** URL segment, e.g. "kjv" */
  id: string;
  abbr: string;
  name: string;
  /** BCP 47 language tag, e.g. "en" */
  language: string;
  languageName: string;
  dir: 'ltr' | 'rtl';
  /** eBible.org file id, e.g. "eng-kjv2006" */
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  /** KJV marks words added by translators with [brackets]; we show them in italics */
  suppliedWords?: boolean;
}

export interface Verse {
  /** Verse number */
  v: number;
  /** Text (may contain [supplied words] for translations that use them) */
  t: string;
  /** Starts a new paragraph */
  p?: boolean;
}

/** One row in the search file: [bookIndex, chapter, verse, plain text] */
export type SearchRow = [number, number, number, string];

export interface Reference {
  book: Book;
  chapter: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
  /** True when only a book name was typed (we go to chapter 1) */
  bookOnly?: boolean;
}
