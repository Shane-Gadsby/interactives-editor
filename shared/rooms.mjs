//Rooms on the server (the player side is interactives-player/src/rooms.ts, and test/rooms-parity.test.ts holds the two to the same
//answers). What lives here is pure: what a shared page declares for a room, cleaning a message, the seat a person gets, and the link
//the learner page holds to the server. index.js does the sockets, the mongo and the sessions.
import {cleanAnswer, isBlocked} from './responses.mjs'
import crypto from 'node:crypto'

//No cap on how much anyone says, only the most one message can be (the socket refuses more than a few KB anyway)
export const ROOM_LIMITS = {show: 300, blocked: 200, sources: 10, text: 2000}
export const ROOM_DEFAULTS = {show: 100}

const whole = (v, def, min, max) => {
	let n = typeof v === 'number' ? v : Number(v)

	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def
}

//What the owner declared for a room when the project was shared. The socket holds to this, never to what a browser says.
//sample is left out, it is for the editor's canvas only
export const cleanRoomDeclaration = (raw) => {
	let o = raw && typeof raw === 'object' ? raw : {},
		words = (Array.isArray(o.blocked) ? o.blocked : []).filter((w) => typeof w === 'string').map((w) => w.trim()).filter(Boolean).slice(0, ROOM_LIMITS.blocked)

	return {
		names: o.names === 'first' ? 'first' : 'seat',
		show: whole(o.show, ROOM_DEFAULTS.show, 1, ROOM_LIMITS.show),
		blocked: words
	}
}

//The rooms a shared page declares, by data source id, read out of the project inside it. Empty when there are none
export const declaredRooms = (html) => {
	if (!html.includes('"source":"room"')) {
		return {}
	}

	let open = html.indexOf('id="ix-project">'),
		start = open + 'id="ix-project">'.length,
		end = open < 0 ? -1 : html.indexOf('</script>', start)

	if (end < 0) {
		return {}
	}

	let project

	try {
		project = JSON.parse(html.slice(start, end))
	}
	catch (err) {
		return {}
	}

	let out = {}

	for (let ds of Array.isArray(project.dataSources) ? project.dataSources : []) {
		if (ds && ds.source === 'room' && typeof ds.id === 'string' && /^[\w-]{1,64}$/.test(ds.id) && Object.keys(out).length < ROOM_LIMITS.sources) {
			out[ds.id] = {...cleanRoomDeclaration(ds.room), name: String(ds.name || '').slice(0, 80)}
		}
	}

	return out
}

//A message as it is kept: control and invisible characters to spaces, spaces squeezed, cut to the most a room takes
export const cleanMessage = (text) => cleanAnswer(text, ROOM_LIMITS.text)

export const isBlockedMessage = isBlocked

const ADJECTIVES = ['Quiet', 'Brave', 'Calm', 'Bright', 'Swift', 'Gentle', 'Clever', 'Happy', 'Lucky', 'Merry', 'Bold', 'Keen', 'Kind', 'Proud', 'Sunny', 'Witty', 'Curious', 'Daring', 'Eager', 'Fancy', 'Jolly', 'Lively', 'Mellow', 'Noble', 'Plucky', 'Rosy', 'Snappy', 'Steady', 'Tidy', 'Upbeat', 'Vivid', 'Zesty'],
	ANIMALS = ['Otter', 'Falcon', 'Heron', 'Koala', 'Lynx', 'Panda', 'Quokka', 'Wombat', 'Dingo', 'Emu', 'Gecko', 'Ibis', 'Kiwi', 'Lorikeet', 'Magpie', 'Numbat', 'Possum', 'Quoll', 'Robin', 'Skink', 'Tern', 'Wallaby', 'Yabby', 'Bandicoot', 'Cockatoo', 'Dolphin', 'Echidna', 'Finch', 'Galah', 'Kingfisher', 'Platypus', 'Turtle']

//The name a person goes by in one room: made up from a keyed hash of who they are and which room, so it is the same every time they
//come back to that room and means nothing anywhere else. Nothing in it can be turned back into the username without the secret
export const seatFor = (secret, project, source, course, username) => {
	let h = crypto.createHmac('sha256', secret).update(`${project}|${source}|${course}|${username}`).digest()

	return `${ADJECTIVES[h[0] % ADJECTIVES.length]} ${ANIMALS[h[1] % ANIMALS.length]} ${10 + h[2] % 90}`
}

//What a person is called to the others under the room's setting: the seat, or their first name when the author said so (and there is
//one to use). Never a surname, a username or an email
export const displayName = (declared, seat, firstName) => {
	let first = cleanAnswer(firstName, 40)

	return declared.names === 'first' && first ? first : seat
}

//Ids sort in the order messages happened (time first, then a counter for the same millisecond), so a room can be read in order by id
let counter = 0
export const messageId = () => `${Date.now().toString(36).padStart(9, '0')}${(counter++ % 46656).toString(36).padStart(3, '0')}${crypto.randomBytes(3).toString('hex')}`

//A message as other people are told it: no username, nothing about who beyond the name they go by
export const publicMessage = (doc) => ({id: doc._id, seat: doc.seat, text: doc.text, at: doc.at instanceof Date ? doc.at.getTime() : Number(doc.at) || 0})

