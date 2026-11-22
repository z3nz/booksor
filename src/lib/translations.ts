import data from '../../data/translations.json' with { type: 'json' };
import type { Translation } from './types.ts';

export const TRANSLATIONS = data as Translation[];
/** Shown to new visitors: the Berean Standard Bible reads in modern English */
export const DEFAULT_TRANSLATION = 'bsb';
export const translationById = new Map(TRANSLATIONS.map((t) => [t.id, t]));

/** The language a translation is in ("en", "es") */
export const languageOf = (tr: string | undefined) => (tr && translationById.get(tr)?.language) || 'en';

/** The first translation offered in a language (the default for English) */
export function defaultTranslationFor(lang: string): string {
  if (lang === 'en') return DEFAULT_TRANSLATION;
  return TRANSLATIONS.find((t) => t.language === lang)?.id ?? DEFAULT_TRANSLATION;
}

/** Which way a language is written: "rtl" for Arabic */
export const directionOf = (lang: string): 'ltr' | 'rtl' => TRANSLATIONS.find((t) => t.language === lang)?.dir ?? 'ltr';

/** Every language there's a Bible in */
export const TRANSLATION_LANGUAGES = [...new Set(TRANSLATIONS.map((t) => t.language))];
