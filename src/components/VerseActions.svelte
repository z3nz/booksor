<script lang="ts">
  // Tap verses to select them, then highlight, bookmark, add a note, or share.
  // Also draws saved highlights/bookmarks/notes onto the chapter text.
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { iconSvg } from '../lib/icons.ts';
  import {
    chapterMarks,
    COLORS,
    emptyLibrary,
    loadLibrary,
    onLibraryChange,
    parsePassageKey,
    passageKey,
    saveLibrary,
    setHighlight,
    updatePassage,
    type Color,
    type Library,
    type PassageRef,
  } from '../lib/library.ts';
  import { compressVerses, copyText, shareOrCopy, shareOrDownloadImage, verseImage } from '../lib/share.ts';
  import { VERSE_SELECTION, XREF_OPEN, type VerseSelection } from '../lib/xref.ts';

  let {
    tr,
    abbr,
    bookName,
    bookIdx,
    chapter,
  }: { tr: string; abbr: string; bookName: string; bookIdx: number; chapter: number } = $props();

  let selected = $state<number[]>([]);
  let lib = $state<Library>(emptyLibrary());
  let toast = $state('');
  let busy = $state(false);

  let noteDialog: HTMLDialogElement;
  let noteFor = $state<PassageRef | null>(null);
  let noteText = $state('');

  const reference = $derived(selected.length ? `${bookName} ${chapter}:${compressVerses(selected)}` : '');
  const selection = $derived<PassageRef | null>(
    selected.length ? { b: bookIdx, c: chapter, from: selected[0], to: selected[selected.length - 1] } : null,
  );
  const marks = $derived(chapterMarks(lib, bookIdx, chapter));
  const selectedColors = $derived(new Set(selected.map((v) => marks.highlights.get(v))));
  /** Selected verses that have cross-references */
  const hasRelated = $derived(selected.some((v) => verseEl(v)?.querySelector('.xn')));
  const bookmarked = $derived(!!(selection && lib.passages[passageKey(selection)]?.bm));
  const hasNote = $derived(!!(selection && lib.passages[passageKey(selection)]?.note));

  const verseEls = () => document.querySelectorAll<HTMLElement>('.verses .verse[data-v]');
  const verseEl = (v: number) => document.querySelector<HTMLElement>(`.verses .verse[data-v="${v}"]`);
  const verseText = (el: HTMLElement | null) => el?.querySelector('.vt')?.textContent?.trim() ?? '';
  const refLabel = (p: PassageRef) => `${bookName} ${chapter}:${p.from === p.to ? p.from : `${p.from}–${p.to}`}`;

  function isContiguous(nums: number[]) {
    return nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  }

  function hashFor(nums: number[]) {
    if (!nums.length) return '';
    const first = nums[0];
    const last = nums[nums.length - 1];
    return isContiguous(nums) && last !== first ? `#v${first}-${last}` : `#v${first}`;
  }

  function setSelected(nums: number[]) {
    selected = [...new Set(nums)].sort((a, b) => a - b);
    const set = new Set(selected);
    for (const el of verseEls()) {
      el.classList.toggle('selected', set.has(Number(el.dataset.v)));
      el.classList.remove('target');
    }
    history.replaceState(history.state, '', window.location.pathname + hashFor(selected));
    window.dispatchEvent(new CustomEvent<VerseSelection>(VERSE_SELECTION, { detail: { verses: selected } }));
  }

  function openRelated() {
    window.dispatchEvent(new CustomEvent<VerseSelection>(XREF_OPEN, { detail: { verses: selected } }));
    // On phones the list opens as a sheet over the bottom of the page, where this bar is
    if (!window.matchMedia('(min-width: 1100px)').matches) setSelected([]);
  }

  /**
   * #v16-18 (a shared link) highlights and scrolls to those verses.
   * #at16 ("continue reading") just scrolls there.
   */
  function showTarget() {
    const at = window.location.hash.match(/^#at(\d+)$/);
    if (at) {
      const el = verseEl(Number(at[1]));
      history.replaceState(history.state, '', window.location.pathname);
      if (el && Number(at[1]) > 1) el.scrollIntoView({ block: 'start' });
      return;
    }
    const m = window.location.hash.match(/^#v(\d+)(?:-(\d+))?$/);
    if (!m) return;
    const from = Number(m[1]);
    const to = Math.max(from, Number(m[2] ?? from));
    let first: HTMLElement | null = null;
    for (const el of verseEls()) {
      const v = Number(el.dataset.v);
      const hit = v >= from && v <= to;
      el.classList.toggle('target', hit);
      if (hit) first ??= el;
    }
    first?.scrollIntoView({ block: 'center' });
  }

  function textOf(from: number, to: number) {
    const parts: string[] = [];
    for (let v = from; v <= to; v++) {
      const t = verseText(verseEl(v));
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }

  const selectedText = () => selected.map((v) => verseText(verseEl(v))).join(' ');
  const shareUrl = () => window.location.origin + window.location.pathname + hashFor(selected);

  function flash(msg: string) {
    toast = msg;
    setTimeout(() => (toast = ''), 2000);
  }

  function save(next: Library, message: string) {
    lib = next;
    flash(saveLibrary(next) ? message : 'Couldn’t save on this device');
  }

  // --- Highlights, bookmarks, notes ---

  function highlight(color: Color | null) {
    const verses = selected.map((v) => ({ b: bookIdx, c: chapter, v, t: verseText(verseEl(v)) }));
    save(setHighlight(lib, verses, color, tr), color ? 'Highlighted' : 'Highlight removed');
    setSelected([]);
  }

  function toggleBookmark() {
    if (!selection) return;
    const next = !bookmarked;
    save(updatePassage(lib, selection, { bm: next }, textOf(selection.from, selection.to), tr), next ? 'Bookmarked' : 'Bookmark removed');
    setSelected([]);
  }

  async function openNote(ref: PassageRef) {
    noteFor = ref;
    noteText = lib.passages[passageKey(ref)]?.note ?? '';
    await tick(); // let the dialog's contents render before opening it
    noteDialog.showModal();
    const box = noteDialog.querySelector('textarea');
    box?.focus();
    box?.setSelectionRange(box.value.length, box.value.length);
  }

  function saveNote(text: string) {
    if (!noteFor) return;
    const had = !!lib.passages[passageKey(noteFor)]?.note;
    const message = text.trim() ? 'Note saved' : had ? 'Note deleted' : '';
    lib = updatePassage(lib, noteFor, { note: text }, textOf(noteFor.from, noteFor.to), tr);
    if (!saveLibrary(lib)) flash('Couldn’t save on this device');
    else if (message) flash(message);
    noteDialog.close();
    setSelected([]);
  }

  /** Show saved highlights, bookmarks and notes in the chapter text. */
  function drawMarks(l: Library) {
    const { highlights, passages } = chapterMarks(l, bookIdx, chapter);
    for (const el of document.querySelectorAll('.verses .mark-icon')) el.remove();
    for (const el of verseEls()) {
      const color = highlights.get(Number(el.dataset.v));
      if (color) el.dataset.hl = color;
      else delete el.dataset.hl;
    }
    for (const p of passages) {
      const start = verseEl(p.from);
      if (p.bm && start) {
        const icon = document.createElement('span');
        icon.className = 'mark-icon bm-icon';
        icon.title = 'Bookmarked';
        icon.innerHTML = iconSvg('bookmark', 14, true);
        start.prepend(icon);
      }
      const end = verseEl(p.to) ?? start;
      if (p.note && end) {
        const btn = document.createElement('button');
        btn.className = 'mark-icon note-btn';
        btn.dataset.passage = p.key;
        btn.setAttribute('aria-label', `Your note on ${refLabel(p)}`);
        btn.title = p.note.length > 120 ? p.note.slice(0, 117) + '…' : p.note;
        btn.innerHTML = iconSvg('note', 15);
        end.append(btn);
      }
    }
  }

  $effect(() => drawMarks(lib));

  // --- Sharing ---

  async function copy() {
    const ok = await copyText(`“${selectedText()}” — ${reference} (${abbr})\n${shareUrl()}`);
    flash(ok ? 'Copied' : 'Couldn’t copy');
  }

  async function link() {
    const ok = await copyText(shareUrl());
    flash(ok ? 'Link copied' : 'Couldn’t copy');
  }

  async function share() {
    const result = await shareOrCopy({
      title: `${reference} (${abbr})`,
      text: `“${selectedText()}” — ${reference} (${abbr})`,
      url: shareUrl(),
    });
    if (result === 'copied') flash('Copied');
    else if (result === 'failed') flash('Couldn’t share');
  }

  async function image() {
    busy = true;
    try {
      const blob = await verseImage({ text: selectedText(), reference: `${reference} (${abbr})` });
      await shareOrDownloadImage(blob, `${reference.replace(/[^\w]+/g, '-')}-${tr}.png`, reference);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    lib = loadLibrary();
    showTarget();
    const container = document.querySelector('.verses');
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const noteBtn = target.closest<HTMLElement>('.note-btn');
      if (noteBtn?.dataset.passage) {
        openNote(parsePassageKey(noteBtn.dataset.passage));
        return;
      }
      if (target.closest('a, button')) return;
      if (window.getSelection()?.toString()) return; // let people select text normally
      const el = target.closest<HTMLElement>('.verse[data-v]');
      if (!el) return;
      const v = Number(el.dataset.v);
      setSelected(selected.includes(v) ? selected.filter((n) => n !== v) : [...selected, v]);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected.length && !noteDialog.open) setSelected([]);
    };
    const onHash = () => showTarget();
    const stopSync = onLibraryChange((l) => (lib = l));
    container?.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    return () => {
      stopSync();
      container?.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  });
</script>

{#if selected.length}
  <div class="bar card" role="toolbar" aria-label="Selected verses">
    <div class="row">
      <span class="ref">{reference}</span>
      <div class="colors" role="group" aria-label="Highlight color">
        {#each COLORS as color (color)}
          <button
            class="swatch"
            style="--swatch: var(--hl-{color})"
            aria-label="Highlight {color}"
            title="Highlight {color}"
            aria-pressed={selectedColors.size === 1 && selectedColors.has(color)}
            onclick={() => highlight(color)}
          ></button>
        {/each}
        {#if [...selectedColors].some(Boolean)}
          <button class="swatch clear" aria-label="Remove highlight" title="Remove highlight" onclick={() => highlight(null)}>
            <Icon name="close" size={14} />
          </button>
        {/if}
      </div>
      <button class="btn btn-icon close" aria-label="Clear selection" onclick={() => setSelected([])}>
        <Icon name="close" size={16} />
      </button>
    </div>
    <div class="actions">
      <button class="btn" onclick={() => selection && openNote(selection)}>
        <Icon name="note" size={16} />{hasNote ? 'Edit note' : 'Note'}
      </button>
      <button class="btn" aria-pressed={bookmarked} onclick={toggleBookmark}>
        <Icon name="bookmark" size={16} filled={bookmarked} />{bookmarked ? 'Saved' : 'Bookmark'}
      </button>
      {#if hasRelated}
        <button class="btn" onclick={openRelated}><Icon name="related" size={16} />Related</button>
      {/if}
      <button class="btn" onclick={copy}><Icon name="copy" size={16} />Copy</button>
      <button class="btn" onclick={link}><Icon name="link" size={16} />Link</button>
      <button class="btn" onclick={share}><Icon name="share" size={16} />Share</button>
      <button class="btn" onclick={image} disabled={busy}><Icon name="image" size={16} />{busy ? '…' : 'Image'}</button>
    </div>
  </div>
{/if}

<span class="toast" class:show={!!toast} role="status">{toast}</span>

<dialog class="note-dialog" bind:this={noteDialog} aria-labelledby="note-title" onclose={() => (noteFor = null)}>
  {#if noteFor}
    <form method="dialog" onsubmit={(e) => (e.preventDefault(), saveNote(noteText))}>
      <h2 id="note-title">{refLabel(noteFor)}</h2>
      <blockquote class="reading">{textOf(noteFor.from, noteFor.to)}</blockquote>
      <textarea bind:value={noteText} rows="5" placeholder="Write a note…" aria-label="Note"></textarea>
      <p class="hint">Saved on this device only. Back it up from your <a href="/saved">Saved</a> page.</p>
      <div class="note-actions">
        {#if lib.passages[passageKey(noteFor)]?.note}
          <button type="button" class="btn danger" onclick={() => saveNote('')}><Icon name="trash" size={16} />Delete</button>
        {/if}
        <span class="spacer"></span>
        <button type="button" class="btn" onclick={() => noteDialog.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  .bar {
    position: fixed;
    left: calc(50% - var(--xref-space, 0px) / 2);
    bottom: calc(16px + var(--listen-space, 0px) + var(--scroll-space, 0px) + env(safe-area-inset-bottom));
    z-index: 30;
    transform: translateX(-50%);
    width: max-content;
    max-width: calc(100vw - 24px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    animation: rise 0.18s ease-out;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ref {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .colors {
    display: flex;
    gap: 6px;
  }
  .swatch {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 50%;
    background: var(--swatch);
    cursor: pointer;
  }
  .swatch[aria-pressed='true'] {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  .swatch.clear {
    background: var(--surface);
    color: var(--muted);
  }
  .close {
    width: 32px;
    min-height: 32px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions .btn {
    min-height: 34px;
    padding: 0 11px;
    font-size: 13px;
    gap: 5px;
  }
  .actions .btn[aria-pressed='true'] {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
  @media (max-width: 520px) {
    .actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .toast {
    position: fixed;
    left: calc(50% - var(--xref-space, 0px) / 2);
    top: 76px;
    z-index: 50;
    transform: translateX(-50%);
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-size: 14px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .toast.show {
    opacity: 1;
  }
  .note-dialog {
    width: min(560px, calc(100vw - 24px));
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .note-dialog:focus-visible {
    outline: none;
  }
  .note-dialog::backdrop {
    background: rgb(20 15 10 / 45%);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
  blockquote {
    margin: 0;
    max-height: 7.5em;
    overflow: auto;
    padding-left: 12px;
    border-left: 3px solid var(--border);
    color: var(--muted);
    font-size: 15px;
    line-height: 1.5;
  }
  textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    font: inherit;
    font-size: 16px;
    color: inherit;
    resize: vertical;
  }
  textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .hint {
    margin: -4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }
  .note-actions {
    display: flex;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .danger {
    color: #b3261e;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
