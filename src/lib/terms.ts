// Word handling shared by search, highlighting and the build script.
// Kept separate from search.ts so pages can highlight without loading the search library.
import { escapeHtml } from './text.ts';

/**
 * Very common words match almost every verse, so they're left out. Pronouns like "I" and "you"
 * stay in: they matter in quotes ("for I know the plans I have for you").
 */
export const STOP_WORDS = new Set(
  'a an and are as at be by for from in is it of on or that the this to unto was were with'.split(' '),
);

/** KJV-era words mapped to the modern word people usually type. */
const ARCHAIC: Record<string, string> = {
  thee: 'you',
  thou: 'you',
  ye: 'you',
  thy: 'your',
  thine: 'your',
  hath: 'has',
  hast: 'have',
  doth: 'does',
  dost: 'do',
  art: 'are',
  shalt: 'shall',
  wilt: 'will',
  saith: 'says',
  spake: 'spoke',
};

/**
 * A light stemmer so different forms of a word match:
 * believeth / believes / believed / believe -> "believ", strengtheneth / strengthens -> "strengthen".
 * It only has to be consistent (the same function runs on verses and queries), not linguistically perfect.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5) w = w.replace(/(eth|est)$/, '');
  if (w.length > 4) w = w.replace(/ies$/, 'y');
  if (w.length > 4) w = w.replace(/(ing|ed)$/, '');
  if (w.length > 3) w = w.replace(/e?s$/, '');
  if (w.length > 3) w = w.replace(/e$/, '');
  return w;
}

/** Turns one word into its index term, or null to skip it. */
export function processTerm(term: string): string | null {
  let t = term.toLowerCase();
  t = ARCHAIC[t] ?? t;
  if (STOP_WORDS.has(t)) return null;
  return stem(t);
}

const WORD = /[\p{L}\p{N}]+/gu;
export const words = (text: string) => text.match(WORD) ?? [];

/** One search entry per verse: the distinct terms from every translation, as plain words. */
export function combineWords(texts: string[]): string {
  const byTerm = new Map<string, string>();
  for (const text of texts) {
    for (const w of words(text)) {
      const t = processTerm(w);
      if (t && !byTerm.has(t)) byTerm.set(t, w.toLowerCase());
    }
  }
  return [...byTerm.values()].join(' ');
}

/** Escaped HTML with every word whose index term matched wrapped in <mark>. */
export function highlight(text: string, terms: string[]): string {
  const set = new Set(terms);
  return text.replace(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu, (chunk) => {
    const html = escapeHtml(chunk);
    if (!/^[\p{L}\p{N}]/u.test(chunk)) return html;
    const t = processTerm(chunk);
    return t && set.has(t) ? `<mark>${html}</mark>` : html;
  });
}
