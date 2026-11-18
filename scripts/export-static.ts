// Writes the files the browser downloads: search data, verse-of-the-day text, and cross-references.
// Run with: node scripts/export-static.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import votd from '../data/votd.json' with { type: 'json' };
import { BOOKS, bookIndex } from '../src/lib/books.ts';
import { getAllVerses, getChapterXrefs, getVerses } from '../src/lib/db.ts';
import { formatReference, parseReference } from '../src/lib/reference.ts';
import { combineWords, verseKey } from '../src/lib/search.ts';
import { plainText } from '../src/lib/text.ts';
import { TRANSLATIONS } from '../src/lib/translations.ts';
import type { SearchRow } from '../src/lib/types.ts';
import type { XrefFile, XrefTarget } from '../src/lib/xref.ts';

const PUBLIC = join(import.meta.dirname, '..', 'public');
mkdirSync(join(PUBLIC, 'search'), { recursive: true });
mkdirSync(join(PUBLIC, 'votd'), { recursive: true });

let problems = 0;
for (const t of TRANSLATIONS) {
  const rows: SearchRow[] = getAllVerses(t.id).map((r) => [r.book, r.chapter, r.verse, plainText(r.text, t.suppliedWords)]);
  const json = JSON.stringify(rows);
  writeFileSync(join(PUBLIC, 'search', `${t.id}.json`), json);
  console.log(`✓ search/${t.id}.json — ${rows.length.toLocaleString()} verses, ${(json.length / 1e6).toFixed(1)} MB`);

  const days = [];
  for (const s of votd) {
    const ref = parseReference(s);
    if (!ref?.verse || ref.endChapter) {
      console.warn(`  ! verse of the day "${s}" isn't a single-chapter verse reference`);
      problems++;
      continue;
    }
    const verses = getVerses(t.id, bookIndex.get(ref.book.code)!, ref.chapter, ref.verse, ref.endVerse);
    const expected = (ref.endVerse ?? ref.verse) - ref.verse + 1;
    if (verses.length !== expected) {
      console.warn(`  ! ${t.abbr} is missing verses for "${s}"`);
      problems++;
    }
    days.push({
      ref: formatReference(ref),
      slug: ref.book.slug,
      chapter: ref.chapter,
      verse: ref.verse,
      endVerse: ref.endVerse,
      text: verses.map((v) => plainText(v.t, t.suppliedWords)).join(' '),
    });
  }
  writeFileSync(join(PUBLIC, 'votd', `${t.id}.json`), JSON.stringify(days));
  console.log(`✓ votd/${t.id}.json — ${days.length} verses`);
}
// One combined search file per language: each verse's distinct words across every translation,
// so a quote in any translation's wording finds the verse.
const byLanguage = Map.groupBy(TRANSLATIONS, (t) => t.language);
for (const [lang, trs] of byLanguage) {
  const texts = new Map<string, { b: number; c: number; v: number; texts: string[] }>();
  for (const t of trs) {
    for (const r of getAllVerses(t.id)) {
      const key = verseKey(r.book, r.chapter, r.verse);
      let entry = texts.get(key);
      if (!entry) texts.set(key, (entry = { b: r.book, c: r.chapter, v: r.verse, texts: [] }));
      entry.texts.push(plainText(r.text, t.suppliedWords));
    }
  }
  const rows: SearchRow[] = [...texts.values()]
    .sort((x, y) => x.b - y.b || x.c - y.c || x.v - y.v)
    .map((e) => [e.b, e.c, e.v, combineWords(e.texts)]);
  const json = JSON.stringify(rows);
  writeFileSync(join(PUBLIC, 'search', `words-${lang}.json`), json);
  console.log(`✓ search/words-${lang}.json — ${rows.length.toLocaleString()} verses from ${trs.map((t) => t.abbr).join(', ')}, ${(json.length / 1e6).toFixed(1)} MB`);
}

// Cross-references: one small file per chapter (the same for every translation). The reader shows each
// passage's text from search/{tr}.json, which it already has for search and offline reading.
let xrefBytes = 0;
for (const [b, book] of BOOKS.entries()) {
  const dir = join(PUBLIC, 'xref', book.slug);
  mkdirSync(dir, { recursive: true });
  for (let c = 1; c <= book.chapters; c++) {
    const file: XrefFile = { refs: {}, targets: [] };
    const index = new Map<string, number>();
    for (const r of getChapterXrefs(b, c)) {
      const key = `${r.to_book}.${r.to_chapter}.${r.to_verse}-${r.end_chapter}.${r.end_verse}`;
      let i = index.get(key);
      if (i === undefined) {
        const target: XrefTarget = [r.to_book, r.to_chapter, r.to_verse, r.end_chapter, r.end_verse];
        index.set(key, (i = file.targets.push(target) - 1));
      }
      (file.refs[r.verse] ??= []).push([i, r.votes]);
    }
    const json = JSON.stringify(file);
    writeFileSync(join(dir, `${c}.json`), json);
    xrefBytes += json.length;
  }
}
console.log(`✓ xref/ — ${BOOKS.reduce((n, b) => n + b.chapters, 0)} chapters, ${(xrefBytes / 1e6).toFixed(1)} MB`);

if (problems) process.exit(1);
