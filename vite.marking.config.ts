import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain ESM, shared with the test that checks the bundle is current
import { sourcesHash } from './scripts/marking-sources.mjs';

// The server's marking (mcp/marking.ts) as one Node ESM file, shared/marking-kit.mjs. It is committed, since test and prod run
// with no build step; `npm run build` makes it again, and test/server-marking.test.ts fails if it has fallen behind the player.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: fileURLToPath(new URL('./mcp/marking.ts', import.meta.url)),
    outDir: 'shared',
    emptyOutDir: false,
    target: 'node18',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'marking-kit.mjs', format: 'es', banner: `/*! built from the player's marking sources ${sourcesHash()} */` } },
  },
  ssr: { noExternal: true },
});
