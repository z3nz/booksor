import { describe, expect, it } from 'vitest';
import { BOOKS } from '../src/lib/books.ts';
import { dataUrls, formatSize, pageUrls } from '../src/lib/offline.ts';
import { SITUATIONS } from '../src/lib/situations.ts';

describe('offline downloads', () => {
  it('covers every chapter, situation page and the book list', () => {
    const urls = pageUrls('kjv');
    const chapters = BOOKS.reduce((n, b) => n + b.chapters, 0);
    expect(chapters).toBe(1189);
    expect(urls).toHaveLength(1 + chapters + SITUATIONS.length);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain('/kjv');
    expect(urls).toContain('/kjv/john/3');
    expect(urls).toContain('/kjv/help/anxiety');
    expect(urls.every((u) => u.startsWith('/kjv'))).toBe(true);
  });

  it('includes the search data for the translation and its language', () => {
    expect(dataUrls('web')).toEqual(['/search/web.json', '/search/words-en.json', '/votd/web.json']);
  });

  it('formats sizes', () => {
    expect(formatSize(43_751_608)).toBe('44 MB');
    expect(formatSize(2_400)).toBe('2 KB');
  });
});