//The link the learner page holds to the server: one WebSocket for every room the project has, that signs in with a first message
//(a browser cannot put a header on a WebSocket), asks for each room it has joined, remembers how far it has heard in each
//(epoch and seq) and asks for what it missed when it comes back, backing off between tries. Frames go to onFrame untouched, and
//onState hears {up: true|false} or {gone: reason} when the server will not have it back. This one function is written out in the
//learner page too (toString goes into its script), so it can't lean on anything outside itself, and it is old style javascript for
//that reason. opts: url, hello() -> {token, session, lti}, WS (the WebSocket class), onFrame, onState, and optionally timers
//(setTimeout, clearTimeout), random and now, which the tests swap
export function createRoomLink(opts) {
	var WS = opts.WS,
		setT = opts.setTimeout || function (f, ms) {
			return setTimeout(f, ms)
		},
		clearT = opts.clearTimeout || function (t) {
			clearTimeout(t)
		},
		random = opts.random || Math.random,
		now = opts.now || Date.now,
		rooms = {},
		pending = {},
		counter = 0,
		ws = null,
		up = false,
		gone = '',
		closed = false,
		tries = 0,
		retry = null,
		watch = null,
		heard = 0

	var settle = function (cid, problem) {
		var p = pending[cid]

		if (p) {
			delete pending[cid]
			clearT(p.timer)
			p.resolve({problem: problem || ''})
		}
	}

	var failAll = function () {
		for (var cid in pending) {
			settle(cid, 'offline')
		}
	}

	var put = function (frame) {
		if (ws && up) {
			try {
				ws.send(JSON.stringify(frame))
				return true
			}
			catch (e) {
			}
		}

		return false
	}

	var askFor = function (room) {
		var r = rooms[room]

		put({t: 'join', room: room, since: r.seq || 0, epoch: r.epoch || ''})
	}

	var later = function () {
		if (closed || gone || retry) {
			return
		}

		var wait = Math.min(30000, 1000 * Math.pow(2, Math.min(tries, 5))) + Math.floor(random() * 1000)

		tries++
		retry = setT(function () {
			retry = null
			connect()
		}, wait)
	}

	var ended = function (socket) {
		if (socket !== ws) {
			return
		}

		var wasUp = up

		ws = null
		up = false
		clearT(watch)
		failAll()

		if (wasUp) {
			opts.onState({up: false})
		}

		later()
	}

	//A server that stopped talking (the beat comes every 20 seconds) is a link that is half open, so it is dropped and made again
	var watchdog = function () {
		clearT(watch)
		watch = setT(function () {
			if (ws && now() - heard > 65000) {
				try {
					ws.close()
				}
				catch (e) {
				}

				return
			}

			if (ws) {
				watchdog()
			}
		}, 20000)
	}

	var take = function (socket, text) {
		var frame

		heard = now()

		try {
			frame = JSON.parse(text)
		}
		catch (e) {
			return
		}

		if (!frame || typeof frame !== 'object' || typeof frame.t !== 'string') {
			return
		}

		if (frame.t === 'ready') {
			up = true
			tries = 0
			opts.onState({up: true})

			for (var room in rooms) {
				askFor(room)
			}

			return
		}

		if (frame.t === 'beat') {
			return
		}

		if (frame.t === 'bye') {
			//Signing in was refused, or there is nothing here to join: asking again will not change that
			if (frame.reason === 'session' || frame.reason === 'nothing' || frame.reason === 'nocourse') {
				gone = frame.reason
				opts.onState({gone: gone})
			}

			try {
				socket.close()
			}
			catch (e) {
			}

			return
		}

		var r = rooms[frame.room]

		if (frame.t === 'sent') {
			settle(frame.cid, frame.ok === false ? frame.problem || 'offline' : '')
		}

		if (r) {
			if (frame.t === 'snapshot' || frame.t === 'replay') {
				r.epoch = frame.epoch || ''
				r.seq = frame.seq || 0
			}
			else if (frame.t === 'event' && frame.seq > r.seq) {
				r.seq = frame.seq
			}
		}

		opts.onFrame(frame)
	}

	var connect = function () {
		if (closed || gone || ws) {
			return
		}

		var socket

		try {
			socket = new WS(opts.url)
		}
		catch (e) {
			later()
			return
		}

		ws = socket
		heard = now()
		watchdog()
		socket.onopen = function () {
			if (socket !== ws) {
				return
			}

			var h = opts.hello() || {}

			try {
				socket.send(JSON.stringify({t: 'hello', token: h.token, session: h.session || null, lti: h.lti || null}))
			}
			catch (e) {
			}
		}
		socket.onmessage = function (e) {
			if (socket === ws && typeof e.data === 'string') {
				take(socket, e.data)
			}
		}
		socket.onclose = function () {
			ended(socket)
		}
		socket.onerror = function () {
		}
	}

	return {
		//Asks for a room (and for what it missed since, when the link has been up before). Joining one twice is one
		join: function (room) {
			if (closed || gone) {
				return
			}

			if (!rooms[room]) {
				rooms[room] = {epoch: '', seq: 0}
			}

			if (up) {
				askFor(room)
			}
			else if (!ws && !retry) {
				connect()
			}
		},
		//Resolves {problem}: empty when the room took it, a short word when it did not (blocked, empty) or when there is no link ('offline')
		send: function (room, text) {
			return new Promise(function (resolve) {
				var cid = String(++counter)

				if (!up || !rooms[room]) {
					return resolve({problem: 'offline'})
				}

				pending[cid] = {resolve: resolve, timer: setT(function () {
					settle(cid, 'offline')
				}, 8000)}

				if (!put({t: 'send', room: room, text: text, cid: cid})) {
					settle(cid, 'offline')
				}
			})
		},
		close: function () {
			closed = true
			clearT(retry)
			clearT(watch)
			failAll()

			if (ws) {
				try {
					ws.close()
				}
				catch (e) {
				}
			}
		},
		//For the tests
		state: function () {
			return {up: up, gone: gone, tries: tries, rooms: JSON.parse(JSON.stringify(rooms))}
		}
	}
}
