// Downloads each translation's verse-per-line file from eBible.org into data/raw/.
// Skips files already downloaded. Run with: node scripts/fetch-sources.ts [--force]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  const zip = join(RAW, `${t.source}.zip`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  // Only pull out the plain text file and the license page.
  execFileSync('unzip', ['-o', '-j', zip, `${t.source}_vpl.txt`, `${t.source}_about.htm`, '-d', RAW], {
    stdio: 'ignore',
  });
  if (!existsSync(txt)) throw new Error(`${zip} did not contain ${t.source}_vpl.txt`);
}
