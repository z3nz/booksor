<script lang="ts">
  // The Saved page: highlights, notes and bookmarks kept on this device, plus backup/restore.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { BOOKS, chapterUrl } from '../lib/books.ts';
  import {
    backupFile,
    COLORS,
    countSaved,
    emptyLibrary,
    highlightGroups,
    loadLibrary,
    mergeLibraries,
    onLibraryChange,
    parseLibrary,
    parsePassageKey,
    parseVerseKey,
    saveLibrary,
    setHighlight,
    updatePassage,
    type Color,
    type Library,
    type PassageRef,
  } from '../lib/library.ts';
  import { loadLastRead, preferredTranslation, type LastRead } from '../lib/prefs.ts';
  import { DEFAULT_TRANSLATION, translationById } from '../lib/translations.ts';

  type Tab = 'highlights' | 'notes' | 'bookmarks';

  let lib = $state<Library>(emptyLibrary());
  let ready = $state(false);
  let tab = $state<Tab>('highlights');
  let color = $state<Color | null>(null);
  let order = $state<'newest' | 'bible'>('newest');
  let tr = $state(DEFAULT_TRANSLATION);
  let last = $state<LastRead | null>(null);
  let toast = $state('');
  let undo = $state<Library | null>(null);
  let editing = $state<string | null>(null);
  let draft = $state('');
  let confirmClear = $state(false);
  let fileInput: HTMLInputElement;

  const counts = $derived(countSaved(lib));

  interface Item extends PassageRef {
    key: string;
    t: string;
    tr: string;
    at: number;
    color?: Color;
    note?: string;
    keys?: string[];
  }

  const items = $derived.by((): Item[] => {
    let list: Item[];
    if (tab === 'highlights') {
      list = highlightGroups(lib)
        .filter((g) => !color || g.color === color)
        .map((g) => ({ ...g, key: g.keys[0] }));
    } else {
      list = Object.entries(lib.passages)
        .filter(([, p]) => (tab === 'notes' ? p.note : p.bm))
        .map(([key, p]) => ({ key, ...parsePassageKey(key), ...p }));
    }
    return order === 'newest'
      ? list.sort((a, b) => b.at - a.at)
      : list.sort((a, b) => a.b - b.b || a.c - b.c || a.from - b.from);
  });

  const TABS: { id: Tab; label: string }[] = [
    { id: 'highlights', label: 'Highlights' },
    { id: 'notes', label: 'Notes' },
    { id: 'bookmarks', label: 'Bookmarks' },
  ];

  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const refOf = (p: PassageRef) => `${BOOKS[p.b]?.name ?? '?'} ${p.c}:${p.from === p.to ? p.from : `${p.from}–${p.to}`}`;
  const urlOf = (p: PassageRef) => chapterUrl(tr, BOOKS[p.b], p.c, p.from, p.to);

  function flash(message: string, before: Library | null = null) {
    toast = message;
    undo = before;
    setTimeout(() => {
      if (toast === message) {
        toast = '';
        undo = null;
      }
    }, 5000);
  }

  function commit(next: Library, message: string, canUndo = true) {
    const before = lib;
    lib = next;
    if (!saveLibrary(next)) flash('Couldn’t save on this device');
    else flash(message, canUndo ? before : null);
  }

  function remove(item: Item) {
    if (tab === 'highlights') {
      const verses = (item.keys ?? []).map((k) => ({ ...parseVerseKey(k), t: '' }));
      commit(setHighlight(lib, verses, null, item.tr), 'Highlight removed');
    } else {
      const patch = tab === 'notes' ? { note: '' } : { bm: false };
      commit(updatePassage(lib, item, patch, item.t, item.tr), tab === 'notes' ? 'Note deleted' : 'Bookmark removed');
    }
  }

  function startEdit(item: Item) {
    editing = item.key;
    draft = item.note ?? '';
  }

  function saveEdit(item: Item) {
    commit(updatePassage(lib, item, { note: draft }, item.t, item.tr), draft.trim() ? 'Note saved' : 'Note deleted');
    editing = null;
  }

  function restoreUndo() {
    if (!undo) return;
    lib = undo;
    saveLibrary(undo);
    toast = 'Restored';
    undo = null;
  }

  function download() {
    const url = URL.createObjectURL(backupFile(lib));
    const a = document.createElement('a');
    a.href = url;
    a.download = `booksor-saved-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restore(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    try {
      const incoming = parseLibrary(JSON.parse(await file.text()));
      const added = Object.keys(incoming.highlights).length + Object.keys(incoming.passages).length;
      if (!added) return flash('That file has nothing to restore');
      commit(mergeLibraries(lib, incoming), 'Backup restored');
    } catch {
      flash('That doesn’t look like a Booksor backup');
    }
  }

  function clearAll() {
    if (!confirmClear) {
      confirmClear = true;
      setTimeout(() => (confirmClear = false), 4000);
      return;
    }
    confirmClear = false;
    commit(emptyLibrary(), 'Everything deleted');
  }

  onMount(() => {
    lib = loadLibrary();
    tr = preferredTranslation();
    last = loadLastRead();
    const c = countSaved(lib);
    if (!c.highlights) tab = c.notes ? 'notes' : c.bookmarks ? 'bookmarks' : 'highlights';
    ready = true;
    return onLibraryChange((l) => (lib = l));
  });
</script>

{#if last}
  {@const book = BOOKS.find((b) => b.slug === last?.slug)}
  {#if book}
    <a class="continue card" href={`${chapterUrl(tr, book, last.chapter)}#at${last.verse}`}>
      <span class="eyebrow">Continue reading</span>
      <span class="continue-ref">{book.name} {last.chapter}{last.verse > 1 ? `:${last.verse}` : ''}</span>
    </a>
  {/if}
{/if}

<div class="tabs" role="tablist" aria-label="Saved">
  {#each TABS as t (t.id)}
    <button role="tab" aria-selected={tab === t.id} onclick={() => ((tab = t.id), (editing = null))}>
      {t.label}
      <span class="count">{counts[t.id]}</span>
    </button>
  {/each}
</div>

<div class="toolbar">
  {#if tab === 'highlights'}
    <div class="colors" role="group" aria-label="Filter by color">
      <button class="chip" aria-pressed={!color} onclick={() => (color = null)}>All</button>
      {#each COLORS as c (c)}
        <button
          class="dot"
          style="--swatch: var(--hl-{c})"
          aria-label="Only {c}"
          aria-pressed={color === c}
          onclick={() => (color = color === c ? null : c)}
        ></button>
      {/each}
    </div>
  {:else}
    <span></span>
  {/if}
  <label class="sort">
    <span class="visually-hidden">Sort</span>
    <select bind:value={order}>
      <option value="newest">Newest first</option>
      <option value="bible">Bible order</option>
    </select>
  </label>
</div>

{#if !ready}
  <p class="empty">Loading…</p>
{:else if !items.length}
  <div class="empty card">
    {#if color}
      <p>No {color} highlights yet.</p>
    {:else}
      <p><strong>Nothing here yet.</strong></p>
      <p>While reading, tap a verse (or several), then pick a highlight color, <em>Note</em> or <em>Bookmark</em>.</p>
      <a class="btn btn-primary" href={`/${tr}/john/1`}>Start reading</a>
    {/if}
  </div>
{:else}
  <ul class="items">
    {#each items as item (item.key)}
      <li class="item card" style={item.color ? `--swatch: var(--hl-${item.color})` : ''} class:colored={!!item.color}>
        <div class="item-head">
          <a class="ref" href={urlOf(item)}>{refOf(item)}</a>
          <span class="meta">{translationById.get(item.tr)?.abbr ?? ''} · {dateFormat.format(item.at)}</span>
        </div>
        <p class="text reading">{item.t}</p>
        {#if tab === 'notes'}
          {#if editing === item.key}
            <!-- svelte-ignore a11y_autofocus -->
            <textarea bind:value={draft} rows="4" aria-label="Note" autofocus></textarea>
            <div class="item-actions">
              <button class="btn" onclick={() => (editing = null)}>Cancel</button>
              <button class="btn btn-primary" onclick={() => saveEdit(item)}>Save</button>
            </div>
          {:else}
            <p class="note">{item.note}</p>
          {/if}
        {/if}
        {#if editing !== item.key}
          <div class="item-actions">
            <a class="btn" href={urlOf(item)}>Read</a>
            {#if tab === 'notes'}
              <button class="btn" onclick={() => startEdit(item)}>Edit</button>
            {/if}
            <button class="btn btn-icon" aria-label="Remove {refOf(item)}" title="Remove" onclick={() => remove(item)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<section class="backup" aria-labelledby="backup-heading">
  <h2 id="backup-heading" class="eyebrow">Your data</h2>
  <p>
    Everything you save stays in this browser on this device. Nothing is sent to us. Download a backup now and then,
    and restore it on another device or browser.
  </p>
  <div class="backup-actions">
    <button class="btn" onclick={download} disabled={!counts.highlights && !counts.notes && !counts.bookmarks}>
      <Icon name="download" size={16} />Download backup
    </button>
    <button class="btn" onclick={() => fileInput.click()}><Icon name="upload" size={16} />Restore backup</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={restore} />
    <button class="btn danger" onclick={clearAll} disabled={!counts.highlights && !counts.notes && !counts.bookmarks}>
      <Icon name="trash" size={16} />{confirmClear ? 'Tap again to delete everything' : 'Delete everything'}
    </button>
  </div>
</section>

<div class="toast" class:show={!!toast} role="status">
  <span>{toast}</span>
  {#if undo}<button onclick={restoreUndo}>Undo</button>{/if}
</div>

<style>
  .continue {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 18px;
    margin-bottom: 24px;
    color: var(--text);
    text-decoration: none;
  }
  .continue:hover {
    border-color: var(--accent);
  }
  .continue-ref {
    font-family: var(--font-reading);
    font-size: 20px;
    font-weight: 600;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    margin-bottom: -1px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .count {
    min-width: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 12px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 16px 0;
  }
  .colors {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chip {
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 13px;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
  }
  .dot {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 50%;
    background: var(--swatch);
    cursor: pointer;
  }
  .dot[aria-pressed='true'] {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px var(--accent);
  }
  .sort select {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    font-size: 13px;
  }
  .empty {
    padding: 24px;
    color: var(--muted);
    text-align: center;
  }
  .empty p {
    margin: 0 0 8px;
  }
  .empty .btn {
    margin-top: 8px;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    padding: 16px 18px;
  }
  .item.colored {
    border-inline-start: 6px solid var(--swatch);
  }
  .item-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .ref {
    font-weight: 600;
    text-decoration: none;
  }
  .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .text {
    display: -webkit-box;
    margin: 8px 0 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    font-size: 17px;
    line-height: 1.55;
  }
  .note {
    margin: 10px 0 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    white-space: pre-wrap;
  }
  textarea {
    width: 100%;
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    font: inherit;
    font-size: 16px;
    color: inherit;
    resize: vertical;
  }
  .item-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 12px;
  }
  .item-actions .btn {
    min-height: 34px;
    font-size: 13px;
  }
  .item-actions .btn-icon {
    width: 34px;
  }
  .backup {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }
  .backup h2 {
    margin: 0 0 8px;
  }
  .backup p {
    margin: 0 0 16px;
    color: var(--muted);
    font-size: 15px;
  }
  .backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .danger {
    color: #b3261e;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(20px + env(safe-area-inset-bottom));
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 12px;
    transform: translateX(-50%);
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-size: 14px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }
  .toast.show {
    opacity: 1;
    pointer-events: auto;
  }
  .toast button {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
