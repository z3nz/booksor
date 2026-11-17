<script lang="ts">
  import { onMount } from 'svelte';
  import { compressVerses, copyText, shareOrCopy, shareOrDownloadImage, verseImage } from '../lib/share.ts';

  let { tr, abbr, bookName, chapter }: { tr: string; abbr: string; bookName: string; chapter: number } = $props();

  let selected = $state<number[]>([]);
  let toast = $state('');
  let busy = $state(false);

  const reference = $derived(selected.length ? `${bookName} ${chapter}:${compressVerses(selected)}` : '');

  const verseEls = () => document.querySelectorAll<HTMLElement>('.verse[data-v]');

  function isContiguous(nums: number[]) {
    return nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  }

  function hashFor(nums: number[]) {
    if (!nums.length) return '';
    const first = nums[0];
    const last = nums[nums.length - 1];
    return isContiguous(nums) && last !== first ? `#v${first}-${last}` : `#v${first}`;
  }

  function setSelected(nums: number[]) {
    selected = [...new Set(nums)].sort((a, b) => a - b);
    const set = new Set(selected);
    for (const el of verseEls()) {
      el.classList.toggle('selected', set.has(Number(el.dataset.v)));
      el.classList.remove('target');
    }
    history.replaceState(null, '', window.location.pathname + hashFor(selected));
  }

  /** Highlight verses from a shared link like #v16-18 and scroll to them. */
  function showTarget() {
    const m = window.location.hash.match(/^#v(\d+)(?:-(\d+))?$/);
    if (!m) return;
    const from = Number(m[1]);
    const to = Math.max(from, Number(m[2] ?? from));
    let first: HTMLElement | null = null;
    for (const el of verseEls()) {
      const v = Number(el.dataset.v);
      const hit = v >= from && v <= to;
      el.classList.toggle('target', hit);
      if (hit) first ??= el;
    }
    first?.scrollIntoView({ block: 'center' });
  }

  function selectedText() {
    const set = new Set(selected);
    return [...verseEls()]
      .filter((el) => set.has(Number(el.dataset.v)))
      .map((el) => el.querySelector('.vt')?.textContent?.trim() ?? '')
      .join(' ');
  }

  const shareUrl = () => window.location.origin + window.location.pathname + hashFor(selected);

  function flash(msg: string) {
    toast = msg;
    setTimeout(() => (toast = ''), 2000);
  }

  async function copy() {
    const ok = await copyText(`“${selectedText()}” — ${reference} (${abbr})\n${shareUrl()}`);
    flash(ok ? 'Copied' : 'Couldn’t copy');
  }

  async function link() {
    const ok = await copyText(shareUrl());
    flash(ok ? 'Link copied' : 'Couldn’t copy');
  }

  async function share() {
    const result = await shareOrCopy({
      title: `${reference} (${abbr})`,
      text: `“${selectedText()}” — ${reference} (${abbr})`,
      url: shareUrl(),
    });
    if (result === 'copied') flash('Copied');
    else if (result === 'failed') flash('Couldn’t share');
  }

  async function image() {
    busy = true;
    try {
      const blob = await verseImage({ text: selectedText(), reference: `${reference} (${abbr})` });
      await shareOrDownloadImage(blob, `${reference.replace(/[^\w]+/g, '-')}-${tr}.png`, reference);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    showTarget();
    const container = document.querySelector('.verses');
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('a')) return;
      if (window.getSelection()?.toString()) return; // let people select text normally
      const el = target.closest<HTMLElement>('.verse[data-v]');
      if (!el) return;
      const v = Number(el.dataset.v);
      setSelected(selected.includes(v) ? selected.filter((n) => n !== v) : [...selected, v]);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected.length) setSelected([]);
    };
    const onHash = () => showTarget();
    container?.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    return () => {
      container?.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  });
</script>

{#if selected.length}
  <div class="bar card" role="toolbar" aria-label="Selected verses">
    <span class="ref">{reference}</span>
    <div class="actions">
      <button class="btn" onclick={copy}>Copy</button>
      <button class="btn" onclick={link}>Link</button>
      <button class="btn" onclick={share}>Share</button>
      <button class="btn" onclick={image} disabled={busy}>{busy ? '…' : 'Image'}</button>
      <button class="btn btn-icon" aria-label="Clear selection" onclick={() => setSelected([])}>✕</button>
    </div>
    <span class="toast" role="status">{toast}</span>
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 30;
    transform: translateX(-50%);
    width: max-content;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
    padding: 10px 12px 10px 16px;
    animation: rise 0.18s ease-out;
  }
  .ref {
    font-weight: 600;
    font-size: 14px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions .btn {
    min-height: 36px;
    padding: 0 12px;
  }
  .actions .btn-icon {
    width: 36px;
    padding: 0;
  }
  .toast {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-size: 13px;
    white-space: nowrap;
  }
  .toast:empty {
    display: none;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
