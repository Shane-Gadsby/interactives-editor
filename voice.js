//A synthesised voice for the Spelling test, made while someone is authoring and saved as plain audio. The editor sends the word
//here, gets a wav back and stores it as an ordinary sound asset, so the page a learner is served only has audio in it and never
//the word. Nothing here is ever reachable from a learner's link: it is under /api, staff only.
//
//The engine is sherpa-onnx (Apache-2.0, an optional npm dependency, so `npm install` on test and prod fetches the native build for
//the box) running Kokoro, an Apache-2.0 speech model with a good set of British voices. The model is 130 MB and does not live in git:
//the first time someone asks for it, it is downloaded once into storage/_voice (checked against a pinned hash), or it is already
//sitting in INTERACTIVES_VOICE_DIR for a box that cannot reach github. INTERACTIVES_VOICE_URL points the download at a mirror.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {spawn} = require('child_process')

const MODEL = {
	id: 'kokoro-int8-multi-lang-v1_0',
	url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2',
	sha256: '72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653',
	bytes: 132353410,
	//Only what the English voices need, so the 180 MB archive's Chinese and espeak data never lands on disk
	files: ['model.int8.onnx', 'voices.bin', 'tokens.txt', 'lexicon-gb-en.txt', 'LICENSE'],
	licence: 'Apache-2.0',
	name: 'Kokoro v1.0 (sherpa-onnx build)',
}

//The speaker ids are the order of the model's own voice table (kokoro-int8-multi-lang-v1_0). British only: the lexicon we load is the British
//one, and there is no Australian voice in any open model of this kind
const VOICES = [
	{id: 'bf_emma', sid: 21, name: 'Emma', gender: 'Woman', accent: 'British'},
	{id: 'bf_isabella', sid: 22, name: 'Isabella', gender: 'Woman', accent: 'British'},
	{id: 'bf_alice', sid: 20, name: 'Alice', gender: 'Woman', accent: 'British'},
	{id: 'bf_lily', sid: 23, name: 'Lily', gender: 'Woman', accent: 'British'},
	{id: 'bm_george', sid: 26, name: 'George', gender: 'Man', accent: 'British'},
	{id: 'bm_lewis', sid: 27, name: 'Lewis', gender: 'Man', accent: 'British'},
	{id: 'bm_daniel', sid: 24, name: 'Daniel', gender: 'Man', accent: 'British'},
	{id: 'bm_fable', sid: 25, name: 'Fable', gender: 'Man', accent: 'British'},
]
const DEFAULT_VOICE = 'bf_emma'
const SAMPLE_RATE_GUESS = 24000
const MAX_PARTS = 4
const MAX_PART_CHARS = 300
const IDLE_MS = 10 * 60 * 1000

//--- Plain helpers (the tests run these as they are)

//The words a text is made of, the way the voice's lexicon spells them
const wordsOf = (text) => String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []

//Words the voice has no pronunciation for. A hyphenated word is fine when each piece is known, and a curly apostrophe is a plain one
const unknownWords = (text, known) => {
	let out = []

	for (let w of wordsOf(text)) {
		let plain = w.replace(/’/g, "'")

		if (known.has(plain) || known.has(plain.replace(/-/g, ''))) {
			continue
		}

		if (plain.includes('-') && plain.split('-').every((p) => known.has(p))) {
			continue
		}

		out.push(w)
	}

	return out
}

//What is wanted, off the wire: parts to say, a voice, a speed, a pause between the parts. Null when it is not a request
const cleanRequest = (body) => {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return null
	}

	let parts = Array.isArray(body.parts) ? body.parts : typeof body.text === 'string' ? [body.text] : null

	if (!parts || !parts.length || parts.length > MAX_PARTS) {
		return null
	}

	parts = parts.map((p) => (typeof p === 'string' ? p.trim() : null))

	if (parts.some((p) => !p || p.length > MAX_PART_CHARS)) {
		return null
	}

	let voice = VOICES.find((v) => v.id === (body.voice || DEFAULT_VOICE))

	if (!voice) {
		return null
	}

	let speed = body.speed === undefined ? 0.9 : Number(body.speed),
		pause = body.pause === undefined ? 0.9 : Number(body.pause)

	if (!Number.isFinite(speed) || !Number.isFinite(pause)) {
		return null
	}

	return {parts, voice, speed: Math.min(1.5, Math.max(0.5, speed)), pause: Math.min(3, Math.max(0.2, pause))}
}

