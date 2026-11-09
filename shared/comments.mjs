//The pure part of review comments (lti-interactives.comments), shared by the server, the editor and the tests: what a
//browser is allowed to say in a comment, how flat rows become threads, the filters the Comments panel uses, who a
//write should notify, and the sliding window the server rate limits comments with. No mongo, no express, no node
//imports, so the browser loads this same file.
//
//One row per message. A thread's first row is its root (_id === thread) and carries the anchor, status and
//assignee; replies are rows with the same `thread`. Comments live outside the project document on purpose: they
//never reach an export or a share link, and they don't fight the op log.

export const LIMITS = {
	text: 2000,
	name: 40,
	mentions: 10,
	perThread: 200,
	perProject: 1000,
	label: 80
}

export const STATUSES = ['open', 'resolved']

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g
const finite = (n) => typeof n === 'number' && Number.isFinite(n)
const clamp = (n) => Math.max(-1e6, Math.min(1e6, n))

//Ids are made by the server (cm + 18 hex), nothing else gets near a query
export const validCommentID = (id) => typeof id === 'string' && /^cm[a-f0-9]{18}$/.test(id)

//The words of a message. Newlines stay, other control characters go. Null for nothing, or too much
export const cleanText = (value) => {
	if (typeof value !== 'string') {
		return null
	}

	let text = value.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim()

	return text && text.length <= LIMITS.text ? text : null
}

