const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Verse text as HTML. KJV-style [supplied words] become italics. */
export function verseHtml(text: string, suppliedWords = false): string {
  const html = escapeHtml(text);
  return suppliedWords ? html.replace(/\[([^\]]+)\]/g, '<em class="added">$1</em>') : html;
}

/** Verse text with markup removed, for search, sharing and copying. */
export function plainText(text: string, suppliedWords = false): string {
  return suppliedWords ? text.replace(/[[\]]/g, '') : text;
}
