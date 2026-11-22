<script lang="ts">
  import { onMount } from 'svelte';
  import { bookBySlug, chapterUrl } from '../lib/books.ts';
  import { preferredTranslation, TRANSLATION_EVENT } from '../lib/prefs.ts';
  import { shareOrCopy, shareOrDownloadImage, verseImage } from '../lib/share.ts';
  import { DEFAULT_TRANSLATION, defaultTranslationFor, languageOf, translationById } from '../lib/translations.ts';
  import { votdIndex, type VotdEntry, type VotdMode } from '../lib/votd.ts';
  import { messages, type UiLang } from '../i18n/index.ts';

  let { lang = 'en' }: { lang?: UiLang } = $props();
  const m = $derived(messages(lang));
  /** The reader's translation, if it's in this page's language */
  const pick = (tr: string) => (languageOf(tr) === lang ? tr : defaultTranslationFor(lang));

  let tr = $state(DEFAULT_TRANSLATION);
  let mode = $state<VotdMode>('day');
  let entries = $state<VotdEntry[]>([]);
  let now = $state(new Date());
  let toast = $state('');

  const entry = $derived(entries.length ? entries[votdIndex(now, mode, entries.length)] : null);
  const abbr = $derived(translationById.get(tr)?.abbr ?? '');
  const url = $derived(entry ? chapterUrl(tr, bookBySlug.get(entry.slug)!, entry.chapter, entry.verse, entry.endVerse) : '#');

  async function load(id: string) {
    tr = id;
    try {
      const res = await fetch(`/votd/${id}.json`);
      entries = await res.json();
    } catch {
      entries = [];
    }
  }

  onMount(() => {
    load(pick(preferredTranslation()));
    const onTr = (e: Event) => load(pick((e as CustomEvent<string>).detail));
    window.addEventListener(TRANSLATION_EVENT, onTr);
    const tick = setInterval(() => (now = new Date()), 30_000);
    return () => {
      window.removeEventListener(TRANSLATION_EVENT, onTr);
      clearInterval(tick);
    };
  });

  function flash(msg: string) {
    toast = msg;
    setTimeout(() => (toast = ''), 2000);
  }

  async function share() {
    if (!entry) return;
    const result = await shareOrCopy({
      title: `${entry.ref} (${abbr})`,
      text: `“${entry.text}” — ${entry.ref} (${abbr})`,
      url: new URL(url, window.location.origin).href,
    });
    if (result === 'copied') flash(m.votd.copied);
    else if (result === 'failed') flash(m.votd.cantShare);
  }

  async function image() {
    if (!entry) return;
    const blob = await verseImage({ text: entry.text, reference: `${entry.ref} (${abbr})` });
    await shareOrDownloadImage(blob, `${entry.ref.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')}-${tr}.png`, entry.ref);
  }
</script>

<section class="votd card" aria-labelledby="votd-heading">
  <div class="top">
    <h2 id="votd-heading" class="eyebrow">{m.votd.heading(mode)}</h2>
    <div class="tabs" role="group" aria-label={m.votd.every}>
      <button aria-pressed={mode === 'day'} onclick={() => (mode = 'day')}>{m.votd.day}</button>
      <button aria-pressed={mode === 'hour'} onclick={() => (mode = 'hour')}>{m.votd.hour}</button>
    </div>
  </div>

  {#if entry}
    <blockquote class="reading" lang={languageOf(tr)}>
      <p>{entry.text}</p>
      <footer><a href={url}>{entry.ref}</a> <span class="tr">{abbr}</span></footer>
    </blockquote>
    <div class="actions">
      <a class="btn btn-primary" href={url}>{m.votd.read}</a>
      <button class="btn" onclick={share}>{m.votd.share}</button>
      <button class="btn" onclick={image}>{m.votd.image}</button>
      <span class="toast" role="status">{toast}</span>
    </div>
  {:else}
    <div class="skeleton" aria-hidden="true">
      <span></span><span></span><span class="short"></span>
    </div>
  {/if}
</section>

<style>
  .votd {
    padding: 24px;
    text-align: left;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
  }
  .tabs {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .tabs button {
    padding: 4px 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .tabs button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 10%);
  }
  blockquote {
    margin: 18px 0 0;
  }
  blockquote p {
    margin: 0;
    font-size: clamp(20px, 3.4vw, 26px);
    line-height: 1.5;
  }
  blockquote footer {
    margin-top: 12px;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 600;
  }
  blockquote footer a {
    text-decoration: none;
  }
  .tr {
    color: var(--muted);
    font-weight: 500;
    font-size: 13px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 20px;
  }
  .toast {
    color: var(--muted);
    font-size: 13px;
  }
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;
  }
  .skeleton span {
    height: 20px;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .skeleton .short {
    width: 40%;
  }
</style>
