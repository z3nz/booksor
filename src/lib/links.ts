// Pages without a translation (home, /help) link to the default translation in their HTML.
// This points those links at the reader's saved translation instead, and keeps them in sync,
// on every page load (pages change without a full reload, so this runs again after each swap).
import { preferredTranslation, TRANSLATION_EVENT } from './prefs.ts';

const listeners = new Set<(tr: string) => void>();

function apply(tr: string) {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-tr-link]')) {
    a.pathname = a.pathname.replace(/^\/[^/]+/, `/${tr}`);
  }
  for (const fn of listeners) fn(tr);
}

document.addEventListener('astro:page-load', () => apply(preferredTranslation()));
window.addEventListener(TRANSLATION_EVENT, (e) => apply((e as CustomEvent<string>).detail));

/** Also run `onChange` whenever links are updated. Call once, from a page's script. */
export function followPreferredTranslation(onChange?: (tr: string) => void) {
  if (onChange) listeners.add(onChange);
}
