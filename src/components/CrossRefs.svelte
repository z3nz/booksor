<script lang="ts">
  // Related passages (cross-references) for the verses you choose. On wide screens it's a panel beside the
  // text; on phones, a sheet from the bottom that shrinks to a small bar while you read a passage.
  // It stays open as you follow references from chapter to chapter (transition:persist), keeps a trail
  // of where you've been, and offers a way back.
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import Icon from './Icon.svelte';
  import { bookName, followPageLang, messages, type UiLang } from '../i18n/index.ts';
  import { loadSettings } from '../lib/prefs.ts';
  import { compressVerses } from '../lib/share.ts';
  import {
    loadVerseTexts,
    loadXrefs,
    relatedTo,
    showsTarget,
    STUDY_EVENT,
    targetLabel,
    targetUrl,
    VERSE_SELECTION,
    XREF_OPEN,
    type VerseSelection,
    type VerseTexts,
    type XrefFile,
  } from '../lib/xref.ts';

  interface Page {
    tr: string;
    book: number;
    slug: string;
    chapter: number;
  }
  interface Source extends Page {
    verses: number[];
  }

  const FIRST = 8; // shown before "Show all"
  const WIDE = '(min-width: 1100px)';
  const PANEL_WIDTH = 360;

  // Stays on screen across pages, so its menus follow each page's language
  let lang = $state<UiLang>('en');
  const m = $derived(messages(lang));

  let page = $state.raw<Page | null>(null);
  let path = $state('');
  let hash = $state('');
  let open = $state(false);
  let collapsed = $state(false); // phones: just the small bar
  let wide = $state(false);
  let study = $state(false);
  let source = $state.raw<Source | null>(null);
  let trail = $state.raw<Source[]>([]);
  let file = $state.raw<XrefFile | null>(null);
  let texts = $state.raw<VerseTexts | null>(null);
  let failed = $state(false);
  let showAll = $state(false);
  let list: HTMLElement | undefined = $state();

  const tr = $derived(page?.tr ?? 'bsb');
  const items = $derived(file && source ? relatedTo(file, source.book, source.chapter, source.verses) : []);
  const shown = $derived(showAll ? items : items.slice(0, FIRST));
  const current = $derived(items.findIndex((r) => showsTarget(tr, path, hash, r.target)));
  const docked = $derived(open && wide);
  const away = $derived(!!source && !!page && (page.book !== source.book || page.chapter !== source.chapter));

  const label = (s: Source) => `${bookName(s.book, lang)} ${s.chapter}:${compressVerses(s.verses)}`;
  const sourceUrl = (s: Source) => `/${tr}/${s.slug}/${s.chapter}#v${s.verses[0]}${s.verses.length > 1 && isRun(s.verses) ? `-${s.verses.at(-1)}` : ''}`;
  const isRun = (vs: number[]) => vs.every((v, i) => i === 0 || v === vs[i - 1] + 1);
  const same = (a: Source, b: Source) => a.book === b.book && a.chapter === b.chapter && a.verses.join() === b.verses.join();

  /** The chapter on screen, from the page itself */
  function readPage(): Page | null {
    const a = document.querySelector<HTMLElement>('article.chapter[data-tr]');
    if (!a) return null;
    return { tr: a.dataset.tr!, book: Number(a.dataset.book), slug: a.dataset.slug!, chapter: Number(a.dataset.chapter) };
  }

  function show(verses: number[]) {
    if (!page || !verses.length) return;
    const next: Source = { ...page, verses: [...verses].sort((a, b) => a - b) };
    if (source && same(source, next)) {
      open = true;
      collapsed = false;
      return;
    }
    // Moving on to another chapter's verse: remember where we came from
    if (source && (source.book !== next.book || source.chapter !== next.chapter)) {
      trail = [...trail.filter((s) => !same(s, source!)), source].slice(-6);
    }
    source = next;
    open = true;
    collapsed = false;
    showAll = false;
    list?.scrollTo(0, 0);
    void load(next);
    if (!wide) keepInView(next.verses[0]);
  }

  /** Phones: the sheet covers the bottom of the page, so bring the verse up above it */
  function keepInView(verse: number) {
    const el = document.querySelector<HTMLElement>(`.verses .verse[data-v="${verse}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const room = Math.max(0, header) + 12;
    const sheetTop = window.innerHeight * 0.4;
    if (top < room || top > sheetTop - 40) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: window.scrollY + top - room, behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  async function load(s: Source) {
    failed = false;
    file = null;
    const f = await loadXrefs(s.slug, s.chapter);
    if (source !== s) return;
    file = f;
    failed = !f;
  }

  // The text for previews: the translation you're reading (loads once, then it's instant)
  $effect(() => {
    if (!open || !source) return;
    const want = tr;
    texts = null;
    void loadVerseTexts(want).then((t) => {
      if (want === tr) texts = t;
    });
  });

  function close() {
    open = false;
    source = null;
    trail = [];
    file = null;
  }

  function backTo(i: number) {
    const s = trail[i];
    trail = trail.slice(0, i);
    source = s;
    showAll = false;
    void load(s);
    void navigate(sourceUrl(s));
  }

  function step(delta: 1 | -1) {
    const i = current < 0 ? (delta > 0 ? 0 : items.length - 1) : current + delta;
    const r = items[i];
    if (r) void navigate(targetUrl(tr, r.target));
  }

  function picked(i: number) {
    // Past the first few, make sure the one you picked stays in the list
    if (i >= FIRST) showAll = true;
    if (!wide) collapsed = true;
  }

  // Room for the panel beside the text; set again after each page change (which resets <html>)
  function setSpace() {
    const root = document.documentElement;
    root.toggleAttribute('data-xref-docked', docked);
    root.style.setProperty('--xref-space', docked ? `${PANEL_WIDTH}px` : '0px');
  }
  $effect(setSpace);

  onMount(() => {
    const stopLang = followPageLang((l) => (lang = l));
    const mq = window.matchMedia(WIDE);
    wide = mq.matches;
    study = loadSettings().study;
    page = readPage();
    path = window.location.pathname.replace(/\.html$/, '');
    hash = window.location.hash;
    if (study && wide) open = true;

    const onWidth = () => (wide = mq.matches);
    const onOpen = (e: Event) => show((e as CustomEvent<VerseSelection>).detail.verses);
    // Follow the verses you tap while the list is open
    const onSelect = (e: Event) => {
      const { verses } = (e as CustomEvent<VerseSelection>).detail;
      if (open && !collapsed && verses.length) show(verses);
    };
    const onStudy = (e: Event) => {
      study = (e as CustomEvent<boolean>).detail;
      if (study && wide) open = true;
      if (!study && !source) open = false;
    };
    const onPageLoad = () => {
      page = readPage();
      path = window.location.pathname.replace(/\.html$/, '');
      hash = window.location.hash;
    };
    const onHash = () => (hash = window.location.hash);
    // The count badges study mode adds after each verse
    const onClick = (e: Event) => {
      const badge = (e.target as HTMLElement).closest<HTMLElement>('.xn[data-xv]');
      if (badge) show([Number(badge.dataset.xv)]);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open || document.querySelector('dialog[open], .verse.selected')) return;
      if (!wide && !collapsed) collapsed = true;
      else close();
    };
    mq.addEventListener('change', onWidth);
    window.addEventListener(XREF_OPEN, onOpen);
    window.addEventListener(VERSE_SELECTION, onSelect);
    window.addEventListener(STUDY_EVENT, onStudy);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    document.addEventListener('astro:page-load', onPageLoad);
    document.addEventListener('astro:after-swap', setSpace);
    document.addEventListener('click', onClick);
    return () => {
      stopLang();
      mq.removeEventListener('change', onWidth);
      window.removeEventListener(XREF_OPEN, onOpen);
      window.removeEventListener(VERSE_SELECTION, onSelect);
      window.removeEventListener(STUDY_EVENT, onStudy);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('astro:page-load', onPageLoad);
      document.removeEventListener('astro:after-swap', setSpace);
      document.removeEventListener('click', onClick);
      document.documentElement.removeAttribute('data-xref-docked');
      document.documentElement.style.setProperty('--xref-space', '0px');
    };
  });
</script>

{#if open && collapsed && !wide && source}
  <div class="mini card" role="region" aria-label={m.xref.panel}>
    <button class="btn btn-icon" aria-label={m.xref.prev} onclick={() => step(-1)} disabled={current === 0}>
      <Icon name="prev" size={14} />
    </button>
    <button class="mini-label" onclick={() => (collapsed = false)} aria-label={m.xref.showList}>
      {#if current >= 0}
        <strong>{targetLabel(items[current].target, lang)}</strong>
        <span>{m.xref.position(current + 1, items.length, label(source))}</span>
      {:else}
        <strong>{m.xref.relatedTo} {label(source)}</strong>
        <span>{m.xref.count(items.length)}</span>
      {/if}
    </button>
    <button class="btn btn-icon" aria-label={m.xref.next} onclick={() => step(1)} disabled={current === items.length - 1}>
      <Icon name="next" size={14} />
    </button>
    <button class="btn btn-icon" aria-label={m.xref.closeShort} onclick={close}><Icon name="close" size={14} /></button>
  </div>
{:else if open}
  <aside class="panel" class:docked class:sheet={!wide} aria-label={m.xref.panel}>
    <header class="head">
      <div class="title">
        {#if source}
          <span class="eyebrow">{m.xref.relatedTo}</span>
          <h2>{label(source)}</h2>
        {:else}
          <span class="eyebrow">{m.xref.study}</span>
          <h2>{m.xref.panel}</h2>
        {/if}
      </div>
      {#if !wide && source}
        <button class="btn btn-icon" aria-label={m.xref.shrink} onclick={() => (collapsed = true)}>
          <Icon name="scroll" size={16} />
        </button>
      {/if}
      <button class="btn btn-icon" aria-label={m.xref.close} onclick={close}><Icon name="close" size={16} /></button>
    </header>

    {#if trail.length || away}
      <nav class="trail" aria-label={m.xref.trail}>
        {#each trail as s, i (i)}
          <button class="crumb" onclick={() => backTo(i)}>{label(s)}</button>
          <span class="sep" aria-hidden="true">›</span>
        {/each}
        {#if source}
          {#if away}
            <a class="crumb" href={sourceUrl(source)}>{trail.length ? label(source) : m.xref.backTo(label(source))}</a>
          {:else}
            <span class="crumb here">{label(source)}</span>
          {/if}
        {/if}
      </nav>
    {/if}

    <div class="body" bind:this={list}>
      {#if !source}
        <p class="hint">
          {m.xref.hintBefore} <span class="badge-sample">12</span>{m.xref.hintMiddle} <strong>{m.verse.related}</strong>{m.xref.hintAfter}
        </p>
      {:else if failed}
        <p class="hint">{m.xref.failed}</p>
      {:else if !file}
        <p class="hint">{m.xref.loading}</p>
      {:else if !items.length}
        <p class="hint">{m.xref.none}</p>
      {:else}
        <ol class="items">
          {#each shown as r, i (r.target.join())}
            <li>
              <a href={targetUrl(tr, r.target)} aria-current={i === current ? 'page' : undefined} onclick={() => picked(i)}>
                <strong>{targetLabel(r.target, lang)}</strong>
                {#if texts}
                  <span class="text reading" {lang}>{texts.passage(r.target)}</span>
                {:else}
                  <span class="text placeholder" aria-hidden="true"></span>
                {/if}
              </a>
            </li>
          {/each}
        </ol>
        {#if items.length > FIRST}
          <button class="btn more" onclick={() => (showAll = !showAll)}>
            {showAll ? m.xref.showFewer : m.xref.showAll(items.length)}
          </button>
        {/if}
      {/if}
      <p class="credit">
        {m.xref.creditBefore} <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener">OpenBible.info</a>
        {m.xref.creditAfter}
      </p>
    </div>
  </aside>
{/if}

<style>
  .panel {
    position: fixed;
    z-index: 32;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
  }
  .docked {
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    border-left: 1px solid var(--border);
    box-shadow: -8px 0 24px -20px rgba(0, 0, 0, 0.4);
  }
  .sheet {
    left: 0;
    right: 0;
    bottom: var(--listen-space, 0px);
    max-height: min(60vh, 640px);
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -10px 30px -16px rgba(0, 0, 0, 0.35);
    padding-bottom: env(safe-area-inset-bottom);
    animation: up 0.2s ease-out;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 14px 12px 10px 18px;
    border-bottom: 1px solid var(--border);
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0;
    font-family: var(--font-reading);
    font-size: 20px;
    line-height: 1.25;
  }
  .head .btn-icon {
    width: 34px;
    min-height: 34px;
  }
  .trail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .crumb {
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .crumb:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .crumb.here {
    color: var(--text);
    font-weight: 600;
    cursor: default;
  }
  .sep {
    color: var(--muted);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 8px 14px;
  }
  .items {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .items a {
    display: block;
    padding: 10px 10px;
    border-radius: 10px;
    color: var(--text);
    text-decoration: none;
  }
  .items a:hover {
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }
  .items a[aria-current] {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .items strong {
    display: block;
    color: var(--accent);
    font-size: 14px;
  }
  .text {
    display: -webkit-box;
    margin-top: 2px;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.5;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
  }
  .placeholder {
    height: 2.6em;
    border-radius: 6px;
    background: linear-gradient(90deg, var(--border) 25%, transparent 50%, var(--border) 75%) 0 0 / 200% 100%;
    opacity: 0.5;
    animation: shimmer 1.2s linear infinite;
  }
  .more {
    display: flex;
    margin: 6px auto 4px;
    min-height: 34px;
    font-size: 13px;
  }
  .hint {
    margin: 12px 10px;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.5;
  }
  .badge-sample {
    display: inline-block;
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: 999px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    vertical-align: 2px;
  }
  .credit {
    margin: 16px 10px 0;
    color: var(--muted);
    font-size: 12px;
  }
  .credit a {
    color: inherit;
  }
  .mini {
    position: fixed;
    left: 50%;
    bottom: calc(12px + var(--listen-space, 0px) + env(safe-area-inset-bottom));
    z-index: 31;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    width: max-content;
    max-width: calc(100vw - 24px);
    padding: 6px;
    animation: rise 0.18s ease-out;
  }
  .mini .btn-icon {
    width: 34px;
    min-height: 34px;
  }
  .mini .btn-icon:disabled {
    opacity: 0.35;
  }
  .mini-label {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 210px;
    padding: 2px 8px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .mini-label strong,
  .mini-label span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .mini-label strong {
    font-size: 14px;
  }
  .mini-label span {
    color: var(--muted);
    font-size: 12px;
  }
  /* Make room beside the text for the panel */
  :global(:root[data-xref-docked] body) {
    padding-right: 360px;
  }
  @keyframes up {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .mini,
    .placeholder {
      animation: none;
    }
  }
</style>
