//Audio in a project that has spelling questions marked on the server. The page is served to every learner, so what is in the audio
//files and what they are called is as readable as the page. A spoken word has to stay a spoken word: the asset's file name
//(colour.mp3) is replaced by a plain one, and the tags inside an mp3 or wav (title, comment) are cut out. Other kinds of audio keep
//whatever tags they have, and the author is told so. Plain CommonJS for the server (it uses Buffer) so index.js can require it where the share page is prepared, and the tests run it as it is.

const extOf = (mime) => ({'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac'}[mime] || 'audio')

//An mp3 without its ID3v2 tag in front and its ID3v1 tag at the back
const cleanMp3 = (bytes) => {
	let start = 0,
		end = bytes.length

	if (end > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
		let size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)

		start = 10 + size + (bytes[5] & 0x10 ? 10 : 0)
	}

	if (end - start > 128 && bytes[end - 128] === 0x54 && bytes[end - 127] === 0x41 && bytes[end - 126] === 0x47) {
		end -= 128
	}

	return start >= end ? null : bytes.slice(start, end)
}

//A wav with only the chunks that play it (fmt, fact and data), so a LIST/INFO chunk with a title never reaches the page
const cleanWav = (bytes) => {
	let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
		tag = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])

	if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
		return null
	}

	let kept = [],
		at = 12

	while (at + 8 <= bytes.length) {
		let id = tag(at),
			size = view.getUint32(at + 4, true),
			total = 8 + size + (size % 2)

		if (id === 'fmt ' || id === 'fact' || id === 'data') {
			kept.push(bytes.slice(at, Math.min(bytes.length, at + total)))
		}

		at += total
	}

	if (!kept.some((c) => String.fromCharCode(c[0], c[1], c[2], c[3]) === 'data')) {
		return null
	}

	let body = kept.reduce((n, c) => n + c.length, 0),
		out = new Uint8Array(12 + body),
		put = new DataView(out.buffer),
		pos = 12

	out.set(bytes.slice(0, 4), 0)
	put.setUint32(4, 4 + body, true)
	out.set(bytes.slice(8, 12), 8)

	for (let c of kept) {
		out.set(c, pos)
		pos += c.length
	}

	return out
}

const fromDataURL = (src) => {
	let m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(src)

	if (!m || !/;base64/i.test(m[2])) {
		return null
	}

	return {mime: m[1], params: m[2], bytes: Uint8Array.from(Buffer.from(m[3], 'base64'))}
}

//Renames the project's audio assets and cleans the files it can, in place. Returns what it could not clean, for the author
const cleanAudioAssets = (project) => {
	let notes = [],
		n = 0

	for (let a of Array.isArray(project.assets) ? project.assets : []) {
		if (!a || typeof a !== 'object' || !/^audio\//i.test(a.mime || '')) {
			continue
		}

		n++
		let was = String(a.name || `audio ${n}`)

		a.name = `audio-${n}.${extOf(a.mime)}`

		let data = typeof a.src === 'string' ? fromDataURL(a.src) : null,
			kind = extOf(data?.mime || a.mime),
			cleaned = data && kind === 'mp3' ? cleanMp3(data.bytes) : data && kind === 'wav' ? cleanWav(data.bytes) : null

		if (cleaned) {
			a.src = `data:${data.mime}${data.params},${Buffer.from(cleaned).toString('base64')}`
			a.size = cleaned.length
		}
		else {
			notes.push(`"${was}" is a ${kind === 'audio' ? 'kind of audio' : `.${kind} file`} whose tags cannot be cleaned here. Its name is hidden, but check that the word is not in its title or comment tags, or use mp3 or wav`)
		}
	}

	return notes
}

module.exports = {cleanAudioAssets, cleanMp3, cleanWav}
