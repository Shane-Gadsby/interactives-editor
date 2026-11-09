//Writes a .br and a .gz beside each text file in dist (what index.js serves through precompressed.js). Runs last in
//`npm run build`, and by hand with `node scripts/precompress.mjs [dir]`. A copy that isn't smaller than the file is
//not kept, and copies left from an earlier build are removed, so dist never holds one its file has moved past.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)

//Keep in step with precompressed.js
const TEXT = /\.(js|mjs|css|html|svg|json|txt|xml|csv|wasm|map)$/i

//Under this a copy saves less than it costs to ask for
const MIN = 1024

export async function precompress(dir) {
	let everything = fs.readdirSync(dir, {recursive: true, withFileTypes: true}).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name))

	//Copies whose file is gone
	for (let p of everything) {
		if (/\.(br|gz)$/.test(p) && !fs.existsSync(p.replace(/\.(br|gz)$/, ''))) {
			fs.rmSync(p)
		}
	}

	let files = everything.filter((p) => TEXT.test(p)),
		out = {files: 0, raw: 0, br: 0, gz: 0},
		next = 0

	//Brotli at 11 takes a while on the big chunk, so a few at a time (the thread pool is the real limit)
	await Promise.all(Array.from({length: 4}, async () => {
		while (next < files.length) {
			let file = files[next++],
				buf = fs.readFileSync(file),
				made = {
					'.br': () => brotli(buf, {params: {
						[zlib.constants.BROTLI_PARAM_QUALITY]: 11,
						[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
						[zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
						[zlib.constants.BROTLI_PARAM_LGWIN]: 24
					}}),
					'.gz': () => gzip(buf, {level: 9})
				}

			for (let ext of Object.keys(made)) {
				fs.rmSync(file + ext, {force: true})

				if (buf.length < MIN) {
					continue
				}

				let z = await made[ext]()

				if (z.length < buf.length) {
					fs.writeFileSync(file + ext, z)
					out[ext === '.br' ? 'br' : 'gz'] += z.length
				}
			}

			out.files++
			out.raw += buf.length
		}
	}))

	return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	let dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url))),
		started = Date.now(),
		r = await precompress(dir)

	console.log(`precompress: ${r.files} files, ${(r.raw / 1024).toFixed(0)} KB raw, ${(r.gz / 1024).toFixed(0)} KB gzip, ${(r.br / 1024).toFixed(0)} KB brotli (${((Date.now() - started) / 1000).toFixed(1)} s)`)
}
