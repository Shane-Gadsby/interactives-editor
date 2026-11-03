import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const playerDir = fileURLToPath(new URL('../interactives-player', import.meta.url));

// The player lives in the sibling repo. The editor imports its source (for the
// canvas and types) and embeds its IIFE build (for previews and exports).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^interactives-player$/, replacement: `${playerDir}/src/index.ts` },
      { find: /^@player-iife(\?raw)?$/, replacement: `${playerDir}/dist/interactives-player.iife.js$1` },
      // The script sandbox's source, for painting script layers on the editor canvas (a lazy chunk)
      { find: /^@player-sandbox$/, replacement: `${playerDir}/src/sandbox.ts` },
      { find: /^@player-sandbox-iife(\?raw)?$/, replacement: `${playerDir}/dist/interactives-sandbox.iife.js$1` },
    ],
    dedupe: ['fflate'],
  },
  // Built for /interactives/ behind haproxy; relative so it also works from any prefix.
  base: './',
  server: {
    fs: { allow: ['..'] },
    // `npm run dev` talks to the real server (node index.js on 3048) for storage.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3048', rewrite: (p) => `/interactives${p}` },
    },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  test: { environment: 'jsdom' },
});
