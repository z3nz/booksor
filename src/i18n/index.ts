// The site's menus come in a few languages. Bible pages use the language of their translation;
// home pages have one per language (/ and /es). Everything else is English for now.
import { BOOKS } from '../lib/books.ts';
import type { Book } from '../lib/types.ts';
import { ES_BOOKS } from './books.ts';
import { en, es, type Messages } from './messages.ts';

export type UiLang = 'en' | 'es';
export const UI_LANGS: UiLang[] = ['en', 'es'];
export const LANGUAGE_NAMES: Record<UiLang, string> = { en: 'English', es: 'Español' };

const DICTS: Record<UiLang, Messages> = { en, es };

/** The menu language for a language code ("es", "es-MX"); English if we don't have it */
export const uiLang = (code?: string | null): UiLang => (code?.toLowerCase().startsWith('es') ? 'es' : 'en');

export const messages = (lang: string | null | undefined): Messages => DICTS[uiLang(lang)];

/** Home page for a language */
export const homeUrl = (lang: UiLang) => (lang === 'en' ? '/' : `/${lang}`);

const NAMES: Record<UiLang, string[]> = {
  en: BOOKS.map((b) => b.name),
  es: ES_BOOKS.map(([name]) => name),
};

/** A book's name in a language ("Juan" for John in Spanish) */
export function bookName(book: Book | number, lang: string | null | undefined): string {
  const i = typeof book === 'number' ? book : BOOKS.indexOf(book);
  return NAMES[uiLang(lang)][i] ?? BOOKS[i]?.name ?? '';
}

/** Names and abbreviations to recognize when someone types a reference in this language */
export function bookAliases(lang: UiLang): [string, Book][] {
  if (lang === 'es') return ES_BOOKS.flatMap(([name, abbr], i) => [name, ...abbr].map((a) => [a, BOOKS[i]] as [string, Book]));
  return BOOKS.flatMap((b) => [b.name, b.slug, ...b.abbr].map((a) => [a, b] as [string, Book]));
}

/** The language of the page on screen (pages change without a full reload, so check each time) */
export const pageLang = (): UiLang => uiLang(typeof document === 'undefined' ? 'en' : document.documentElement.lang);

/** Call `fn` with the page's language now and after every page change. Returns a function to stop. */
export function followPageLang(fn: (lang: UiLang) => void): () => void {
  const update = () => fn(pageLang());
  update();
  document.addEventListener('astro:page-load', update);
  return () => document.removeEventListener('astro:page-load', update);
}
