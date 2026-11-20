// Deploys the whole site from a finished `astro build`: the main Worker (booksor) and one files-only Worker per
// language (booksor-es…). Workers Builds runs this as its deploy command; by hand, use `pnpm run deploy`.
//
// Order matters. The main Worker goes first, holding this build's scripts plus the live build's (see
// keep-previous-assets.ts), so old and new pages both find their files. Then each language Worker.
//
// Extra arguments go to every `wrangler deploy`, e.g. `pnpm run deploy:all --dry-run`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keepPreviousAssets } from './keep-previous-assets.ts';
import { readMainConfig, splitDist } from './split-dist.ts';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const args = process.argv.slice(2);

try {
  const { kept, failed } = await keepPreviousAssets(dist);
  console.log(`✓ kept ${kept} script and style files from the live site`);
  for (const f of failed) console.warn(`  ! couldn't fetch ${f}`);
} catch (e) {
  // Not fatal: without them, a page from the old build might miss a script for a few seconds
  console.warn(`  ! couldn't keep the live site's scripts: ${(e as Error).message}`);
}

const { mainFiles, workers } = splitDist({
  dist,
  out: join(root, 'dist-langs'),
  translations: JSON.parse(readFileSync(join(root, 'data', 'translations.json'), 'utf8')),
  main: readMainConfig(join(root, 'wrangler.jsonc')),
});

const wrangler = (extra: string[], env = process.env) =>
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', ...extra, ...args], { cwd: root, stdio: 'inherit', env });

// Workers Builds sets WRANGLER_CI_OVERRIDE_NAME=booksor (and a matching tag), which makes *every* wrangler deploy
// in the build go to the main Worker, whatever its config says. Keep them for the main Worker only; otherwise
// each language Worker's files would replace the whole site (this happened on 2026-11-20).
const { WRANGLER_CI_OVERRIDE_NAME, WRANGLER_CI_MATCH_TAG, ...langEnv } = process.env;
const mainName = readMainConfig(join(root, 'wrangler.jsonc')).name;
if (WRANGLER_CI_OVERRIDE_NAME && WRANGLER_CI_OVERRIDE_NAME !== mainName) {
  throw new Error(`Workers Builds expects Worker "${WRANGLER_CI_OVERRIDE_NAME}", but wrangler.jsonc says "${mainName}"`);
}

console.log(`\n→ ${mainName} (${mainFiles.toLocaleString()} files)`);
wrangler([]);
for (const w of workers) {
  console.log(`\n→ ${w.name} (${w.files.toLocaleString()} files): ${w.ids.map((id) => `/${id}`).join(' ')}`);
  wrangler(['--config', join(w.dir, 'wrangler.jsonc')], langEnv);
}
