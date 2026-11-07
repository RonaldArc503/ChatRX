// @ts-check
import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [preact()],

  vite: {
    server: { proxy: {
      '/api/agents': 'http://127.0.0.1:8787',
      '/mcp': 'http://127.0.0.1:8787',
    } },
    plugins: [tailwindcss()]
  }
});