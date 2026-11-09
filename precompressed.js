//Serves the .br and .gz copies that scripts/precompress.mjs writes beside dist's text files at build time. Mounted
//ahead of express.static with the same options, so a browser that accepts brotli gets 1.5 MB for the main chunk
//instead of 2 MB of gzip, and nothing is compressed per request. Anything it can't answer (no copy, no
//Accept-Encoding match, a Range request, not a text file) falls through to express.static, which sends the plain file.
//
//haproxy does its own gzip on the way out, but leaves a response alone when it already has a Content-Encoding, so
//nothing is compressed twice. The cache headers still come from the same options.setHeaders as the plain file,
//called with the plain file's path so the tiers (media, stamped, no-cache) work out the same.
let fs = require('fs'),
	path = require('path'),

	//What precompress.mjs writes copies for. Keep in step with it
	compressible = /\.(js|mjs|css|html|svg|json|txt|xml|csv|wasm|map)$/i,

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
	},

	ext = {br: '.br', gzip: '.gz'},

	//A copy this much older than the plain file is left over from an earlier build. Git checkouts write files in any
	//order, so a few seconds of slack stops a fresh deploy from looking stale
	slack = 10000

module.exports = (root, options = {}) => {
	root = path.resolve(root)

	let {setHeaders, ...sendOptions} = options

	return async (req, res, next) => {
		if ((req.method !== 'GET' && req.method !== 'HEAD') || !compressible.test(req.path)) {
			return next()
		}

		//Plain or compressed, a cache has to know the answer depends on this
		res.vary('Accept-Encoding')

		let enc = pick(req.headers['accept-encoding'])

		//A range of the compressed bytes is no use to anyone
		if (!enc || req.headers.range) {
			return next()
		}

		let rel
		try {
			rel = decodeURIComponent(req.path).replace(/^\/+/, '')
		}
		catch (e) {
			return next()
		}

		let plain = path.resolve(root, rel)

		//Climbing out of root, a dotfile, or a null byte is express.static's to refuse
		if (rel.includes('\0') || !plain.startsWith(root + path.sep) || rel.split('/').some((p) => p.startsWith('.'))) {
			return next()
		}

		let stat, copy
		try {
			[stat, copy] = await Promise.all([fs.promises.stat(plain), fs.promises.stat(plain + ext[enc])])
		}
		catch (e) {
			return next()
		}

		if (!stat.isFile() || !copy.isFile() || copy.mtimeMs + slack < stat.mtimeMs) {
			return next()
		}

		res.type(path.extname(plain))
		res.setHeader('Content-Encoding', enc)

		if (setHeaders) {
			setHeaders(res, plain, stat)
		}

		res.sendFile(rel + ext[enc], {root, dotfiles: 'allow', ...sendOptions}, (err) => {
			if (!err || res.headersSent) {
				return
			}

			//Gone between the stat and the read: the plain file is still the right answer
			res.removeHeader('Content-Encoding')
			res.removeHeader('Content-Type')
			res.removeHeader('Cache-Control')
			next()
		})
	}
}

module.exports.pick = pick
