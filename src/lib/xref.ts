// Cross-references: passages related to a verse, from OpenBible.info (CC BY), ranked by readers' votes.
//
// scripts/export-static.ts writes one small file per chapter, the same for every translation, listing
// each verse's related passages. Their text comes from search/{tr}.json, the whole translation's text,
// which search and offline reading already use; it's loaded the first time someone opens the list.
import { bookName } from '../i18n/index.ts';
import { BOOKS, chapterUrl, verseKey } from './books.ts';
import type { SearchRow } from './types.ts';

/** [book, chapter, verse, endChapter, endVerse] */
export type XrefTarget = [number, number, number, number, number];

/** public/xref/{book}/{chapter}.json */
export interface XrefFile {
  /** verse → [index into targets, votes][], most helpful first */
  refs: Record<string, [number, number][]>;
  targets: XrefTarget[];
}

export interface Related {
  target: XrefTarget;
  votes: number;
}

/** Events: open the panel for some verses, and tell it what's selected */
export const XREF_OPEN = 'booksor:xref-open';
export const VERSE_SELECTION = 'booksor:verse-selection';
/** Study mode turned on or off (detail: boolean) */
export const STUDY_EVENT = 'booksor:study';
export interface VerseSelection {
  verses: number[];
}

export const xrefUrl = (slug: string, chapter: number) => `/xref/${slug}/${chapter}.json`;

/**
 * Passages related to the chosen verses, most helpful first. With several verses chosen, passages
 * related to more of them rise to the top; passages inside the chosen verses themselves are left out.
 */
export function relatedTo(file: XrefFile, book: number, chapter: number, verses: number[]): Related[] {
  const chosen = new Set(verses);
  const votes = new Map<number, number>();
  for (const v of verses) {
    for (const [i, n] of file.refs[v] ?? []) votes.set(i, (votes.get(i) ?? 0) + Math.max(n, 1));
  }
  const inside = ([b, c, v, ec, ev]: XrefTarget) => {
    if (b !== book || c !== chapter || ec !== chapter) return false;
    for (let x = v; x <= ev; x++) if (!chosen.has(x)) return false;
    return true;
  };
  return [...votes]
    .map(([i, n]) => ({ target: file.targets[i], votes: n }))
    .filter((r) => r.target && !inside(r.target))
    .sort((a, b) => b.votes - a.votes || a.target[0] - b.target[0] || a.target[1] - b.target[1] || a.target[2] - b.target[2]);
}

/** "Romans 5:8", "1 John 4:9–10", "Hebrews 6:20–7:3" (book names in `lang`) */
export function targetLabel([b, c, v, ec, ev]: XrefTarget, lang = 'en'): string {
  const name = bookName(b, lang);
  if (ec !== c) return `${name} ${c}:${v}–${ec}:${ev}`;
  return ev !== v ? `${name} ${c}:${v}–${ev}` : `${name} ${c}:${v}`;
}

/** Link to the passage, highlighted (just its first verse when it runs into the next chapter) */
export function targetUrl(tr: string, [b, c, v, ec, ev]: XrefTarget): string {
  return chapterUrl(tr, BOOKS[b], c, v, ec === c ? ev : undefined);
}

/** Is `path#hash` (a chapter page, maybe with #v8 or #v9-10) showing this passage? */
export function showsTarget(tr: string, path: string, hash: string, target: XrefTarget): boolean {
  const url = targetUrl(tr, target);
  const [p, h = ''] = url.split('#');
  return path === p && hash.replace(/^#/, '') === h;
}

/** A whole translation's text, for showing related passages */
export interface VerseTexts {
  /** The passage's text, cut after `maxVerses` verses with "…" */
  passage(target: XrefTarget, maxVerses?: number): string;
}

export function verseTexts(rows: SearchRow[]): VerseTexts {
  const at = new Map(rows.map((r, i) => [verseKey(r[0], r[1], r[2]), i]));
  return {
    passage([b, c, v, ec, ev], maxVerses = 6) {
      const start = at.get(verseKey(b, c, v));
      if (start === undefined) return '';
      const parts: string[] = [];
      for (let i = start; i < rows.length; i++) {
        const [rb, rc, rv, text] = rows[i];
        if (rb !== b || rc > ec || (rc === ec && rv > ev)) break;
        if (parts.length === maxVerses) {
          parts.push('…');
          break;
        }
        parts.push(text);
      }
      return parts.join(' ');
    },
  };
}

// Loaded once per visit (pages change without a full reload, so this lasts while you read)
const files = new Map<string, Promise<XrefFile | null>>();
const texts = new Map<string, Promise<VerseTexts | null>>();

function once<T>(cache: Map<string, Promise<T | null>>, url: string, make: (res: Response) => Promise<T>) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => (res.ok ? make(res) : null))
      .catch(() => null);
    // Don't remember a failure (offline, say): try again next time
    void p.then((x) => x ?? cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** One chapter's cross-references */
export const loadXrefs = (slug: string, chapter: number) =>
  once(files, xrefUrl(slug, chapter), (res) => res.json() as Promise<XrefFile>);

/** A translation's text (the same file search uses) */
export const loadVerseTexts = (tr: string) =>
  once(texts, `/search/${tr}.json`, async (res) => verseTexts((await res.json()) as SearchRow[]));