//Cut the silence off both ends of some samples, leaving a short lead and tail so the word does not start or stop on a click
const trimSilence = (samples, rate, lead = 0.08, tail = 0.16, threshold = 0.012) => {
	let first = 0,
		last = samples.length - 1

	while (first < samples.length && Math.abs(samples[first]) < threshold) {
		first++
	}

	while (last > first && Math.abs(samples[last]) < threshold) {
		last--
	}

	if (first >= samples.length) {
		return new Float32Array(0)
	}

	let from = Math.max(0, first - Math.round(lead * rate)),
		to = Math.min(samples.length, last + 1 + Math.round(tail * rate))

	return samples.slice(from, to)
}

//The parts one after another with a pause of silence between, then evened out to a comfortable level and faded at the ends
const joinParts = (parts, rate, pause) => {
	let gap = Math.round(pause * rate),
		length = parts.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, parts.length - 1),
		out = new Float32Array(length),
		at = 0

	parts.forEach((p, i) => {
		out.set(p, at)
		at += p.length + (i < parts.length - 1 ? gap : 0)
	})

	let peak = 0

	for (let i = 0; i < out.length; i++) {
		peak = Math.max(peak, Math.abs(out[i]))
	}

	//Louder to about -2 dBFS, but never lifting a near-silent result into noise
	let gain = peak > 0.02 ? Math.min(4, 0.8 / peak) : 1,
		fade = Math.min(Math.round(0.01 * rate), Math.floor(out.length / 2))

	for (let i = 0; i < out.length; i++) {
		let g = gain

		if (i < fade) {
			g *= i / fade
		} else if (out.length - 1 - i < fade) {
			g *= (out.length - 1 - i) / fade
		}

		out[i] *= g
	}

	return out
}

//A 16-bit mono wav with only the fmt and data chunks: no title, no comment, nothing that could name the word
const encodeWav = (samples, rate) => {
	let bytes = Buffer.alloc(44 + samples.length * 2)

	bytes.write('RIFF', 0)
	bytes.writeUInt32LE(36 + samples.length * 2, 4)
	bytes.write('WAVEfmt ', 8)
	bytes.writeUInt32LE(16, 16)
	bytes.writeUInt16LE(1, 20)
	bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(rate, 24)
	bytes.writeUInt32LE(rate * 2, 28)
	bytes.writeUInt16LE(2, 32)
	bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36)
	bytes.writeUInt32LE(samples.length * 2, 40)

	for (let i = 0; i < samples.length; i++) {
		bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2)
	}

	return bytes
}

//--- The service

