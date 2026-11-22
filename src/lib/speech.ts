// Helpers for reading aloud with the browser's built-in voices (Web Speech API).

export const RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

/**
 * Split text into pieces short enough to speak in one go. Chrome's voices stop after
 * ~15 seconds of a single utterance, so long verses are split at sentence ends, then
 * at commas/semicolons, then between words.
 */
export function speechChunks(text: string, max = 200): string[] {
  const clean = text.replace(/[[\]¶]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const out: string[] = [];
  let current = '';
  const push = (piece: string) => {
    if (!piece) return;
    if (current && (current + ' ' + piece).length > max) {
      out.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  };
  for (const sentence of clean.match(/[^.!?]+[.!?]+["'’”)]*|[^.!?]+$/g) ?? [clean]) {
    const s = sentence.trim();
    if (s.length <= max) {
      push(s);
      continue;
    }
    for (const clause of s.match(/[^,;:]+[,;:]?/g) ?? [s]) {
      const c = clause.trim();
      if (c.length <= max) {
        push(c);
        continue;
      }
      for (const word of c.split(' ')) push(word);
    }
  }
  if (current) out.push(current);
  return out;
}

export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
}

const norm = (tag: string) => tag.toLowerCase().replace('_', '-');

/** Other codes voices use for a language: Tagalog voices are "fil-PH", older Android calls Indonesian "in-ID" */
const SAME_LANGUAGE: Record<string, string[]> = { tl: ['tl', 'fil'], id: ['id', 'in'], zh: ['zh', 'cmn'] };

/**
 * Voices for a language, best first: natural-sounding ones, then the reader's own accent
 * (`locale`, e.g. en-US from the browser), then the system default, then local ones.
 */
export function rankVoices<V extends VoiceLike>(voices: V[], lang: string, locale = ''): V[] {
  const want = lang.toLowerCase();
  const accent = norm(locale);
  const score = (v: V) =>
    (/natural|neural|premium|enhanced|online/i.test(v.name) ? 4 : 0) +
    (/^google/i.test(v.name) ? 2 : 0) +
    (accent && norm(v.lang) === accent ? 1.5 : 0) +
    (v.default ? 1 : 0) +
    (v.localService ? 0.5 : 0);
  return voices
    .filter((v) => (SAME_LANGUAGE[want] ?? [want]).includes(norm(v.lang).split('-')[0]))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/** The saved voice if it's still installed, otherwise the best one. */
export function pickVoice<V extends VoiceLike>(voices: V[], lang: string, saved: string, locale = ''): V | undefined {
  const ranked = rankVoices(voices, lang, locale);
  return ranked.find((v) => v.name === saved) ?? ranked[0];
}

/** Auto-scroll speed (1–10) in pixels per second, scaled with the text size. */
export function scrollPixelsPerSecond(level: number, fontSize: number) {
  const clamped = Math.min(10, Math.max(1, level));
  return Math.round(clamped * 5 * (fontSize / 19) * 10) / 10;
}
