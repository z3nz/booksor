# Booksor

A free, fast Bible website: [booksor.com](https://booksor.com). See [ROADMAP.md](ROADMAP.md) for plans.

**Stack:** Astro (static pages) · Svelte (interactive pieces) · TypeScript · SQLite at build time · Cloudflare static hosting.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (Node 24+; uses built-in `node:sqlite`) |
| `pnpm data` | Download the Bible texts from eBible.org, build `data/bible.sqlite`, export search and verse-of-the-day files to `public/` |
| `pnpm dev` | Local dev server |
| `pnpm build` | Build every chapter page into `dist/` |
| `pnpm preview` | Serve the built site locally |
| `pnpm test` | Unit tests (reference parser, verse of the day) |
| `pnpm check` | Type check |
| `pnpm run deploy` | Build and publish to Cloudflare |

Run `pnpm data` once before `dev` or `build`. The downloads, the database and the exported files are generated, so they are not committed.

## How it fits together

- `data/translations.json`: which translations to import, plus license and attribution for each. Add a new eBible.org translation here and run `pnpm data`.
- `scripts/`: the data pipeline (download, then build SQLite, then export JSON).
- `src/lib/`: shared logic: books, the reference parser, preferences, sharing, and the search worker.
- `src/pages/[tr]/[book]/[chapter].astro`: one static page per chapter, read from SQLite while the site builds.
- Search runs in a Web Worker in the browser using MiniSearch, so there's no server and no per-search cost.
