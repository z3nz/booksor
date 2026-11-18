// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import offline from './integrations/offline.mjs';

export default defineConfig({
  site: 'https://booksor.com',
  trailingSlash: 'never',
  // /kjv/john/3 -> dist/kjv/john/3.html (Cloudflare serves it at the clean URL)
  build: { format: 'file' },
  integrations: [svelte(), sitemap({ filter: (page) => !/\/(saved|offline)$/.test(page) }), offline()],
});
