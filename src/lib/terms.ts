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

// Other languages: accents don't matter when searching ("corazon" finds "corazón", and "a" matches the
// 1909 Spanish spelling "á"), the commonest little words are skipped, and a light rule matches plurals and
// other word endings. Like stem() above, each rule only has to be consistent, not linguistically perfect.
const foldAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
const stopWords = (list: string) => new Set(list.split(' '));

const ES_STOP_WORDS = stopWords('a al de del el en la las lo los y e o u que se un una unos unas con por para su sus');

export function stemEs(word: string): string {
  let w = word;
  if (w.length > 5) w = w.replace(/es$/, '');
  if (w.length > 4) w = w.replace(/s$/, '');
  return w;
}

export function processTermEs(term: string): string | null {
  const t = foldAccents(term.toLowerCase());
  if (ES_STOP_WORDS.has(t)) return null;
  return stemEs(t);
}

// Portuguese: "corações"/"coração" and "pães"/"pão" meet at "-ao"; then plural -s.
const PT_STOP_WORDS = stopWords(
  'a o as os ao aos à às de da do das dos e em no na nos nas um uma uns umas que se por pelo pela pelos pelas para com',
);
export function processTermPt(term: string): string | null {
  const t = foldAccents(term.toLowerCase());
  if (PT_STOP_WORDS.has(t)) return null;
  let w = t;
  if (w.length > 4) w = w.replace(/(oes|aes)$/, 'ao');
  // "pastores"/"pastor", "luzes"/"luz": -es after r, z or s; otherwise a plain -s ("fontes"/"fonte")
  if (w.length > 4) w = /[rzs]es$/.test(w) ? w.slice(0, -2) : w.replace(/s$/, '');
  return w;
}

// French: elisions ("l'Éternel", "qu'il") split into a letter or two plus the word, so those are skipped;
// plurals in -s and -x match the singular.
const FR_STOP_WORDS = stopWords('l d j m n s t c qu le la les de des du un une et en au aux a à que qui se ce');
export function processTermFr(term: string): string | null {
  const t = foldAccents(term.toLowerCase());
  if (FR_STOP_WORDS.has(t)) return null;
  return t.length > 4 ? t.replace(/[sx]$/, '') : t;
}

// German: ß is written ss ("daß" in 1912, "dass" today), umlauts can be typed without the dots, and the
// commonest endings come off ("Liebe", "lieben", "liebet" -> "lieb").
const DE_STOP_WORDS = stopWords('der die das den dem des ein eine einen einem einer eines und oder zu zum zur im in am an auf von mit');
export function processTermDe(term: string): string | null {
  const t = foldAccents(term.toLowerCase().replace(/ß/g, 'ss'));
  if (DE_STOP_WORDS.has(t)) return null;
  return t.length > 4 ? t.replace(/(en|er|es|em|et|e|n|s)$/, '') : t;
}

// Italian: elisions ("dell'uomo", "l'Eterno") are skipped like French; the final vowel comes off so singular and
// plural meet ("cielo"/"cieli" -> "ciel", "parola"/"parole" -> "parol").
const IT_STOP_WORDS = stopWords(
  'l d un il lo la i gli le di a da in con su per tra fra e ed o del dello della dei degli delle al allo alla ai agli alle dal dalla nel nella nei che si uno una dell nell all dall sull',
);
export function processTermIt(term: string): string | null {
  const t = foldAccents(term.toLowerCase());
  if (IT_STOP_WORDS.has(t)) return null;
  return t.length > 4 ? t.replace(/[aeio]$/, '') : t;
}

// Russian: ё is written е, and the commonest case and verb endings come off ("пастух", "пастуха", "пастухи" ->
// "пастух"). Much lighter than a real Russian stemmer, but the same rule runs on verses and queries.
const RU_STOP_WORDS = stopWords('и в во на с со к ко о об от из у за по до не ни же а но да ли бы то что как');
const RU_ENDING =
  /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|иях|ешь|ишь|ете|ите|ают|яют|ует|ила|ала|яла|или|али|ило|ах|ях|ам|ям|ой|ей|ою|ею|ом|ем|ую|юю|ая|яя|ое|ее|ые|ие|ый|ий|ов|ев|ет|ит|ут|ют|ат|ят|ил|ал|ть|ти|а|я|о|е|ы|и|у|ю|ь|й)$/;
