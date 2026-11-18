// Recorded narration. Bob Souer's reading of the Berean Standard Bible is public domain; Berean asked
// us to host our own copy and link to BereanBible.com. scripts/audio.ts puts the files in R2.
import { adjacentChapter, bookBySlug } from './books.ts';

export const AUDIO_BASE: string = import.meta.env.PUBLIC_AUDIO_BASE ?? 'https://audio.booksor.com';

export const NARRATOR = {
  name: 'Bob Souer',
  translation: 'bsb',
  credit: 'BereanBible.com',
  creditUrl: 'https://bereanbible.com/',
};

export interface Narration {
  /** Chapter page, e.g. "/bsb/john/3" */
  url: string;
  /** "John 3" */
  title: string;
  src: string;
  prevUrl: string | null;
  nextUrl: string | null;
}

/** The recording for a chapter page, or null if that translation has no narration */
export function narrationFor(path: string): Narration | null {
  const m = /^\/([^/]+)\/([^/]+)\/(\d+)$/.exec(path);
  if (!m || m[1] !== NARRATOR.translation) return null;
  const book = bookBySlug.get(m[2]);
  const chapter = Number(m[3]);
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  const link = (step: 1 | -1) => {
    const other = adjacentChapter(book, chapter, step);
    return other ? `/${m[1]}/${other.book.slug}/${other.chapter}` : null;
  };
  return {
    url: path,
    title: `${book.name} ${chapter}`,
    src: `${AUDIO_BASE}/${m[1]}/souer/${book.slug}/${chapter}.mp3`,
    prevUrl: link(-1),
    nextUrl: link(1),
  };
}

/**
 * Roughly where a verse starts in a chapter recording, from how much text comes before it.
 * The recordings have no verse timings, so this backs up a little to be sure not to miss the start.
 */
export function estimateVerseTime(verses: { v: number; text: string }[], verse: number, duration: number): number {
  const total = verses.reduce((sum, x) => sum + x.text.length, 0);
  const i = verses.findIndex((x) => x.v === verse);
  if (i <= 0 || !total || !Number.isFinite(duration)) return 0;
  const before = verses.slice(0, i).reduce((sum, x) => sum + x.text.length, 0);
  return Math.max(0, (before / total) * duration - 2);
}

/** The other way round: roughly which verse is being read at `time` */
export function estimateVerseAt(verses: { v: number; text: string }[], time: number, duration: number): number | null {
  if (!verses.length) return null;
  const total = verses.reduce((sum, x) => sum + x.text.length, 0);
  if (!total || !Number.isFinite(duration) || duration <= 0) return verses[0].v;
  const target = (Math.max(0, time) / duration) * total;
  let sum = 0;
  for (const x of verses) {
    sum += x.text.length;
    if (sum > target) return x.v;
  }
  return verses[verses.length - 1].v;
}

/** "1:05", or "1:02:05" for long recordings */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const mm = String(Math.floor((s % 3600) / 60));
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
