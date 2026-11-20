// Before deploying: copies the live site's scripts and styles (/_astro/…) that this build no longer has into
// dist/_astro/, so pages from the previous build keep working. That matters because the main Worker and the
// language Workers deploy one after another: for a few seconds, live pages from the old build still ask the
// main Worker for the old files. The old names come from the live sw.js (CONFIG.assets).
// Run with: node scripts/keep-previous-assets.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SITE = 'https://booksor.com';

/** The /_astro/ files listed in a built sw.js, or [] if it can't be read */
export function astroAssets(sw: string): string[] {
  const json = sw.match(/\/\* CONFIG \*\/ (\{[^\n]*\})/)?.[1];
  if (!json) return [];
  try {
    const assets: unknown = JSON.parse(json).assets;
    return Array.isArray(assets) ? assets.filter((p): p is string => typeof p === 'string' && /^\/_astro\/[\w.-]+$/.test(p)) : [];
  } catch {
    return []; // the source template isn't JSON, only the built file is
  }
}

export async function keepPreviousAssets(dist: string, site = SITE): Promise<{ kept: number; failed: string[] }> {
  const res = await fetch(`${site}/sw.js`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${site}/sw.js: HTTP ${res.status}`);
  const missing = astroAssets(await res.text()).filter((p) => !existsSync(join(dist, p)));
  const failed: string[] = [];
  await Promise.all(
    missing.map(async (p) => {
      const r = await fetch(site + p);
      if (!r.ok) return void failed.push(`${p} (HTTP ${r.status})`);
      const file = join(dist, p);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }),
  );
  return { kept: missing.length - failed.length, failed };
}

if (import.meta.main) {
  const { kept, failed } = await keepPreviousAssets(join(import.meta.dirname, '..', 'dist'));
  console.log(`✓ kept ${kept} script and style files from the live site`);
  for (const f of failed) console.warn(`  ! couldn't fetch ${f}`);
}
