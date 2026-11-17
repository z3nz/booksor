// Parses the downloaded eBible.org files into data/bible.sqlite.
// Run with: node scripts/build-db.ts
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import translations from '../data/translations.json' with { type: 'json' };
import { BOOKS, bookIndex } from '../src/lib/books.ts';

const DATA = join(import.meta.dirname, '..', 'data');
const DB_PATH = join(DATA, 'bible.sqlite');

rmSync(DB_PATH, { force: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE translations (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE verses (
    tr TEXT NOT NULL,
    book INTEGER NOT NULL,   -- index into BOOKS (0 = Genesis)
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL,
    para INTEGER NOT NULL DEFAULT 0,  -- 1 = starts a paragraph
    PRIMARY KEY (tr, book, chapter, verse)
  ) WITHOUT ROWID;
`);

const insertTr = db.prepare('INSERT INTO translations (id, json) VALUES (?, ?)');
const insertVerse = db.prepare('INSERT INTO verses (tr, book, chapter, verse, text, para) VALUES (?, ?, ?, ?, ?, ?)');
const LINE = /^(\S+) (\d+):(\d+)\s?(.*)$/;

let problems = 0;
db.exec('BEGIN');
for (const t of translations) {
  insertTr.run(t.id, JSON.stringify(t));
  const lines = readFileSync(join(DATA, 'raw', `${t.source}_vpl.txt`), 'utf8').split(/\r?\n/);
  const maxChapter = new Map<number, number>();
  let count = 0;
  let skipped = 0;
  for (const line of lines) {
    const m = line.match(LINE);
    if (!m) continue;
    const book = bookIndex.get(m[1]);
    if (book === undefined) {
      skipped++; // deuterocanonical/apocryphal books aren't in the MVP
      continue;
    }
    const para = m[4].includes('¶');
    const text = m[4].replace(/¶/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue; // verse omitted by this translation
    const chapter = Number(m[2]);
    insertVerse.run(t.id, book, chapter, Number(m[3]), text, para ? 1 : 0);
    maxChapter.set(book, Math.max(maxChapter.get(book) ?? 0, chapter));
    count++;
  }
  for (const [i, b] of BOOKS.entries()) {
    if (maxChapter.get(i) !== b.chapters) {
      console.warn(`  ! ${t.abbr} ${b.name}: expected ${b.chapters} chapters, found ${maxChapter.get(i) ?? 0}`);
      problems++;
    }
  }
  console.log(`✓ ${t.abbr}: ${count.toLocaleString()} verses${skipped ? ` (skipped ${skipped} verses from extra books)` : ''}`);
}
db.exec('COMMIT');

// Sanity check: John 3:16 in every translation
const john = bookIndex.get('JOH')!;
const q = db.prepare('SELECT tr, text FROM verses WHERE book = ? AND chapter = 3 AND verse = 16');
for (const row of q.all(john)) console.log(`  ${String(row.tr).toUpperCase()} John 3:16 — ${row.text}`);

db.close();
if (problems) {
  console.error(`${problems} problem(s) found`);
  process.exit(1);
}
