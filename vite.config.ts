import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const playerDir = fileURLToPath(new URL('../interactives-player', import.meta.url));

// The version (package.json) and build id (the editor and player commits it was built from), shown in Preferences and help
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
// A "+" after the commit means it was built with changes not committed yet (dist is committed with its source, so a
// build is usually made before the commit it lands in: without the mark it reads as the commit before)
const commit = (dir: string) => {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', '.', ':!dist', ':!mcp/dist'], { cwd: dir, encoding: 'utf8' }).trim();
    return dirty ? `${sha}+` : sha;
  } catch {
    return '';
  }
};
const buildId = [commit(fileURLToPath(new URL('.', import.meta.url))), commit(playerDir)].filter(Boolean).join('.') || 'dev';

// The player lives in the sibling repo. The editor imports its source (for the
// canvas and types) and embeds its IIFE build (for previews and exports).
export default defineConfig({
  plugins: [react()],
  // Saved artboard pictures (lib/still-cache.ts) are only good for the build that drew them
  define: { __IX_BUILD__: JSON.stringify(Date.now().toString(36)), __IX_VERSION__: JSON.stringify(version), __IX_BUILD_ID__: JSON.stringify(buildId) },
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
