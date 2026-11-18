<script lang="ts">
  // Site-wide read-aloud player. It lives in the layout with transition:persist, so it keeps going as
  // you move between pages; and because chapter changes happen without a full page load, the browser
  // lets it carry straight on into the next chapter.
  //
  // Two ways to listen:
  //  - narrator: a real recording (Bob Souer reading the BSB) in an <audio> element. Because it's media,
  //    it keeps playing with the phone locked and shows up on the lock screen with controls.
  //  - voice: the device's speech voices, verse by verse, for translations without a recording (or by
  //    choice, or when the recording can't load). Speech stops when the phone locks.
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
  import { estimateVerseAt, estimateVerseTime, formatTime, NARRATOR, narrationFor, type Narration } from '../lib/audio.ts';
  import { loadSettings, updateSettings } from '../lib/prefs.ts';
  import { pickVoice, rankVoices, RATES, speechChunks } from '../lib/speech.ts';

  const NARRATOR_OPTION = '__narrator';
  const SKIP_SECONDS = 15;

  let open = $state(false);
  let playing = $state(false);
  let mode = $state<'voice' | 'narrator'>('voice');
  let status = $state('');
  let showOptions = $state(false);
  let barHeight = $state(0);

  // voice mode
  let chapter = $state.raw<ChapterText | null>(null);
  let index = $state(0);

  // narrator mode
  let audio: HTMLAudioElement;
  let narration = $state.raw<Narration | null>(null);
  let current = $state(0);
  let duration = $state(0);
  /** The recordings couldn't be reached this visit (offline, say): use the device voice */
  let narratorFailed = false;
  /** Text of the chapter being narrated, if it's on screen, for starting at a verse */
  let narratedText = $state.raw<ChapterText | null>(null);

  let rate = $state(1);
  let voiceName = $state('');
  let voices = $state.raw<SpeechSynthesisVoice[]>([]);
  let continueNext = $state(true);
  let narratorOn = $state(true);

  const locale = typeof navigator === 'undefined' ? '' : navigator.language;
  const lang = $derived(chapter?.lang ?? 'en');
  const available = $derived(rankVoices(voices, lang, locale));
  const voice = $derived(pickVoice(voices, lang, voiceName, locale));
  const verseNumber = $derived(chapter?.verses[index]?.v ?? 1);

  const nowUrl = $derived(mode === 'narrator' ? (narration?.url ?? null) : (chapter?.url ?? null));
  const nowTitle = $derived(mode === 'narrator' ? (narration?.title ?? '') : (chapter?.title ?? ''));
  /** The chapter in the player has a recording, so offer it in the voice list */
  const canNarrate = $derived(!!nowUrl && !!narrationFor(nowUrl));
  const approxVerse = $derived(
    mode === 'narrator' && narratedText ? estimateVerseAt(narratedText.verses, current, duration) : null,
  );

  let run = 0; // bumps on every start/stop so callbacks from older speech or loads are ignored
  const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
  const hasMediaSession = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onScreen = () => !!nowUrl && chapterPath(window.location.pathname) === nowUrl;
  const pageText = (url: string) => (chapterPath(window.location.pathname) === url ? readChapter(document, url) : null);

  // --- Following along on the page ---

  function clearMarks() {
    for (const el of document.querySelectorAll('.verse.speaking')) el.classList.remove('speaking');
  }

  function mark(scroll = true) {
    clearMarks();
    // The recordings have no verse timings, so only the device voice highlights verses
    if (!onScreen() || !open || mode !== 'voice') return;
    const el = document.querySelector<HTMLElement>(`.verses .verse[data-v="${verseNumber}"]`);
    if (!el) return;
    el.classList.add('speaking');
    if (!scroll) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - barHeight - 32) {
      el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function stop(message = '') {
    run++;
    if (hasSpeech()) speechSynthesis.cancel();
    audio?.pause();
    playing = false;
    status = message;
  }

  // --- Narrator ---

  function playNarration(n: Narration, startVerse?: number) {
    stop();
    const id = run;
    mode = 'narrator';
    narration = n;
    narratedText = pageText(n.url);
    clearMarks();
    if (audio.getAttribute('src') !== n.src) {
      current = 0;
      duration = 0;
      audio.src = n.src;
    }
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    const text = narratedText;
    if (startVerse && text) {
      const seek = () => {
        if (id === run) audio.currentTime = estimateVerseTime(text.verses, startVerse, audio.duration);
      };
      if (audio.readyState >= 1) seek();
      else audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    setMediaMetadata(n);
    // Must be called straight from the tap (or from the previous recording ending) or phones refuse
    audio.play().catch((e: DOMException) => {
      if (id !== run) return;
      if (e.name === 'NotAllowedError') stop('Press play to keep listening');
      // other failures arrive as the audio element's error event
    });
  }

  /** Go to another chapter's recording, bringing the page along if you're reading along */
  function changeNarration(url: string | null) {
    const n = url ? narrationFor(url) : null;
    if (!n) return;
    const following = onScreen();
    playNarration(n);
    if (following) void navigate(n.url);
  }

  function narrationEnded() {
    const n = narration;
    if (!n || mode !== 'narrator') return;
    if (!continueNext || !n.nextUrl) {
      stop(n.nextUrl ? 'End of chapter' : 'The end');
      return;
    }
    changeNarration(n.nextUrl);
  }

  function narrationError() {
    if (mode !== 'narrator' || !narration || !audio.getAttribute('src')) return;
    // Couldn't load the recording: carry on with the device voice from about the same place
    narratorFailed = true;
    const n = narration;
    const verse = narratedText ? estimateVerseAt(narratedText.verses, current, duration) : null;
    stop();
    if (!hasSpeech()) {
      status = 'Couldn’t load the recording';
      return;
    }
    startVoice({ action: 'start', url: n.url, verse: verse ?? undefined });
  }

  function seekBy(seconds: number) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration - 0.5, Math.max(0, audio.currentTime + seconds));
  }

  function setMediaMetadata(n: Narration) {
    if (!hasMediaSession()) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: n.title,
      artist: NARRATOR.name,
      album: 'Berean Standard Bible',
      artwork: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }

  /** Keeps the lock screen's progress bar right */
  function setPosition() {
    if (!hasMediaSession() || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration),
      });
    } catch {
      // not supported
    }
  }

  function setupMediaSession() {
    if (!hasMediaSession()) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => resume()],
      ['pause', () => stop()],
      ['stop', () => close()],
      ['seekbackward', (d) => seekBy(-(d.seekOffset ?? SKIP_SECONDS))],
      ['seekforward', (d) => seekBy(d.seekOffset ?? SKIP_SECONDS)],
      ['seekto', (d) => d.seekTime != null && (audio.currentTime = d.seekTime)],
      // Back goes to the start of the chapter first, like a music player
      ['previoustrack', () => (audio.currentTime > 5 ? (audio.currentTime = 0) : changeNarration(narration?.prevUrl ?? null))],
      ['nexttrack', () => changeNarration(narration?.nextUrl ?? null)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // this browser doesn't offer that control
      }
    }
  }

  // --- Device voice ---

  function speakVerse(i: number, withIntro = false) {
    if (!chapter) return;
    stop();
    const id = run;
    const ch = chapter;
    mode = 'voice';
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
    const here = pageText(path);
    if (here) return here;
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return readChapter(new DOMParser().parseFromString(await res.text(), 'text/html'), path);
    } catch {
      return null;
    }
  }

  function startVoice(req: ListenRequest) {
    if (!hasSpeech()) {
      status = 'This browser can’t read aloud';
      return;
    }
    const url = chapterPath(req.url ?? window.location.pathname);
    // Use the page that's on screen right away: phones only allow speech straight after a tap
    const ch = pageText(url);
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

  // --- Both ---

  const useNarrator = (url: string) =>
    narratorOn && !narratorFailed && navigator.onLine !== false ? narrationFor(url) : null;

  function start(req: ListenRequest) {
    const url = chapterPath(req.url ?? window.location.pathname);
    open = true;
    showOptions = false;
    const n = useNarrator(url);
    if (n) playNarration(n, req.verse && req.verse > 1 ? req.verse : undefined);
    else {
      mode = 'voice';
      startVoice({ ...req, url });
    }
  }

  function close() {
    stop();
    clearMarks();
    open = false;
    if (audio.getAttribute('src')) {
      audio.removeAttribute('src');
      audio.load();
    }
    narration = null;
    if (hasMediaSession()) navigator.mediaSession.metadata = null;
  }

  function resume() {
    if (mode === 'narrator' && narration) {
      status = '';
      audio.play().catch(() => {});
    } else if (chapter) speakVerse(index, index === 0);
  }

  function toggle() {
    if (playing) stop();
    else resume();
  }

  function step(delta: 1 | -1) {
    if (mode === 'narrator') {
      seekBy(delta * SKIP_SECONDS);
      return;
    }
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
    if (mode === 'narrator') {
      audio.defaultPlaybackRate = r;
      audio.playbackRate = r;
    } else if (playing) speakVerse(index);
  }

  /** Picking the narrator or a device voice; switches over from about the same verse */
  function setVoice(name: string) {
    const url = nowUrl;
    if (name === NARRATOR_OPTION) {
      narratorOn = true;
      narratorFailed = false;
      updateSettings({ narrator: true });
      const n = url ? narrationFor(url) : null;
      if (n && mode === 'voice' && (playing || chapter)) {
        const wasPlaying = playing;
        playNarration(n, verseNumber > 1 ? verseNumber : undefined);
        if (!wasPlaying) audio.pause();
      }
      return;
    }
    voiceName = name;
    updateSettings({ voice: name });
    if (canNarrate) {
      narratorOn = false;
      updateSettings({ narrator: false });
    }
    if (mode === 'narrator' && url) {
      const wasPlaying = playing;
      const verse = approxVerse;
      stop();
      if (wasPlaying) startVoice({ action: 'start', url, verse: verse ?? undefined });
      else {
        mode = 'voice';
        void load(url).then((c) => {
          chapter = c;
          index = c && verse ? Math.max(0, c.verses.findIndex((x) => x.v === verse)) : 0;
        });
      }
    } else if (playing) speakVerse(index);
  }

  function setContinue(on: boolean) {
    continueNext = on;
    updateSettings({ continueNext: on });
  }

  // Tell the Listen buttons what's playing
  $effect(() => {
    publishListenState({
      active: open,
      playing,
      url: nowUrl,
      verse: mode === 'narrator' ? approxVerse : chapter ? verseNumber : null,
    });
  });

  // Keep the selected-verse bar and the end of the page clear of the player
  const setSpace = () => document.documentElement.style.setProperty('--listen-space', open ? `${barHeight + 12}px` : '0px');
  $effect(setSpace);

  $effect(() => {
    if (hasMediaSession()) navigator.mediaSession.playbackState = !open ? 'none' : playing ? 'playing' : 'paused';
  });

  onMount(() => {
    const s = loadSettings();
    rate = s.rate;
    voiceName = s.voice;
    continueNext = s.continueNext;
    narratorOn = s.narrator;

    const loadVoices = () => (voices = speechSynthesis.getVoices());
    if (hasSpeech()) {
      speechSynthesis.cancel(); // in case speech from a previous full page load is still going
      loadVoices();
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
    }
    setupMediaSession();

    const onRequest = (e: Event) => {
      const req = (e as CustomEvent<ListenRequest>).detail;
      if (req.action === 'stop') close();
      else start(req);
    };
    const onPageLoad = () => {
      mark(false);
      // Came to the page that's being narrated: now we can tell roughly which verse it's on
      if (mode === 'narrator' && narration && !narratedText) narratedText = pageText(narration.url);
    };
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

<!-- Events arrive a moment late, so they only count while the narrator is the one playing -->
<audio
  bind:this={audio}
  preload="none"
  onplay={() => mode === 'narrator' && ((playing = true), (status = ''))}
  onpause={() => mode === 'narrator' && (playing = false)}
  onwaiting={() => mode === 'narrator' && (status = 'Loading…')}
  onplaying={() => mode === 'narrator' && (status = '')}
  ontimeupdate={() => (current = audio.currentTime)}
  ondurationchange={() => ((duration = audio.duration), setPosition())}
  onratechange={setPosition}
  onseeked={setPosition}
  onended={narrationEnded}
  onerror={narrationError}
></audio>

{#if open}
  <div class="player card" role="region" aria-label="Read aloud" bind:offsetHeight={barHeight}>
    {#if showOptions}
      <div class="options">
        <label>
          <span>Voice</span>
          <select
            value={mode === 'narrator' ? NARRATOR_OPTION : (voice?.name ?? '')}
            onchange={(e) => setVoice(e.currentTarget.value)}
          >
            {#if canNarrate}
              <option value={NARRATOR_OPTION}>{NARRATOR.name} (recorded narrator)</option>
            {/if}
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
        {#if mode === 'narrator'}
          <p class="credit">
            Narrated by {NARRATOR.name}, courtesy of <a href={NARRATOR.creditUrl} target="_blank" rel="noopener">{NARRATOR.credit}</a>
          </p>
        {/if}
      </div>
    {/if}

    {#if mode === 'narrator'}
      <input
        class="seek"
        type="range"
        aria-label="Position in chapter"
        min="0"
        max={duration || 1}
        step="1"
        value={current}
        disabled={!duration}
        oninput={(e) => (audio.currentTime = Number(e.currentTarget.value))}
      />
    {/if}

    <div class="controls">
      {#if mode === 'narrator'}
        <button class="btn btn-icon" aria-label={`Back ${SKIP_SECONDS} seconds`} onclick={() => step(-1)} disabled={!duration}>
          <Icon name="back" size={16} />
        </button>
      {:else}
        <button class="btn btn-icon" aria-label="Previous verse" onclick={() => step(-1)} disabled={!chapter}>
          <Icon name="prev" size={16} />
        </button>
      {/if}
      <button class="btn btn-icon btn-primary main" aria-label={playing ? 'Pause' : 'Play'} onclick={toggle} disabled={!nowUrl}>
        <Icon name={playing ? 'pause' : 'play'} size={20} filled />
      </button>
      {#if mode === 'narrator'}
        <button class="btn btn-icon" aria-label={`Forward ${SKIP_SECONDS} seconds`} onclick={() => step(1)} disabled={!duration}>
          <Icon name="forward" size={16} />
        </button>
      {:else}
        <button class="btn btn-icon" aria-label="Next verse" onclick={() => step(1)} disabled={!chapter}>
          <Icon name="next" size={16} />
        </button>
      {/if}
      <select class="rate" aria-label="Reading speed" value={rate} onchange={(e) => setRate(Number(e.currentTarget.value))}>
        {#each RATES as r (r)}
          <option value={r}>{r}×</option>
        {/each}
      </select>
      {#if nowUrl}
        {@const verse = mode === 'narrator' ? approxVerse : verseNumber}
        <a class="now" href={verse ? `${nowUrl}#v${verse}` : nowUrl} title="Go to what's playing">
          <span class="now-title">{nowTitle}</span>
          <span class="now-status" class:has-status={!!status}>
            {status || (mode === 'narrator' ? `${formatTime(current)} / ${formatTime(duration)}` : `Verse ${verseNumber}`)}
          </span>
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
    font-variant-numeric: tabular-nums;
  }
  .seek {
    display: block;
    width: calc(100% - 12px);
    height: 16px;
    margin: 0 6px 4px;
    accent-color: var(--accent);
    cursor: pointer;
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
  .credit {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
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
