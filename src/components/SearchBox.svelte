<script lang="ts">
  import { onMount } from 'svelte';
  import { BOOKS, bookIndex, chapterUrl } from '../lib/books.ts';
  import { formatReference, parseReference } from '../lib/reference.ts';
  import { highlight } from '../lib/terms.ts';
  import { describesSelf, helpUrl, isCrisisQuery, matchSituations, soundsPersonal } from '../lib/situations.ts';
  import CareNote from './CareNote.svelte';
  import { preferredTranslation, TRANSLATION_EVENT } from '../lib/prefs.ts';
  import { DEFAULT_TRANSLATION, translationById } from '../lib/translations.ts';
  import type { SearchHit, SearchRequest, SearchResponse } from '../lib/search.worker.ts';

  let {
    variant = 'compact',
    translation,
    placeholder,
  }: { variant?: 'hero' | 'compact'; translation?: string; placeholder?: string } = $props();

  let tr = $state(DEFAULT_TRANSLATION);
  let q = $state('');
  let open = $state(false);
  let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let hits = $state<SearchHit[]>([]);
  let total = $state(0);
  let partial = $state(false);
  let preview = $state<string | null>(null);
  let active = $state(0);
  let input: HTMLInputElement;
  let root: HTMLElement;

  let worker: Worker | undefined;
  let seq = 0;
  let lastSearch = 0;
  let lastLookup = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ref = $derived(parseReference(q));
  const refUrl = $derived(ref ? chapterUrl(tr, ref.book, ref.chapter, ref.verse, ref.endChapter ? undefined : ref.endVerse) : null);
  const textSearch = $derived(q.trim().length >= 2 && (!ref || ref.bookOnly));
  // "I'm struggling with anxiety", "lonely", "lost my job" -> curated situation pages
  const situations = $derived(ref && !ref.bookOnly ? [] : matchSituations(q));
  const crisis = $derived(isCrisisQuery(q));
  const offerAll = $derived(!situations.length && soundsPersonal(q));
  // Word matches for "I want to…" or "struggling with…" are noise next to a matching situation
  const shownHits = $derived(crisis || (situations.length && (partial || describesSelf(q))) ? [] : hits);
  const situationUrls = $derived([...situations.map((m) => helpUrl(tr, m.situation.slug)), ...(offerAll ? ['/help'] : [])]);
  const items = $derived([
    ...(ref && refUrl ? [refUrl] : []),
    ...situationUrls,
    ...shownHits.map((h) => chapterUrl(tr, BOOKS[h.b], h.c, h.v)),
  ]);
  const hitOffset = $derived((ref && refUrl ? 1 : 0) + situationUrls.length);
  const abbr = $derived(translationById.get(tr)?.abbr ?? tr.toUpperCase());

  onMount(() => {
    tr = translation ?? preferredTranslation();
    const onTr = (e: Event) => {
      if (translation) return;
      tr = (e as CustomEvent<string>).detail;
      hits = [];
      preview = null;
      if (worker) {
        send({ type: 'load', tr });
        run();
      }
    };
    window.addEventListener(TRANSLATION_EVENT, onTr);
    return () => {
      window.removeEventListener(TRANSLATION_EVENT, onTr);
      worker?.terminate();
    };
  });

  function send(msg: SearchRequest) {
    worker?.postMessage(msg);
  }

  function ensureWorker() {
    if (worker) return;
    status = 'loading';
    worker = new Worker(new URL('../lib/search.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SearchResponse>) => {
      const msg = e.data;
      if (msg.type === 'ready') status = 'ready';
      else if (msg.type === 'error') status = 'error';
      else if (msg.type === 'results' && msg.id === lastSearch) {
        hits = msg.hits;
        total = msg.total;
        partial = msg.partial;
        status = 'ready';
      } else if (msg.type === 'lookup' && msg.id === lastLookup) {
        preview = msg.text;
      }
    };
    send({ type: 'load', tr });
  }

  function run() {
    active = 0;
    if (ref?.verse && !ref.endChapter) {
      lastLookup = ++seq;
      send({
        type: 'lookup',
        id: lastLookup,
        tr,
        book: bookIndex.get(ref.book.code)!,
        chapter: ref.chapter,
        verse: ref.verse,
        endVerse: ref.endVerse,
      });
    } else {
      preview = null;
    }
    if (textSearch) {
      lastSearch = ++seq;
      send({ type: 'search', id: lastSearch, tr, q });
    } else {
      hits = [];
      total = 0;
    }
  }

  function onInput() {
    ensureWorker();
    open = true;
    clearTimeout(timer);
    timer = setTimeout(run, 60);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, items.length - 1);
      scrollActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      scrollActive();
    } else if (e.key === 'Enter') {
      const url = items[active];
      if (url) {
        e.preventDefault();
        window.location.href = url;
      }
    } else if (e.key === 'Escape') {
      if (q) q = '';
      else input.blur();
      open = false;
      hits = [];
    }
  }

  function scrollActive() {
    requestAnimationFrame(() => root.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  function onGlobalKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    input.focus();
  }

  function onGlobalClick(e: MouseEvent) {
    if (variant === 'compact' && open && !root.contains(e.target as Node)) open = false;
  }

  const showPanel = $derived(variant === 'hero' ? q.trim().length > 0 : open && q.trim().length > 0);
</script>

<svelte:window onkeydown={onGlobalKey} onclick={onGlobalClick} />

<div class="search {variant}" bind:this={root}>
  <div class="field">
    <svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <input
      bind:this={input}
      bind:value={q}
      oninput={onInput}
      onfocus={() => {
        ensureWorker();
        open = true;
      }}
      onkeydown={onKeydown}
      type="search"
      placeholder={placeholder ?? (variant === 'hero' ? 'Try “the Lord is my shepherd”, “jn 3:16” or “anxious”' : 'Search or go to a verse…')}
      aria-label="Search the Bible"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="go"
      role="combobox"
      aria-expanded={showPanel}
      aria-controls="search-results-{variant}"
      aria-autocomplete="list"
    />
    <kbd class="hint" aria-hidden="true">/</kbd>
  </div>

  {#if showPanel}
    <div class="panel" id="search-results-{variant}" role="listbox" aria-label="Search results">
      {#if crisis}
        <CareNote kind="crisis" compact />
      {/if}

      {#if ref && refUrl}
        <a class="result ref" href={refUrl} data-active={active === 0} role="option" aria-selected={active === 0}>
          <span class="label">{ref.bookOnly ? 'Open book' : 'Go to'}</span>
          <span class="title">{formatReference(ref)} <span class="tr">{abbr}</span></span>
          {#if preview}
            <span class="text reading">{preview}</span>
          {:else if ref.bookOnly}
            <span class="meta">{ref.book.chapters} {ref.book.chapters === 1 ? 'chapter' : 'chapters'}</span>
          {/if}
        </a>
      {/if}

      {#each situations as m, i (m.situation.slug)}
        {@const idx = i + (ref && refUrl ? 1 : 0)}
        <a
          class="result situation"
          href={helpUrl(tr, m.situation.slug)}
          data-active={active === idx}
          role="option"
          aria-selected={active === idx}
          onmouseenter={() => (active = idx)}
        >
          <span class="label">Verses for</span>
          <span class="title">{m.situation.title}</span>
          <span class="meta">{m.situation.intro}</span>
        </a>
      {/each}
      {#if offerAll}
        {@const idx = ref && refUrl ? 1 : 0}
        <a class="result situation" href="/help" data-active={active === idx} role="option" aria-selected={active === idx}>
          <span class="label">Going through something?</span>
          <span class="title">Find verses for what you’re facing</span>
          <span class="meta">Anxiety, grief, loneliness, fear, doubt and more</span>
        </a>
      {/if}

      {#if textSearch && !crisis && (shownHits.length || !situationUrls.length)}
        {#if status === 'loading' && !hits.length}
          <div class="status">Loading search…</div>
        {:else if status === 'error'}
          <div class="status">
            {navigator.onLine
              ? 'Search couldn’t load. Check your connection and try again.'
              : 'Search needs a connection the first time. To search offline, download this translation in settings (Aa).'}
          </div>
        {:else if shownHits.length}
          <div class="status">
            {partial ? 'No verse has all of those words. Closest matches: ' : ''}
            {total > shownHits.length ? `Top ${shownHits.length} of ${total.toLocaleString()} verses` : `${shownHits.length} ${shownHits.length === 1 ? 'verse' : 'verses'}`}
          </div>
          {#each shownHits as h, i (h.b + ':' + h.c + ':' + h.v)}
            {@const idx = i + hitOffset}
            <a
              class="result"
              href={chapterUrl(tr, BOOKS[h.b], h.c, h.v)}
              data-active={active === idx}
              role="option"
              aria-selected={active === idx}
              onmouseenter={() => (active = idx)}
            >
              <span class="title">
                {BOOKS[h.b].name} {h.c}:{h.v}
                {#if h.otherWording}<span class="other" title="Your words matched how another translation phrases this verse">matched another translation</span>{/if}
              </span>
              <span class="text reading">{@html highlight(h.t, h.terms)}</span>
            </a>
          {/each}
        {:else if status === 'ready' && !ref && !situationUrls.length}
          <div class="status">No verses found for “{q}”.</div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: 100%;
  }
  .field {
    position: relative;
    display: flex;
    align-items: center;
  }
  .icon {
    position: absolute;
    left: 14px;
    color: var(--muted);
    pointer-events: none;
  }
  input {
    width: 100%;
    height: 42px;
    padding: 0 40px 0 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 16px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
    appearance: none;
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .hint {
    position: absolute;
    right: 12px;
    padding: 1px 7px;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: 12px;
  }
  @media (hover: none) {
    .hint {
      display: none;
    }
  }
  .hero input {
    height: 58px;
    padding-left: 50px;
    font-size: 18px;
    box-shadow: var(--shadow);
  }
  .hero .icon {
    left: 18px;
    width: 22px;
    height: 22px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .compact .panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 30;
    max-height: min(70vh, 560px);
    overflow-y: auto;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .hero .panel {
    margin-top: 16px;
    text-align: left;
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.12s, background 0.12s;
  }
  .compact .result {
    border-color: transparent;
  }
  .result[data-active='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  }
  .result.situation {
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
    background: color-mix(in srgb, var(--accent) 4%, var(--surface));
  }
  .result.situation .title {
    font-family: var(--font-reading);
    font-size: 18px;
  }
  .result.situation .label,
  .result.ref .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .title {
    font-size: 14px;
    font-weight: 600;
  }
  .ref .title {
    font-size: 17px;
  }
  .other {
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
  }
  .tr {
    margin-left: 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }
  .text {
    font-size: 16px;
    line-height: 1.55;
  }
  .meta,
  .status {
    color: var(--muted);
    font-size: 13px;
  }
  .status {
    padding: 2px 4px;
  }
</style>
