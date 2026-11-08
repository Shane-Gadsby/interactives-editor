import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain ESM, shared with the test that checks the bundle is current
import { sourcesHash } from './scripts/media-sources.mjs';

// The trusted side of the media bridge (the player's src/media) as one browser ES module, shared/media-bridge.mjs. The learner page loads it
// from /interactives/media-bridge.mjs, and the server imports it to clean a project's declared sensors. It is committed, since test and
// prod run with no build step; `npm run build` makes it again, and test/server-media.test.ts fails if it has fallen behind the player.
export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: fileURLToPath(new URL('./mcp/media.ts', import.meta.url)), formats: ['es'], fileName: () => 'media-bridge.mjs' },
    outDir: 'shared',
    emptyOutDir: false,
    target: 'es2020',
    minify: false,
    rollupOptions: { output: { banner: `/*! built from the player's media sources ${sourcesHash()} */` } },
  },
});
