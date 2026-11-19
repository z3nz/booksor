<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { TRANSLATIONS, DEFAULT_TRANSLATION, defaultTranslationFor, languageOf, translationById } from '../lib/translations.ts';
  import { preferredTranslation, setPreferredTranslation } from '../lib/prefs.ts';
  import { homeUrl, messages, UI_LANGS, uiLang, type UiLang } from '../i18n/index.ts';

  // `location` is the rest of the path after the translation, e.g. "john/3" or "help/anxiety"
  let { current, location, lang = 'en' }: { current?: string; location?: string; lang?: UiLang } = $props();
  const m = $derived(messages(lang));
  const groups = [...Map.groupBy(TRANSLATIONS, (t) => t.languageName)];

  let value = $state(DEFAULT_TRANSLATION);
  const name = $derived(translationById.get(value)?.name ?? '');

  onMount(() => {
    if (current) {
      value = current;
      setPreferredTranslation(current); // remember what the reader is reading
    } else {
      // Pages without a Bible on them show the reader's translation, if it's in the page's language
      const preferred = preferredTranslation();
      value = uiLang(languageOf(preferred)) === lang ? preferred : defaultTranslationFor(lang);
    }
  });

  function change() {
    setPreferredTranslation(value);
    const otherLanguage = uiLang(languageOf(value)) !== lang;
    // Topic pages ("help/anxiety") are only in English so far
    if (location && !(otherLanguage && location.startsWith('help/'))) void navigate(`/${value}/${location}${window.location.hash}`);
    else if (current) void navigate(`/${value}`);
    // On a home page, picking a Bible in another language goes to that language's home page
    else if (otherLanguage && onHomePage()) void navigate(homeUrl(uiLang(languageOf(value))));
  }

  function onHomePage() {
    const path = window.location.pathname.replace(/(\/index)?\.html$/, '').replace(/(.)\/$/, '$1') || '/';
    return UI_LANGS.some((l) => homeUrl(l) === path);
  }
</script>

<label class="wrap" title={name}>
  <span class="visually-hidden">{m.translation.label}</span>
  <select bind:value onchange={change}>
    {#each groups as [language, list] (language)}
      <optgroup label={language}>
        {#each list as t (t.id)}
          <option value={t.id}>{t.abbr}</option>
        {/each}
      </optgroup>
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
