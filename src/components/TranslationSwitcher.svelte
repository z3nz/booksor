<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { TRANSLATIONS, DEFAULT_TRANSLATION, translationById } from '../lib/translations.ts';
  import { preferredTranslation, setPreferredTranslation } from '../lib/prefs.ts';

  // `location` is the rest of the path after the translation, e.g. "john/3" or "help/anxiety"
  let { current, location }: { current?: string; location?: string } = $props();

  let value = $state(DEFAULT_TRANSLATION);
  const name = $derived(translationById.get(value)?.name ?? '');

  onMount(() => {
    if (current) {
      value = current;
      setPreferredTranslation(current); // remember what the reader is reading
    } else {
      value = preferredTranslation();
    }
  });

  function change() {
    setPreferredTranslation(value);
    if (location) void navigate(`/${value}/${location}${window.location.hash}`);
    else if (current) void navigate(`/${value}`);
  }
</script>

<label class="wrap" title={name}>
  <span class="visually-hidden">Translation</span>
  <select bind:value onchange={change}>
    {#each TRANSLATIONS as t (t.id)}
      <option value={t.id}>{t.abbr}</option>
    {/each}
  </select>
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
</label>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  select {
    height: 40px;
    padding: 0 30px 0 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }
  svg {
    position: absolute;
    right: 11px;
    color: var(--muted);
    pointer-events: none;
  }
</style>
