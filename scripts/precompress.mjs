//Makes the compressed copies by hand into the same cache folder the server uses (storage/_compressed, or
//INTERACTIVES_STORAGE), so a local run can look at the sizes or have them ready before the server's first request.
//The server does this itself in the background after it starts: `node scripts/precompress.mjs [distDir] [cacheDir]`.
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const precompressed = createRequire(import.meta.url)('../precompressed.js')

let dist = path.resolve(process.argv[2] ?? here('../dist')),
	cache = path.resolve(process.argv[3] ?? path.join(process.env.INTERACTIVES_STORAGE || here('../storage'), '_compressed')),
	r = await precompressed(dist, cache).build()

console.log(`precompress: ${r.made} made, ${r.reused} reused, ${r.removed} cleared, ${(r.raw / 1024).toFixed(0)} KB raw, ${(r.gz / 1024).toFixed(0)} KB gzip, ${(r.br / 1024).toFixed(0)} KB brotli (${(r.ms / 1000).toFixed(1)} s) in ${cache}`)
