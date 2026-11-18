// Build-time only: Astro pages read the Bible text from SQLite while generating static HTML.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Verse } from './types.ts';

let db: DatabaseSync | undefined;

function open(): DatabaseSync {
  db ??= new DatabaseSync(join(process.cwd(), 'data', 'bible.sqlite'), { readOnly: true });
  return db;
}

interface Row {
  verse: number;
  text: string;
  para: number;
}

const toVerse = (r: Row): Verse => (r.para ? { v: r.verse, t: r.text, p: true } : { v: r.verse, t: r.text });

/** All verses in a chapter. `book` is the index into BOOKS. */
export function getChapter(tr: string, book: number, chapter: number): Verse[] {
  const rows = open()
    .prepare('SELECT verse, text, para FROM verses WHERE tr = ? AND book = ? AND chapter = ? ORDER BY verse')
    .all(tr, book, chapter) as unknown as Row[];
  return rows.map(toVerse);
}

/** Verses `from`..`to` (inclusive) within one chapter. */
export function getVerses(tr: string, book: number, chapter: number, from: number, to = from): Verse[] {
  const rows = open()
    .prepare(
      'SELECT verse, text, para FROM verses WHERE tr = ? AND book = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse',
    )
    .all(tr, book, chapter, from, to) as unknown as Row[];
  return rows.map(toVerse);
}

export function getAllVerses(tr: string) {
  return open()
    .prepare('SELECT book, chapter, verse, text FROM verses WHERE tr = ? ORDER BY book, chapter, verse')
    .all(tr) as unknown as { book: number; chapter: number; verse: number; text: string }[];
}

export interface XrefRow {
  verse: number;
  to_book: number;
  to_chapter: number;
  to_verse: number;
  end_chapter: number;
  end_verse: number;
  votes: number;
}

/** Every cross-reference from a chapter, most helpful first for each verse */
export function getChapterXrefs(book: number, chapter: number): XrefRow[] {
  return open()
    .prepare(
      `SELECT verse, to_book, to_chapter, to_verse, end_chapter, end_verse, votes FROM xrefs
       WHERE book = ? AND chapter = ? ORDER BY verse, votes DESC, to_book, to_chapter, to_verse`,
    )
    .all(book, chapter) as unknown as XrefRow[];
}

/** How many cross-references each verse in a chapter has */
export function getXrefCounts(book: number, chapter: number): Map<number, number> {
  const rows = open()
    .prepare('SELECT verse, COUNT(*) AS n FROM xrefs WHERE book = ? AND chapter = ? GROUP BY verse')
    .all(book, chapter) as unknown as { verse: number; n: number }[];
  return new Map(rows.map((r) => [r.verse, r.n]));
}
