<script lang="ts">
  import { onMount } from 'svelte';
  import OfflineSettings from './OfflineSettings.svelte';
  import { followPageLang, messages, type UiLang } from '../i18n/index.ts';
  import { DEFAULT_SETTINGS, loadSettings, MAX_SIZE, MIN_SIZE, updateSettings, type Settings, type Theme } from '../lib/prefs.ts';

  // Stays on screen across pages (transition:persist), so it follows each page's language
  let { lang: initialLang = 'en' }: { lang?: UiLang } = $props();
  let lang = $state(initialLang);
  const m = $derived(messages(lang));

  let open = $state(false);
  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let root: HTMLElement;

  const THEMES: Theme[] = ['system', 'light', 'sepia', 'dark'];

  onMount(() => {
    settings = loadSettings();
    return followPageLang((l) => (lang = l));
  });

  function update(patch: Partial<Settings>) {
    settings = updateSettings(patch);
  }

  function onWindowClick(e: MouseEvent) {
    // composedPath: the clicked button may already be gone from the page (e.g. swapped for a progress bar)
    if (open && !e.composedPath().includes(root)) open = false;
  }
  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="settings" bind:this={root}>
  <button
    class="btn btn-icon toggle"
    aria-expanded={open}
    aria-controls="reader-settings"
    aria-label={m.settings.label}
    title={m.settings.label}
    onclick={() => (open = !open)}
  >
    <span class="aa">A<span>a</span></span>
  </button>

  <!-- Stays mounted while closed so an offline download keeps its progress -->
  <div class="panel card" id="reader-settings" role="dialog" aria-label={m.settings.label} hidden={!open}>
      <div class="eyebrow">{m.settings.theme}</div>
      <div class="themes">
        {#each THEMES as t (t)}
          <button class="theme" aria-pressed={settings.theme === t} onclick={() => update({ theme: t })}>
            <span class="swatch {t}"></span>
            {m.settings.themes[t]}
          </button>
        {/each}
      </div>

      <div class="eyebrow">{m.settings.size}</div>
      <div class="size">
        <button
          class="btn btn-icon"
          aria-label={m.settings.smaller}
          disabled={settings.size <= MIN_SIZE}
          onclick={() => update({ size: Math.max(MIN_SIZE, settings.size - 1) })}>A−</button
        >
        <input
          type="range"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={settings.size}
          aria-label={m.settings.size}
          oninput={(e) => update({ size: Number(e.currentTarget.value) })}
        />
        <button
          class="btn btn-icon"
          aria-label={m.settings.larger}
          disabled={settings.size >= MAX_SIZE}
          onclick={() => update({ size: Math.min(MAX_SIZE, settings.size + 1) })}>A+</button
        >
      </div>
      <p class="preview reading" {lang}>{m.settings.preview}</p>
      <OfflineSettings active={open} {lang} />
  </div>
</div>

<style>
  .settings {
    position: relative;
  }
  .aa {
    font-family: var(--font-reading);
    font-size: 18px;
    font-weight: 600;
  }
  .aa span {
    font-size: 14px;
  }
  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 40;
    width: min(320px, calc(100vw - 32px));
    max-height: calc(100dvh - 90px);
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: transparent;
    font-size: 12px;
    cursor: pointer;
  }
  .theme[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 15%);
  }
  .swatch.system {
    background: linear-gradient(135deg, #fbf8f2 50%, #15130f 50%);
  }
  .swatch.light {
    background: #fbf8f2;
  }
  .swatch.sepia {
    background: #f1e7d0;
  }
  .swatch.dark {
    background: #15130f;
  }
  .size {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .size input {
    flex: 1;
    accent-color: var(--accent);
  }
  .size .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .preview {
    margin: 4px 0 0;
    font-size: var(--reader-size);
    line-height: 1.6;
  }
</style>
