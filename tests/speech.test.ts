import { describe, expect, it } from 'vitest';
import { pickVoice, rankVoices, scrollPixelsPerSecond, speechChunks } from '../src/lib/speech.ts';

describe('speechChunks', () => {
  it('keeps short verses whole and tidies them', () => {
    expect(speechChunks('  Jesus   wept. ')).toEqual(['Jesus wept.']);
    expect(speechChunks('')).toEqual([]);
  });

  it('splits long verses at sentence ends, then commas, then words', () => {
    // Esther 8:9 (KJV) is the longest verse in the Bible
    const esther =
      'Then were the king’s scribes called at that time in the third month, that is, the month Sivan, on the three and twentieth day thereof; and it was written according to all that Mordecai commanded unto the Jews, and to the lieutenants, and the deputies and rulers of the provinces which are from India unto Ethiopia, an hundred twenty and seven provinces, unto every province according to the writing thereof, and unto every people after their language, and to the Jews according to their writing, and according to their language.';
    const chunks = speechChunks(esther, 120);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join(' ')).toBe(esther);
    expect(speechChunks('One. Two. Three.', 9)).toEqual(['One. Two.', 'Three.']);
    expect(speechChunks('aaaa bbbb cccc', 9)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('drops KJV bracket marks for supplied words', () => {
    expect(speechChunks('God [is] love')).toEqual(['God is love']);
  });
});

describe('voices', () => {
  const voices = [
    { name: 'Thomas', lang: 'fr-FR' },
    { name: 'Fred', lang: 'en-US', localService: true },
    { name: 'Samantha', lang: 'en-US', default: true, localService: true },
    { name: 'Microsoft Aria Online (Natural) - English', lang: 'en-US' },
    { name: 'Daniel', lang: 'en_GB', localService: true },
  ];

  it('only offers voices for the language, natural-sounding ones first', () => {
    const ranked = rankVoices(voices, 'en').map((v) => v.name);
    expect(ranked[0]).toMatch(/Natural/);
    expect(ranked[1]).toBe('Samantha');
    expect(ranked).toContain('Daniel');
    expect(ranked).not.toContain('Thomas');
  });

  it('prefers the reader’s own accent when voices are otherwise equal', () => {
    const google = [
      { name: 'Google UK English Female', lang: 'en-GB' },
      { name: 'Google US English', lang: 'en-US' },
    ];
    expect(rankVoices(google, 'en', 'en-US')[0].name).toBe('Google US English');
    expect(rankVoices(google, 'en', 'en-GB')[0].name).toBe('Google UK English Female');
  });

  it('finds voices filed under another code for the same language', () => {
    const others = [
      { name: 'Blessica', lang: 'fil-PH' },
      { name: 'Damayanti', lang: 'in_ID' },
    ];
    expect(rankVoices(others, 'tl').map((v) => v.name)).toEqual(['Blessica']);
    expect(rankVoices(others, 'id').map((v) => v.name)).toEqual(['Damayanti']);
  });

  it('keeps the saved voice while it exists', () => {
    expect(pickVoice(voices, 'en', 'Fred')?.name).toBe('Fred');
    expect(pickVoice(voices, 'en', 'Gone')?.name).toMatch(/Natural/);
    expect(pickVoice(voices, 'de', '')).toBeUndefined();
  });
});

it('scales auto-scroll speed with text size', () => {
  expect(scrollPixelsPerSecond(3, 19)).toBe(15);
  expect(scrollPixelsPerSecond(3, 38)).toBe(30);
  expect(scrollPixelsPerSecond(99, 19)).toBe(50);
});
