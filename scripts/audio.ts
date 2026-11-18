// Human-narrated audio: Bob Souer reading the Berean Standard Bible (public domain, from openbible.com).
// Berean asked us to host our own copy, so this downloads the recordings, makes them smaller, and
// uploads them to the "booksor-audio" R2 bucket (served at AUDIO_BASE in src/lib/audio.ts).
//
//   node scripts/audio.ts download   1,189 chapter MP3s into data/raw/audio/souer/ (about 5.5 GB)
//   node scripts/audio.ts encode     64 kbps mono copies into data/raw/audio/out/ (about 2.7 GB)
//   node scripts/audio.ts upload     to R2 as bsb/souer/{book}/{chapter}.mp3
//
// Every step skips work already done, so it can be stopped and run again.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { BOOKS } from '../src/lib/books.ts';

const run = promisify(execFile);
const SOURCE = 'https://openbible.com/audio/souer/';
const BUCKET = 'booksor-audio';
const ROOT = join(import.meta.dirname, '..', 'data', 'raw', 'audio');
const RAW = join(ROOT, 'souer');
const OUT = join(ROOT, 'out');
const UPLOADED = join(ROOT, 'uploaded.txt');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

interface Chapter {
  /** Name on openbible.com, e.g. BSB_43_Jhn_003.mp3 */
  source: string;
  /** Key in the bucket, e.g. bsb/souer/john/3.mp3 */
  key: string;
  title: string;
}

/** Their book codes differ from ours (Jhn, Ezk, Tts…), so read them from the folder listing */
async function chapters(): Promise<Chapter[]> {
  const html = await (await fetch(SOURCE)).text();
  const codes = new Map<number, string>();
  for (const [, n, code] of html.matchAll(/BSB_(\d\d)_(\w+?)_\d{3}\.mp3/g)) codes.set(Number(n), code);
  return BOOKS.flatMap((book, i) => {
    const code = codes.get(i + 1);
    if (!code) throw new Error(`No recordings listed for ${book.name}`);
    return Array.from({ length: book.chapters }, (_, c) => ({
      source: `BSB_${String(i + 1).padStart(2, '0')}_${code}_${String(c + 1).padStart(3, '0')}.mp3`,
      key: `bsb/souer/${book.slug}/${c + 1}.mp3`,
      title: `${book.name} ${c + 1}`,
    }));
  });
}

/** Run `fn` over `items`, `limit` at a time, printing progress */
async function pool<T>(label: string, items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
      done++;
      if (done % 50 === 0 || done === items.length) console.log(`${label}: ${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

async function download(list: Chapter[]) {
  mkdirSync(RAW, { recursive: true });
  const todo = list.filter((c) => !existsSync(join(RAW, c.source)));
  console.log(`${list.length - todo.length} already downloaded`);
  await pool('download', todo, 4, async (c) => {
    const res = await fetch(SOURCE + c.source);
    if (!res.ok) throw new Error(`${c.source}: HTTP ${res.status}`);
    const file = join(RAW, c.source);
    writeFileSync(`${file}.part`, new Uint8Array(await res.arrayBuffer()));
    renameSync(`${file}.part`, file);
  });
}

async function encode(list: Chapter[]) {
  const todo = list.filter((c) => !existsSync(join(OUT, c.key)));
  console.log(`${list.length - todo.length} already encoded`);
  await pool('encode', todo, 8, async (c) => {
    const out = join(OUT, c.key);
    mkdirSync(dirname(out), { recursive: true });
    // Constant bit rate so browsers can jump to any point accurately. Drop the studio's own tags.
    await run(FFMPEG, [
      '-v', 'error', '-y',
      '-i', join(RAW, c.source),
      '-map', '0:a', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k',
      '-map_metadata', '-1', '-id3v2_version', '3',
      '-metadata', `title=${c.title}`,
      '-metadata', 'artist=Bob Souer',
      '-metadata', 'album=Berean Standard Bible',
      '-metadata', 'copyright=Public domain. BereanBible.com',
      '-f', 'mp3', `${out}.part`,
    ]);
    renameSync(`${out}.part`, out);
  });
}

async function upload(list: Chapter[]) {
  const sent = new Set(existsSync(UPLOADED) ? readFileSync(UPLOADED, 'utf8').split('\n') : []);
  const todo = list.filter((c) => !sent.has(c.key));
  console.log(`${list.length - todo.length} already uploaded`);
  await pool('upload', todo, 8, async (c) => {
    await run('npx', [
      'wrangler', 'r2', 'object', 'put', `${BUCKET}/${c.key}`,
      '--file', join(OUT, c.key),
      '--content-type', 'audio/mpeg',
      '--cache-control', 'public, max-age=31536000, immutable',
      '--remote',
    ]);
    appendFileSync(UPLOADED, `${c.key}\n`);
  });
}

function totalSize(dir: string, files: string[]) {
  const bytes = files.reduce((sum, f) => sum + (existsSync(join(dir, f)) ? statSync(join(dir, f)).size : 0), 0);
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

const step = process.argv[2];
const list = await chapters();
if (list.length !== 1189) throw new Error(`Expected 1,189 chapters, got ${list.length}`);
if (step === 'download') {
  await download(list);
  console.log(`downloaded ${totalSize(RAW, list.map((c) => c.source))}`);
} else if (step === 'encode') {
  await encode(list);
  console.log(`encoded ${totalSize(OUT, list.map((c) => c.key))}`);
} else if (step === 'upload') {
  await upload(list);
} else {
  console.log('Usage: node scripts/audio.ts download|encode|upload');
  process.exit(1);
}
