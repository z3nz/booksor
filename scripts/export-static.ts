// Writes the files the browser downloads: search data and verse-of-the-day text.
// Run with: node scripts/export-static.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import votd from '../data/votd.json' with { type: 'json' };
import { bookIndex } from '../src/lib/books.ts';
import { getAllVerses, getVerses } from '../src/lib/db.ts';
import { formatReference, parseReference } from '../src/lib/reference.ts';
import { plainText } from '../src/lib/text.ts';
import { TRANSLATIONS } from '../src/lib/translations.ts';
import type { SearchRow } from '../src/lib/types.ts';

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
if (problems) process.exit(1);
