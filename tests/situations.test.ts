import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKS } from '../src/lib/books.ts';
import { parseReference } from '../src/lib/reference.ts';
import { GROUPS, isCrisisQuery, soundsPersonal, matchSituations, POPULAR_SITUATIONS, SITUATIONS, situationBySlug } from '../src/lib/situations.ts';
import { TRANSLATIONS } from '../src/lib/translations.ts';

const top = (q: string) => matchSituations(q).map((m) => m.situation.slug);

describe('situation data', () => {
  it('has unique slugs, known groups, and enough verses', () => {
    expect(new Set(SITUATIONS.map((s) => s.slug)).size).toBe(SITUATIONS.length);
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const s of SITUATIONS) {
      expect(groups.has(s.group), s.slug).toBe(true);
      expect(s.slug, s.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(s.verses.length, s.slug).toBeGreaterThanOrEqual(10);
      expect(new Set(s.verses).size, `${s.slug} repeats a verse`).toBe(s.verses.length);
      expect(s.keywords.length, s.slug).toBeGreaterThan(3);
    }
    for (const slug of POPULAR_SITUATIONS) expect(situationBySlug.has(slug), slug).toBe(true);
  });

  it('only uses references that parse to verses', () => {
    for (const s of SITUATIONS) {
      for (const v of s.verses) {
        const ref = parseReference(v);
        expect(ref?.verse, `${s.slug}: ${v}`).toBeGreaterThan(0);
        expect(ref?.endChapter, `${s.slug}: ${v}`).toBeUndefined();
      }
    }
  });

  const dbPath = join(import.meta.dirname, '..', 'data', 'bible.sqlite');
  it.skipIf(!existsSync(dbPath))('every verse exists in every translation', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const count = db.prepare('SELECT count(*) AS n FROM verses WHERE tr = ? AND book = ? AND chapter = ? AND verse BETWEEN ? AND ?');
    const missing: string[] = [];
    for (const s of SITUATIONS) {
      for (const v of s.verses) {
        const ref = parseReference(v)!;
        const want = (ref.endVerse ?? ref.verse!) - ref.verse! + 1;
        for (const t of TRANSLATIONS) {
          const { n } = count.get(t.id, BOOKS.indexOf(ref.book), ref.chapter, ref.verse!, ref.endVerse ?? ref.verse!) as { n: number };
          if (n !== want) missing.push(`${t.id} ${v} (${s.slug})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('matching what people type', () => {
  it.each([
    ['anxiety', 'anxiety'],
    ['Anxious', 'anxiety'],
    ["I'm struggling with anxiety", 'anxiety'],
    ['i’m so worried', 'anxiety'],
    ['feeling lonely', 'loneliness'],
    ['I feel all alone', 'loneliness'],
    ['grief', 'grief'],
    ['my dad passed away', 'grief'],
    ['lost my job', 'work'],
    ['I lost my job and I’m scared', 'work'],
    ['worried about money', 'money'],
    ['cant sleep', 'weariness'],
    ['verses for anger', 'anger'],
    ['dealing with depression', 'depression'],
    ['going through a breakup', 'heartbreak'],
    ['struggling with porn', 'temptation'],
    ['how to forgive someone who hurt me', 'forgiving'],
    ['god feels far away', 'god-feels-far'],
    ['I feel worthless', 'insecurity'],
  ])('"%s" → %s', (q, slug) => {
    expect(top(q)).toContain(slug);
  });

  it('puts the most specific match first', () => {
    expect(top('I lost my job')[0]).toBe('work');
    expect(top('afraid of death')[0]).toBe('facing-death');
  });

  it('suggests situations for a word being typed', () => {
    expect(top('anx')).toEqual(['anxiety']);
    const lon = matchSituations('lonel');
    expect(lon[0].situation.slug).toBe('loneliness');
    expect(lon[0].prefix).toBe(true);
  });

  it.each(['the lord is my shepherd', 'children of israel', 'fear not', 'for god so loved the world', 'jn 3:16', 'love', 'in the beginning', 'lo'])(
    'leaves ordinary searches alone: "%s"',
    (q) => {
      expect(top(q)).toEqual([]);
    },
  );

  it('notices personal queries that match nothing specific', () => {
    expect(top("I'm struggling")).toEqual([]);
    expect(soundsPersonal("I'm struggling")).toBe(true);
    expect(soundsPersonal('going through a lot')).toBe(true);
    expect(soundsPersonal('the lord is my shepherd')).toBe(false);
  });

  it('recognises when someone may be in crisis', () => {
    expect(isCrisisQuery('I want to die')).toBe(true);
    expect(isCrisisQuery('thinking about suicide')).toBe(true);
    expect(isCrisisQuery('self-harm')).toBe(true);
    expect(isCrisisQuery('die to self')).toBe(false);
    expect(isCrisisQuery('the wages of sin is death')).toBe(false);
    expect(top('I want to die')[0]).toBe('hopelessness');
  });
});
