// Highlights, notes and bookmarks. Saved on this device only (localStorage), with
// backup/restore as a JSON file. Verses are keyed by book/chapter/verse rather than
// translation, so a highlight made in the KJV also shows in the WEB and BSB.
//
// Everything except load/save is a pure function so it can be tested.
import { verseKey } from './books.ts';

export const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type Color = (typeof COLORS)[number];

export interface Highlight {
  color: Color;
  /** Verse text when highlighted, and its translation, for the Saved page */
  t: string;
  tr: string;
  /** Last changed, ms since epoch */
  at: number;
}

/** A bookmark and/or note on a run of verses in one chapter. */
export interface Passage {
  bm?: true;
  note?: string;
  t: string;
  tr: string;
  at: number;
}

export interface Library {
  v: 1;
  /** Keyed by verseKey: "book:chapter:verse" */
  highlights: Record<string, Highlight>;
  /** Keyed by passageKey: "book:chapter:from-to" */
  passages: Record<string, Passage>;
}

export interface PassageRef {
  b: number;
  c: number;
  from: number;
  to: number;
}

export const emptyLibrary = (): Library => ({ v: 1, highlights: {}, passages: {} });

export const passageKey = (p: PassageRef) => `${p.b}:${p.c}:${p.from}-${p.to}`;

export function parseVerseKey(key: string) {
  const [b, c, v] = key.split(':').map(Number);
  return { b, c, v };
}

export function parsePassageKey(key: string): PassageRef {
  const [b, c, range] = key.split(':');
  const [from, to] = range.split('-').map(Number);
  return { b: Number(b), c: Number(c), from, to };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const VERSE_KEY = /^\d+:\d+:\d+$/;
const PASSAGE_KEY = /^\d+:\d+:\d+-\d+$/;

/** Read a library from untrusted JSON (storage or a backup file), dropping anything malformed. */
export function parseLibrary(data: unknown): Library {
  const lib = emptyLibrary();
  if (!isObject(data)) return lib;
  if (isObject(data.highlights)) {
    for (const [key, h] of Object.entries(data.highlights)) {
      if (!VERSE_KEY.test(key) || !isObject(h) || !COLORS.includes(h.color as Color)) continue;
      lib.highlights[key] = { color: h.color as Color, t: String(h.t ?? ''), tr: String(h.tr ?? ''), at: Number(h.at) || 0 };
    }
  }
  if (isObject(data.passages)) {
    for (const [key, p] of Object.entries(data.passages)) {
      if (!PASSAGE_KEY.test(key) || !isObject(p)) continue;
      const entry: Passage = { t: String(p.t ?? ''), tr: String(p.tr ?? ''), at: Number(p.at) || 0 };
      if (p.bm) entry.bm = true;
      if (typeof p.note === 'string' && p.note.trim()) entry.note = p.note;
      if (entry.bm || entry.note) lib.passages[key] = entry;
    }
  }
  return lib;
}

/** Highlight verses in a color, or remove their highlight with `null`. */
export function setHighlight(
  lib: Library,
  verses: { b: number; c: number; v: number; t: string }[],
  color: Color | null,
  tr: string,
  now = Date.now(),
): Library {
  const highlights = { ...lib.highlights };
  for (const { b, c, v, t } of verses) {
    const key = verseKey(b, c, v);
    if (color) highlights[key] = { color, t, tr, at: now };
    else delete highlights[key];
  }
  return { ...lib, highlights };
}

/** Change a passage's bookmark or note. An empty note removes it; an empty passage is deleted. */
export function updatePassage(
  lib: Library,
  ref: PassageRef,
  patch: { bm?: boolean; note?: string },
  t: string,
  tr: string,
  now = Date.now(),
): Library {
  const key = passageKey(ref);
  const prev = lib.passages[key];
  const next: Passage = { t, tr, at: now };
  const bm = patch.bm ?? prev?.bm;
  const note = (patch.note ?? prev?.note)?.trim();
  if (bm) next.bm = true;
  if (note) next.note = note;
  const passages = { ...lib.passages };
  if (next.bm || next.note) passages[key] = next;
  else delete passages[key];
  return { ...lib, passages };
}

export function removePassage(lib: Library, key: string): Library {
  const passages = { ...lib.passages };
  delete passages[key];
  return { ...lib, passages };
}

/** Combine two libraries (e.g. restoring a backup). For the same verse, the newer change wins. */
export function mergeLibraries(a: Library, b: Library): Library {
  const pick = <T extends { at: number }>(x: Record<string, T>, y: Record<string, T>) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y)) if (!out[k] || v.at > out[k].at) out[k] = v;
    return out;
  };
  return { v: 1, highlights: pick(a.highlights, b.highlights), passages: pick(a.passages, b.passages) };
}

