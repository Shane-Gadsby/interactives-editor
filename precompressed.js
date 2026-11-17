//Compressed copies of dist's text files, made by the server itself in the background after it starts and kept in a
//cache folder outside git (storage/_compressed), then handed out ahead of express.static to browsers that accept
//brotli or gzip. Test and prod have no build step and keep no .br/.gz in the repo, so this is where they come from.
//
//Until a file's copy exists the plain file goes out as it always did. A copy counts only while the file it came from
//still has the size and mtime it had when the copy was made (kept in manifest.json), so a restart reuses every copy
//and a deploy redoes just the files that changed. Hashed assets that went away have their copies deleted.
//
//haproxy does its own gzip on the way out, but leaves a response alone when it already has a Content-Encoding, so
//nothing is compressed twice. The cache headers still come from the same options.setHeaders as the plain file,
//called with the plain file's path so the tiers (media, stamped, no-cache) work out the same.
let fs = require('fs'),
	path = require('path'),
	zlib = require('zlib'),
	{promisify} = require('util'),
	brotli = promisify(zlib.brotliCompress),
	gzip = promisify(zlib.gzip),

	//What gets a copy
	compressible = /\.(js|mjs|css|html|svg|json|txt|xml|csv|wasm|map)$/i,

	//Under this a copy saves less than it costs to ask for
	minSize = 1024,

	ext = {br: '.br', gzip: '.gz'},

	//Highest q wins, br on a tie. q=0 means no, and * stands for anything not named
	pick = (header) => {
		let q = {}

		for (let part of String(header || '').split(',')) {
			let [name, ...params] = part.trim().toLowerCase().split(';'),
				weight = 1

			for (let p of params) {
				let m = /^\s*q\s*=\s*([\d.]+)/.exec(p)
				if (m) weight = Number(m[1])
			}

			if (name) q[name] = weight
		}

		let best = null,
			bestQ = 0

		for (let enc of ['br', 'gzip']) {
			let w = enc in q ? q[enc] : (q['*'] ?? 0)
			if (w > bestQ) {
				best = enc
				bestQ = w
			}
		}

		return best
	}

