// Pages without a translation (home, /help) link to the default translation in their HTML.
// This points those links at the reader's saved translation instead, and keeps them in sync.
import { preferredTranslation, TRANSLATION_EVENT } from './prefs.ts';

export function followPreferredTranslation(onChange?: (tr: string) => void) {
  const apply = (tr: string) => {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-tr-link]')) {
      a.pathname = a.pathname.replace(/^\/[^/]+/, `/${tr}`);
    }
    onChange?.(tr);
  };
  apply(preferredTranslation());
  window.addEventListener(TRANSLATION_EVENT, (e) => apply((e as CustomEvent<string>).detail));
}
