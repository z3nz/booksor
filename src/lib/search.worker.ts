// Runs in a Web Worker so building the search index never freezes the page.
// Loads two files: the combined words for the language (what we search) and
// the reader's translation (what we show).
import { buildIndex, search, verseKey, type SearchHit, type SearchIndex } from './search.ts';
import { translationById } from './translations.ts';
import type { SearchRow } from './types.ts';

export type { SearchHit };

export type SearchRequest =
  | { type: 'load'; tr: string }
  | { type: 'search'; id: number; tr: string; q: string }
  | { type: 'lookup'; id: number; tr: string; book: number; chapter: number; verse: number; endVerse?: number };

export type SearchResponse =
  | { type: 'ready'; tr: string }
  | { type: 'results'; id: number; hits: SearchHit[]; total: number; partial: boolean }
  | { type: 'lookup'; id: number; text: string | null }
  | { type: 'error'; message: string };

const post = (msg: SearchResponse) => self.postMessage(msg);

async function fetchRows(path: string): Promise<SearchRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load search data (${res.status})`);
  return res.json();
}

/** Cache a promise, but forget it if it fails so the next attempt retries. */
function cached<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

const indexes = new Map<string, Promise<{ rows: SearchRow[]; index: SearchIndex }>>();
const displays = new Map<string, Promise<Map<string, string>>>();

const loadIndex = (lang: string) =>
  cached(indexes, lang, async () => {
    const rows = await fetchRows(`/search/words-${lang}.json`);
    return { rows, index: buildIndex(rows, lang) };
  });

const loadDisplay = (tr: string) =>
  cached(displays, tr, async () => new Map((await fetchRows(`/search/${tr}.json`)).map((r) => [verseKey(r[0], r[1], r[2]), r[3]])));

async function load(tr: string) {
  const lang = translationById.get(tr)?.language ?? 'en';
  const [{ rows, index }, display] = await Promise.all([loadIndex(lang), loadDisplay(tr)]);
  return { rows, index, display, lang };
}

self.onmessage = async (e: MessageEvent<SearchRequest>) => {
  const msg = e.data;
  try {
    const { rows, index, display, lang } = await load(msg.tr);
    if (msg.type === 'load') {
      post({ type: 'ready', tr: msg.tr });
    } else if (msg.type === 'search') {
      post({ type: 'results', id: msg.id, ...search(index, rows, display, msg.q, 30, lang) });
    } else if (msg.type === 'lookup') {
      const parts: string[] = [];
      for (let v = msg.verse; v <= (msg.endVerse ?? msg.verse) && parts.length < 6; v++) {
        const text = display.get(verseKey(msg.book, msg.chapter, v));
        if (text) parts.push(text);
      }
      post({ type: 'lookup', id: msg.id, text: parts.length ? parts.join(' ') : null });
    }
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
