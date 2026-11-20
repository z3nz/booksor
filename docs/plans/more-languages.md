# Plan: more languages, past the 20,000-file limit

Status: **planned, not started** (written 2026-11-19). Spanish is live; this covers everything after it.
Pick up at [Steps](#steps), step 1.

## Where we are

- English (BSB, KJV, WEB) and Spanish (Reina-Valera 1909) are live. Spanish has translated menus, Spanish book
  names and references, accent-insensitive search and a home page at `/es`.
- The whole site is static files served by one Cloudflare Worker (`booksor`, custom domain booksor.com).
  The build has **6,144 files** (`find dist -type f | wc -l`).
- Cloudflare's free plan allows **20,000 files per Worker**. Each translation adds about **1,190 files**
  (1,189 chapters plus a book list; topic pages are English only). That leaves room for roughly **10 more
  translations**, fewer than the first wave below.

## The decision

Options we weighed:

| Option | Cost | Limits | Verdict |
| --- | --- | --- | --- |
| **Split translations across extra files-only Workers, routed by path** | Free | 20k files per Worker, 100 Workers per account; static file requests are free and unlimited | **Chosen** |
| Build chapter pages on request in a Worker (Astro Cloudflare adapter) | Free up to a point | Free plan caps Workers at 100,000 requests a day; over that, pages error until midnight UTC | Rejected: the cap could take pages down |
| Workers Paid plan | $5/month | 100k files per Worker | **Fallback** if splitting doesn't work |
| One translation per language only | Free | About 12 translations total | Too limiting |

## How splitting works

1. **One build, as now.** `astro build` writes every page to `dist/`. Local `pnpm preview` keeps serving the
   whole site from `dist/`, so development doesn't change.
2. **A split step after the build** (new, e.g. `scripts/split-dist.ts`). For each language other than English,
   it moves that language's translations (`dist/{tr}.html` and `dist/{tr}/**`) into `dist-langs/{lang}/`, plus
   a copy of `404.html`.
3. **What stays in the main Worker** (`dist/`): English pages, every home page (`/`, `/es`, `/pt`…), `/_astro/`
   scripts and styles, icons, `search/*.json`, `votd/*.json`, `xref/**` (cross-references, shared by every
   translation), `sw.js`, `offline.json`, the sitemap. That's about 5,000 files, growing by only ~3 small data
   files per translation.
4. **One files-only Worker per language**, e.g. `booksor-pt`, `booksor-fr` (also `booksor-es`; Spanish moves
   out of the main Worker). Each has:
   - no script, just `assets.directory: dist-langs/{lang}`, the same `html_handling` and `not_found_handling`
     as the main Worker
   - a route per translation: `booksor.com/{tr}` and `booksor.com/{tr}/*` (zone `booksor.com`)
   - its own 20k-file allowance, so about 15 translations per language before that language needs a second
     Worker
   - a generated `wrangler.jsonc`, written by the split step from `data/translations.json`, so adding a
     translation needs no hand-edited config
5. **What a request does:** `booksor.com/almeida/john/3` matches the route, so `booksor-pt` serves the file.
   The page's `/_astro/…` scripts don't match any route, so the main Worker serves them.
6. **Visitors see no difference.** Everything is still the booksor.com origin, so the service worker, offline
   downloads, page changes without reloading (Astro ClientRouter), the cross-reference panel and read-aloud
   all work unchanged.

### What the docs say (and what still needs a test)

- A **route takes precedence over a Custom Domain** on the same hostname (Custom Domains docs). So routes on
  `booksor.com/{tr}*` should win over the main Worker for those paths.
- Static-only Workers need no script (Workers best practices). A route can exist without a script (Routes
  docs).
- **Not spelled out anywhere:** a route pointing at a Worker that has only static files. Step 1 tests this
  before anything else is built.

Sources:
[Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) ·
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) ·
[Static assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) ·
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) ·
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) ·
[Workers for Platforms changelog (routes with no script)](https://developers.cloudflare.com/changelog/product/workers-for-platforms/)

### Deploys

- **One command for everything.** Cloudflare Workers Builds (push to `main` → build → deploy) would run a new
  deploy command, e.g. `pnpm run deploy:all`. It builds once, runs the split, then runs `wrangler deploy` for
  each language Worker and the main one. Wrangler only uploads changed files, so later deploys stay quick.
- **The deploy gap.** Workers deploy one at a time. For a few seconds, a language Worker's new pages could ask
  for `/_astro/*.js` files the main Worker doesn't have yet, or the reverse. Fix: before deploying, the main
  build also keeps the **previous** build's script and style files. Their names are in the live `sw.js`
  (`CONFIG.assets`), so the deploy step fetches any missing ones into `dist/_astro/`. Old and new pages then
  both work throughout.
- **Settings the user changes in the dashboard:** the Workers Builds deploy command. Also check that the build's
  API token can deploy *other* Workers (`booksor-pt`…). If it can't, the user creates an API token with Workers
  edit permission and adds it as a build secret (Claude can't create or handle the token).

## Steps

1. **Test the route on the real domain (about 15 minutes, needs the user's OK; it touches the live zone).**
   - Deploy a throwaway files-only Worker `booksor-route-test` holding `zz-route-test.html`,
     `zz-route-test/a.html` and a `404.html`, with route `booksor.com/zz-route-test*`.
   - Check:
     - `/zz-route-test` and `/zz-route-test/a` come from the test Worker, not the main site's 404
     - `/zz-route-test/missing` gets the test Worker's 404
     - `/` and `/_astro/…` still come from the main Worker
     - range requests and caching headers look the same as the main Worker's
   - Delete the Worker and its route afterwards.
   - **If it fails:** stop and decide between Workers Paid ($5/month, no splitting needed) and building pages on
     request.
2. **Build the split step and generated configs.**
   - `scripts/split-dist.ts`, plus generated `workers/lang-{lang}/wrangler.jsonc`.
   - `package.json` scripts: `split`, `deploy:all`.
   - The "keep previous scripts" step that reads the live `sw.js`.
   - Check that every `dist-langs/*` and `dist/` stays under 20k files, failing the build if not (with margin,
     e.g. 19,000).
   - Tests for the split, e.g. no file in two places, and every translation in `data/translations.json` landing
     somewhere.
3. **Update deploys** (the user, in the Cloudflare dashboard): the Workers Builds deploy command, plus the API
   token if needed (see above).
4. **Move Spanish to `booksor-es`.** It proves the setup with a language that's already live. Check
   `booksor.com/rv1909/john/3`, `/es`, offline download of RVR1909, search, cross-references and switching
   translations, on a phone too.
5. **Add languages in batches**, following the checklist below. Commit and deploy after each batch.

## First wave: languages and translations

All complete Bibles from eBible.org that it marks as redistributable. **Check each license in its
`{id}_about.htm` before adding** (the ones marked "open license" need the exact terms and attribution).

| Batch | Language | eBible ID | Translation | License |
| --- | --- | --- | --- | --- |
| A | Portuguese | `porbrbsl` or `porbr2018` | World Portuguese Bible (PD) or Bíblia Livre | PD / open license: compare quality first |
| A | French | `fraLSG` | Louis Segond 1910 | Public domain |
| A | German | `deu1912` | Luther 1912 | Public domain |
| A | Italian | `ita1927` | Riveduta 1927 | Public domain |
| B | Russian | `russyn` | Synodal | Public domain (Cyrillic; the catalog wrongly says "Latin" script) |
| B | Indonesian | `indayt` | Alkitab Yang Terbuka (AYT) | Open license (YLSA): check terms |
| B | Vietnamese | `vie1934` | 1934 (catalog says 1923) | Public domain |
| B | Swahili | `swhonen` | Kiswahili Contemporary Version (Biblica) | Open license (Biblica): check terms |
| B | Tagalog | `tglulb` | Unlocked Literal Bible (Door43) | CC BY-SA: check terms |
| C | Chinese | `cmn-cu89s` | Chinese Union Version, Simplified | Public domain |
| C | Arabic | `arb-vd` | Van Dyck | Public domain, **right to left** |
| C | Hindi | `hin2017` | Indian Revised Version | Open license (Bridge Connectivity Solutions): check terms |
| C | Korean | `kor` | Korean Bible 1910 | Public domain (older Korean) |

Batch C needs extra work, so it comes last:
- **Chinese:** no spaces between words, so search needs segmenting, e.g. indexing character pairs.
- **Arabic:** right-to-left layout.
- **Hindi and Korean:** fonts and search rules.

## Checklist for each new language

This is what adding Spanish actually touched (commit `cd7c252`):

1. **Translation**
   - `data/translations.json`: `id`, `abbr`, `name`, `language`, `languageName` (in that language), `dir`,
     `source`, `sourceUrl` (`https://ebible.org/Scriptures/{id}_vpl.zip`), `license`, `attribution`, and
     `suppliedWords: true` if added words are in [brackets].
   - Run `pnpm data`, then check the text for quirks with a SQLite query: brackets, `¶` paragraph marks (none
     means one verse per line), stray markup, and verse counts compared with BSB.
2. **Book names:** add `{LANG}_BOOKS` to `src/i18n/books.ts`, with the name plus the abbreviations people type.
   Then wire it into `src/i18n/index.ts`: the `UiLang` type, `UI_LANGS`, `LANGUAGE_NAMES`, `uiLang()`,
   `NAMES` and `bookAliases()`.
3. **Menus:** add the language's object to `src/i18n/messages.ts` (typed `Messages`, so a missing message fails
   type checking). Ask a native speaker to review it.
4. **References:** add ordinal words ("premier", "erste"…) to `NUMBER_WORDS` in `src/lib/reference.ts`.
5. **Search words:** in `src/lib/terms.ts`, add `processTermFor(lang)` rules: stop words, accent folding where
   people type without accents, and a light plural/stem rule. Chinese needs segmentation (see batch C).
6. **Home page:** add `src/pages/{lang}/index.astro` (`<HomePage lang="xx" />`) and add `/{lang}` to `SHELL` in
   `integrations/offline.mjs`.
7. **Tests:** a `tests/{language}.test.ts` like `tests/spanish.test.ts`, covering:
   - references in the language's style
   - book name coverage
   - search word rules
   - the top hit for 4–5 famous verses in that translation's own wording (check the actual text first; the
     1909 Spanish says "la caridad es sufrida", not the modern "el amor es sufrido")
   - every message key present
8. **Check by hand:** the home page, a chapter, search, the verse bar at phone width (long labels), read-aloud
   voice, cross-references, offline download, and switching to and from English.

### Things that need generalizing once there are more than two languages

- **The home page language hint** (`HomePage.astro`) assumes exactly two languages ("the other one"). Change it
  to suggest the browser's preferred language from `navigator.languages`, if we have it.
- **The footer** lists every menu language. Past about 6, switch to a compact language menu or a `/languages`
  page.
- **Fonts:** Literata and Inter cover Latin, Cyrillic, Greek and Vietnamese. Arabic, Devanagari, Chinese and
  Korean fall back to system fonts, which is fine to start with. Later, load a Noto font for that language only.
- **Right to left (Arabic):**
  - Set `dir="rtl"` on `<html>` for those pages (Base.astro gets `dir` from the translation).
  - Check the CSS for left/right properties, and switch to logical ones (`margin-inline-start`…) where it
    matters: the chapter number, the verse bar, the docked cross-reference panel (could dock on the left), and
    focus mode.
- **Topic pages** (`/help`) stay English. Translating the 39 topics is its own roadmap item.

## Still to settle

- Portuguese: World Portuguese Bible (public domain, modern) or Bíblia Livre? Compare a few famous verses.
- Spanish menus and book names: a native-speaker review is still pending (`src/i18n/messages.ts`,
  `src/i18n/books.ts`).
- Whether to also add a second translation for big languages (e.g. a modern Spanish one if an openly licensed
  one turns up).
