// Draws the app icons (for "install as an app") from the Booksor logo.
// Run once after changing the logo: node scripts/make-icons.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const OUT = join(import.meta.dirname, '..', 'public', 'icons');
const BG = '#fbf8f2';
const ACCENT = '#8a3b2e';

// The open-book mark, drawn in a 32×32 box
const book = `
  <path d="M4 7.5C4 6.7 4.7 6 5.5 6H13a3 3 0 0 1 3 3v17a2.5 2.5 0 0 0-2.5-2.5H5.5C4.7 23.5 4 22.8 4 22z" fill="${ACCENT}"/>
  <path d="M28 7.5C28 6.7 27.3 6 26.5 6H19a3 3 0 0 0-3 3v17a2.5 2.5 0 0 1 2.5-2.5h8c.8 0 1.5-.7 1.5-1.5z" fill="${ACCENT}" opacity=".65"/>`;

/** `scale` is how much of the icon the book fills; maskable icons keep it inside the safe zone. */
function svg(scale: number, rounded: boolean) {
  const offset = (32 - 32 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" ${rounded ? 'rx="7"' : ''} fill="${BG}"/>
    <g transform="translate(${offset} ${offset + 0.6 * scale}) scale(${scale})">${book}</g>
  </svg>`;
}

const icons: [string, number, string][] = [
  ['icon-192.png', 192, svg(0.8, false)],
  ['icon-512.png', 512, svg(0.8, false)],
  ['maskable-512.png', 512, svg(0.6, false)],
  ['apple-touch-icon.png', 180, svg(0.72, false)],
];

for (const [name, size, source] of icons) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`✓ ${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
