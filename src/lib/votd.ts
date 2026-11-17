export interface VotdEntry {
  ref: string;
  slug: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  text: string;
}

export type VotdMode = 'day' | 'hour';

/**
 * Which verse to show. Depends only on the date, so everyone sees the same verse
 * (per local calendar day, or per clock hour). The multipliers shuffle the order so
 * consecutive days don't walk the list in sequence.
 */
export function votdIndex(date: Date, mode: VotdMode, count: number): number {
  if (count <= 0) return 0;
  if (mode === 'day') {
    const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
    return (day * 37) % count;
  }
  const hour = Math.floor(date.getTime() / 3_600_000);
  return (hour * 101) % count;
}
