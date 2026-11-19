// Search logic shared by the browser worker, the build script and the tests.
//
// Every verse is indexed once, using the words from *all* translations in that language,
// so a quote in any wording finds the verse. Results are shown in the reader's translation.
import MiniSearch, { type SearchResult } from 'minisearch';
import { verseKey } from './books.ts';
import { processTermFor, words } from './terms.ts';
import type { SearchRow } from './types.ts';

export { combineWords, highlight, processTerm, processTermFor, stem } from './terms.ts';

export type SearchIndex = MiniSearch<{ id: number; t: string }>;

/** `rows` are the combined-words rows: [book, chapter, verse, words]. */
export function buildIndex(rows: SearchRow[], lang: string = 'en'): SearchIndex {
  const index: SearchIndex = new MiniSearch({ fields: ['t'], processTerm: processTermFor(lang) });
  index.addAll(rows.map((r, id) => ({ id, t: r[3] })));
  return index;
}

export { verseKey };

export interface SearchHit {
  b: number;
  c: number;
  v: number;
  /** Verse text in the reader's translation */
  t: string;
  /** Index terms that matched, for highlighting */
  terms: string[];
  /** True when the match came from another translation's wording */
  otherWording: boolean;
}

export interface SearchOutcome {
  hits: SearchHit[];
  total: number;
  /** No verse had every word; these are the closest matches */
  partial: boolean;
}

const normalize = (s: string) => words(s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()).join(' ');

export function search(
  index: SearchIndex,
  rows: SearchRow[],
  display: Map<string, string>,
  q: string,
  limit = 30,
  lang = 'en',
): SearchOutcome {
  const processTerm = processTermFor(lang);
  const options = {
    // Only the word being typed is treated as a prefix ("lov" -> love, loved, loveth)
    prefix: (_term: string, i: number, terms: string[]) => i === terms.length - 1,
    fuzzy: (term: string) => (term.length > 4 ? 0.2 : false),
    // Partial-word and typo matches count much less than exact words, so "love" ranks verses
    // about love above verses that only contain "lovingkindness"
    weights: { prefix: 0.1, fuzzy: 0.3 },
    combineWith: 'AND' as const,
  };
  let results: SearchResult[] = index.search(q, options);
  const partial = !results.length;
  if (partial) results = index.search(q, { ...options, combineWith: 'OR' });

  const phrase = normalize(q);
  const queryTerms = words(q)
    .map(processTerm)
    .filter((t): t is string => !!t);
  const last = queryTerms.length - 1;

  const ranked = [];
  for (const r of results.slice(0, 500)) {
    const [b, c, v] = rows[r.id];
    const text = display.get(verseKey(b, c, v));
    if (text === undefined) continue; // verse not in this translation
    const here = new Set(words(text).map(processTerm));
    // A small nudge toward verses whose wording in the reader's own translation uses the query
    // words. Kept small (tuned against tests/search.test.ts) so quotes from other translations
    // still win; the word still being typed gets less for a partial match.
    let score = r.score;
    let otherWording = false;
    queryTerms.forEach((t, i) => {
      if (here.has(t)) score += 3;
      else if (i === last && [...here].some((h) => h?.startsWith(t))) score += 1;
      else otherWording = true; // this word only appears in another translation's wording
    });
    // Exact phrase in the reader's translation goes first
    if (phrase.includes(' ') && normalize(text).includes(phrase)) score += 1000;
    // For closest matches, verses matching more of the query words come first
    if (partial) score += r.queryTerms.length * 100;
    ranked.push({ b, c, v, text, score, terms: r.terms, otherWording });
  }
  ranked.sort((a, z) => z.score - a.score);

  return {
    partial,
    total: results.length,
    hits: ranked.slice(0, limit).map(({ b, c, v, text, terms, otherWording }) => ({ b, c, v, t: text, terms, otherWording })),
  };
}
