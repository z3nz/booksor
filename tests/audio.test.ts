import { describe, expect, it } from 'vitest';
import { AUDIO_BASE, estimateVerseAt, estimateVerseTime, formatTime, narrationFor } from '../src/lib/audio.ts';

describe('narrationFor', () => {
  it('finds the recording for a BSB chapter, with the chapters either side', () => {
    expect(narrationFor('/bsb/john/3')).toEqual({
      url: '/bsb/john/3',
      title: 'John 3',
      src: `${AUDIO_BASE}/bsb/souer/john/3.mp3`,
      prevUrl: '/bsb/john/2',
      nextUrl: '/bsb/john/4',
    });
  });

  it('crosses books, and stops at the ends of the Bible', () => {
    expect(narrationFor('/bsb/malachi/4')?.nextUrl).toBe('/bsb/matthew/1');
    expect(narrationFor('/bsb/matthew/1')?.prevUrl).toBe('/bsb/malachi/4');
    expect(narrationFor('/bsb/genesis/1')?.prevUrl).toBeNull();
    expect(narrationFor('/bsb/revelation/22')?.nextUrl).toBeNull();
    expect(narrationFor('/bsb/1-corinthians/13')?.src).toBe(`${AUDIO_BASE}/bsb/souer/1-corinthians/13.mp3`);
  });

  it('has nothing for other translations or pages', () => {
    expect(narrationFor('/kjv/john/3')).toBeNull();
    expect(narrationFor('/bsb/john/22')).toBeNull();
    expect(narrationFor('/bsb/nowhere/1')).toBeNull();
    expect(narrationFor('/bsb')).toBeNull();
    expect(narrationFor('/help/anxiety')).toBeNull();
  });
});

describe('verse timing estimates', () => {
  const verses = [
    { v: 1, text: 'a'.repeat(100) },
    { v: 2, text: 'b'.repeat(100) },
    { v: 3, text: 'c'.repeat(200) },
  ];

  it('places a verse by how much text comes before it, starting a little early', () => {
    expect(estimateVerseTime(verses, 1, 120)).toBe(0);
    expect(estimateVerseTime(verses, 2, 120)).toBe(28);
    expect(estimateVerseTime(verses, 3, 120)).toBe(58);
    expect(estimateVerseTime(verses, 9, 120)).toBe(0);
    expect(estimateVerseTime(verses, 3, NaN)).toBe(0);
  });

  it('finds the verse at a time', () => {
    expect(estimateVerseAt(verses, 0, 120)).toBe(1);
    expect(estimateVerseAt(verses, 31, 120)).toBe(2);
    expect(estimateVerseAt(verses, 100, 120)).toBe(3);
    expect(estimateVerseAt(verses, 500, 120)).toBe(3);
    expect(estimateVerseAt([], 5, 120)).toBeNull();
  });
});

describe('formatTime', () => {
  it('shows minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
