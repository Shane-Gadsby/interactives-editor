//A caching proxy for Google Fonts, so a learner's browser (and the editor's) never has to talk to Google. The page asks us for the
//same css2 url Google would have answered, we fetch it from Google once, rewrite every font file in it to point back here, keep
//both on disk (storage/_fonts, not git) and answer from disk from then on. The font files are fetched the same way, one at a
//time, when a browser first asks for them (a family's css names a file per script, and nobody needs the Cyrillic one for English).
//
//It is not an open proxy: only family names the Google catalog (src/data/google-fonts.json) knows, weights as numbers, only the
//font files that appeared in a css we fetched ourselves (and only from fonts.gstatic.com), a size cap on every download, a cap on
//how much we keep and a limit on how often one address can make us call Google. A failure here is soft by design: the css keeps
//Google's own url as a second source for every file, and the player and editor fall back to Google's css when this route answers
//with anything but a stylesheet, so text always renders.
//
//INTERACTIVES_FONTS_PROXY=off turns the routes off (they answer 404 and everything falls back to Google). INTERACTIVES_FONTS_DIR
//moves the cache (default <storage>/_fonts).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const MAX_CSS = 400 * 1024
const MAX_FILE = 2 * 1024 * 1024
const MAX_CSS_FILES = 4000
const MAX_FONT_FILES = 8000
const TIMEOUT = 10000
//Cache misses only (a hit costs us nothing): per address and for everyone together, per minute
const PER_IP = 150
const IN_TOTAL = 400
//Open Sans is the brand font of every branded starter, so it is fetched at startup rather than on first use
const PREWARM = [{family: 'Open Sans', weights: [400, 600, 700]}]

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex')
const WEIGHT_RE = /^[1-9]00$/

//family=Open+Sans:wght@400;700 (express has already turned the + into a space) -> {family, weights}, or null for anything else
const parseFamily = (raw) => {
	if (typeof raw !== 'string' || raw.length > 120) {
		return null
	}

	let [name, rest, ...extra] = raw.split(':'),
		weights = []

	if (extra.length || !/^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(name)) {
		return null
	}

	if (rest !== undefined) {
		let m = /^wght@(\d{3}(?:;\d{3}){0,8})$/.exec(rest)

		if (!m) {
			return null
		}

		weights = [...new Set(m[1].split(';').filter((w) => WEIGHT_RE.test(w)).map(Number))].sort((a, b) => a - b)

		if (!weights.length) {
			return null
		}
	}

	return {family: name.trim().replace(/ +/g, ' '), weights}
}

