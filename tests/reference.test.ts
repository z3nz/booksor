import { describe, expect, it } from 'vitest';
import { findBook, formatReference, parseReference } from '../src/lib/reference.ts';
import { adjacentChapter, bookBySlug, BOOKS } from '../src/lib/books.ts';

const fmt = (s: string) => {
  const r = parseReference(s);
  return r ? formatReference(r) : null;
};

describe('findBook', () => {
  it.each([
    ['jn', 'John'],
    ['john', 'John'],
    ['gen', 'Genesis'],
    ['gene', 'Genesis'],
    ['ps', 'Psalms'],
    ['psalm', 'Psalms'],
    ['1 cor', '1 Corinthians'],
    ['1cor', '1 Corinthians'],
    ['1co', '1 Corinthians'],
    ['i cor', '1 Corinthians'],
    ['ii cor', '2 Corinthians'],
    ['first corinthians', '1 Corinthians'],
    ['2nd timothy', '2 Timothy'],
    ['iii john', '3 John'],
    ['1 jn', '1 John'],
    ['song of songs', 'Song of Solomon'],
    ['song of solomon', 'Song of Solomon'],
    ['phil', 'Philippians'],
    ['philem', 'Philemon'],
    ['judg', 'Judges'],
    ['jude', 'Jude'],
    ['rev', 'Revelation'],
    ['revelations', 'Revelation'],
    ['Isaiah', 'Isaiah'],
    ['1 thes.', '1 Thessalonians'],
  ])('%s -> %s', (input, name) => {
    expect(findBook(input)?.name).toBe(name);
  });

  it.each(['', 'x', 'zzz', '4 john', 'hello'])('%s -> null', (input) => {
    expect(findBook(input)).toBeNull();
  });
});

describe('parseReference', () => {
  it.each([
    ['jn 3:16', 'John 3:16'],
    ['John 3:16', 'John 3:16'],
    ['john 3 16', 'John 3:16'],
    ['john 3.16', 'John 3:16'],
    ['jn3:16', 'John 3:16'],
    ['john 3:', 'John 3'],
    ['ps 23', 'Psalms 23'],
    ['ps23', 'Psalms 23'],
    ['1 cor 13:4-7', '1 Corinthians 13:4-7'],
    ['1co13:4–7', '1 Corinthians 13:4-7'],
    ['rom 8:38-9:1', 'Romans 8:38-9:1'],
    ['gen 1-3', 'Genesis 1-3'],
    ['jude 5', 'Jude 1:5'],
    ['jude 3-5', 'Jude 1:3-5'],
    ['song of songs 2', 'Song of Solomon 2'],
    ['first john 4:8', '1 John 4:8'],
    ['genesis', 'Genesis'],
    ['ps 119:105', 'Psalms 119:105'],
    ['john 3:16-14', 'John 3:16'],
    ['gen 49-60', 'Genesis 49-50'],
  ])('%s -> %s', (input, out) => {
    expect(fmt(input)).toBe(out);
  });

  it.each(['', 'love', 'jn 22', 'gen 0', 'john 3:0', 'for god so loved', '3:16'])('%s -> null', (input) => {
    expect(parseReference(input)).toBeNull();
  });

  it('marks book-only references', () => {
    expect(parseReference('romans')).toMatchObject({ chapter: 1, bookOnly: true });
  });
});

describe('books', () => {
  it('has 66 books and 1,189 chapters', () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.reduce((n, b) => n + b.chapters, 0)).toBe(1189);
  });

  it('crosses book boundaries for next/previous chapter', () => {
    const gen = bookBySlug.get('genesis')!;
    const exo = bookBySlug.get('exodus')!;
    expect(adjacentChapter(gen, 50, 1)).toEqual({ book: exo, chapter: 1 });
    expect(adjacentChapter(exo, 1, -1)).toEqual({ book: gen, chapter: 50 });
    expect(adjacentChapter(gen, 1, -1)).toBeNull();
    expect(adjacentChapter(bookBySlug.get('revelation')!, 22, 1)).toBeNull();
  });
});
