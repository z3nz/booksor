// Runs in a Web Worker so building the search index never freezes the page.
import MiniSearch, { type SearchResult } from 'minisearch';
import type { SearchRow } from './types.ts';

export type SearchRequest =
  | { type: 'load'; tr: string }
  | { type: 'search'; id: number; tr: string; q: string }
  | { type: 'lookup'; id: number; tr: string; book: number; chapter: number; verse: number; endVerse?: number };

export interface SearchHit {
  b: number;
  c: number;
  v: number;
  t: string;
  terms: string[];
}

export type SearchResponse =
  | { type: 'ready'; tr: string }
  | { type: 'results'; id: number; hits: SearchHit[]; total: number; partial: boolean }
  | { type: 'lookup'; id: number; text: string | null }
  | { type: 'error'; message: string };

interface Loaded {
  rows: SearchRow[];
  index: MiniSearch<{ id: number; t: string }>;
  byRef: Map<string, number>;
}

const MAX_RESULTS = 30;

// Very common words match almost every verse, so they're left out of the index.
// Exact phrases still rank first because the phrase check below uses the full text.
const STOP_WORDS = new Set(
  'a an and are as at be by for from in is it of on or that the this to unto was were with'.split(' '),
);
const processTerm = (term: string) => {
  const t = term.toLowerCase();
  return STOP_WORDS.has(t) ? null : t;
};
const cache = new Map<string, Promise<Loaded>>();
const post = (msg: SearchResponse) => self.postMessage(msg);

function load(tr: string): Promise<Loaded> {
  let p = cache.get(tr);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/search/${tr}.json`);
      if (!res.ok) throw new Error(`Could not load search data (${res.status})`);
      const rows = (await res.json()) as SearchRow[];
      const index = new MiniSearch<{ id: number; t: string }>({ fields: ['t'], processTerm });
      index.addAll(rows.map((r, id) => ({ id, t: r[3] })));
      const byRef = new Map(rows.map((r, i) => [`${r[0]}:${r[1]}:${r[2]}`, i]));
      post({ type: 'ready', tr });
      return { rows, index, byRef };
    })();
    p.catch(() => cache.delete(tr));
    cache.set(tr, p);
  }
  return p;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function search({ rows, index }: Loaded, q: string) {
  const options = {
    // Only the word being typed is treated as a prefix ("lov" -> love, loved, loveth)
    prefix: (_term: string, i: number, terms: string[]) => i === terms.length - 1,
    fuzzy: (term: string) => (term.length > 4 ? 0.2 : false),
    combineWith: 'AND' as const,
  };
  let hits: SearchResult[] = index.search(q, options);
  // No verse has every word: show verses matching the most words instead, and say so
  const partial = !hits.length;
  if (partial) hits = index.search(q, { ...options, combineWith: 'OR' });

  // Exact phrase matches go to the top
  const phrase = normalize(q);
  const ranked = hits.slice(0, 400).map((h) => ({
    h,
    score: h.score + (phrase.includes(' ') && normalize(rows[h.id][3]).includes(phrase) ? 1000 : 0),
  }));
  ranked.sort((a, b) => b.score - a.score);

  return {
    partial,
    total: hits.length,
    hits: ranked.slice(0, MAX_RESULTS).map(({ h }) => {
      const [b, c, v, t] = rows[h.id];
      return { b, c, v, t, terms: h.terms };
    }),
  };
}

self.onmessage = async (e: MessageEvent<SearchRequest>) => {
  const msg = e.data;
  try {
    const data = await load(msg.tr);
    if (msg.type === 'search') {
      post({ type: 'results', id: msg.id, ...search(data, msg.q) });
    } else if (msg.type === 'lookup') {
      const parts: string[] = [];
      for (let v = msg.verse; v <= (msg.endVerse ?? msg.verse) && parts.length < 6; v++) {
        const i = data.byRef.get(`${msg.book}:${msg.chapter}:${v}`);
        if (i !== undefined) parts.push(data.rows[i][3]);
      }
      post({ type: 'lookup', id: msg.id, text: parts.length ? parts.join(' ') : null });
    }
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
