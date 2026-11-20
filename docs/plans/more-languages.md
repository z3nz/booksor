# Plan: more languages, past the 20,000-file limit

Status: **in progress.** Steps 1–4 done, Spanish is live on `booksor-es` (2026-11-20). Batch A (Portuguese,
French, German, Italian) is built and tested (2026-11-20); next is its deploy and checks by hand, then batch B.

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

1. **Test the route on the real domain.** ✅ **Done 2026-11-20: it works.** Results:
   - A files-only Worker on a route serves its files with the **full path** (`/zz-route-test/a` found
     `zz-route-test/a.html`), so language Workers keep the same folder layout as `dist/`.
     Its own `404.html` answers missing pages; `/`, `/bsb/john/3` and `/_astro/…` stayed on the main Worker.
   - **Use one pattern per translation, `booksor.com/{tr}*`.** An exact pattern (`booksor.com/{tr}`) does
     **not** match with a query string (`/{tr}?q=1` fell through to the main Worker).
   - Because `{tr}*` is a prefix match, it also catches `/{tr}x`. The split step must fail if a translation
     id is the start of any other top-level path or translation id.
   - Trailing-slash redirects (`/{tr}/a/` → `/{tr}/a`) and the response headers matched the main Worker.
     Neither Worker answers range requests with 206 (both send the whole file), so nothing changes there;
     the audio is on R2 anyway.
   - A new route took under a minute to take effect.
   - The test Worker and its route are deleted.

   Original test plan:
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
2. **Build the split step and generated configs.** ✅ **Done 2026-11-20.**
   - `scripts/split-dist.ts` (`pnpm run split`), `scripts/keep-previous-assets.ts`, `scripts/deploy-all.ts`
     (`pnpm run deploy:all`, `--dry-run` passes through to wrangler). Tests in `tests/split.test.ts`.
   - Change from the plan: each language Worker's config is generated into `dist-langs/{lang}/wrangler.jsonc`
     (files in `dist-langs/{lang}/site/`), not committed under `workers/`, so it can't drift from
     `data/translations.json`.
   - Dry run on the real build: main Worker 4,955 files, `booksor-es` 1,191 (1,189 chapters, the book list
     and a 404 page).
   - The limit counts files only. Wrangler's "Read N files" line also counts folders, but its upload list
     skips them.

   Original plan:
   - `scripts/split-dist.ts`, plus generated `workers/lang-{lang}/wrangler.jsonc`.
   - `package.json` scripts: `split`, `deploy:all`.
   - The "keep previous scripts" step that reads the live `sw.js`.
   - Check that every `dist-langs/*` and `dist/` stays under 20k files, failing the build if not (with margin,
     e.g. 19,000).
   - Tests for the split, e.g. no file in two places, and every translation in `data/translations.json` landing
     somewhere.
