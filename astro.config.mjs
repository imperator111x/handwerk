// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://zeus-service.de',
  output: 'server',
  trailingSlash: 'never',
  session: false,
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [
    sitemap({
      filter(page) {
        try {
          const path = new URL(page).pathname.replace(/\/$/, "") || "/";
          return path === "/" || path === "/impressum" || path === "/datenschutz";
        } catch {
          return false;
        }
      },
    }),
  ],
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
