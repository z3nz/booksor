// "I'm struggling with…" situation search: curated topics with verses, and matching what
// people type ("feeling anxious", "lost my job", "grief") to those topics.
import data from '../../data/situations.json' with { type: 'json' };
import { stem } from './terms.ts';
import { DEFAULT_TRANSLATION, languageOf } from './translations.ts';

export type Care = 'crisis' | 'safety' | 'support';
export type SituationGroup = 'feelings' | 'hard-times' | 'relationships' | 'faith' | 'encouragement';

export interface Situation {
  slug: string;
  title: string;
  group: SituationGroup;
  intro: string;
  keywords: string[];
  /** References like "Philippians 4:6-7", best first */
  verses: string[];
  /** Show help resources alongside the verses */
  care?: Care;
}

export const SITUATIONS = data as Situation[];
export const situationBySlug = new Map(SITUATIONS.map((s) => [s.slug, s]));

export const GROUPS: { id: SituationGroup; label: string }[] = [
  { id: 'feelings', label: 'Feelings' },
  { id: 'hard-times', label: 'Hard times' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'faith', label: 'Faith' },
  { id: 'encouragement', label: 'Encouragement' },
];

/** Shown first on the home page */
export const POPULAR_SITUATIONS = [
  'anxiety',
  'fear',
  'depression',
  'loneliness',
  'grief',
  'stress',
  'anger',
  'guilt',
  'illness',
  'money',
  'doubt',
  'strength',
];

/** A topic page; they're in English so far, so other languages' translations use the default one */
export const helpUrl = (tr: string, slug: string) => `/${languageOf(tr) === 'en' ? tr : DEFAULT_TRANSLATION}/help/${slug}`;

// --- Matching what people type ---

/** Words that say "I'm describing how I feel / what I'm going through" */
const INTENT =
  /\b(struggl\w*|dealing|going through|feel\w*|felt|i'?m|i am|im|help|verses?|scriptures?|bible (verses?|says?)|deal with|cope|coping|overcom\w*|battling|suffering from|scared of|afraid of|worried about|about|how (to|do i|can i|do you))\b/;

/** Words that carry no meaning for matching once the intent is known */
const FILLER = new Set(
  (
    'i im am is are was be been so very really feel feeling feelings felt struggling struggle with dealing ' +
    'going through about for help need verses verse bible scripture scriptures what does say says how ' +
    'to deal a an the of in on when you your overcome overcoming and or lot lots right now today ' +
    'battling suffering from just kind sort of always constantly bit little something who'
  ).split(' '),
);

/** Kept for matching ("lost my job", "hate me") but don't count against coverage */
const SOFT = new Set(['my', 'me', 'myself']);

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);


interface Keyword {
  situation: Situation;
  stems: string[];
  /** Single-word keywords can be autocompleted */
  word?: string;
}

const KEYWORDS: Keyword[] = SITUATIONS.flatMap((situation) =>
  situation.keywords.map((k) => {
    // Drop filler words from keywords too, so "lost my job" lines up with the query once "my" is removed
    const words = tokenize(k);
    const meaningful = words.filter((w) => !FILLER.has(w));
    return {
      situation,
      stems: (meaningful.length ? meaningful : words).map(stem),
      word: words.length === 1 ? words[0] : undefined,
    };
  }),
);

/** Does `needle` appear as a run inside `hay`? */
function contains(hay: string[], needle: string[]): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export interface SituationMatch {
  situation: Situation;
  /** Higher is a better match */
  score: number;
  /** Matched only by the start of a word still being typed */
  prefix: boolean;
}

/** Situations that fit what someone typed. Empty when the query looks like an ordinary verse search. */
export function matchSituations(query: string, limit = 3): SituationMatch[] {
  const q = query.toLowerCase().trim();
  if (q.length < 3) return [];
  const intent = INTENT.test(q.replace(/[’]/g, "'"));
  const allTokens = tokenize(q);
  const tokens = allTokens.filter((t) => !FILLER.has(t));
  const tokenStems = tokens.map(stem);

  const scores = new Map<Situation, SituationMatch>();
  const covered = new Set<number>();
  for (const k of KEYWORDS) {
    const at = contains(tokenStems, k.stems);
    if (at < 0) continue;
    for (let i = at; i < at + k.stems.length; i++) covered.add(i);
    const prev = scores.get(k.situation);
    const score = k.stems.length * 10 + (prev?.score ?? 0);
    scores.set(k.situation, { situation: k.situation, score, prefix: false });
  }

  let matches = [...scores.values()];
  // Without words like "struggling with" or "feeling", only match when every word is about a situation,
  // so ordinary searches ("children of israel", "fear not") stay ordinary.
  const needed = tokens.filter((t, i) => !SOFT.has(t) && !covered.has(i)).length;
  if (!intent && needed > 0) matches = [];

  // Autocomplete a single word being typed: "anx" -> Anxiety & worry
  if (!matches.length && tokens.length === 1 && tokens[0].length >= 3 && allTokens.length === 1) {
    const typed = tokens[0];
    for (const k of KEYWORDS) {
      if (!k.word?.startsWith(typed) || scores.has(k.situation)) continue;
      scores.set(k.situation, { situation: k.situation, score: typed.length / k.word.length, prefix: true });
    }
    matches = [...scores.values()].filter((m) => m.prefix);
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** "I feel…", "struggling with…", "verses for…": the query describes the person, not a verse. */
export function describesSelf(query: string): boolean {
  return INTENT.test(query.toLowerCase().replace(/[’]/g, "'"));
}

/** True when the words suggest someone may be in danger of harming themselves. */
export function isCrisisQuery(query: string): boolean {
  return /\b(suicid\w*|kill(ing)? myself|want to die|wanna die|end (my|it) (life|all)|end it|self[ -]?harm\w*|cutting myself|hurt(ing)? myself|no reason to live)\b/i.test(
    query,
  );
}

/** "I'm struggling", "going through a lot": personal, but nothing specific to match. Offer the full list. */
export function soundsPersonal(query: string): boolean {
  return /\b(struggl\w*|going through|dealing with|i feel|feeling|cope|coping|help me|hard time|rough day|bad day)\b/i.test(query);
}
