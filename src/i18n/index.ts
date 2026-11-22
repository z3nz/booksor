// The site's menus come in a few languages, one file each (en.ts, es.ts…). Bible pages use the language of their
// translation; each language has a home page (/, /es, /pt…). Topic pages (/help) are English only for now.
import { BOOKS } from '../lib/books.ts';
import type { Book } from '../lib/types.ts';
import * as de from './de.ts';
import { messages as en, type BookNames, type Messages } from './en.ts';
import * as es from './es.ts';
import * as fr from './fr.ts';
import * as id from './id.ts';
import * as it from './it.ts';
import * as pt from './pt.ts';
import * as ru from './ru.ts';
import * as sw from './sw.ts';
import * as tl from './tl.ts';
import * as vi from './vi.ts';

const LANGS = {
  en: { name: 'English', messages: en, books: BOOKS.map((b) => [b.name, [b.slug, ...b.abbr]]) as BookNames },
  es: { name: 'Español', ...es },
  pt: { name: 'Português', ...pt },
  fr: { name: 'Français', ...fr },
  de: { name: 'Deutsch', ...de },
  it: { name: 'Italiano', ...it },
  ru: { name: 'Русский', ...ru },
  id: { name: 'Bahasa Indonesia', ...id },
  vi: { name: 'Tiếng Việt', ...vi },
  sw: { name: 'Kiswahili', ...sw },
  tl: { name: 'Tagalog', ...tl },
} satisfies Record<string, { name: string; messages: Messages; books: BookNames }>;

export type UiLang = keyof typeof LANGS;
export const UI_LANGS = Object.keys(LANGS) as UiLang[];
export const LANGUAGE_NAMES = Object.fromEntries(UI_LANGS.map((l) => [l, LANGS[l].name])) as Record<UiLang, string>;

const isUiLang = (code: string): code is UiLang => code in LANGS;

/** The menu language for a language code ("es", "pt-BR"); English if we don't have it */
export const uiLang = (code?: string | null): UiLang => {
  const base = code?.toLowerCase().split('-')[0] ?? '';
  return isUiLang(base) ? base : 'en';
};

export const messages = (lang: string | null | undefined): Messages => LANGS[uiLang(lang)].messages;

/** Home page for a language */
export const homeUrl = (lang: UiLang) => (lang === 'en' ? '/' : `/${lang}`);

/** A book's name in a language ("Juan" for John in Spanish) */
export function bookName(book: Book | number, lang: string | null | undefined): string {
  const i = typeof book === 'number' ? book : BOOKS.indexOf(book);
  return LANGS[uiLang(lang)].books[i]?.[0] ?? BOOKS[i]?.name ?? '';
}

/** Names and abbreviations to recognize when someone types a reference in this language */
export function bookAliases(lang: UiLang): [string, Book][] {
  return LANGS[lang].books.flatMap(([name, abbr], i) => [name, ...abbr].map((a) => [a, BOOKS[i]] as [string, Book]));
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
