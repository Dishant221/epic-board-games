// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Canonical origin used for SEO tags and the sitemap. Set SITE_URL in CI.
const site = process.env.SITE_URL ?? 'https://epic-board-games.example.com';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  // Hash-based CSP for every inline script/style Astro emits (delivered as a
  // <meta> tag). frame-ancestors and other header-only directives are in public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  integrations: [react(), sitemap({ filter: (page) => !/\/(profile|friends)$/.test(page) })],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // `npm run dev:web` proxies the API to a local `wrangler dev` on :8787.
      proxy: { '/api': { target: 'http://localhost:8787', ws: true, changeOrigin: false } },
    },
  },
});