module.exports = (distDir, cacheDir, options = {}) => {
	distDir = path.resolve(distDir)
	cacheDir = path.resolve(cacheDir)

	//Brotli 11 is about 7 s on the 6 MB chunk. It runs on the thread pool, one file at a time, so the server never waits
	//on it, and it is paid once per changed file. 10 is half the time for 2% more bytes
	let quality = options.quality ?? 11,
		manifestFile = path.join(cacheDir, 'manifest.json'),

		//Plain file's full path to {size, mtimeMs, enc: ['br', 'gzip']}, only for copies that are on disk and current
		ready = new Map(),
		running = null,

		//always / in the manifest, so it means the same thing whichever OS wrote it
		rel = (plain) => path.relative(distDir, plain).split(path.sep).join('/'),

		saveManifest = () => {
			let out = {}
			for (let [plain, e] of ready) out[rel(plain)] = e
			fs.mkdirSync(cacheDir, {recursive: true})
			fs.writeFileSync(`${manifestFile}.tmp`, JSON.stringify(out))
			fs.renameSync(`${manifestFile}.tmp`, manifestFile)
		},

		load = () => {
			try {
				for (let [r, e] of Object.entries(JSON.parse(fs.readFileSync(manifestFile, 'utf8')))) {
					if (e.enc.every((k) => fs.existsSync(path.join(cacheDir, r + ext[k])))) {
						ready.set(path.join(distDir, r), e)
					}
				}
			}
			catch (err) {
				//No manifest yet, or one that can't be read: everything gets made again
			}
		},

		textFiles = () => {
			try {
				return fs.readdirSync(distDir, {recursive: true, withFileTypes: true})
					.filter((e) => e.isFile() && compressible.test(e.name))
					.map((e) => path.join(e.parentPath, e.name))
			}
			catch (err) {
				return []
			}
		},

		//Makes whichever copies are missing or out of date, biggest first (the main chunk is the one that matters), then
		//clears what nothing needs any more. Safe to call twice: the second call waits for the first
		build = () => running ||= (async () => {
			let started = Date.now(),
				out = {made: 0, reused: 0, removed: 0, br: 0, gz: 0, raw: 0, ms: 0},
				files = []

			for (let plain of textFiles()) {
				try {
					let stat = fs.statSync(plain)
					if (stat.size >= minSize) files.push({plain, stat})
				}
				catch (err) {
				}
			}

			files.sort((a, b) => b.stat.size - a.stat.size)

			for (let {plain, stat} of files) {
				let have = ready.get(plain)

				if (have && have.size === stat.size && have.mtimeMs === stat.mtimeMs) {
					out.reused++
					continue
				}

				ready.delete(plain)

				//A file can go between listing and reading (a build still writing, or a deploy landing), so skip it
				//and carry on with the rest instead of the whole run giving up
				let buf
				try {
					buf = await fs.promises.readFile(plain)
				}
				catch (err) {
					if (err.code === 'ENOENT') continue
					throw err
				}
				let made = [],
					target = path.join(cacheDir, rel(plain))

				fs.mkdirSync(path.dirname(target), {recursive: true})

				//The two one after the other, so only one pool thread is ever busy
				for (let [enc, make] of [
					['br', () => brotli(buf, {params: {
						[zlib.constants.BROTLI_PARAM_QUALITY]: quality,
						[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
						[zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
						[zlib.constants.BROTLI_PARAM_LGWIN]: 24
					}})],
					['gzip', () => gzip(buf, {level: 9})]
				]) {
					let z = await make()

					if (z.length < buf.length) {
						fs.writeFileSync(`${target}${ext[enc]}.tmp`, z)
						fs.renameSync(`${target}${ext[enc]}.tmp`, target + ext[enc])

						//Same mtime as the file, so the etag stays put when only the copy is made again
						fs.utimesSync(target + ext[enc], stat.atime, stat.mtime)
						made.push(enc)
						out[enc === 'br' ? 'br' : 'gz'] += z.length
					}
					else {
						fs.rmSync(target + ext[enc], {force: true})
					}
				}

				//Re-stat: if the file moved on while it was being compressed, this entry is simply never a match
				ready.set(plain, {size: stat.size, mtimeMs: stat.mtimeMs, enc: made})
				out.made++
				out.raw += buf.length

				saveManifest()

				//Let a request in between files
				await new Promise((r) => setImmediate(r))
			}

			//Entries for files that are gone, and copies in the cache nothing points at
			let live = new Set(files.map((f) => f.plain))

			for (let plain of [...ready.keys()]) {
				if (!live.has(plain)) {
					ready.delete(plain)
				}
			}

			let wanted = new Set()

			for (let [plain, e] of ready) {
				for (let k of e.enc) wanted.add(path.join(cacheDir, rel(plain) + ext[k]))
			}

			try {
				for (let e of fs.readdirSync(cacheDir, {recursive: true, withFileTypes: true})) {
					let p = path.join(e.parentPath, e.name)

					if (e.isFile() && /\.(br|gz|tmp)$/.test(e.name) && !wanted.has(p)) {
						fs.rmSync(p, {force: true})
						out.removed++
					}
				}
			}
			catch (err) {
			}

			saveManifest()
			out.ms = Date.now() - started
			return out
		})().finally(() => {
			running = null
		}),

		//Middleware for express.static's twin: same mount, same options. Passes anything it can't answer on
		serve = (root, serveOptions = {}) => {
			root = path.resolve(root)

			let {setHeaders, ...sendOptions} = serveOptions

			return (req, res, next) => {
				if ((req.method !== 'GET' && req.method !== 'HEAD') || !compressible.test(req.path)) {
					return next()
				}

				//Plain or compressed, a cache has to know the answer depends on this
				res.vary('Accept-Encoding')

				let enc = pick(req.headers['accept-encoding'])

				//A range of the compressed bytes is no use to anyone
				if (!enc || req.headers.range || !ready.size) {
					return next()
				}

				let r
				try {
					r = decodeURIComponent(req.path).replace(/^\/+/, '')
				}
				catch (err) {
					return next()
				}

				let plain = path.resolve(root, r)

				//Climbing out of root, a dotfile, or a null byte is express.static's to refuse
				if (r.includes('\0') || !plain.startsWith(root + path.sep) || r.split('/').some((p) => p.startsWith('.'))) {
					return next()
				}

				let e = ready.get(plain)

				if (!e || !e.enc.includes(enc)) {
					return next()
				}

				let stat
				try {
					stat = fs.statSync(plain)
				}
				catch (err) {
					return next()
				}

				//The file has changed since its copy was made
				if (stat.size !== e.size || stat.mtimeMs !== e.mtimeMs) {
					return next()
				}

				res.type(path.extname(plain))
				res.setHeader('Content-Encoding', enc)

				if (setHeaders) {
					setHeaders(res, plain, stat)
				}

				res.sendFile(rel(plain) + ext[enc], {root: cacheDir, dotfiles: 'allow', ...sendOptions}, (err) => {
					if (!err || res.headersSent) {
						return
					}

					//Copy gone from under us: the plain file is still the right answer
					res.removeHeader('Content-Encoding')
					res.removeHeader('Content-Type')
					res.removeHeader('Cache-Control')
					next()
				})
			}
		}

	load()

	return {serve, build, ready: () => ready.size}
}

module.exports.pick = pick