//A guest's display name: letters, numbers and a little punctuation, 2 to 40 characters
export const cleanName = (value) => {
	if (typeof value !== 'string') {
		return null
	}

	let name = value.replace(/[^\p{L}\p{N} .'_-]+/gu, ' ').replace(/\s+/g, ' ').trim()

	return name.length >= 2 && name.length <= LIMITS.name ? name : null
}

const cleanLabel = (value) => typeof value === 'string' ? value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.label) : ''

//Where a thread is pinned: an artboard, and a point in that artboard (x, y). With a layer, also the spot inside the
//layer in its own coordinates (lx, ly), so the pin follows the layer when it moves. The point stays as the fallback
//for when the layer is gone. Null for anything else
export const cleanAnchor = (a) => {
	if (!a || typeof a !== 'object' || Array.isArray(a)) {
		return null
	}

	let artboardId = typeof a.artboardId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(a.artboardId) ? a.artboardId : null

	if (!artboardId || !finite(a.x) || !finite(a.y)) {
		return null
	}

	let out = {artboardId, layerId: null, x: clamp(a.x), y: clamp(a.y)}

	if (typeof a.layerId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(a.layerId) && finite(a.lx) && finite(a.ly)) {
		out.layerId = a.layerId
		out.lx = clamp(a.lx)
		out.ly = clamp(a.ly)
	}

	return out
}

//The names the editor wrote beside the anchor, kept so the panel can still say where a note was after the artboard
//or layer is renamed or deleted
export const cleanContext = (c) => ({artboard: cleanLabel(c?.artboard), layer: cleanLabel(c?.layer)})

const USERNAME = /^[\w.@-]{1,64}$/

export const cleanUsername = (v) => typeof v === 'string' && USERNAME.test(v) ? v : null

export const cleanMentions = (list) => {
	if (!Array.isArray(list)) {
		return []
	}

	let out = []

	for (let v of list) {
		let name = cleanUsername(v)

		if (name && !out.includes(name)) {
			out.push(name)
		}

		if (out.length >= LIMITS.mentions) {
			break
		}
	}

	return out
}

//Somebody a thread is handed to. Null clears it, undefined (nothing sent) is left to the caller
export const cleanAssignee = (v) => {
	let username = cleanUsername(v?.username)

	return username ? {username, name: cleanLabel(v.name) || username} : null
}

export const cleanStatus = (v) => STATUSES.includes(v) ? v : null

//Flat rows -> threads, oldest thread first, each with its messages oldest first. Replies whose root is missing are dropped
export const threadsOf = (rows) => {
	let roots = new Map(),
		out = []

	for (let r of rows) {
		if (r._id === r.thread) {
			let t = {
				id: r._id,
				n: r.n || 0,
				anchor: r.anchor,
				ctx: r.context || {artboard: '', layer: ''},
				status: r.status === 'resolved' ? 'resolved' : 'open',
				assignee: r.assignee || null,
				resolved: r.resolved || null,
				created: r.created,
				updated: r.updated || r.created,
				comments: []
			}

			roots.set(r._id, t)
			out.push(t)
		}
	}

	for (let r of rows) {
		let t = roots.get(r.thread)

		if (t) {
			t.comments.push({id: r._id, by: r.by, text: r.text, mentions: r.mentions || [], created: r.created, edited: r.edited || null})
		}
	}

	for (let t of out) {
		t.comments.sort((a, b) => time(a.created) - time(b.created) || (a.id < b.id ? -1 : 1))
	}

	return out.sort((a, b) => (a.n - b.n) || time(a.created) - time(b.created))
}

const time = (d) => d instanceof Date ? d.getTime() : typeof d === 'string' ? Date.parse(d) || 0 : Number(d) || 0

const sameUser = (a, b) => !!a && !!b && !a.guest && !b.guest && !!a.username && a.username === b.username

//Did this person write anything in the thread?
export const isMine = (thread, me) => !!me && thread.comments.some((c) => sameUser(c.by, me))

export const isAssignedTo = (thread, me) => !!me?.username && thread.assignee?.username === me.username

//Filters of the Comments panel. status: open | resolved | all; scope: all | mine | assigned; artboardId: one artboard or ''
export const matchesFilter = (thread, filter, me) => {
	if (filter.status && filter.status !== 'all' && thread.status !== filter.status) {
		return false
	}

	if (filter.scope === 'mine' && !isMine(thread, me)) {
		return false
	}

	if (filter.scope === 'assigned' && !isAssignedTo(thread, me)) {
		return false
	}

	if (filter.artboardId && thread.anchor.artboardId !== filter.artboardId) {
		return false
	}

	return true
}

//Counts for the panel's chips and the project card
export const countsOf = (threads, me) => ({
	open: threads.filter((t) => t.status === 'open').length,
	resolved: threads.filter((t) => t.status === 'resolved').length,
	mine: threads.filter((t) => isMine(t, me)).length,
	assigned: threads.filter((t) => t.status === 'open' && isAssignedTo(t, me)).length
})

//Everyone a thread could be handed to or mention: the owner, and whoever has written in the project. Guests have no
//username, so they can't be picked
export const peopleOf = (threads, owner) => {
	let seen = new Map()

	if (owner?.username) {
		seen.set(owner.username, {username: owner.username, name: owner.name || owner.username})
	}

	for (let t of threads) {
		for (let c of t.comments) {
			if (c.by?.username && !c.by.guest && !seen.has(c.by.username)) {
				seen.set(c.by.username, {username: c.by.username, name: c.by.name || c.by.username})
			}
		}
	}

	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

//Who hears about a write: the assignee when a thread is handed to them, people mentioned, and (for a reply) everybody
//else in the thread. Never the author. One notice per person, the strongest reason first
export const noticesFor = ({thread, by, kind, mentions = [], assignee = null}) => {
	let reasons = new Map(),
		add = (user, why) => {
			if (!user || reasons.has(user) || (by?.username && user === by.username)) {
				return
			}

			reasons.set(user, why)
		}

	if (assignee?.username) {
		add(assignee.username, 'assigned')
	}

	for (let u of mentions) {
		add(u, 'mention')
	}

	if (kind === 'reply') {
		if (thread.assignee?.username) {
			add(thread.assignee.username, 'reply')
		}

		for (let c of thread.comments) {
			if (c.by?.username && !c.by.guest) {
				add(c.by.username, 'reply')
			}
		}
	}

	return [...reasons].map(([user, why]) => ({user, kind: why}))
}

//A sliding window per key: `max` hits in `windowMs`. hit() says whether this one is allowed (and counts it only if so)
export class Limiter {
	constructor(max, windowMs) {
		this.max = max
		this.windowMs = windowMs
		this.hits = new Map()
	}

	hit(key, now = Date.now()) {
		let list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs)

		if (list.length >= this.max) {
			this.hits.set(key, list)
			return false
		}

		list.push(now)
		this.hits.set(key, list)

		//Keys that went quiet would sit here forever
		if (this.hits.size > 5000) {
			this.sweep(now)
		}

		return true
	}

	sweep(now = Date.now()) {
		for (let [key, list] of this.hits) {
			if (!list.some((t) => now - t < this.windowMs)) {
				this.hits.delete(key)
			}
		}
	}
}

//Where to draw a pin, in its artboard's own coordinates. `place(layerId, lx, ly)` is how the caller finds a layer's
//spot (the editor knows the layer's matrix), returning null when the layer is not there any more. detached means
//the pin fell back to its saved point
export const pinSpot = (anchor, place) => {
	if (anchor.layerId && finite(anchor.lx) && finite(anchor.ly)) {
		let at = place(anchor.layerId, anchor.lx, anchor.ly)

		if (at) {
			return {x: at.x, y: at.y, detached: false}
		}

		return {x: anchor.x, y: anchor.y, detached: true}
	}

	return {x: anchor.x, y: anchor.y, detached: false}
}

//The words under a thread in the panel: its first message, shortened
export const snippet = (text, max = 90) => {
	let one = String(text || '').replace(/\s+/g, ' ').trim()

	return one.length > max ? `${one.slice(0, max - 1)}…` : one
}
