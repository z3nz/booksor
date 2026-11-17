// Small per-device preferences kept in localStorage. Every access is wrapped because
// storage can be blocked (private mode, disabled cookies); the site must work without it.
import { DEFAULT_TRANSLATION, translationById } from './translations.ts';

export type Theme = 'system' | 'light' | 'sepia' | 'dark';
export interface Settings {
  theme: Theme;
  size: number;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', size: 19 };
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

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, JSON.stringify(s));
  applySettings(s);
}

export function applySettings(s: Settings) {
  const root = document.documentElement;
  if (s.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty('--reader-size', `${s.size}px`);
}

export function preferredTranslation(): string {
  const id = read(TRANSLATION_KEY);
  return id && translationById.has(id) ? id : DEFAULT_TRANSLATION;
}

export function setPreferredTranslation(id: string) {
  write(TRANSLATION_KEY, id);
  window.dispatchEvent(new CustomEvent(TRANSLATION_EVENT, { detail: id }));
}