export function processTermRu(term: string): string | null {
  const t = term.toLowerCase().replace(/ё/g, 'е');
  if (RU_STOP_WORDS.has(t)) return null;
  if (t.length <= 4) return t;
  const s = t.replace(RU_ENDING, '');
  return s.length >= 3 ? s : t;
}

// Indonesian: words don't inflect, but particles join the word ("kasih-Nya" splits at the hyphen; "kasihnya",
// "dialah" don't), so -nya, -lah, -kah and -pun come off.
const ID_STOP_WORDS = stopWords('yang dan di ke dari untuk dengan itu ini pada dalam adalah akan oleh atau juga');
export function processTermId(term: string): string | null {
  const t = term.toLowerCase();
  if (ID_STOP_WORDS.has(t)) return null;
  return t.length > 5 ? t.replace(/(nya|lah|kah|pun)$/, '') : t;
}

// Vietnamese: one syllable per word. Tone marks are optional when typing ("yeu thuong" finds "yêu thương"), and
// đ is typed d. The exact-phrase bonus still puts the verse with the marks as typed first.
const VI_STOP_WORDS = stopWords('va cua la thi ma cac nhung');
export function processTermVi(term: string): string | null {
  const t = foldAccents(term.toLowerCase()).replace(/đ/g, 'd');
  return VI_STOP_WORDS.has(t) ? null : t;
}

// Swahili and Tagalog: lowercase, skip the commonest little words. Both build words from prefixes and infixes
// that a light rule can't undo, so there's no stemming.
const SW_STOP_WORDS = stopWords('na ya wa la za kwa katika ni cha vya kwamba');
export function processTermSw(term: string): string | null {
  const t = term.toLowerCase();
  return SW_STOP_WORDS.has(t) ? null : t;
}
const TL_STOP_WORDS = stopWords('ang ng mga sa at na si ni ay kay');
export function processTermTl(term: string): string | null {
  const t = term.toLowerCase();
  return TL_STOP_WORDS.has(t) ? null : t;
}

// Chinese has no spaces between words, so each run of characters is indexed as single characters and overlapping
// pairs ("神爱世人" -> 神 爱 世 人 神爱 爱世 世人). A query matches when every character and pair appears, which
// finds the phrase without a dictionary; the exact-phrase bonus in search.ts puts verses with it in order first.
// The commonest particles aren't indexed alone (they still count inside pairs).
const ZH_STOP_CHARS = new Set('的了之而与和');
const HAN = /\p{Script=Han}/u;
export function processTermZh(term: string): string[] | null {
  const out: string[] = [];
  // Runs of Chinese characters, and runs of anything else (digits, Latin)
  for (const run of term.toLowerCase().match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) ?? []) {
    if (!HAN.test(run)) {
      out.push(run);
      continue;
    }
    const chars = [...run];
    chars.forEach((c, i) => {
      if (!ZH_STOP_CHARS.has(c)) out.push(c);
      if (i + 1 < chars.length) out.push(c + chars[i + 1]);
    });
  }
  return out.length ? out : null;
}

// Arabic: vowel marks and the hamza/madda forms of alif are optional ("ٱللَّهُ", "الله" and "اللة" meet), and the
// article and the commonest prefixes and suffixes come off (a light stemmer, after Larkey's "light10").
const normalizeAr = (s: string) =>
  foldAccents(s)
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '');
const AR_STOP_WORDS = stopWords('في من علي الي عن مع ثم او ان هذا هذه ذلك التي الذي');
export function processTermAr(term: string): string | null {
  let t = normalizeAr(term);
  if (AR_STOP_WORDS.has(t)) return null;
  const prefix = t.match(/^(وال|فال|بال|كال|لل|ال|و)/);
  if (prefix && t.length - prefix[0].length >= 3) t = t.slice(prefix[0].length);
  const suffix = t.match(/(ها|هم|كم|ان|ات|ون|ين|يه|ه|ي)$/);
  if (suffix && t.length - suffix[0].length >= 3) t = t.slice(0, -suffix[0].length);
  return t;
}

