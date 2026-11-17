# Booksor

A free, fast Bible website: [booksor.com](https://booksor.com). See [ROADMAP.md](ROADMAP.md) for plans.

**Stack:** Astro (static pages) · Svelte (interactive pieces) · TypeScript · SQLite at build time · Cloudflare static hosting.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (Node 24+, which has SQLite built in as `node:sqlite`) |
| `pnpm data` | Download the Bible texts from eBible.org, build `data/bible.sqlite`, export search and verse-of-the-day files to `public/` |
| `pnpm dev` | Local dev server |
| `pnpm build` | Build every chapter page into `dist/` |
| `pnpm preview` | Serve the built site locally |
| `pnpm test` | Unit tests (reference parser, verse of the day) |
| `pnpm check` | Type check |
| `pnpm run ci:build` | Everything Cloudflare runs: data, tests, build |
| `pnpm run deploy` | Build and publish to Cloudflare by hand (normally automatic, see below) |
| `pnpm run deploy:www` | Publish the small Worker that redirects www.booksor.com to booksor.com |

Run `pnpm data` once before `dev` or `build`. The downloads, the database and the exported files are generated, so they are not committed.

## How it fits together

- `data/translations.json`: which translations to import, plus license and attribution for each. Add a new eBible.org translation here and run `pnpm data`.
- `scripts/`: the data pipeline (download, then build SQLite, then export JSON).
- `src/lib/`: shared logic: books, the reference parser, preferences, sharing, and the search worker.
- `src/pages/[tr]/[book]/[chapter].astro`: one static page per chapter, read from SQLite while the site builds.
- Search runs in a Web Worker in the browser using MiniSearch, so there's no server and no per-search cost.

## Deployment

Pushing to `main` deploys automatically. Cloudflare Workers Builds is connected to this GitHub repo and runs:

- Build command: `pnpm run ci:build`, which downloads the texts, runs the tests (a failure stops the deploy) and builds the site
- Deploy command: `pnpm exec wrangler deploy`

The site is static files on Cloudflare at **booksor.com** (see `wrangler.jsonc`). `www.booksor.com` is a separate tiny Worker in `workers/www-redirect/` that redirects to booksor.com. It rarely changes, so deploy it by hand with `pnpm run deploy:www`.

