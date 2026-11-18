// Messages between the site-wide read-aloud player (ListenPlayer.svelte, which stays alive as you
// move between pages) and the Listen buttons on chapter pages.

export interface ListenRequest {
  action: 'start' | 'stop';
  /** Chapter path, e.g. "/bsb/john/3" */
  url?: string;
  /** Verse to start from */
  verse?: number;
}

export interface ListenState {
  /** The player is open */
  active: boolean;
  playing: boolean;
  /** Chapter being read */
  url: string | null;
  verse: number | null;
}

export const LISTEN_REQUEST = 'booksor:listen';
export const LISTEN_STATE = 'booksor:listen-state';

let current: ListenState = { active: false, playing: false, url: null, verse: null };

export const listenState = () => current;

export function requestListen(req: ListenRequest) {
  window.dispatchEvent(new CustomEvent<ListenRequest>(LISTEN_REQUEST, { detail: req }));
}

export function publishListenState(state: ListenState) {
  current = state;
  window.dispatchEvent(new CustomEvent<ListenState>(LISTEN_STATE, { detail: state }));
}

/** Clean chapter path: no trailing ".html", slash, query or hash */
export const chapterPath = (path: string) => path.replace(/\.html$/, '').replace(/(.)\/$/, '$1');

export interface ChapterText {
  url: string;
  /** "John 3" */
  title: string;
  /** Spoken before verse 1: "John, chapter 3" */
  intro: string;
  lang: string;
  nextUrl: string | null;
  verses: { v: number; text: string }[];
}

/** Read a chapter's verses from its page (the one on screen, or one fetched in the background). */
export function readChapter(doc: Document, url: string): ChapterText | null {
  const article = doc.querySelector<HTMLElement>('article.chapter[data-title]');
  if (!article) return null;
  const verses = [...article.querySelectorAll<HTMLElement>('.verses .verse[data-v]')].map((el) => ({
    v: Number(el.dataset.v),
    text: el.querySelector('.vt')?.textContent?.trim() ?? '',
  }));
  const next = article.querySelector<HTMLAnchorElement>('a[data-nav="next"]');
  return {
    url: chapterPath(url),
    title: article.dataset.title ?? '',
    intro: article.dataset.intro ?? '',
    lang: article.dataset.lang ?? 'en',
    nextUrl: next ? chapterPath(new URL(next.getAttribute('href')!, 'https://x').pathname) : null,
    verses,
  };
}