export interface HighlightGroup extends PassageRef {
  color: Color;
  t: string;
  tr: string;
  at: number;
  /** verseKeys in this group, for removing it */
  keys: string[];
}

/** Join neighbouring verses with the same color into one entry, newest first. */
export function highlightGroups(lib: Library): HighlightGroup[] {
  const sorted = Object.entries(lib.highlights)
    .map(([key, h]) => ({ key, ...parseVerseKey(key), ...h }))
    .sort((x, y) => x.b - y.b || x.c - y.c || x.v - y.v);
  const groups: HighlightGroup[] = [];
  for (const h of sorted) {
    const last = groups.at(-1);
    if (last && last.b === h.b && last.c === h.c && last.to === h.v - 1 && last.color === h.color) {
      last.to = h.v;
      last.t += ' ' + h.t;
      last.at = Math.max(last.at, h.at);
      last.keys.push(h.key);
    } else {
      groups.push({ b: h.b, c: h.c, from: h.v, to: h.v, color: h.color, t: h.t, tr: h.tr, at: h.at, keys: [h.key] });
    }
  }
  return groups.sort((x, y) => y.at - x.at);
}

/** Everything saved in one chapter, for drawing it on the page. */
export function chapterMarks(lib: Library, b: number, c: number) {
  const prefix = `${b}:${c}:`;
  const highlights = new Map<number, Color>();
  for (const [key, h] of Object.entries(lib.highlights)) {
    if (key.startsWith(prefix)) highlights.set(Number(key.slice(prefix.length)), h.color);
  }
  const passages: (PassageRef & Passage & { key: string })[] = [];
  for (const [key, p] of Object.entries(lib.passages)) {
    if (key.startsWith(prefix)) passages.push({ key, ...parsePassageKey(key), ...p });
  }
  return { highlights, passages };
}

export function countSaved(lib: Library) {
  const passages = Object.values(lib.passages);
  return {
    highlights: highlightGroups(lib).length,
    notes: passages.filter((p) => p.note).length,
    bookmarks: passages.filter((p) => p.bm).length,
  };
}

// --- Device storage ---

const KEY = 'booksor:library';
export const LIBRARY_EVENT = 'booksor:library';

export function loadLibrary(): Library {
  try {
    return parseLibrary(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return emptyLibrary();
  }
}

/** Save and tell the rest of the page. Returns false if the browser refused to store it. */
export function saveLibrary(lib: Library): boolean {
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(lib));
  } catch {
    ok = false;
  }
  window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail: lib }));
  return ok;
}

/** Run `fn` whenever the library changes, in this tab or another one. Returns an unsubscribe. */
export function onLibraryChange(fn: (lib: Library) => void): () => void {
  const local = (e: Event) => fn((e as CustomEvent<Library>).detail);
  const other = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) fn(loadLibrary());
  };
  window.addEventListener(LIBRARY_EVENT, local);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(LIBRARY_EVENT, local);
    window.removeEventListener('storage', other);
  };
}

export function backupFile(lib: Library): Blob {
  return new Blob([JSON.stringify({ app: 'booksor', exported: new Date().toISOString(), ...lib }, null, 2)], {
    type: 'application/json',
  });
}