//opts.load is for the tests (a stand-in for the speech engine), opts.fetch for the download, opts.sha256 for the file it should be, opts.dir for where the model is
module.exports = (opts) => {
	let {express, storageDir} = opts,
		load = opts.load || (() => require('sherpa-onnx-node')),
		getFetch = opts.fetch || ((...a) => fetch(...a)),
		//A box that sets INTERACTIVES_VOICE_DIR has the model put there by hand and never downloads one
		pinned = !opts.dir && !!process.env.INTERACTIVES_VOICE_DIR,
		baseDir = opts.dir || process.env.INTERACTIVES_VOICE_DIR || path.join(storageDir, '_voice', MODEL.id),
		url = process.env.INTERACTIVES_VOICE_URL || MODEL.url,
		engineError = null,
		sherpa = null,
		install = {state: 'idle', done: 0, total: MODEL.bytes, error: null, promise: null},
		tts = null,
		known = null,
		idle = null,
		queue = Promise.resolve(),
		waiting = 0

	let ready = () => MODEL.files.filter((f) => f !== 'LICENSE').every((f) => fs.existsSync(path.join(baseDir, f)))

	//Is the engine there for this box (the optional dependency, which has a native part). Cached, with the reason when it is not
	let engine = () => {
		if (sherpa) {
			return sherpa
		}

		if (engineError) {
			return null
		}

		try {
			sherpa = load()
		} catch (e) {
			engineError = `The speech engine (sherpa-onnx-node) is not installed on this server, or has no build for it (${String(e?.message || e).split('\n')[0].slice(0, 120)}). Run npm install in the editor's folder.`
		}

		return sherpa
	}

	let status = () => {
		let out = {
			voices: VOICES.map(({id, name, gender, accent}) => ({id, name, gender, accent})),
			defaultVoice: DEFAULT_VOICE,
			model: {name: MODEL.name, licence: MODEL.licence, megabytes: Math.round(MODEL.bytes / 1048576)},
		}

		if (!engine()) {
			return {...out, state: 'unsupported', error: engineError}
		}

		if (ready()) {
			return {...out, state: 'ready'}
		}

		if (install.state === 'installing') {
			return {...out, state: 'installing', done: install.done, total: install.total}
		}

		return {...out, state: install.state === 'failed' ? 'failed' : 'missing', ...(install.error ? {error: install.error} : {})}
	}

	let runTar = (archive, into) =>
		new Promise((resolve, reject) => {
			let top = MODEL.id,
				p = spawn('tar', ['-xjf', archive, '-C', into, '--strip-components=1', ...MODEL.files.map((f) => `${top}/${f}`)], {stdio: ['ignore', 'ignore', 'pipe']}),
				err = ''

			p.stderr.on('data', (d) => (err += d))
			p.on('error', (e) => reject(new Error(`Could not run tar to unpack the voice (${e.message}). tar and bzip2 have to be installed on the server.`)))
			p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Unpacking the voice failed: ${err.trim().split('\n').pop() || `tar exited ${code}`}. bzip2 has to be installed on the server.`))))
		})

	//Download the model once, check it, unpack the part we use beside the final folder and move it into place
	let download = async () => {
		let parent = path.dirname(baseDir),
			stamp = `${process.pid}-${Date.now()}`,
			archive = path.join(parent, `.download-${stamp}.tar.bz2`),
			staging = path.join(parent, `.unpack-${stamp}`)

		await fs.promises.mkdir(parent, {recursive: true})

		try {
			let res = await getFetch(url, {redirect: 'follow'})

			if (!res.ok || !res.body) {
				throw new Error(`The voice download failed: ${res.status} from ${new URL(url).host}. Put the model in ${baseDir} by hand, or point INTERACTIVES_VOICE_URL at a copy.`)
			}

			let total = Number(res.headers.get('content-length')) || MODEL.bytes,
				hash = crypto.createHash('sha256'),
				out = fs.createWriteStream(archive)

			install.total = total
			install.done = 0

			for await (let chunk of res.body) {
				hash.update(chunk)
				install.done += chunk.length

				if (!out.write(chunk)) {
					await new Promise((r) => out.once('drain', r))
				}
			}

			await new Promise((resolve, reject) => {
				out.once('error', reject)
				out.end(resolve)
			})

			if (hash.digest('hex') !== (opts.sha256 || MODEL.sha256)) {
				throw new Error('The voice download did not match the file it should be, so it was thrown away.')
			}

			await fs.promises.mkdir(staging, {recursive: true})
			await runTar(archive, staging)

			for (let f of MODEL.files) {
				if (!fs.existsSync(path.join(staging, f))) {
					throw new Error(`The voice archive had no ${f}.`)
				}
			}

			await fs.promises.rm(baseDir, {recursive: true, force: true})
			await fs.promises.rename(staging, baseDir)
		} finally {
			await fs.promises.rm(archive, {force: true})
			await fs.promises.rm(staging, {recursive: true, force: true})
		}
	}

	//Start the download (once; asking again while it runs, or when it is done, changes nothing)
	let startInstall = () => {
		if (!engine() || ready() || install.state === 'installing') {
			return status()
		}

		if (pinned) {
			install = {...install, state: 'failed', error: `The voice model is not in ${baseDir}. It has to be put there by hand (the files are listed in the README), because this box does not download it.`}

			return status()
		}

		install = {state: 'installing', done: 0, total: MODEL.bytes, error: null, promise: null}
		install.promise = download().then(
			() => {
				install.state = 'idle'
			},
			(e) => {
				console.warn(`interactives: voice download failed: ${e.message}`)
				install.state = 'failed'
				install.error = String(e.message).slice(0, 300)
			}
		)

		return status()
	}

	//The words the voice can say, read once from its own lexicon
	let knownWords = async () => {
		if (!known) {
			let text = await fs.promises.readFile(path.join(baseDir, 'lexicon-gb-en.txt'), 'utf8'),
				set = new Set()

			for (let line of text.split('\n')) {
				let at = line.indexOf(' ')

				if (at > 0) {
					set.add(line.slice(0, at))
				}
			}

			known = set
		}

		return known
	}

	//The model is loaded when it is wanted and let go of after a while, so the box does not hold 300 MB for a feature used in bursts
	let voice = async () => {
		clearTimeout(idle)
		idle = setTimeout(() => {
			tts = null
			known = null
		}, IDLE_MS)
		idle.unref?.()

		if (!tts) {
			tts = await sherpa.OfflineTts.createAsync({
				model: {
					kokoro: {
						model: path.join(baseDir, 'model.int8.onnx'),
						voices: path.join(baseDir, 'voices.bin'),
						tokens: path.join(baseDir, 'tokens.txt'),
						lexicon: path.join(baseDir, 'lexicon-gb-en.txt'),
						lengthScale: 1,
					},
				},
				numThreads: 2,
				maxNumSentences: 1,
			})
		}

		return tts
	}

	let speak = (req) =>
		new Promise((resolve, reject) => {
			if (waiting >= 8) {
				return reject(Object.assign(new Error('The voice is busy, try again in a moment.'), {status: 429, code: 'busy'}))
			}

			waiting++
			queue = queue
				.then(async () => {
					let words = await knownWords()

					for (let part of req.parts) {
						let odd = unknownWords(part, words)

						if (odd.length) {
							throw Object.assign(new Error(`The voice does not know how to say "${odd[0]}". Type it as it sounds in Say it like (for example "cull er" for colour), using ordinary English words.`), {status: 422, code: 'unknown-word', word: odd[0]})
						}
					}

					let engineTts = await voice(),
						rate = engineTts.sampleRate || SAMPLE_RATE_GUESS,
						pieces = []

					for (let text of req.parts) {
						//The engine only knows the plain apostrophe
						let made = await engineTts.generateAsync({text: text.replace(/[\u2018\u2019]/g, "'"), sid: req.voice.sid, speed: req.speed})

						pieces.push(trimSilence(Float32Array.from(made.samples), made.sampleRate || rate, 0.08, 0.16))
					}

					let all = joinParts(pieces, rate, req.pause)

					if (!all.length) {
						throw Object.assign(new Error('The voice made no sound for that.'), {status: 422, code: 'silent'})
					}

					return encodeWav(all, rate)
				})
				.then(resolve, reject)
				.finally(() => waiting--)
		})

	let router = new express.Router()

	router.use(express.json({limit: '16kb'}))

	router.get('/', (req, res) => res.json(status()))
	router.post('/install', (req, res) => res.json(startInstall()))
	router.post('/speak', async (req, res) => {
		let want = cleanRequest(req.body)

		if (!want) {
			return res.status(400).json({error: 'That is not something the voice can say.', code: 'bad-request'})
		}

		let now = status()

		if (now.state !== 'ready') {
			return res.status(503).json({error: now.state === 'unsupported' ? now.error : 'The voice is not set up on this server yet.', code: now.state, state: now.state})
		}

		try {
			let wav = await speak(want)

			res.set({'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store'})
			res.send(wav)
		} catch (e) {
			if (!e.status) {
				console.trace('interactives: voice', e)
			}

			res.status(e.status || 500).json({error: e.status ? e.message : 'The voice failed to make that. Try again.', code: e.code || 'failed', ...(e.word ? {word: e.word} : {})})
		}
	})

	return {router, status, startInstall, speak, installing: () => install.promise}
}

Object.assign(module.exports, {MODEL, VOICES, cleanRequest, unknownWords, wordsOf, trimSilence, joinParts, encodeWav})
