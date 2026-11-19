// After `astro build`: writes dist/sw.js (from src/service-worker.js) and dist/offline.json.
//
// sw.js gets this build's version, the scripts/styles/fonts to save up front, and a data cache
// name that only changes when the Bible data changes (so downloads survive ordinary deploys).
// offline.json tells the "Download for offline" button the cache names and download sizes.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import translations from '../data/translations.json' with { type: 'json' };

const SHELL = ['/', '/es', '/help', '/saved', '/about', '/offline'];
const EXTRA_ASSETS = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const urlPath = (dist, file) => '/' + relative(dist, file).split(sep).join('/');

function hashFiles(files) {
  const h = createHash('sha256');
  for (const f of files.sort()) h.update(f).update(readFileSync(f));
  return h.digest('hex').slice(0, 12);
}

export default function offline() {
  return {
    name: 'booksor-offline',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);

        // Scripts and styles, plus only the Latin font files (other scripts' fonts load when needed)
        const assets = walk(join(dist, '_astro'))
          .map((f) => urlPath(dist, f))
          .filter((p) => !/\.woff2?$/.test(p) || /-latin-wght-normal\./.test(p));

        const xrefFiles = walk(join(dist, 'xref'));
        const dataFiles = [...walk(join(dist, 'search')), ...walk(join(dist, 'votd')), ...xrefFiles];
        const xrefBytes = xrefFiles.reduce((n, f) => n + statSync(f).size, 0);
        const dataVersion = hashFiles(dataFiles);
        const shellHtml = SHELL.map((p) => join(dist, p === '/' ? 'index.html' : `${p.slice(1)}.html`));
        const version = hashFiles([...shellHtml, join(fileURLToPath(new URL('../src/service-worker.js', import.meta.url)))]) +
          '-' + createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 8);

        const size = (p) => statSync(join(dist, p)).size;
        const sizes = {};
        for (const t of translations) {
          const pages = walk(join(dist, t.id)).filter((f) => f.endsWith('.html'));
          const data = [`search/${t.id}.json`, `search/words-${t.language}.json`, `votd/${t.id}.json`];
          sizes[t.id] = {
            pages: pages.length + 1 + xrefFiles.length, // + the translation's book list and related passages
            bytes:
              pages.reduce((n, f) => n + statSync(f).size, size(`${t.id}.html`)) +
              data.reduce((n, p) => n + size(p), 0) +
              xrefBytes,
          };
        }

        const config = { version, dataCache: `booksor-data-${dataVersion}`, assets: [...assets, ...EXTRA_ASSETS], shell: SHELL };
        const template = readFileSync(new URL('../src/service-worker.js', import.meta.url), 'utf8');
        if (!template.includes('/* CONFIG */')) throw new Error('src/service-worker.js is missing its /* CONFIG */ marker');
        const sw = template.replace(/\/\* CONFIG \*\/ \{[^\n]*\}/, `/* CONFIG */ ${JSON.stringify(config)}`);
        writeFileSync(join(dist, 'sw.js'), sw);
        writeFileSync(
          join(dist, 'offline.json'),
          JSON.stringify({ version, pagesCache: 'booksor-pages', dataCache: config.dataCache, translations: sizes }),
        );
        logger.info(`sw.js ${version}: ${config.assets.length} assets saved up front, data cache ${config.dataCache}`);
      },
    },
  };
}
