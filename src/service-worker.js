// Booksor service worker: keeps pages you've read, and translations you download, available offline.
//
// This file is a template. After each build, integrations/offline.mjs copies it to dist/sw.js and
// fills in CONFIG with the build's version, the files to save up front, and the data cache name.
//
// Caches:
//   booksor-assets       scripts, styles, fonts, icons. File names change when their content does,
//                        so once saved they never need fetching again.
//   booksor-pages        HTML pages, keyed by clean URL. Online we always ask the network first.
//   booksor-data-<hash>  search, verse-of-the-day and cross-reference data. Replaced when the Bible
//                        data changes.

const CONFIG = /* CONFIG */ { version: 'dev', dataCache: 'booksor-data-dev', assets: [], shell: [] };

const ASSETS = 'booksor-assets';
const PAGES = 'booksor-pages';
const DATA = CONFIG.dataCache;
/** On a slow connection, show the saved copy of a page after this long */
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSETS);
      await Promise.all(
        CONFIG.assets.map(async (url) => {
          if (await assets.match(url)) return;
          try {
            await assets.add(url);
          } catch {
            // saved later, the first time it's used
          }
        }),
      );
      const pages = await caches.open(PAGES);
      await Promise.all(
        CONFIG.shell.map(async (path) => {
          try {
            const res = await fetch(path, { cache: 'reload' });
            if (res.ok) await pages.put(pageKey(new URL(path, self.location.origin)), await unredirect(res));
          } catch {
            // offline during install; these get saved when visited
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('booksor-data-') && name !== DATA) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname === '/offline.json') return;

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(req, ASSETS));
  } else if (/^\/(search|votd|xref)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(req, DATA));
  } else if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html') || looksLikePage(url)) {
    event.respondWith(page(event, url));
  } else if (/\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, ASSETS));
  }
});

/**
 * Pages change without a full reload: the site fetches the next page in the background, without
 * saying it wants HTML. Our pages are the addresses with no file extension.
 */
function looksLikePage(url) {
  return !/\.[a-z0-9]+$/i.test(url.pathname);
}

/** Same key for /kjv/john/3, /kjv/john/3.html and /kjv/john/3/ (and no query or hash) */
function pageKey(url) {
  const path = url.pathname.replace(/\.html$/, '').replace(/(.)\/$/, '$1');
  return url.origin + (path === '/index' ? '/' : path);
}

/** Browsers refuse to show a redirected response for a page, so store a plain copy */
async function unredirect(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function page(event, url) {
  const key = pageKey(url);
  const cache = await caches.open(PAGES);
  const network = fetch(event.request).then(async (res) => {
    if (res.ok && res.type === 'basic') await cache.put(key, await unredirect(res.clone()));
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT)]);
  } catch {
    const saved = await cache.match(key, { ignoreVary: true });
    if (saved) return saved;
    const late = await network.catch(() => null);
    if (late) return late;
    const offline = await cache.match(pageKey(new URL('/offline', self.location.origin)), { ignoreVary: true });
    return offline || new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  const fresh = fetch(req)
    .then(async (res) => {
      if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await fresh) || new Response('', { status: 504 });
}
