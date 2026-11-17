// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://booksor.com',
  trailingSlash: 'never',
  // /kjv/john/3 -> dist/kjv/john/3.html (Cloudflare serves it at the clean URL)
  build: { format: 'file' },
  integrations: [svelte(), sitemap()],
});
