// Downloads each translation's verse-per-line file from eBible.org into data/raw/.
// Skips files already downloaded. Run with: node scripts/fetch-sources.ts [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import translations from '../data/translations.json' with { type: 'json' };

const RAW = join(import.meta.dirname, '..', 'data', 'raw');
const force = process.argv.includes('--force');
mkdirSync(RAW, { recursive: true });

for (const t of translations) {
  const txt = join(RAW, `${t.source}_vpl.txt`);
  if (existsSync(txt) && !force) {
    console.log(`✓ ${t.abbr} already downloaded`);
    continue;
  }
  console.log(`↓ ${t.abbr} from ${t.sourceUrl}`);
  const res = await fetch(t.sourceUrl);
  if (!res.ok) throw new Error(`${t.sourceUrl}: HTTP ${res.status}`);
  // Only keep the plain text file and the license page from the zip.
  const wanted = new Set([`${t.source}_vpl.txt`, `${t.source}_about.htm`]);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => wanted.has(f.name) });
  for (const [name, data] of Object.entries(files)) writeFileSync(join(RAW, name), data);
  if (!existsSync(txt)) throw new Error(`${t.sourceUrl} did not contain ${t.source}_vpl.txt`);
}
