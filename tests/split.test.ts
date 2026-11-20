import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import translations from '../data/translations.json' with { type: 'json' };
import { astroAssets } from '../scripts/keep-previous-assets.ts';
import { prefixClashes, readMainConfig, splitDist, workerConfig } from '../scripts/split-dist.ts';

const main = readMainConfig(join(import.meta.dirname, '..', 'wrangler.jsonc'));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)));
}

function write(file: string, text = 'x') {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A small dist/ shaped like the real one: every translation's book list and a chapter, plus shared files */
function fakeDist(root: string) {
  const dist = join(root, 'dist');
  for (const f of ['index.html', 'es.html', '404.html', 'about.html', 'sw.js', '_astro/a.js', 'xref/john/3.json']) {
    write(join(dist, f));
  }
  for (const t of translations) {
    write(join(dist, `${t.id}.html`));
    write(join(dist, t.id, 'john', '3.html'));
    write(join(dist, 'search', `${t.id}.json`));
  }
  return dist;
}

describe('splitting dist/ across Workers', () => {
  let root: string;
  let dist: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'booksor-split-'));
    dist = fakeDist(root);
  });
  const split = (maxFiles?: number) => splitDist({ dist, out: join(root, 'dist-langs'), translations, main, maxFiles });

  it('puts every translation in exactly one place, and moves nothing else', () => {
    const before = walk(dist).sort();
    const { workers } = split();
    const after = [
      ...walk(dist),
      ...workers.flatMap((w) => walk(join(w.dir, 'site')).filter((f) => f !== '404.html')),
    ].sort();
    expect(after).toEqual(before);

    for (const t of translations) {
      const home = t.language === 'en' ? dist : join(root, 'dist-langs', t.language, 'site');
      expect(walk(home)).toContain(join(t.id, 'john', '3.html'));
      expect(walk(home)).toContain(`${t.id}.html`);
    }
  });

  it('keeps English, home pages and shared data in the main Worker', () => {
    split();
    const left = walk(dist);
    expect(left).toEqual(expect.arrayContaining(['index.html', 'es.html', 'bsb.html', 'sw.js', '_astro/a.js', 'xref/john/3.json']));
    expect(left).toContain(join('search', 'rv1909.json'));
    expect(left.some((f) => f.startsWith('rv1909'))).toBe(false);
  });

  it('gives each language Worker its own 404 page and a route per translation', () => {
    const { workers } = split();
    const es = workers.find((w) => w.lang === 'es')!;
    expect(es.name).toBe('booksor-es');
    expect(walk(join(es.dir, 'site'))).toContain('404.html');
    const config = JSON.parse(readFileSync(join(es.dir, 'wrangler.jsonc'), 'utf8').replace(/^\/\/.*$/m, ''));
    expect(config.routes).toEqual([{ pattern: 'booksor.com/rv1909*', zone_name: 'booksor.com' }]);
    expect(config.assets).toEqual({ ...main.assets, directory: './site' });
    expect(config.compatibility_date).toBe(main.compatibility_date);
    expect(config.main).toBeUndefined(); // files only, no script
  });

  it('refuses to run twice on the same build', () => {
    split();
    expect(() => split()).toThrow(/build again/);
  });

  it('fails when a Worker would go over the file limit', () => {
    expect(() => split(5)).toThrow(/Over 5 files: main Worker/);
  });
});

describe('route clashes', () => {
  it('catches a translation id that starts another path or id', () => {
    expect(prefixClashes(['rv'], ['rv.html', 'rv', 'rv1909.html'])).toEqual(['/rv* would also catch /rv1909']);
    expect(prefixClashes(['rv', 'rv1909'], [])).toEqual(['/rv* would also catch /rv1909']);
    expect(prefixClashes(['rv1909'], ['rv1909.html', 'rv1909', 'es.html', 'bsb'])).toEqual([]);
  });

  it('has none for the real translations', () => {
    const ids = translations.map((t) => t.id);
    expect(prefixClashes(ids, ['index', 'es', 'about', 'help', 'saved', 'offline', 'search', 'votd', 'xref', 'icons'])).toEqual([]);
  });

  it('builds one route per translation', () => {
    expect(workerConfig('pt', ['almeida', 'blivre'], main).routes.map((r) => r.pattern)).toEqual([
      'booksor.com/almeida*',
      'booksor.com/blivre*',
    ]);
  });
});

describe('keeping the live build’s scripts', () => {
  it('reads the /_astro/ files from a built sw.js', () => {
    const config = { version: 'v', assets: ['/_astro/a.B1.js', '/_astro/b.C2.css', '/favicon.svg', '/_astro/../x'] };
    const sw = `const CONFIG = /* CONFIG */ ${JSON.stringify(config)};\nconst DATA = 1;`;
    expect(astroAssets(sw)).toEqual(['/_astro/a.B1.js', '/_astro/b.C2.css']);
  });

  it('ignores the unbuilt template and junk', () => {
    expect(astroAssets("const CONFIG = /* CONFIG */ { version: 'dev', assets: [] };")).toEqual([]);
    expect(astroAssets('<html>not found</html>')).toEqual([]);
  });
});
