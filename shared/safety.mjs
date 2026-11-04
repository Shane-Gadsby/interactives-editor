//The pure part of the server's protections, shared with the tests (index.js loads it with import(), like ops.mjs).
//No mongo, no fs, no express: ids, and the headers that stop uploaded files and shared pages doing anything but
//being what they are.

import {randomBytes} from 'node:crypto'

//Names storage/ already uses for its own folders. A project id is a folder name too (storage/<id>), so these would
//land on the share pages, the thumbnails or the published libraries. Lower case, because a laptop's disk isn't case sensitive
export const RESERVED_IDS = new Set(['shares', 'thumbs', '_libraries', '_templates'])

//Ids come from the editor (uid() in the player's format.ts), nothing else should ever get near a query or a path.
//Nothing starting with _ either: that's the namespace for the server's own folders
export const validID = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(id) && id[0] !== '_' && !RESERVED_IDS.has(id.toLowerCase())

//A new project id made here, so a client can't pick one that is somebody else's
export const newProjectID = () => `pr${randomBytes(9).toString('hex')}`

//Same for a template, and for the id of a checklist item someone adds
export const newTemplateID = () => `tp${randomBytes(9).toString('hex')}`
export const newItemID = () => `ck${randomBytes(6).toString('hex')}`

//Shared pages are whole interactives with their own scripts, served from the same origin as the editor. A sandbox
//without allow-same-origin makes them a stranger to it: they run, open links and post forms, but they can't read the
//editor's cookies or call its api. allow-popups-to-escape-sandbox lets a link they open in a new tab load as a normal page
export const SHARE_CSP = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

//What a browser can do with these without ever treating them as a page: pictures (not svg, which is a document),
//video, audio, fonts, and the data files the player fetches
const SAFE_MIME = [
	/^image\/(?!svg|x-svg)[a-z0-9.+-]+$/,
	/^video\/[a-z0-9.+-]+$/,
	/^audio\/[a-z0-9.+-]+$/,
	/^font\/[a-z0-9.+-]+$/,
	/^application\/(x-)?font-[a-z0-9.+-]+$/,
	/^application\/vnd\.ms-fontobject$/,
	/^application\/json$/,
	/^text\/(csv|plain|tab-separated-values)$/
]

const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"

//The mime type as written, minus anything that could end the header line. Falls back to octet-stream
const cleanMime = (mime) => {
	let text = String(mime || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100)

	return /^[\w.+-]+\/[\w.+-]+(\s*;.*)?$/.test(text) ? text : 'application/octet-stream'
}

//Sets the content headers for an uploaded asset (project or library) on an express res (or anything with setHeader).
//Types that can't be a page go out as they were uploaded, svg goes out as a picture that can't run scripts, and
//everything else (html, xml, pdf, unknown) is a download. Fetching, <img>, <video> and font loading ignore
//Content-Disposition, so the player and the editor are unaffected
export const assetHeaders = (res, mime) => {
	let full = cleanMime(mime),
		base = full.split(';')[0].trim().toLowerCase()

	res.setHeader('X-Content-Type-Options', 'nosniff')

	if (/^image\/(x-)?svg/.test(base)) {
		res.setHeader('Content-Type', 'image/svg+xml')
		res.setHeader('Content-Security-Policy', SVG_CSP)
	}
	else if (SAFE_MIME.some((re) => re.test(base))) {
		res.setHeader('Content-Type', full)
	}
	else {
		res.setHeader('Content-Type', 'application/octet-stream')
		res.setHeader('Content-Disposition', 'attachment')
	}
}

export const shareHeaders = (res) => {
	res.setHeader('Content-Security-Policy', SHARE_CSP)
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('Referrer-Policy', 'no-referrer')
}
