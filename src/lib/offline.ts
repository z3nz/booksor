// "Download for offline": saves every page of a translation, plus its search data, into the
// same caches the service worker (src/service-worker.js) reads from when there's no connection.
import { BOOKS, chapterUrl } from './books.ts';
import { helpUrl, SITUATIONS } from './situations.ts';
import { languageOf, translationById } from './translations.ts';
import { xrefUrl } from './xref.ts';

export interface OfflineManifest {
  version: string;
  pagesCache: string;
  dataCache: string;
  translations: Record<string, { pages: number; bytes: number }>;
}

export const offlineSupported = () =>
  typeof window !== 'undefined' && 'caches' in window && 'serviceWorker' in navigator;

const MANIFEST_KEY = 'booksor:offline-manifest';
let manifest: Promise<OfflineManifest | null> | undefined;

/** Cache names and download sizes for this build. Remembered so it works offline too. */
export function loadManifest(): Promise<OfflineManifest | null> {
  manifest ??= (async () => {
    try {
      const res = await fetch('/offline.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const m = (await res.json()) as OfflineManifest;
      try {
        localStorage.setItem(MANIFEST_KEY, JSON.stringify(m));
      } catch {
        // fine
      }
      return m;
    } catch {
      try {
        return JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? 'null');
      } catch {
        return null;
      }
    }
  })();
  return manifest;
}

/** Every page in a translation: book list, chapters, and situation pages. */
export function pageUrls(tr: string): string[] {
  return [
    `/${tr}`,
    ...BOOKS.flatMap((b) => Array.from({ length: b.chapters }, (_, i) => chapterUrl(tr, b, i + 1))),
    // Topic pages are English only so far
    ...(languageOf(tr) === 'en' ? SITUATIONS.map((s) => helpUrl(tr, s.slug)) : []),
  ];
}

/** Data the search box, verse of the day and related passages need. */
export function dataUrls(tr: string): string[] {
  const lang = translationById.get(tr)?.language ?? 'en';
  return [`/search/${tr}.json`, `/search/words-${lang}.json`, `/votd/${tr}.json`, ...xrefUrls()];
}

/** Cross-references, one file per chapter, shared by every translation */
export const xrefUrls = () => BOOKS.flatMap((b) => Array.from({ length: b.chapters }, (_, i) => xrefUrl(b.slug, i + 1)));

/** Data shared with other translations: all of the same language, or all of them */
export const sharedBy = (url: string): 'language' | 'all' | null =>
  url.startsWith('/xref/') ? 'all' : url.includes('/words-') ? 'language' : null;

const abs = (path: string) => new URL(path, window.location.origin).href;
const MATCH = { ignoreVary: true, ignoreSearch: true };

export interface OfflineStatus {
  done: number;
  total: number;
}

/** How much of a translation is saved on this device. */
export async function offlineStatus(tr: string): Promise<OfflineStatus | null> {
  const m = await loadManifest();
  if (!m || !offlineSupported()) return null;
  const [pages, data] = await Promise.all([caches.open(m.pagesCache), caches.open(m.dataCache)]);
  const saved = new Set([...(await pages.keys()), ...(await data.keys())].map((r) => r.url));
  const urls = [...pageUrls(tr), ...dataUrls(tr)];
  return { done: urls.filter((u) => saved.has(abs(u))).length, total: urls.length };
}

/**
 * Save every page of a translation. Skips what's already saved, so it can be resumed.
 * Calls `onProgress(done, total)` as it goes; stop it with `signal`.
 */
export async function downloadTranslation(
  tr: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const m = await loadManifest();
  if (!m) throw new Error('Offline downloads need a connection to start');
  // Ask the browser not to clear this when space runs low (it may say no; that's fine)
  await navigator.storage?.persist?.().catch(() => false);

  const [pages, data] = await Promise.all([caches.open(m.pagesCache), caches.open(m.dataCache)]);
  const saved = new Set([...(await pages.keys()), ...(await data.keys())].map((r) => r.url));
  const jobs: { url: string; cache: Cache }[] = [];
  let done = 0;
  for (const u of pageUrls(tr)) {
    if (saved.has(abs(u))) done++;
    else jobs.push({ url: u, cache: pages });
  }
  // Search data first (it's the most useful offline), then pages, then related passages
  const data_ = dataUrls(tr).filter((u) => (saved.has(abs(u)) ? (done++, false) : true));
  const [search, xrefs] = [data_.filter((u) => !u.startsWith('/xref/')), data_.filter((u) => u.startsWith('/xref/'))];
  jobs.unshift(...search.map((url) => ({ url, cache: data })));
  jobs.push(...xrefs.map((url) => ({ url, cache: data })));
  const total = done + jobs.length;
  onProgress(done, total);

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      signal.throwIfAborted();
      const { url, cache } = jobs[next++];
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const body = res.redirected ? new Response(await res.blob(), { headers: res.headers }) : res;
      await cache.put(abs(url), body);
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/**
 * Remove a downloaded translation. Data that other downloaded translations still use stays:
 * `keep.language` when one in the same language is downloaded, `keep.all` when any is.
 */
export async function removeTranslation(tr: string, keep: { language: boolean; all: boolean }): Promise<void> {
  const m = await loadManifest();
  if (!m) return;
  const [pages, data] = await Promise.all([caches.open(m.pagesCache), caches.open(m.dataCache)]);
  const prefix = abs(`/${tr}`);
  for (const req of await pages.keys()) {
    if (req.url === prefix || req.url.startsWith(prefix + '/')) await pages.delete(req);
  }
  for (const u of dataUrls(tr)) {
    const shared = sharedBy(u);
    if ((shared === 'language' && keep.language) || (shared === 'all' && keep.all)) continue;
    await data.delete(abs(u), MATCH);
  }
}

export function formatSize(bytes: number) {
  return bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
