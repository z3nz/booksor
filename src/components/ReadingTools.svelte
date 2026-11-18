<script lang="ts">
  // Listen (read aloud with the browser's voices), auto-scroll, and focus mode for a chapter.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { loadSettings, updateSettings } from '../lib/prefs.ts';
  import { pickVoice, rankVoices, RATES, scrollPixelsPerSecond, speechChunks } from '../lib/speech.ts';

  let { lang, intro, nextUrl }: { lang: string; intro: string; nextUrl: string | null } = $props();

  type Mode = 'listen' | 'scroll';
  const AUTOPLAY_KEY = 'booksor:autoplay';

  let mode = $state<Mode | null>(null);
  let playing = $state(false);
  let current = $state(0);
  let status = $state('');
  let showOptions = $state(false);
  let barHeight = $state(0);

  let rate = $state(1);
  let voiceName = $state('');
  let voices = $state.raw<SpeechSynthesisVoice[]>([]);
  let scrollSpeed = $state(3);
  let continueNext = $state(true);
  let focus = $state(false);

  const locale = typeof navigator === 'undefined' ? '' : navigator.language;
  const available = $derived(rankVoices(voices, lang, locale));
  const voice = $derived(pickVoice(voices, lang, voiceName, locale));

  let verses: HTMLElement[] = [];
  let run = 0; // bumps on every start/stop so callbacks from old speech are ignored
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

  function setStatus(message: string) {
    status = message;
  }

  /** Where to start: a selected or linked verse, else the first one on screen. */
  function startIndex() {
    const picked = verses.findIndex((el) => el.classList.contains('selected') || el.classList.contains('target'));
    if (picked >= 0) return picked;
    const i = verses.findIndex((el) => el.getBoundingClientRect().bottom > 90);
    return Math.max(0, i);
  }

  function goNext(m: Mode) {
    if (!nextUrl) return;
    try {
      sessionStorage.setItem(AUTOPLAY_KEY, m);
    } catch {
      // the next chapter just won't start by itself
    }
    window.location.href = nextUrl;
  }

  function endOfChapter(m: Mode) {
    stop();
    if (continueNext && nextUrl) {
      setStatus('Next chapter…');
      nextTimer = setTimeout(() => goNext(m), m === 'scroll' ? 2500 : 800);
    } else {
      setStatus(nextUrl ? 'End of chapter' : 'The end');
    }
  }

  function stop(message = '') {
    run++;
    clearTimeout(nextTimer);
    cancelAnimationFrame(raf);
    if (hasSpeech()) speechSynthesis.cancel();
    playing = false;
    setStatus(message);
  }

  // --- Listen ---

  function markSpeaking(i: number) {
    verses.forEach((el, j) => el.classList.toggle('speaking', j === i));
    const el = verses[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - barHeight - 32) {
      el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function speakVerse(i: number, withIntro = false) {
    stop();
    const id = run;
    current = i;
    playing = true;
    markSpeaking(i);
    const text = verses[i]?.querySelector('.vt')?.textContent ?? '';
    const chunks = [...(withIntro ? [`${intro}.`] : []), ...speechChunks(text)];
    let started = false;
    const say = (k: number) => {
      if (id !== run) return;
      if (k >= chunks.length) {
        if (i + 1 < verses.length) speakVerse(i + 1);
        else endOfChapter('listen');
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[k]);
      u.lang = voice?.lang ?? lang;
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onstart = () => {
        started = true;
      };
      u.onend = () => say(k + 1);
      u.onerror = (e) => {
        if (id !== run || e.error === 'interrupted' || e.error === 'canceled') return;
        stop(e.error === 'not-allowed' ? 'Press play to keep listening' : 'Couldn’t read aloud on this device');
      };
      speechSynthesis.speak(u);
    };
    say(0);
    // Some browsers quietly refuse to speak until you tap something (e.g. after moving to the next chapter)
    setTimeout(() => {
      if (id === run && !started && !speechSynthesis.speaking) stop('Press play to keep listening');
    }, 4000);
  }

  function play() {
    if (!hasSpeech()) {
      setStatus('This browser can’t read aloud');
      return;
    }
    const picked = verses.findIndex((el) => el.classList.contains('selected'));
    const i = picked >= 0 ? picked : current;
    speakVerse(i, i === 0);
  }

  function step(delta: number) {
    const i = Math.min(verses.length - 1, Math.max(0, current + delta));
    if (playing) speakVerse(i);
    else {
      current = i;
      markSpeaking(i);
    }
  }

  function setRate(r: number) {
    rate = r;
    updateSettings({ rate: r });
    if (playing) speakVerse(current);
  }

  function setVoice(name: string) {
    voiceName = name;
    updateSettings({ voice: name });
    if (playing) speakVerse(current);
  }

  // --- Auto-scroll ---

  let raf = 0;
  let lastTime = 0;
  let y = 0;

  function readerSize() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 19;
  }

  function startScroll() {
    stop();
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
      if (atEnd) endOfChapter('scroll');
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function setScrollSpeed(s: number) {
    scrollSpeed = Math.min(10, Math.max(1, s));
    updateSettings({ scrollSpeed });
  }

  // --- Opening, closing, focus ---

  function open(m: Mode) {
    if (mode === m) return close();
    stop();
    mode = m;
    showOptions = false;
    if (m === 'listen') {
      current = startIndex();
      play();
    } else {
      startScroll();
    }
  }

  function close() {
    stop();
    verses.forEach((el) => el.classList.remove('speaking'));
    mode = null;
  }

  function toggle() {
    if (playing) stop();
    else if (mode === 'listen') play();
    else startScroll();
  }

  function toggleFocus() {
    focus = !focus;
    updateSettings({ focus });
  }

  function setContinue(on: boolean) {
    continueNext = on;
    updateSettings({ continueNext: on });
  }

  // Keep the selected-verse bar and the end of the page clear of the player
  $effect(() => {
    document.documentElement.style.setProperty('--player-space', mode ? `${barHeight + 12}px` : '0px');
  });

  onMount(() => {
    verses = [...document.querySelectorAll<HTMLElement>('.verses .verse[data-v]')];
    const s = loadSettings();
    rate = s.rate;
    voiceName = s.voice;
    scrollSpeed = s.scrollSpeed;
    continueNext = s.continueNext;
    focus = s.focus;

    const loadVoices = () => (voices = speechSynthesis.getVoices());
    if (hasSpeech()) {
      speechSynthesis.cancel(); // in case speech from the last page is still going
      loadVoices();
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
    }

    // Keep going from the previous chapter
    let carry: string | null = null;
    try {
      carry = sessionStorage.getItem(AUTOPLAY_KEY);
      sessionStorage.removeItem(AUTOPLAY_KEY);
    } catch {
      // ignore
    }
    if (carry === 'listen' && hasSpeech()) {
      mode = 'listen';
      current = 0;
      // Voices can arrive a moment after the page loads
      setTimeout(() => speakVerse(0, true), voices.length ? 0 : 400);
    } else if (carry === 'scroll') {
      mode = 'scroll';
      window.scrollTo(0, 0);
      setStatus('Starting…');
      nextTimer = setTimeout(startScroll, 1500);
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open], .verse.selected')) return;
      if (mode) close();
      else if (focus) toggleFocus();
    };
    const onHide = () => hasSpeech() && speechSynthesis.cancel();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
      if (hasSpeech()) speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  });
</script>

<div class="tools" role="group" aria-label="Reading tools">
  <button class="btn tool" aria-pressed={mode === 'listen'} onclick={() => open('listen')}>
    <Icon name="listen" size={16} />Listen
  </button>
  <button class="btn tool" aria-pressed={mode === 'scroll'} onclick={() => open('scroll')}>
    <Icon name="scroll" size={16} />Auto-scroll
  </button>
  <button class="btn tool" aria-pressed={focus} onclick={toggleFocus}>
    <Icon name="focus" size={16} />Focus
  </button>
</div>

{#if focus}
  <button class="btn exit-focus" onclick={toggleFocus} title="Exit focus mode (Esc)">
    <Icon name="unfocus" size={16} />Exit focus
  </button>
{/if}

{#if mode}
  <div class="player card" role="region" aria-label={mode === 'listen' ? 'Read aloud' : 'Auto-scroll'} bind:offsetHeight={barHeight}>
    {#if showOptions}
      <div class="options">
        {#if mode === 'listen'}
          <label>
            <span>Voice</span>
            <select value={voice?.name ?? ''} onchange={(e) => setVoice(e.currentTarget.value)}>
              {#each available as v (v.name)}
                <option value={v.name}>{v.name.replace(/^Microsoft |^Google /, '')} ({v.lang})</option>
              {:else}
                <option value="">Default voice</option>
              {/each}
            </select>
          </label>
        {/if}
        <label class="check">
          <input type="checkbox" checked={continueNext} onchange={(e) => setContinue(e.currentTarget.checked)} />
          <span>Keep going into the next chapter</span>
        </label>
      </div>
    {/if}

    <div class="controls">
      {#if mode === 'listen'}
        <button class="btn btn-icon" aria-label="Previous verse" onclick={() => step(-1)}><Icon name="prev" size={16} /></button>
        <button class="btn btn-icon btn-primary main" aria-label={playing ? 'Pause' : 'Play'} onclick={toggle}>
          <Icon name={playing ? 'pause' : 'play'} size={20} filled />
        </button>
        <button class="btn btn-icon" aria-label="Next verse" onclick={() => step(1)}><Icon name="next" size={16} /></button>
        <select class="rate" aria-label="Reading speed" value={rate} onchange={(e) => setRate(Number(e.currentTarget.value))}>
          {#each RATES as r (r)}
            <option value={r}>{r}×</option>
          {/each}
        </select>
        <span class="where" class:has-status={!!status}>{status || `Verse ${verses[current]?.dataset.v ?? 1}`}</span>
      {:else}
        <button class="btn btn-icon" aria-label="Slower" disabled={scrollSpeed <= 1} onclick={() => setScrollSpeed(scrollSpeed - 1)}>
          <Icon name="minus" size={16} />
        </button>
        <button class="btn btn-icon btn-primary main" aria-label={playing ? 'Pause' : 'Start scrolling'} onclick={toggle}>
          <Icon name={playing ? 'pause' : 'play'} size={20} filled />
        </button>
        <button class="btn btn-icon" aria-label="Faster" disabled={scrollSpeed >= 10} onclick={() => setScrollSpeed(scrollSpeed + 1)}>
          <Icon name="plus" size={16} />
        </button>
        <span class="where" class:has-status={!!status}>{status || `Speed ${scrollSpeed}`}</span>
      {/if}
      <button class="btn btn-icon" aria-label="Options" aria-expanded={showOptions} onclick={() => (showOptions = !showOptions)}>
        <Icon name="sliders" size={16} />
      </button>
      <button class="btn btn-icon" aria-label="Close" onclick={close}><Icon name="close" size={16} /></button>
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
    right: 12px;
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
  .player {
    position: fixed;
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom));
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
  .rate,
  .options select {
    min-height: 36px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 13px;
  }
  .where {
    min-width: 72px;
    padding: 0 6px;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 6px 6px 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .options label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .options select {
    flex: 1;
    min-width: 0;
    max-width: 260px;
    border-radius: 10px;
  }
  .check input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }
  @media (max-width: 420px) {
    .where:not(.has-status) {
      display: none;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
