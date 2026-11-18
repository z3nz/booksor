# Booksor Roadmap

A free, fast, beautiful Bible site at **booksor.com**.

**Effort:** S = a few hours · M = a day or two · L = a week or more

## Guiding constraints

- **Free first.** No paid APIs, no paid servers. Everything runs on Cloudflare's free tier until there's a reason to pay.
- **Translation licensing.** Only public-domain or openly licensed texts can be hosted directly. The NKJV, NIV, ESV and NLT are copyrighted and need a license or an API with usage limits. Free sources:
  - English: KJV, World English Bible (WEB), Berean Standard Bible (BSB), ASV, Young's Literal
  - Other languages: [eBible.org](https://ebible.org/Scriptures/) has free texts in hundreds of languages, all in the same verse-per-line format our importer reads
- **Never machine-translate scripture.** The site's menus can be translated, but Bible text always comes from a real, published translation.
- **Cloudflare static file limit.** A free deploy can hold 20,000 files. Each translation adds about 1,200 chapter pages, so around 12–15 translations we switch to rendering chapters on demand (see Phase 2).
- **AI content is always labeled** and kept separate from scripture.

## Phase 1 — MVP

- [x] **S** Clean chapter reader: mobile-first, serif font, dark/sepia themes, font size
- [x] **S** Clean URLs for every chapter (`/kjv/john/3`), verse links (`#v16`, `#v16-18`)
- [x] **S** Translation switcher that keeps your place (KJV, WEB, BSB)
- [x] **S** Book/chapter picker, previous/next chapter, keyboard shortcuts (← → and `/`)
- [x] **S–M** Reference search: `jn 3:16`, `1 cor 13:4-7`, `ps 23`, `song of songs 2`
- [x] **M** Full-text search with autocomplete verse cards, running in the browser
- [x] **S** Verse of the day / verse of the hour
- [x] **S** Share a verse: copy link, copy text, phone share menu, image card
- [x] **S** SEO: page titles, descriptions, canonical links, sitemap
- [x] **S** About page with licenses and attribution
- [x] Deploy to Cloudflare
- [x] Live at booksor.com (www redirects to it)

## Phase 2 — Languages, situations, reading mode

- [ ] **M** Bible translations in many languages (eBible.org imports)
- [ ] **M** Site menus in multiple languages
- [ ] **M** Switch chapter pages to on-demand rendering with edge caching once we near the 20k-file limit (Astro Cloudflare adapter + D1 or R2)
- [x] **M** "I'm struggling with…" situation search: 39 curated situations (`data/situations.json`) with topic pages, a `/help` hub, search cards, and crisis resources for sensitive topics
- [x] **M** Reading mode: read aloud using the browser's built-in voices (speed, voice, verse highlighting, continues into the next chapter), auto-scroll, focus mode
- [x] **M** Pages change without a full reload, so the read-aloud player keeps going across pages and on into the next chapter on phones
- [x] **M** Bookmarks, highlights (5 colors), notes, saved on the device (no account needed), with a Saved page and backup/restore
- [x] **S** "Continue where you left off" on the home page
- [x] **S** Offline support: install like an app, pages you read are saved automatically, download a whole translation (with search) from the settings panel

## Phase 3 — The book experience

- [ ] **L** Desktop book view with page-flip animations (plain reader stays as fallback; respects reduced-motion)
- [x] **M** Cross-translation search: a quote in any hosted translation's wording finds the verse
- [ ] **S–M** Phrase matching across translations (short quotes like "love is patient" rank 4th in KJV today)
- [ ] **M–L** Search by meaning ("I feel alone" finds verses without those exact words) — Workers AI + Vectorize free tiers
- [ ] **S–M** Cross-references: verses related to the one you're reading (OpenBible.info, ~340k links)
- [ ] **S** Side-by-side translations
- [ ] **M** Reading plans (Bible in a year, streaks)
- [ ] **M** Real audio for read-aloud, so it keeps playing with the phone locked (with lock-screen controls). Options: Bob Souer's BSB narration (openbible.com; need to confirm the recordings' license), Bible Brain API, or generating our own with an open-source voice (Piper) and hosting on R2
- [ ] **S** Verse-of-the-day email/notification and embeddable widget

## Phase 4 — Down the road

- [ ] **L** AI images per chapter: generated ahead of time, reviewed, stored. Needs a style guide (e.g., scenery and settings rather than depicting God or Jesus)
- [ ] **M** Accounts + sync across devices (Cloudflare D1)
- [ ] **L** Original Greek/Hebrew word study and interlinear (STEPBible data, CC BY)
- [ ] **M** "Explain this passage" AI study helper, clearly labeled as commentary
- [ ] **M** Maps and timelines for story-heavy books (Exodus, Acts, Paul's journeys)
- [ ] Licensed translations like the NKJV (licensing or API terms)

## Free Cloudflare services for later

| Need | Service | Free tier (check current limits) |
|---|---|---|
| Database (accounts, progress, notes sync) | D1 (SQLite) | 5 GB storage, 5M rows read/day, 100k rows written/day |
| Search by meaning | Workers AI + Vectorize | Daily free allowance |
| Images and audio files | R2 | 10 GB storage, no download fees |
| Server routes | Workers | 100k requests/day |

## Ideas backlog

Add anything here. We'll sort it into a phase later.

- Red-letter edition (words of Jesus in red)
- Print-friendly chapter view
- More situations, and a second pass over verse choices with pastors or readers
- Word-by-word highlighting while listening (voices report word positions unevenly across browsers)
