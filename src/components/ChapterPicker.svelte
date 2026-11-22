<script lang="ts">
  import { navigate } from 'astro:transitions/client';
  import { BOOKS, bookBySlug, chapterUrl } from '../lib/books.ts';
  import type { Book } from '../lib/types.ts';
  import { fold } from '../lib/reference.ts';
  import { bookName, messages, type UiLang } from '../i18n/index.ts';

  let { tr, slug, chapter, lang = 'en' }: { tr: string; slug: string; chapter: number; lang?: UiLang } = $props();
  const m = $derived(messages(lang));
  const name = (b: Book) => bookName(b, lang);

  let dialog: HTMLDialogElement;
  let book = $state<Book | null>(null);
  let filter = $state('');

  const current = $derived(bookBySlug.get(slug)!);
  const shown = $derived(
    filter.trim() ? BOOKS.filter((b) => fold(name(b)).includes(fold(filter.trim()))) : BOOKS,
  );

  function openPicker() {
    book = null;
    filter = '';
    dialog.showModal();
  }

  function pick(b: Book) {
    if (b.chapters === 1) {
      dialog.close();
      void navigate(chapterUrl(tr, b, 1));
    }
    else book = b;
  }

  function onDialogClick(e: MouseEvent) {
    if (e.target === dialog) dialog.close(); // backdrop
  }
</script>

<button class="trigger" onclick={openPicker} aria-haspopup="dialog">
  <span>{name(current)} {chapter}</span>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
</button>

<dialog bind:this={dialog} onclick={onDialogClick} aria-label={m.picker.label}>
  <div class="inner">
    {#if book}
      <div class="head">
        <button class="btn" onclick={() => (book = null)}>{m.picker.back}</button>
        <h2>{name(book)}</h2>
        <button class="btn btn-icon" aria-label={m.picker.close} onclick={() => dialog.close()}>✕</button>
      </div>
      <div class="chapters">
        {#each Array.from({ length: book.chapters }, (_, i) => i + 1) as c (c)}
          <a href={chapterUrl(tr, book, c)} class:current={book === current && c === chapter}>{c}</a>
        {/each}
      </div>
    {:else}
      <div class="head">
        <input type="search" placeholder={m.picker.filter} bind:value={filter} aria-label={m.picker.filter} />
        <button class="btn btn-icon" aria-label={m.picker.close} onclick={() => dialog.close()}>✕</button>
      </div>
      {#each [['OT', m.books.ot], ['NT', m.books.nt]] as [t, label] (t)}
        {@const list = shown.filter((b) => b.testament === t)}
        {#if list.length}
          <h3 class="eyebrow">{label}</h3>
          <div class="books">
            {#each list as b (b.code)}
              <button class:current={b === current} onclick={() => pick(b)}>{name(b)}</button>
            {/each}
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</dialog>

<style>
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    margin-inline-start: -12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    font-family: var(--font-reading);
    font-size: clamp(26px, 5vw, 34px);
    font-weight: 600;
    letter-spacing: -0.01em;
    cursor: pointer;
  }
  .trigger:hover {
    background: var(--surface-2);
  }
  .trigger svg {
    color: var(--muted);
  }
  dialog {
    width: min(720px, calc(100vw - 32px));
    max-height: min(80vh, 760px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  dialog::backdrop {
    background: rgb(20 15 10 / 45%);
    backdrop-filter: blur(2px);
  }
  .inner {
    padding: 16px;
  }
  .head {
    position: sticky;
    top: -16px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -16px -16px 8px;
    padding: 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .head h2 {
    flex: 1;
    margin: 0;
    font-family: var(--font-reading);
    font-size: 20px;
    text-align: center;
  }
  .head input {
    flex: 1;
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    font-size: 16px;
  }
  h3 {
    margin: 16px 0 8px;
  }
  .books {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }
  .books button {
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    text-align: start;
    font-size: 15px;
    cursor: pointer;
  }
  .books button:hover {
    background: var(--surface-2);
  }
  .chapters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 6px;
  }
  .chapters a {
    display: grid;
    place-items: center;
    height: 48px;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text);
    font-weight: 500;
    text-decoration: none;
  }
  .chapters a:hover {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  }
  .current {
    border-color: var(--accent) !important;
    box-shadow: inset 0 0 0 1px var(--accent);
    font-weight: 600;
  }
</style>
