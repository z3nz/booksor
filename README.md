# Booksor

A free, fast Bible website: [booksor.com](https://booksor.com). See [ROADMAP.md](ROADMAP.md) for plans.

**Stack:** Astro (static pages) · Svelte (interactive pieces) · TypeScript · SQLite at build time · Cloudflare static hosting.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (Node 24+, which has SQLite built in as `node:sqlite`) |
| `pnpm data` | Download the Bible texts from eBible.org, build `data/bible.sqlite`, export search, verse-of-the-day and cross-reference files to `public/` |
| `pnpm xref:update` | Refresh the cross-reference snapshot (`data/cross-references.zip`) from OpenBible.info, then rerun `pnpm data` |
| `pnpm dev` | Local dev server |
| `pnpm build` | Build every chapter page into `dist/` |
| `pnpm preview` | Serve the built site locally |
| `pnpm test` | Unit tests (references, search quality, situations, saved verses, read-aloud, offline) |
| `pnpm check` | Type check |
| `pnpm run ci:build` | Everything Cloudflare runs: data, tests, build |
| `pnpm run deploy` | Build and publish to Cloudflare by hand (normally automatic, see below) |
| `pnpm run deploy:www` | Publish the small Worker that redirects www.booksor.com to booksor.com |

Run `pnpm data` once before `dev` or `build`. The downloads, the database and the exported files are generated, so they are not committed.

## How it fits together

- `data/translations.json`: which translations to import, plus license and attribution for each. Add a new eBible.org translation here and run `pnpm data`.
- Languages: `src/i18n/` has the menu text (`messages.ts`, type-checked so every language has every message) and book names with the abbreviations people type (`books.ts`). Bible pages use their translation's language; home pages are `/` and `/es`. Search handles each language's words in `src/lib/terms.ts` (Spanish ignores accents). Topic pages (`/help`) are English only so far.
- `scripts/`: the data pipeline (download, then build SQLite, then export JSON).
- `src/lib/`: shared logic: books, the reference parser, preferences, sharing, and the search worker.
- `src/pages/[tr]/[book]/[chapter].astro`: one static page per chapter, read from SQLite while the site builds.
- Search runs in a Web Worker in the browser using MiniSearch, so there's no server and no per-search cost.
- Cross-references: `data/cross-references.zip` is a committed snapshot of OpenBible.info's data (CC BY), so the files people download for offline use only change when we update it on purpose. `pnpm data` writes one small file per chapter to `public/xref/` (shared by every translation); the panel (`src/components/CrossRefs.svelte`) shows each passage's text from `search/{tr}.json`.
- Recorded narration: `scripts/audio.ts` downloads Bob Souer's BSB recordings, re-encodes them and uploads them to the `booksor-audio` R2 bucket (audio.booksor.com). Workers static assets don't support range requests, which Safari needs for audio.
- `data/situations.json`: the "What are you going through?" topics, their search keywords and verses. A test checks every verse exists in every translation.
- Offline: `src/service-worker.js` is a template. After each build, `integrations/offline.mjs` writes `dist/sw.js` (with the build's file list and version) and `dist/offline.json` (cache names and download sizes for the "Download for offline" button in `src/lib/offline.ts`). The service worker only registers in production builds, so `pnpm dev` always shows fresh code.
- App icons in `public/icons/` are drawn from the logo by `node scripts/make-icons.ts`; rerun it if the logo changes.

## Deployment

Pushing to `main` deploys automatically. Cloudflare Workers Builds is connected to this GitHub repo and runs:

- Build command: `pnpm run ci:build`, which downloads the texts, runs the tests (a failure stops the deploy) and builds the site
- Deploy command: `pnpm exec wrangler deploy`

The site is static files on Cloudflare at **booksor.com** (see `wrangler.jsonc`). `www.booksor.com` is a separate tiny Worker in `workers/www-redirect/` that redirects to booksor.com. It rarely changes, so deploy it by hand with `pnpm run deploy:www`.

