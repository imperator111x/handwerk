// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://zeus-service.de',
  output: 'server',
  session: false,
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [sitemap()],
  vite: {
    plugins: [
      /** @type {any} */
      (tailwindcss()),
    ],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
