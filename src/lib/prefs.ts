// Small per-device preferences kept in localStorage. Every access is wrapped because
// storage can be blocked (private mode, disabled cookies); the site must work without it.
import { DEFAULT_TRANSLATION, translationById } from './translations.ts';

export type Theme = 'system' | 'light' | 'sepia' | 'dark';
export interface Settings {
  theme: Theme;
  size: number;
  /** Hide everything but the text on chapter pages */
  focus: boolean;
  /** Read-aloud speed (1 = normal) and chosen voice name ('' = best available) */
  rate: number;
  voice: string;
  /** Auto-scroll speed, 1–10 */
  scrollSpeed: number;
  /** Keep listening / scrolling into the next chapter */
  continueNext: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  size: 19,
  focus: false,
  rate: 1,
  voice: '',
  scrollSpeed: 3,
  continueNext: true,
};
export const MIN_SIZE = 14;
export const MAX_SIZE = 28;

const SETTINGS_KEY = 'booksor:settings';
const TRANSLATION_KEY = 'booksor:tr';
export const TRANSLATION_EVENT = 'booksor:translation';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: preferences just won't persist
  }
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(read(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Change some settings, keeping the rest as stored (several components save settings). */
export function updateSettings(patch: Partial<Settings>): Settings {
  const s = { ...loadSettings(), ...patch };
  write(SETTINGS_KEY, JSON.stringify(s));
  applySettings(s);
  return s;
}

export function applySettings(s: Settings) {
  const root = document.documentElement;
  if (s.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty('--reader-size', `${s.size}px`);
  root.toggleAttribute('data-focus', s.focus);
}

export function preferredTranslation(): string {
  const id = read(TRANSLATION_KEY);
  return id && translationById.has(id) ? id : DEFAULT_TRANSLATION;
}

export function setPreferredTranslation(id: string) {
  write(TRANSLATION_KEY, id);
  window.dispatchEvent(new CustomEvent(TRANSLATION_EVENT, { detail: id }));
}

// --- Where you left off ---

export interface LastRead {
  slug: string;
  chapter: number;
  /** Verse at the top of the screen */
  verse: number;
  at: number;
}

const LAST_KEY = 'booksor:last';

export function loadLastRead(): LastRead | null {
  try {
    const x = JSON.parse(read(LAST_KEY) ?? 'null');
    return x && typeof x.slug === 'string' && x.chapter > 0 ? { verse: 1, ...x } : null;
  } catch {
    return null;
  }
}

export function saveLastRead(last: Omit<LastRead, 'at'>) {
  write(LAST_KEY, JSON.stringify({ ...last, at: Date.now() }));
}

// --- Recently read chapters (for the offline page) ---

const HISTORY_KEY = 'booksor:history';

/** Paths like "/kjv/john/3", newest first */
export function loadHistory(): string[] {
  try {
    const list = JSON.parse(read(HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function recordHistory(path: string) {
  write(HISTORY_KEY, JSON.stringify([path, ...loadHistory().filter((p) => p !== path)].slice(0, 20)));
}
