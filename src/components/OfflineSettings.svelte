<script lang="ts">
  // In the reading settings panel: download the current translation for offline use, and install the app.
  import { onMount } from 'svelte';
  import {
    downloadTranslation,
    formatSize,
    loadManifest,
    offlineStatus,
    offlineSupported,
    removeTranslation,
    type OfflineStatus,
  } from '../lib/offline.ts';
  import { preferredTranslation, TRANSLATION_EVENT } from '../lib/prefs.ts';
  import { DEFAULT_TRANSLATION, TRANSLATIONS, translationById } from '../lib/translations.ts';

  /** True while the settings panel is open; nothing is checked until it first opens */
  let { active }: { active: boolean } = $props();

  interface InstallPrompt extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  let supported = $state(true);
  let tr = $state(DEFAULT_TRANSLATION);
  let bytes = $state<number | null>(null);
  let status = $state<OfflineStatus | null>(null);
  let downloading = $state(false);
  let progress = $state({ done: 0, total: 1 });
  let error = $state('');
  let installPrompt = $state<InstallPrompt | null>(null);
  let ios = $state(false);
  let installed = $state(false);
  let controller: AbortController | null = null;
  let checked = false;

  const abbr = $derived(translationById.get(tr)?.abbr ?? tr.toUpperCase());
  const complete = $derived(!!status && status.done >= status.total);
  // Pages you've read are saved anyway; only call it a partial download once it's a real chunk
  const savedShare = $derived(status ? status.done / status.total : 0);
  const partial = $derived(savedShare >= 0.05);
  const percent = $derived(Math.floor((progress.done / Math.max(1, progress.total)) * 100));

  async function refresh() {
    if (!offlineSupported()) {
      supported = false;
      return;
    }
    const m = await loadManifest();
    bytes = m?.translations[tr]?.bytes ?? null;
    status = await offlineStatus(tr);
  }

  $effect(() => {
    if (active && !checked) {
      checked = true;
      refresh();
    }
  });

  async function download() {
    error = '';
    downloading = true;
    controller = new AbortController();
    try {
      await downloadTranslation(tr, (done, total) => (progress = { done, total }), controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) {
        error = navigator.onLine ? 'The download stopped. Try again to pick up where it left off.' : 'You’re offline. Connect and try again to finish.';
      }
    } finally {
      downloading = false;
      controller = null;
      await refresh();
    }
  }

  async function remove() {
    const lang = translationById.get(tr)?.language;
    const keep = { language: false, all: false };
    for (const other of TRANSLATIONS) {
      if (other.id === tr) continue;
      const s = await offlineStatus(other.id);
      if (!s || s.done < s.total) continue;
      keep.all = true;
      if (other.language === lang) keep.language = true;
    }
    await removeTranslation(tr, keep);
    await refresh();
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') installed = true;
    installPrompt = null;
  }

  onMount(() => {
    tr = preferredTranslation();
    installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const w = window as { booksorInstall?: InstallPrompt };
    installPrompt = w.booksorInstall ?? null;
    const onInstallable = () => (installPrompt = w.booksorInstall ?? null);
    const onInstalled = () => ((installed = true), (installPrompt = null));
    const onTr = (e: Event) => {
      if (downloading) return;
      tr = (e as CustomEvent<string>).detail;
      if (checked) refresh();
    };
    window.addEventListener('booksor:installable', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(TRANSLATION_EVENT, onTr);
    return () => {
      controller?.abort();
      window.removeEventListener('booksor:installable', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(TRANSLATION_EVENT, onTr);
    };
  });
</script>

<div class="offline">
  <div class="eyebrow">Offline</div>
  {#if !supported}
    <p class="muted">This browser can’t save the Bible for offline reading.</p>
  {:else if downloading}
    <div class="bar" role="progressbar" aria-label="Saving {abbr} for offline" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style="width: {percent}%"></span>
    </div>
    <div class="row">
      <span class="muted">Saving {abbr}… {percent}%</span>
      <button class="btn small" onclick={() => controller?.abort()}>Cancel</button>
    </div>
  {:else if complete}
    <div class="row">
      <span class="done">✓ {abbr} is saved for offline reading</span>
      <button class="btn small" onclick={remove}>Remove</button>
    </div>
  {:else}
    <button class="btn wide" onclick={download} disabled={!status}>
      {partial ? 'Finish downloading' : 'Download'}
      {abbr}{bytes ? ` · ${formatSize(bytes)}` : ''}
    </button>
    <p class="muted">
      Every chapter plus search, so you can read anywhere without internet.
      {#if partial}{Math.floor(savedShare * 100)}% saved so far.{/if}
    </p>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if !installed}
    {#if installPrompt}
      <button class="btn wide" onclick={install}>Install Booksor as an app</button>
    {:else if ios}
      <p class="muted">Install on iPhone or iPad: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
    {/if}
  {/if}
</div>

<style>
  .offline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .muted {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .done {
    font-size: 14px;
    font-weight: 500;
  }
  .error {
    margin: 0;
    color: #b3261e;
    font-size: 13px;
  }
  .wide {
    width: 100%;
    min-height: 38px;
    font-size: 14px;
  }
  .small {
    min-height: 30px;
    padding: 0 10px;
    font-size: 13px;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .bar {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
</style>