// Hindi: the nukta and chandrabindu are optional (both are often typed without), and the commonest plural and case
// endings come off ("लोगों" -> "लोग", "बातें" -> "बात").
const HI_STOP_WORDS = stopWords('का की के को में से है हैं और ने पर यह वह भी तो ही था थे थी कि जो एक');
const HI_ENDING = /(ियों|ियाँ|ियां|ाओं|ाएँ|ाएं|ुओं|ों|ें|ीं|ाँ|ां|ी|े|ा|ि|ु|ू)$/;
export function processTermHi(term: string): string | null {
  const t = term.normalize('NFD').replace(/\u093C/g, '').replace(/\u0901/g, '\u0902').normalize('NFC');
  if (HI_STOP_WORDS.has(t)) return null;
  if (t.length <= 3) return t;
  const s = t.replace(HI_ENDING, '');
  return s.length >= 2 ? s : t;
}

/** One word in, its index term(s) out, or null to skip it. Chinese gives several terms per word. */
export type TermProcessor = (term: string) => string | string[] | null;

const PROCESSORS: Record<string, TermProcessor> = {
  es: processTermEs,
  pt: processTermPt,
  fr: processTermFr,
  de: processTermDe,
  it: processTermIt,
  ru: processTermRu,
  id: processTermId,
  vi: processTermVi,
  sw: processTermSw,
  tl: processTermTl,
  zh: processTermZh,
  ar: processTermAr,
  hi: processTermHi,
};

/** The word → index term function for a language */
export const processTermFor = (lang: string = 'en'): TermProcessor => PROCESSORS[lang] ?? processTerm;

/** Every index term for a list of words, in order */
export const termsOf = (lang: string, list: string[]) =>
  list.flatMap((w) => processTermFor(lang)(w) ?? []);

// Letters with their marks (Hindi vowel signs and Arabic vowel marks are marks, not letters) and digits
const WORD = /[\p{L}\p{M}\p{N}]+/gu;
export const words = (text: string) => text.match(WORD) ?? [];

/** One search entry per verse: the distinct terms from every translation, as plain words. */
export function combineWords(texts: string[], lang: string = 'en'): string {
  const term = processTermFor(lang);
  const byTerm = new Map<string, string>();
  for (const text of texts) {
    for (const w of words(text)) {
      const t = term(w);
      // Chinese gives several terms per run of characters, so the run itself is the key
      const key = Array.isArray(t) ? w : t;
      if (key && !byTerm.has(key)) byTerm.set(key, w.toLowerCase());
    }
  }
  return [...byTerm.values()].join(' ');
}

/** Escaped HTML with every word whose index term matched wrapped in <mark>. */
export function highlight(text: string, terms: string[], lang: string = 'en'): string {
  const processTerm = processTermFor(lang);
  const set = new Set(terms);
  if (lang === 'zh') return highlightZh(text, set);
  return text.replace(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu, (chunk) => {
    const html = escapeHtml(chunk);
    if (!/^[\p{L}\p{M}\p{N}]/u.test(chunk)) return html;
    const t = processTerm(chunk);
    return typeof t === 'string' && set.has(t) ? `<mark>${html}</mark>` : html;
  });
}

/**
 * Chinese: mark the characters covered by a matched pair. Single characters are marked only when the query was a
 * single character, otherwise every common character in the verse would light up.
 */
function highlightZh(text: string, terms: Set<string>): string {
  const pairs = [...terms].some((t) => [...t].length === 2);
  const chars = [...text];
  const marked = chars.map(() => false);
  chars.forEach((c, i) => {
    if (pairs && i + 1 < chars.length && terms.has(c + chars[i + 1])) marked[i] = marked[i + 1] = true;
    if (!pairs && terms.has(c)) marked[i] = true;
  });
  let html = '';
  chars.forEach((c, i) => {
    if (marked[i] && !marked[i - 1]) html += '<mark>';
    html += escapeHtml(c);
    if (marked[i] && !marked[i + 1]) html += '</mark>';
  });
  return html;
}