3. **Update deploys** (the user, in the Cloudflare dashboard): Workers & Pages → `booksor` → Settings →
   Build → Deploy command: change `pnpm exec wrangler deploy` to `pnpm run deploy:all`. The next push to
   `main` then creates `booksor-es` and moves Spanish (that's step 4). If the build log shows an
   authentication or permission error for `booksor-es` or its route, the build token needs **Workers
   Scripts: Edit** (account) and **Workers Routes: Edit** (zone booksor.com): see above.
   - Spanish may 404 for a few seconds on that first deploy, between the main Worker dropping it and
     `booksor-es` going live. That only happens once.
   - ⚠️ **First try (commit `02291af`, 2026-11-20) took the site down for a few minutes.** Workers Builds sets
     `WRANGLER_CI_OVERRIDE_NAME=booksor`, which sends *every* `wrangler deploy` in the build to the main
     Worker. So the Spanish deploy replaced the whole site with only `/rv1909` pages. Fixed by rolling back
     (`wrangler rollback bd525b80… --name booksor`). `deploy-all.ts` now removes that variable and
     `WRANGLER_CI_MATCH_TAG` for language deploys. A local dry run can only catch this with the variable set:
     `WRANGLER_CI_OVERRIDE_NAME=booksor pnpm run deploy:all --dry-run`.
   - That deploy also gave the main Worker a `booksor.com/rv1909*` route, and **the main deploy doesn't remove
     it** (the main Worker only has a custom domain, so wrangler leaves zone routes alone). The second CI
     deploy (`225eba4`) then failed: "Can't deploy routes that are assigned to another worker", and
     `/rv1909/…` gave 404 for about 10 minutes. Fixed by removing the route in the dashboard (booksor.com
     domain → Workers Routes) and running `pnpm exec wrangler deploy --config dist-langs/es/wrangler.jsonc`
     by hand. If a route ever lands on the wrong Worker, that's where to fix it.
   - **Confirmed (`fb13a69`):** the Workers Builds token can deploy `booksor-es` and its route. Both Workers
     deployed in one build, and Spanish stayed up throughout.

4. **Move Spanish to `booksor-es`.** ✅ **Live on `booksor-es` since 2026-11-20** (deployed by hand, see
   step 3). Checked with curl: `/rv1909/john/3` (Spanish text, all scripts and styles load), with a query
   string, trailing-slash redirect, the Spanish Worker's 404 page, `/es`, English chapters, and the search,
   verse-of-the-day, cross-reference and offline files. A full Workers Builds deploy (`fb13a69`) then
   succeeded, and the user checked offline download, switching translations and a phone by hand. ✅

   Original step: Check
   `booksor.com/rv1909/john/3`, `/es`, offline download of RVR1909, search, cross-references and switching
   translations, on a phone too.
5. **Add languages in batches**, following the checklist below. Commit and deploy after each batch.
   - **Batch A** 🟡 built and tested 2026-11-20: `blivre` (pt), `sblm` (fr), `luther1912` (de), `riveduta` (it),
     each in its own Worker (`booksor-pt`…, 1,191 files each; main Worker 4,971). See [Batch A notes](#batch-a-notes).
     Still to do: deploy, then the checks by hand.

## First wave: languages and translations

All complete Bibles from eBible.org that it marks as redistributable. **Check each license in its
`{id}_about.htm` before adding** (the ones marked "open license" need the exact terms and attribution).

| Batch | Language | eBible ID | Translation | License |
| --- | --- | --- | --- | --- |
| A | Portuguese | `porbr2018` | Bíblia Livre (`blivre`) | CC BY 4.0 Brasil, credit on every page |
| A | French | `frasbl` | Sainte Bible libre pour le monde (`sblm`) | Public domain (draft, being proofread) |
| A | German | `deu1912` | Luther 1912 (`luther1912`) | Public domain |
| A | Italian | `ita1927` | Riveduta 1927 (`riveduta`) | Public domain |
| B | Russian | `russyn` | Synodal | Public domain (Cyrillic; the catalog wrongly says "Latin" script) |
| B | Indonesian | `indayt` | Alkitab Yang Terbuka (AYT) | Open license (YLSA): check terms |
| B | Vietnamese | `vie1934` | 1934 (catalog says 1923) | Public domain |
| B | Swahili | `swhonen` | Kiswahili Contemporary Version (Biblica) | Open license (Biblica): check terms |
| B | Tagalog | `tglulb` | Unlocked Literal Bible (Door43) | CC BY-SA: check terms |
| C | Chinese | `cmn-cu89s` | Chinese Union Version, Simplified | Public domain |
| C | Arabic | `arb-vd` | Van Dyck | Public domain, **right to left** |
| C | Hindi | `hin2017` | Indian Revised Version | Open license (Bridge Connectivity Solutions): check terms |
| C | Korean | `kor` | Korean Bible 1910 | Public domain (older Korean) |

**Check each candidate's verse numbering against the BSB before choosing it** (compare the `BOOK c:v` keys of
the `_vpl.txt` files; about 16 extra verses that the BSB leaves out are normal). Some well-known Bibles number
the Old Testament differently (Hebrew style), which breaks cross-references, translation switching and even
chapter counts, unless we write a renumbering table.

Batch C needs extra work, so it comes last:
- **Chinese:** no spaces between words, so search needs segmenting, e.g. indexing character pairs.
- **Arabic:** right-to-left layout.
- **Hindi and Korean:** fonts and search rules.

## Checklist for each new language

What adding a language touches (updated after batch A):

1. **Translation**
   - `data/translations.json`: `id`, `abbr`, `name`, `language`, `languageName` (in that language), `dir`,
     `source`, `sourceUrl` (`https://ebible.org/Scriptures/{id}_vpl.zip`), `license`, `attribution`, and
     `suppliedWords: true` if added words are in [brackets].
   - The translation `id` is its URL (`/blivre/john/3`) and its route (`booksor.com/blivre*`), so it must not be
     the start of another top-level path or id (the split step checks).
   - Run `pnpm data`, then check the text for quirks with a SQLite query: brackets (supplied words, or other
     verse numbers like Luther's `[32:1]`, which `build-db.ts` now strips), `¶` paragraph marks (none means one
     verse per line), stray markup, spaces before punctuation (`build-db.ts` fixes `,` and `.`), and verse
     counts compared with BSB.
2. **Language file:** `src/i18n/{lang}.ts` exporting `books` (each book's name plus the abbreviations people
   type, in BOOKS order) and `messages` (typed `Messages`, so a missing message fails type checking). Copy an
   existing one. Add it to `LANGS` in `src/i18n/index.ts`; everything else (`UiLang`, `UI_LANGS`, the footer,
   the home page hint, the offline home pages) follows from that and `data/translations.json`.
   - The search box example and the text-size preview quote the translation's own wording.
   - Ask a native speaker to review it.
3. **References:** add ordinal words ("premier", "erste"…) to `NUMBER_WORDS` in `src/lib/reference.ts`. Book
   names are matched with accents first, so two names that differ only by an accent (Portuguese "Jó"/"Jo")
   both work.
4. **Search words:** in `src/lib/terms.ts`, add a `processTerm{Lang}` to `PROCESSORS`: stop words (including
   elided forms like French "l", "qu"), accent folding, and a light plural/stem rule. Chinese needs
   segmentation (see batch C).
5. **Home page:** add `src/pages/{lang}/index.astro` (`<HomePage lang="xx" />`).
6. **Tests:** add the language to `REFERENCES` and `FAMOUS` in `tests/languages.test.ts` (the top hit for 4–5
   famous verses in that translation's own wording; check the actual text first, the 1909 Spanish says "la
   caridad es sufrida", not the modern "el amor es sufrido"), plus a `search words` case. Every message key,
   every book name and abbreviation, and the home page are checked for every language automatically.
7. **Check by hand:** the home page, a chapter, search, the verse bar at phone width (long labels), read-aloud
   voice, cross-references, offline download, and switching to and from English.

### Things that need generalizing once there are more than two languages

- ✅ **The home page language hint** now offers the browser's most preferred language we have
  (`navigator.languages`), unless it's the page's own.
- **The footer** lists every menu language: 6 now, the most it should hold. Before batch B, switch to a compact
  language menu or a `/languages` page.
- **Fonts:** Literata and Inter cover Latin, Cyrillic, Greek and Vietnamese. Arabic, Devanagari, Chinese and
  Korean fall back to system fonts, which is fine to start with. Later, load a Noto font for that language only.
- **Right to left (Arabic):**
  - Set `dir="rtl"` on `<html>` for those pages (Base.astro gets `dir` from the translation).
  - Check the CSS for left/right properties, and switch to logical ones (`margin-inline-start`…) where it
    matters: the chapter number, the verse bar, the docked cross-reference panel (could dock on the left), and
    focus mode.
- **Topic pages** (`/help`) stay English. Translating the 39 topics is its own roadmap item.

## Batch A notes

- **Portuguese:** chose Bíblia Livre (Almeida-style, finished, numbering matches) over the World Portuguese
  Bible, which is modern and public domain but marked as a draft under revision. Its CC BY 4.0 credit is in the
  attribution shown on every chapter page.
- **French:** Louis Segond 1910 numbers verses Hebrew-style in 24 books (Malachi has 3 chapters, about 60 psalms
  count the heading as verse 1), and Darby is further off. Chose the Sainte Bible libre pour le monde, a light
  modern update of Segond with English numbering (public domain, marked as a draft being proofread). Ostervald
  was the other option: finished, but 7 places are numbered differently. Segond could come later with a
  renumbering table.
- **German:** references are shown as "Johannes 3:16"; German usually writes "3,16" (typing it works).
- **Text fixes in `build-db.ts`:** Luther's bracketed other verse numbers are removed, and spaces before `,`,
  `.` and `;` (Bíblia Livre, 653 verses; one in the BSB) are removed. French keeps its space before `;`.
- Menus in French and Italian say "Focus" for focus mode, since "Concentration" was too long for the toolbar.

## Still to settle

- Native-speaker review of menus and book names: Spanish (`src/i18n/es.ts`), Portuguese, French, German,
  Italian.
- Whether to also add a second translation for big languages (e.g. a modern Spanish one if an openly licensed
  one turns up).
