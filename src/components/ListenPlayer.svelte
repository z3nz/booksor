<script lang="ts">
  // Site-wide read-aloud player. It lives in the layout with transition:persist, so it keeps going as
  // you move between pages; and because chapter changes happen without a full page load, the browser
  // lets it carry straight on into the next chapter.
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import Icon from './Icon.svelte';
  import {
    chapterPath,
    LISTEN_REQUEST,
    publishListenState,
    readChapter,
    type ChapterText,
    type ListenRequest,
  } from '../lib/listen.ts';
  import { loadSettings, updateSettings } from '../lib/prefs.ts';
  import { pickVoice, rankVoices, RATES, speechChunks } from '../lib/speech.ts';

  let open = $state(false);
  let playing = $state(false);
  let chapter = $state.raw<ChapterText | null>(null);
  let index = $state(0);
  let status = $state('');
  let showOptions = $state(false);
  let barHeight = $state(0);

  let rate = $state(1);
  let voiceName = $state('');
  let voices = $state.raw<SpeechSynthesisVoice[]>([]);
  let continueNext = $state(true);

  const locale = typeof navigator === 'undefined' ? '' : navigator.language;
  const lang = $derived(chapter?.lang ?? 'en');
  const available = $derived(rankVoices(voices, lang, locale));
  const voice = $derived(pickVoice(voices, lang, voiceName, locale));
  const verseNumber = $derived(chapter?.verses[index]?.v ?? 1);

  let run = 0; // bumps on every start/stop so callbacks from older speech are ignored
  const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onScreen = () => !!chapter && chapterPath(window.location.pathname) === chapter.url;
  const verseEls = () => [...document.querySelectorAll<HTMLElement>('.verses .verse[data-v]')];

  // --- Following along on the page ---

  function clearMarks() {
    for (const el of document.querySelectorAll('.verse.speaking')) el.classList.remove('speaking');
  }

  function mark(scroll = true) {
    clearMarks();
    if (!onScreen() || !open) return;
    const el = document.querySelector<HTMLElement>(`.verses .verse[data-v="${verseNumber}"]`);
    if (!el) return;
    el.classList.add('speaking');
    if (!scroll) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - barHeight - 32) {
      el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  // --- Speaking ---

  function stop(message = '') {
    run++;
    if (hasSpeech()) speechSynthesis.cancel();
    playing = false;
    status = message;
  }

  function speakVerse(i: number, withIntro = false) {
    if (!chapter) return;
    stop();
    const id = run;
    const ch = chapter;
    index = i;
    playing = true;
    mark();
    const chunks = [...(withIntro && ch.intro ? [`${ch.intro}.`] : []), ...speechChunks(ch.verses[i]?.text ?? '')];
    let started = false;
    const say = (k: number) => {
      if (id !== run) return;
      if (k >= chunks.length) {
        if (i + 1 < ch.verses.length) speakVerse(i + 1);
        else void nextChapter();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[k]);
      u.lang = voice?.lang ?? ch.lang;
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onstart = () => (started = true);
      u.onend = () => say(k + 1);
      u.onerror = (e) => {
        if (id !== run || e.error === 'interrupted' || e.error === 'canceled') return;
        stop(e.error === 'not-allowed' ? 'Press play to keep listening' : 'Couldn’t read aloud on this device');
      };
      speechSynthesis.speak(u);
    };
    say(0);
    // Some browsers quietly refuse to speak; don't sit there looking busy
    setTimeout(() => {
      if (id === run && !started && !speechSynthesis.speaking) stop('Press play to keep listening');
    }, 4000);
  }

  /** At the end of a chapter: load the next one, bring the page along if you're reading it, keep going. */
  async function nextChapter() {
    if (!chapter) return;
    const following = onScreen();
    if (!continueNext || !chapter.nextUrl) {
      stop(chapter.nextUrl ? 'End of chapter' : 'The end');
      clearMarks();
      return;
    }
    stop('Next chapter…');
    const id = run;
    const next = await load(chapter.nextUrl);
    if (id !== run) return;
    if (!next) {
      stop('Couldn’t load the next chapter');
      return;
    }
    chapter = next;
    index = 0;
    if (following) await navigate(next.url);
    if (id === run) speakVerse(0, true);
  }

  /** A chapter's text: from the page if it's on screen, otherwise fetched in the background. */
  async function load(url: string): Promise<ChapterText | null> {
    const path = chapterPath(url);
    if (chapterPath(window.location.pathname) === path) return readChapter(document, path);
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return readChapter(new DOMParser().parseFromString(await res.text(), 'text/html'), path);
    } catch {
      return null;
    }
  }

  function start(req: ListenRequest) {
    if (!hasSpeech()) {
      open = true;
      status = 'This browser can’t read aloud';
      return;
    }
    const url = chapterPath(req.url ?? window.location.pathname);
    // Use the page that's on screen right away: phones only allow speech straight after a tap
    const ch = chapterPath(window.location.pathname) === url ? readChapter(document, url) : null;
    open = true;
    showOptions = false;
    const begin = (c: ChapterText) => {
      chapter = c;
      const i = req.verse ? Math.max(0, c.verses.findIndex((x) => x.v === req.verse)) : 0;
      speakVerse(i, i === 0);
    };
    if (ch) begin(ch);
    else {
      stop('Loading…');
      const id = run;
      void load(url).then((c) => {
        if (id !== run) return;
        if (c) begin(c);
        else stop('Couldn’t load this chapter');
      });
    }
  }

  function close() {
    stop();
    clearMarks();
    open = false;
  }

  function toggle() {
    if (playing) stop();
    else if (chapter) speakVerse(index, index === 0);
  }

  function step(delta: number) {
    if (!chapter) return;
    const i = Math.min(chapter.verses.length - 1, Math.max(0, index + delta));
    if (playing) speakVerse(i);
    else {
      index = i;
      mark();
    }
  }

  function setRate(r: number) {
    rate = r;
    updateSettings({ rate: r });
    if (playing) speakVerse(index);
  }

  function setVoice(name: string) {
    voiceName = name;
    updateSettings({ voice: name });
    if (playing) speakVerse(index);
  }

  function setContinue(on: boolean) {
    continueNext = on;
    updateSettings({ continueNext: on });
  }

  // Tell the Listen buttons what's playing
  $effect(() => {
    publishListenState({ active: open, playing, url: chapter?.url ?? null, verse: chapter ? verseNumber : null });
  });

  // Keep the selected-verse bar and the end of the page clear of the player
  const setSpace = () => document.documentElement.style.setProperty('--listen-space', open ? `${barHeight + 12}px` : '0px');
  $effect(setSpace);

  onMount(() => {
    const s = loadSettings();
    rate = s.rate;
    voiceName = s.voice;
    continueNext = s.continueNext;

    const loadVoices = () => (voices = speechSynthesis.getVoices());
    if (hasSpeech()) {
      speechSynthesis.cancel(); // in case speech from a previous full page load is still going
      loadVoices();
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
    }

    const onRequest = (e: Event) => {
      const req = (e as CustomEvent<ListenRequest>).detail;
      if (req.action === 'stop') close();
      else start(req);
    };
    const onPageLoad = () => mark(false);
    const onHide = () => hasSpeech() && speechSynthesis.cancel();
    window.addEventListener(LISTEN_REQUEST, onRequest);
    document.addEventListener('astro:page-load', onPageLoad);
    document.addEventListener('astro:after-swap', setSpace);
    window.addEventListener('pagehide', onHide);
    return () => {
      stop();
      window.removeEventListener(LISTEN_REQUEST, onRequest);
      document.removeEventListener('astro:page-load', onPageLoad);
      document.removeEventListener('astro:after-swap', setSpace);
      window.removeEventListener('pagehide', onHide);
      if (hasSpeech()) speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  });
</script>

{#if open}
  <div class="player card" role="region" aria-label="Read aloud" bind:offsetHeight={barHeight}>
    {#if showOptions}
      <div class="options">
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
        <label class="check">
          <input type="checkbox" checked={continueNext} onchange={(e) => setContinue(e.currentTarget.checked)} />
          <span>Keep going into the next chapter</span>
        </label>
      </div>
    {/if}

    <div class="controls">
      <button class="btn btn-icon" aria-label="Previous verse" onclick={() => step(-1)} disabled={!chapter}>
        <Icon name="prev" size={16} />
      </button>
      <button class="btn btn-icon btn-primary main" aria-label={playing ? 'Pause' : 'Play'} onclick={toggle} disabled={!chapter}>
        <Icon name={playing ? 'pause' : 'play'} size={20} filled />
      </button>
      <button class="btn btn-icon" aria-label="Next verse" onclick={() => step(1)} disabled={!chapter}>
        <Icon name="next" size={16} />
      </button>
      <select class="rate" aria-label="Reading speed" value={rate} onchange={(e) => setRate(Number(e.currentTarget.value))}>
        {#each RATES as r (r)}
          <option value={r}>{r}×</option>
        {/each}
      </select>
      {#if chapter}
        <a class="now" href={`${chapter.url}#v${verseNumber}`} title="Go to what's playing">
          <span class="now-title">{chapter.title}</span>
          <span class="now-status" class:has-status={!!status}>{status || `Verse ${verseNumber}`}</span>
        </a>
      {:else}
        <span class="now"><span class="now-status has-status">{status}</span></span>
      {/if}
      <button class="btn btn-icon" aria-label="Options" aria-expanded={showOptions} onclick={() => (showOptions = !showOptions)}>
        <Icon name="sliders" size={16} />
      </button>
      <button class="btn btn-icon" aria-label="Stop and close" onclick={close}><Icon name="close" size={16} /></button>
    </div>
  </div>
{/if}

<style>
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
  .now {
    display: flex;
    flex-direction: column;
    min-width: 84px;
    max-width: 160px;
    padding: 0 6px;
    color: var(--text);
    line-height: 1.2;
    text-decoration: none;
  }
  .now-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .now-status {
    color: var(--muted);
    font-size: 12px;
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
    .now {
      min-width: 0;
      max-width: 92px;
    }
    .rate {
      padding: 0 4px;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