module.exports = ({express, storageDir, catalogFile = path.join(__dirname, 'src', 'data', 'google-fonts.json')}) => {
	let router = express.Router(),
		off = /^(off|0|false|no)$/i.test(process.env.INTERACTIVES_FONTS_PROXY || ''),
		dir = path.resolve(process.env.INTERACTIVES_FONTS_DIR || path.join(storageDir, '_fonts')),
		cssDir = path.join(dir, 'css'),
		fileDir = path.join(dir, 'files'),
		counts = {css: 0, files: 0},
		//Google's own answer to "is that a family", loaded the first time it is needed. Without the file (a box that has no src/) any well-formed name goes through to Google
		catalog = undefined,
		known = (family) => {
			if (catalog === undefined) {
				try {
					catalog = new Set(JSON.parse(fs.readFileSync(catalogFile, 'utf8')).fonts.map((f) => f[0].toLowerCase()))
				}
				catch (e) {
					catalog = null
				}
			}

			return !catalog || catalog.has(family.toLowerCase())
		},
		//One entry per address, a window of the last minute's cache misses
		windows = new Map(),
		recent = [],
		allowed = (ip) => {
			let now = Date.now(),
				mine = (windows.get(ip) || []).filter((t) => now - t < 60000)

			recent = recent.filter((t) => now - t < 60000)

			if (mine.length >= PER_IP || recent.length >= IN_TOTAL) {
				windows.set(ip, mine)
				return false
			}

			mine.push(now)
			recent.push(now)
			windows.set(ip, mine)

			if (windows.size > 5000) {
				for (let [k, v] of windows) {
					if (!v.some((t) => now - t < 60000)) {
						windows.delete(k)
					}
				}
			}

			return true
		},
		inFlight = new Map(),
		//Two requests for the same thing share one trip to Google
		once = (key, make) => {
			if (!inFlight.has(key)) {
				inFlight.set(key, make().finally(() => inFlight.delete(key)))
			}

			return inFlight.get(key)
		},
		//A failure is remembered for a few minutes, so a family Google refuses is not asked about again for every page view
		failed = new Map(),
		fetchCapped = async (url, cap, asText) => {
			let res = await fetch(url, {headers: {'User-Agent': UA, Accept: asText ? 'text/css,*/*;q=0.1' : '*/*'}, signal: AbortSignal.timeout(TIMEOUT)})

			if (!res.ok) {
				throw new Error(`Google answered ${res.status}`)
			}

			if (Number(res.headers.get('content-length')) > cap) {
				throw new Error('too big')
			}

			let buf = Buffer.from(await res.arrayBuffer())

			if (buf.length > cap) {
				throw new Error('too big')
			}

			return buf
		},
		write = async (file, data) => {
			let tmp = `${file}.${process.pid}.${Date.now()}.tmp`

			await fs.promises.writeFile(tmp, data)
			await fs.promises.rename(tmp, file)
		},
		//The css for a family the way a modern browser gets it from Google, with every file pointing back at /fonts/file/<hash>.woff2
		//(relative to the css, so it works under whatever prefix the route is mounted at) and Google's own url kept as the next source
		buildCss = async (want) => {
			let upstream = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(want.family).replace(/%20/g, '+')}${want.weights.length ? `:wght@${want.weights.join(';')}` : ''}${want.text ? `&text=${encodeURIComponent(want.text)}` : ''}&display=swap`,
				css = (await fetchCapped(upstream, MAX_CSS, true)).toString('utf8'),
				map = {}

			css = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)(\s*format\((['"])woff2\3\))?/g, (all, url, fmt) => {
				let name = sha(url)

				map[name] = url

				return `url(file/${name}.woff2) format('woff2'), url(${url}) format('woff2')`
			})

			if (!Object.keys(map).length) {
				throw new Error('no font files in the css')
			}

			return {css, map}
		},
		serveCss = async (req, res) => {
			let want = parseFamily(req.query.family)

			if (!want || (req.query.text !== undefined && req.query.text !== want.family) || (req.query.text !== undefined && want.weights.length)) {
				return res.status(400).end()
			}

			if (!known(want.family)) {
				return res.status(404).end()
			}

			if (req.query.text !== undefined) {
				want.text = want.family
			}

			let key = sha(`${want.family}|${want.weights.join(',')}|${want.text || ''}`),
				file = path.join(cssDir, `${key}.css`),
				css

			try {
				css = await fs.promises.readFile(file, 'utf8')
			}
			catch (e) {
				if (failed.get(key) > Date.now()) {
					return res.status(502).end()
				}

				if (counts.css >= MAX_CSS_FILES) {
					return res.status(503).end()
				}

				if (!allowed(req.ip)) {
					return res.status(429).end()
				}

				try {
					css = await once(key, async () => {
						let built = await buildCss(want)

						await Promise.all(Object.entries(built.map).map(([name, url]) => write(path.join(fileDir, `${name}.url`), url)))
						await write(file, built.css)
						counts.css++

						return built.css
					})
				}
				catch (err) {
					console.warn(`fonts-proxy: ${want.family} from Google failed (${err.message})`)
					failed.set(key, Date.now() + 5 * 60000)

					return res.status(502).end()
				}
			}

			//Not stamped, and Google can change a family, so this is the media tier (an hour, then a cheap revalidation); the files it names never change
			res.set({'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff'})
			res.send(css)
		},
		serveFile = async (req, res) => {
			let name = req.params.name,
				m = /^([0-9a-f]{40})\.woff2$/.exec(name)

			if (!m) {
				return res.status(404).end()
			}

			let file = path.join(fileDir, name)

			if (!fs.existsSync(file)) {
				//Only a url we wrote down ourselves, out of a css we fetched
				let url

				try {
					url = fs.readFileSync(path.join(fileDir, `${m[1]}.url`), 'utf8').trim()
				}
				catch (e) {
					return res.status(404).end()
				}

				if (!/^https:\/\/fonts\.gstatic\.com\/[^\s'"]+$/.test(url) || sha(url) !== m[1]) {
					return res.status(404).end()
				}

				if (failed.get(m[1]) > Date.now()) {
					return res.status(502).end()
				}

				if (counts.files >= MAX_FONT_FILES) {
					return res.status(503).end()
				}

				if (!allowed(req.ip)) {
					return res.status(429).end()
				}

				try {
					await once(m[1], async () => {
						let buf = await fetchCapped(url, MAX_FILE, false)

						//wOF2, or the browser would be handed something that is not a font
						if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
							throw new Error('not a woff2 file')
						}

						await write(file, buf)
						counts.files++
					})
				}
				catch (err) {
					console.warn(`fonts-proxy: a font file from Google failed (${err.message})`)
					failed.set(m[1], Date.now() + 5 * 60000)

					return res.status(502).end()
				}
			}

			//The name is a hash of the url Google versioned it under, so it can never change
			res.set({'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff'})
			res.sendFile(file, {headers: {}, cacheControl: false})
		}

	if (!off) {
		for (let d of [cssDir, fileDir]) {
			fs.mkdirSync(d, {recursive: true})
		}

		try {
			counts.css = fs.readdirSync(cssDir).length
			counts.files = fs.readdirSync(fileDir).filter((f) => f.endsWith('.woff2')).length
		}
		catch (e) {
			//a count that starts at nothing only means the cap is looser
		}
	}

	//Pages on another origin (the share page, a preview in a blob) load the stylesheet and the files from here
	router.use((req, res, next) => {
		if (off) {
			return res.status(404).end()
		}

		res.set('Access-Control-Allow-Origin', '*')
		next()
	})
	router.get('/css2', serveCss)
	router.get('/file/:name', serveFile)

	//Open Sans, css and every file, once the server has been up a few seconds (soft: if Google is not reachable it is fetched on first use instead)
	let prewarm = async () => {
		for (let p of PREWARM) {
			try {
				let want = {family: p.family, weights: p.weights},
					key = sha(`${want.family}|${want.weights.join(',')}|`),
					file = path.join(cssDir, `${key}.css`)

				if (fs.existsSync(file)) {
					continue
				}

				let built = await buildCss(want)

				for (let [name, url] of Object.entries(built.map)) {
					await write(path.join(fileDir, `${name}.url`), url)

					if (!fs.existsSync(path.join(fileDir, `${name}.woff2`))) {
						try {
							await write(path.join(fileDir, `${name}.woff2`), await fetchCapped(url, MAX_FILE, false))
							counts.files++
						}
						catch (e) {
							//left for first use
						}
					}
				}

				await write(file, built.css)
				counts.css++
			}
			catch (e) {
				console.warn(`fonts-proxy: could not pre-warm ${p.family} (${e.message})`)
			}
		}
	}

	return {router, prewarm: () => (off ? null : setTimeout(() => void prewarm(), 5000).unref()), dir, off}
}

module.exports.parseFamily = parseFamily
