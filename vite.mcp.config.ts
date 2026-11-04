import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The MCP server (mcp/server.ts) as one Node ESM file: mcp/dist/interactives-mcp.mjs.
// `interactives-player` points at a DOM-free subset so the help topics can be bundled too.
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: [{ find: /^interactives-player$/, replacement: fileURLToPath(new URL('./mcp/player-lite.ts', import.meta.url)) }],
  },
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'mcp/dist',
    emptyOutDir: true,
    target: 'node18',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'interactives-mcp.mjs', format: 'es', banner: '#!/usr/bin/env node' } },
  },
  ssr: { noExternal: true },
});
