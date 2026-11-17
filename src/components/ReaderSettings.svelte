<script lang="ts">
  import { onMount } from 'svelte';
  import { DEFAULT_SETTINGS, loadSettings, MAX_SIZE, MIN_SIZE, saveSettings, type Settings, type Theme } from '../lib/prefs.ts';

  let open = $state(false);
  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let root: HTMLElement;

  const THEMES: { id: Theme; label: string }[] = [
    { id: 'system', label: 'Auto' },
    { id: 'light', label: 'Light' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'dark', label: 'Dark' },
  ];

  onMount(() => {
    settings = loadSettings();
  });

  function update(patch: Partial<Settings>) {
    settings = { ...settings, ...patch };
    saveSettings(settings);
  }

  function onWindowClick(e: MouseEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
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
    aria-label="Reading settings"
    title="Reading settings"
    onclick={() => (open = !open)}
  >
    <span class="aa">A<span>a</span></span>
  </button>

  {#if open}
    <div class="panel card" id="reader-settings" role="dialog" aria-label="Reading settings">
      <div class="eyebrow">Theme</div>
      <div class="themes">
        {#each THEMES as t (t.id)}
          <button class="theme" aria-pressed={settings.theme === t.id} onclick={() => update({ theme: t.id })}>
            <span class="swatch {t.id}"></span>
            {t.label}
          </button>
        {/each}
      </div>

      <div class="eyebrow">Text size</div>
      <div class="size">
        <button
          class="btn btn-icon"
          aria-label="Smaller text"
          disabled={settings.size <= MIN_SIZE}
          onclick={() => update({ size: Math.max(MIN_SIZE, settings.size - 1) })}>A−</button
        >
        <input
          type="range"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={settings.size}
          aria-label="Text size"
          oninput={(e) => update({ size: Number(e.currentTarget.value) })}
        />
        <button
          class="btn btn-icon"
          aria-label="Larger text"
          disabled={settings.size >= MAX_SIZE}
          onclick={() => update({ size: Math.min(MAX_SIZE, settings.size + 1) })}>A+</button
        >
      </div>
      <p class="preview reading">In the beginning was the Word, and the Word was with God.</p>
    </div>
  {/if}
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
