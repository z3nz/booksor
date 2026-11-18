<script lang="ts">
  // Under the chapter title: Listen (handled by the site-wide ListenPlayer), auto-scroll, focus mode, and
  // study mode (cross-reference counts on each verse; the CrossRefs panel does the rest).
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import Icon from './Icon.svelte';
  import { chapterPath, LISTEN_STATE, listenState, requestListen, type ListenState } from '../lib/listen.ts';
  import { loadSettings, updateSettings } from '../lib/prefs.ts';
  import { scrollPixelsPerSecond } from '../lib/speech.ts';
  import { STUDY_EVENT } from '../lib/xref.ts';

  let { nextUrl }: { nextUrl: string | null } = $props();

  const SCROLL_CARRY_KEY = 'booksor:autoplay';

  let listening = $state(false);
  let scrolling = $state(false); // the auto-scroll bar is open
  let playing = $state(false); // auto-scroll is moving
  let status = $state('');
  let showOptions = $state(false);
  let barHeight = $state(0);
  let scrollSpeed = $state(3);
  let continueNext = $state(true);
  let focus = $state(false);
  let study = $state(false);

  let raf = 0;
  let lastTime = 0;
  let y = 0;
  let run = 0;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  const here = () => chapterPath(window.location.pathname);

  // --- Listen ---

  /** Start from a selected or linked verse, else the first one on screen */
  function startVerse(): number | undefined {
    const els = [...document.querySelectorAll<HTMLElement>('.verses .verse[data-v]')];
    const picked = els.find((el) => el.classList.contains('selected') || el.classList.contains('target'));
    const el = picked ?? els.find((e) => e.getBoundingClientRect().bottom > 90);
    return el ? Number(el.dataset.v) : undefined;
  }

  function toggleListen() {
    if (listening) requestListen({ action: 'stop' });
    else requestListen({ action: 'start', url: here(), verse: startVerse() });
  }

  const showListenState = (s: ListenState) => (listening = s.active && s.url === here());

  // --- Auto-scroll ---

  function readerSize() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 19;
  }

  function stopScroll(message = '') {
    run++;
    clearTimeout(nextTimer);
    cancelAnimationFrame(raf);
    playing = false;
    status = message;
  }

  function startScroll() {
    stopScroll();
    playing = true;
    lastTime = performance.now();
    y = window.scrollY;
    const id = run;
    const pager = document.querySelector('.chapter .pager');
    const tick = (t: number) => {
      if (id !== run) return;
      const dt = Math.min(0.1, (t - lastTime) / 1000);
      lastTime = t;
      // If the reader scrolls by hand, carry on from where they put it
      if (Math.abs(window.scrollY - y) > 3) y = window.scrollY;
      y += scrollPixelsPerSecond(scrollSpeed, readerSize()) * dt;
      window.scrollTo(0, y);
      const atEnd =
        (pager && pager.getBoundingClientRect().top < window.innerHeight - barHeight - 16) ||
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atEnd) endOfChapter();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function endOfChapter() {
    stopScroll();
    if (continueNext && nextUrl) {
      status = 'Next chapter…';
      nextTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(SCROLL_CARRY_KEY, 'scroll');
        } catch {
          // the next chapter just won't start scrolling by itself
        }
        void navigate(nextUrl!);
      }, 2500);
    } else {
      status = nextUrl ? 'End of chapter' : 'The end';
    }
  }

  function toggleScrollBar() {
    if (scrolling) closeScroll();
    else {
      scrolling = true;
      showOptions = false;
      startScroll();
    }
  }

  function closeScroll() {
    stopScroll();
    scrolling = false;
  }

  function setScrollSpeed(s: number) {
    scrollSpeed = Math.min(10, Math.max(1, s));
    updateSettings({ scrollSpeed });
  }

  function setContinue(on: boolean) {
    continueNext = on;
    updateSettings({ continueNext: on });
  }

  // --- Focus ---

  function toggleFocus() {
    focus = !focus;
    updateSettings({ focus });
  }

  // --- Study ---

  function toggleStudy() {
    study = !study;
    updateSettings({ study });
    window.dispatchEvent(new CustomEvent(STUDY_EVENT, { detail: study }));
  }

  // Keep the selected-verse bar and the end of the page clear of the auto-scroll bar
  const setSpace = () => document.documentElement.style.setProperty('--scroll-space', scrolling ? `${barHeight + 12}px` : '0px');
  $effect(setSpace);

  onMount(() => {
    const s = loadSettings();
    scrollSpeed = s.scrollSpeed;
    continueNext = s.continueNext;
    focus = s.focus;
    study = s.study;
    showListenState(listenState());

    // Keep scrolling from the previous chapter
    try {
      if (sessionStorage.getItem(SCROLL_CARRY_KEY) === 'scroll') {
        sessionStorage.removeItem(SCROLL_CARRY_KEY);
        scrolling = true;
        window.scrollTo(0, 0);
        status = 'Starting…';
        nextTimer = setTimeout(startScroll, 1500);
      }
    } catch {
      // ignore
    }

    const onListen = (e: Event) => showListenState((e as CustomEvent<ListenState>).detail);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open], .verse.selected')) return;
      if (scrolling) closeScroll();
      else if (focus) toggleFocus();
    };
    window.addEventListener(LISTEN_STATE, onListen);
    window.addEventListener('keydown', onKey);
    return () => {
      stopScroll();
      document.documentElement.style.setProperty('--scroll-space', '0px');
      window.removeEventListener(LISTEN_STATE, onListen);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="tools" role="group" aria-label="Reading tools">
  <button class="btn tool" aria-pressed={listening} onclick={toggleListen}>
    <Icon name="listen" size={16} />Listen
  </button>
  <button class="btn tool" aria-pressed={scrolling} onclick={toggleScrollBar}>
    <Icon name="scroll" size={16} />Auto-scroll
  </button>
  <button class="btn tool" aria-pressed={focus} onclick={toggleFocus}>
    <Icon name="focus" size={16} />Focus
  </button>
  <button class="btn tool" aria-pressed={study} onclick={toggleStudy} title="Show related passages for each verse">
    <Icon name="study" size={16} />Study
  </button>
</div>

{#if focus}
  <button class="btn exit-focus" onclick={toggleFocus} title="Exit focus mode (Esc)">
    <Icon name="unfocus" size={16} />Exit focus
  </button>
{/if}

{#if scrolling}
  <div class="scroller card" role="region" aria-label="Auto-scroll" bind:offsetHeight={barHeight}>
    {#if showOptions}
      <div class="options">
        <label class="check">
          <input type="checkbox" checked={continueNext} onchange={(e) => setContinue(e.currentTarget.checked)} />
          <span>Keep going into the next chapter</span>
        </label>
      </div>
    {/if}
    <div class="controls">
      <button class="btn btn-icon" aria-label="Slower" disabled={scrollSpeed <= 1} onclick={() => setScrollSpeed(scrollSpeed - 1)}>
        <Icon name="minus" size={16} />
      </button>
      <button
        class="btn btn-icon btn-primary main"
        aria-label={playing ? 'Pause' : 'Start scrolling'}
        onclick={() => (playing ? stopScroll() : startScroll())}
      >
        <Icon name={playing ? 'pause' : 'play'} size={20} filled />
      </button>
      <button class="btn btn-icon" aria-label="Faster" disabled={scrollSpeed >= 10} onclick={() => setScrollSpeed(scrollSpeed + 1)}>
        <Icon name="plus" size={16} />
      </button>
      <span class="where">{status || `Speed ${scrollSpeed}`}</span>
      <button class="btn btn-icon" aria-label="Options" aria-expanded={showOptions} onclick={() => (showOptions = !showOptions)}>
        <Icon name="sliders" size={16} />
      </button>
      <button class="btn btn-icon" aria-label="Close" onclick={closeScroll}><Icon name="close" size={16} /></button>
    </div>
  </div>
{/if}

<style>
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .tool {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
    color: var(--muted);
    gap: 6px;
  }
  .tool[aria-pressed='true'] {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .exit-focus {
    position: fixed;
    top: 12px;
    right: calc(12px + var(--xref-space, 0px));
    z-index: 25;
    min-height: 34px;
    font-size: 13px;
    opacity: 0.55;
    transition: opacity 0.2s;
  }
  .exit-focus:hover,
  .exit-focus:focus-visible {
    opacity: 1;
  }
  .scroller {
    position: fixed;
    left: calc(50% - var(--xref-space, 0px) / 2);
    /* Sits above the read-aloud player if both are open */
    bottom: calc(12px + var(--listen-space, 0px) + env(safe-area-inset-bottom));
    z-index: 29;
    transform: translateX(-50%);
    width: max-content;
    max-width: calc(100vw - 24px);
    padding: 8px;
    animation: rise 0.18s ease-out;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .controls .btn-icon {
    width: 36px;
    min-height: 36px;
  }
  .controls .main {
    width: 44px;
    min-height: 44px;
  }
  .controls .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .where {
    min-width: 72px;
    padding: 0 6px;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
  }
  .options {
    padding: 6px 6px 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .check input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
