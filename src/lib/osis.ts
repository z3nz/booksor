// OSIS book codes ("Gen", "1Cor", "Ps"), as used by the OpenBible.info cross-reference data.
// Same order as BOOKS, so a code's position is our book index.
export const OSIS_BOOKS = (
  'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer ' +
  'Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal ' +
  'Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'
).split(' ');

const osisIndex = new Map(OSIS_BOOKS.map((code, i) => [code, i]));

export interface OsisVerse {
  b: number;
  c: number;
  v: number;
}

/** "John.3.16" → {b: 42, c: 3, v: 16}, or null */
export function parseOsisVerse(s: string): OsisVerse | null {
  const m = /^(\w+)\.(\d+)\.(\d+)$/.exec(s.trim());
  const b = m ? osisIndex.get(m[1]) : undefined;
  return m && b !== undefined ? { b, c: Number(m[2]), v: Number(m[3]) } : null;
}

/** "1John.4.9-1John.4.10" → start and end verses (end = start for a single verse) */
export function parseOsisRange(s: string): { start: OsisVerse; end: OsisVerse } | null {
  const [a, b] = s.split('-');
  const start = parseOsisVerse(a);
  const end = b ? parseOsisVerse(b) : start;
  if (!start || !end) return null;
  // Ranges only go forward and stay in one book
  if (end.b !== start.b || end.c < start.c || (end.c === start.c && end.v < start.v)) return null;
  return { start, end };
}
