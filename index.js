require('../suite-libs/crash-guard')
let port = Number(process.env.PORT) || 3048,
	version = '0.1.0',
	appName = 'interactives',
	express = require('express'),
	fs = require('fs'),
	app = express(),
	mongoConnect = require('../suite-libs/mongo-connect'),
	client = mongoConnect(),
	cacheHeaders = require('../suite-libs/cache-headers'),
	sessionCheck = require('../suite-libs/session-check'),
	path = require('path'),
	crypto = require('crypto'),
	router = new express.Router(),

	//The suite's one power user (god mode) rule lives in the toolbox, which is always checked out beside us.
	//If it isn't there for some reason, nobody gets the extras rather than everybody
	powerUser = (() => {
		try {
			return require('../toolbox/public/sys/js/powerUser.js')
		}
		catch (e) {
			console.warn('interactives: ../toolbox/public/sys/js/powerUser.js not found, power user mode is off')
			return {canUse: () => false}
		}
	})(),

	//Uploaded assets live on disk, in storage/ beside this file unless INTERACTIVES_STORAGE says otherwise.
	//On test/prod storage/ gets symlinked onto the bigger pool, which is mounted somewhere different on each box
	storageDir = path.resolve(process.env.INTERACTIVES_STORAGE || `${__dirname}/storage`),

	//The editor is a built single page app (npm run build -> dist/). Read once at boot and stamped like
	//every other app's document
	indexFile = `${__dirname}/dist/index.html`,
	stamped = null,
	stampedAt = 0,

	//Picked up on request rather than once at boot, and again whenever the build replaces it. vite empties dist/
	//while it builds, so a boot in that gap would otherwise be stuck on the not-built page, and an old copy would
	//point at asset hashes that are gone
	indexHTML = () => {
		let mtime = 0

		try {
			mtime = fs.statSync(indexFile).mtimeMs
		}
		catch (e) {
			return stamped ? stamped() : '<!doctype html><p>The editor has not been built. Run <code>npm run build</code>.</p>'
		}

		if (!stamped || mtime !== stampedAt) {
			stamped = cacheHeaders.stampedDocument(indexFile)
			stampedAt = mtime
		}

		//Vite's assets/ files are content hashed already, and must load by exactly the url the lazy chunks import
		//them by. A ?v= stamp on the entry makes the browser treat it as a second module, so the first lazy import
		//would boot a whole second copy of the editor
		return stamped().replace(/((?:\.\/)?assets\/[\w.-]+\.(?:js|css))\?v=[^"'\s>]*/g, '$1')
	},

	maxAsset = 60 * 1024 * 1024,
	maxTags = 20,
	maxLabel = 40,

	analyticsDB,
	db,
	projects,
	revisions,
	prefs,
	libraries,
	userData,
	ingest,

	//Revision ids are strings (time first, so they sort), keeps mongodb's ObjectId out of this app's requires
	revisionID = () => `${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`,
	validRevision = (id) => typeof id === 'string' && /^[a-z0-9]{12,30}$/.test(id)

//Live editing. One room per open project: the document in memory, the op log, and everyone connected over SSE.
//The shared op code is an ES module (the browser uses the same file), so it comes in through import()
let ops = null,
	library = null,
	safety = null,
	learner = null,
	records = null
const rooms = new Map(),
	LOG_KEEP = 2000,
	PALETTE = ['#e5484d', '#30a46c', '#3e63dd', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#ad7f58'],

	sseSend = (res, event, data, id) => {
		res.write(`${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
	},

	broadcast = (room, event, data, id) => {
		for (let c of room.clients) sseSend(c.res, event, data, id)
	},

	presenceOf = (room) => [...room.clients].map((c) => ({clientId: c.id, name: c.name, color: c.color, ...c.presence})),

	//Revision history: a snapshot of the document every few minutes while it's being changed, plus one before
	//every restore. Old ones past the cap get dropped
	revisionEvery = 5 * 60 * 1000,
	revisionCap = 100,
	lastRevision = new Map(),

	snapshot = async (projectID, docString, rev, by, reason, force) => {
		let last = lastRevision.get(projectID)

		if (!force && last === undefined) {
			let newest = await revisions.findOne({project: projectID}, {sort: {created: -1}, projection: {created: 1}})
			last = newest ? newest.created.getTime() : 0
		}

		if (!force && Date.now() - last < revisionEvery) return

		lastRevision.set(projectID, Date.now())
		await revisions.insertOne({_id: revisionID(), project: projectID, created: new Date(), rev, by: by || null, reason: reason || 'Autosave', size: docString.length, doc: docString})

		//Keep the newest revisionCap
		let old = await revisions.find({project: projectID}, {sort: {created: -1}, skip: revisionCap, projection: {_id: 1}}).toArray()
		if (old.length) await revisions.deleteMany({_id: {$in: old.map((r) => r._id)}})
	},

	//Writes the room's document back to mongo, bumping rev so plain (non-live) saves still see conflicts
	persist = async (room) => {
		if (!room.dirty || room.deleted) return
		room.dirty = false
		clearTimeout(room.saveTimer)
		room.rev++
		let p = room.doc, first = p.artboards?.[0]
		snapshot(room.id, JSON.stringify(p), room.rev, null, 'Autosave').catch((err) => console.trace(`${appName}: revision of ${room.id} failed`, err))
		await projects.updateOne({_id: room.id}, {$set: {
			name: String(p.name || 'Untitled project').slice(0, 200),
			updated: new Date(),
			doc: JSON.stringify(p),
			rev: room.rev,
			meta: {
				artboards: p.artboards?.length || 0,
				library: !!p.settings?.library,
				preview: first ? {width: first.width, height: first.height, background: first.background?.type === 'solid' ? first.background.color : '#ffffff'} : null
			}
		}}).catch((err) => {
			room.dirty = true
			console.trace(`${appName}: live save of ${room.id} failed`, err)
		})
	},

	openRoom = async (id) => {
		let room = rooms.get(id)
		if (room) {
			clearTimeout(room.closeTimer)
			return room
		}
		let doc = await projects.findOne({_id: id})
		if (!doc) return null
		//Someone may have opened it while we waited on mongo
		if (rooms.has(id)) return rooms.get(id)
		room = {id, doc: JSON.parse(doc.doc), owner: doc.owner || null, rev: doc.rev || 0, seq: 0, log: [], clients: new Set(), dirty: false, saveTimer: null, closeTimer: null, nextColor: 0}
		rooms.set(id, room)
		return room
	},

	maybeCloseRoom = (room) => {
		if (room.clients.size) return
		clearTimeout(room.closeTimer)
		room.closeTimer = setTimeout(async () => {
			if (room.clients.size) return
			await persist(room)
			//Someone may have joined while the save was running: the room stays, with them in it
			if (room.clients.size) return
			if (rooms.get(room.id) === room) rooms.delete(room.id)
		}, 30 * 1000)
	}

const enforcing = () => process.env.SUITE_SESSION_ENFORCE === '1',

	//Ids come from the editor (uid() in the player's format.ts), nothing else should ever get near a query.
	//Never one of storage/'s own folder names (shares, thumbs, _libraries), see shared/safety.mjs
	validID = (id) => safety.validID(id),

	whoIs = (req) => {
		let user = req.sessionData?.user

		//si-manager's formatted session has fullName/firstName/lastName (older ones had firstname/lastname)
		return user ? {username: user.username || null, userID: user.userID ?? null, name: user.fullName || [user.firstName || user.firstname, user.lastName || user.lastname].filter(Boolean).join(' ') || user.username || null} : null
	},

	//Admins and power users, minus presentation mode. Same rule as everywhere else in the suite
	isPower = (req) => powerUser.canUse(req.sessionData?.access),

	//Your own projects only, unless you're a power user. Logs instead of refusing until the box enforces
	//sessions, same as session-check
	mayChange = (req, res, doc) => {
		if (!doc?.owner?.username) {
			return true
		}

		let me = whoIs(req)

		if (me && (me.username === doc.owner.username || isPower(req))) {
			return true
		}

		console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: not the owner`)

		if (enforcing()) {
			res.status(403).json({error: 'That project belongs to someone else'})
			return false
		}

		return true
	},

	metaOf = (doc) => ({
		...doc.meta,
		id: doc._id,
		name: doc.name,
		created: doc.created,
		updated: doc.updated,
		rev: doc.rev,
		owner: doc.owner || null,
		thumb: doc.thumb || null,

		//A library project: marked as one in its settings (meta.library, from every save) and, once published, its version
		isLibrary: !!doc.meta?.library,
		libraryVersion: doc.library?.version || 0,

		//Organising metadata, top level on the document (not in meta, every save rewrites that)
		tags: Array.isArray(doc.tags) ? doc.tags : [],
		folder: typeof doc.folder === 'string' && doc.folder ? doc.folder : null
	}),

	//Tags and folder come straight from the browser, so trim them, drop control chars and cap the lot.
	//Returns null for anything that isn't the right shape
	cleanLabel = (value, max) => {
		if (typeof value !== 'string') {
			return null
		}

		let label = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()

		return label && label.length <= max ? label : null
	},

	//Every id is checked by validID before it gets near here, so these can't climb out of storageDir
	projectDir = (projectID) => path.join(storageDir, projectID),
	shareFile = (token) => path.join(storageDir, 'shares', `${token}.html`),
	thumbFile = (projectID) => path.join(storageDir, 'thumbs', `${projectID}.jpg`),
	assetFile = (projectID, assetID) => path.join(storageDir, projectID, assetID),

	//A published library keeps its own copy of the assets its snapshot uses, so the snapshot doesn't change under
	//people when the library project edits or deletes an asset. Library ids are project ids, so validID covers them too
	libraryDir = (libraryID) => path.join(storageDir, '_libraries', libraryID),

	removeAssets = async (projectID, assetID) => {
		if (assetID) {
			await fs.promises.rm(assetFile(projectID, assetID), {force: true})
			await fs.promises.rm(`${assetFile(projectID, assetID)}.json`, {force: true})
		}
		else {
			await fs.promises.rm(projectDir(projectID), {recursive: true, force: true})
		}
	}

//Nothing the api sends is ever to be sniffed into a page
router.use('/api', (req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff')
	next()
})

//No body unless something parsed one, express 5 leaves it undefined
router.use((req, res, next) => {
	req.body = req.body || {}
	next()
})

router.use(cacheHeaders.stampGate)

//Every api route: never cached, staff session wanted (log only until SUITE_SESSION_ENFORCE=1)
router.use('/api', cacheHeaders.api, sessionCheck({staff: true}))

//Each person's editor preferences (theme, wheel, default font...), kept per user rather than per browser. Keyed
//by username, so it's an _id lookup and needs no index. No session (dev) means one shared "guest" set
const PREF_KEYS = {wheel: ['zoom', 'ctrl'], theme: ['dark', 'light', 'auto'], tooltips: 'boolean', rulers: 'boolean', accessibility: 'boolean', screenReader: 'boolean', defaultFont: 'string'},
	cleanPrefs = (p) => {
		let out = {}
		for (let [k, rule] of Object.entries(PREF_KEYS)) {
			let v = p?.[k]
			if (Array.isArray(rule) ? rule.includes(v) : rule === 'string' ? typeof v === 'string' && v.length < 120 : typeof v === rule) out[k] = v
		}
		return out
	}

router.get('/api/prefs', async (req, res) => {
	let user = whoIs(req)?.username || 'guest',
		doc = await prefs.findOne({_id: user})
	res.json({user, prefs: doc?.prefs || {}})
})

router.put('/api/prefs', express.json({limit: '16kb'}), async (req, res) => {
	let user = whoIs(req)?.username || 'guest',
		clean = cleanPrefs(req.body.prefs)
	await prefs.updateOne({_id: user}, {$set: {prefs: clean, updated: new Date()}}, {upsert: true})
	res.json({user, prefs: clean})
})

//Who the editor's talking to, for the projects list and the owner badge
router.get('/api/session', (req, res) => {
	res.json({user: whoIs(req), power: isPower(req)})
})

//The projects list, mine only. ?all=1 gets everyone's, but only for power users (god mode). With no session at
//all (dev without si-manager) there's nobody to filter on, so it's everything until the box enforces sessions
router.get('/api/projects', async (req, res) => {
	let me = whoIs(req),
		filter = (req.query.all === '1' && isPower(req)) || (!me?.username && !enforcing()) ? {} : {'owner.username': me?.username ?? null},
		list = await projects.find(filter, {projection: {doc: 0}}).sort({updated: -1}).limit(1000).toArray()

	res.json(list.map(metaOf))
})

router.get('/api/projects/:id', async (req, res) => {
	if (!validID(req.params.id)) {
		return res.status(400).json({error: 'Bad project id'})
	}

	let doc = await projects.findOne({_id: req.params.id})

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	//A live room has newer content than mongo until its next save
	let room = rooms.get(req.params.id)
	res.json({project: room ? room.doc : JSON.parse(doc.doc), rev: room ? room.rev : doc.rev, owner: doc.owner || null, live: room ? room.seq : null})
})

//Save. The editor sends the rev it loaded, and a mismatch means someone else saved in between,
//so it gets a 409 instead of quietly flattening their work. rev 0 (or none) is a brand new project
router.put('/api/projects/:id', express.json({limit: '25mb'}), async (req, res) => {
	let id = req.params.id,
		project = req.body.project,
		rev = Number(req.body.rev) || 0

	if (!validID(id) || !project || project.id !== id || project.format !== 'interactives' || !Array.isArray(project.artboards)) {
		return res.status(400).json({error: 'Not a valid project'})
	}

	let existing = await projects.findOne({_id: id}, {projection: {doc: 0}})

	if (existing && !mayChange(req, res, existing)) {
		return
	}

	if (existing && !req.body.force && existing.rev !== rev) {
		return res.status(409).json({error: 'This project was saved somewhere else since you opened it', rev: existing.rev})
	}

	if (!existing && rev !== 0 && !req.body.force) {
		return res.status(409).json({error: 'This project was deleted somewhere else', rev: 0})
	}

	let firstBoard = project.artboards[0],
		next = (existing?.rev || 0) + 1,
		set = {
			name: String(project.name || 'Untitled project').slice(0, 200),
			updated: new Date(),

			//Stored as a string on purpose. Bindings and logic params use keys like "fill.color", and user
			//data has no business deciding what mongo sees as a field path
			doc: JSON.stringify(project),
			rev: next,
			meta: {
				artboards: project.artboards.length,
				library: !!project.settings?.library,
				preview: firstBoard ? {width: firstBoard.width, height: firstBoard.height, background: firstBoard.background?.type === 'solid' ? firstBoard.background.color : '#ffffff'} : null
			}
		}

	//Filter on the rev we checked, so two saves racing each other can't both win
	let result = await projects.updateOne(
		existing ? {_id: id, rev: existing.rev} : {_id: id},
		{$set: set, $setOnInsert: {created: new Date(), owner: whoIs(req)}},
		{upsert: !existing}
	).catch((err) => err)

	if (result instanceof Error || (existing && result.matchedCount === 0)) {
		return res.status(409).json({error: 'This project was saved somewhere else at the same moment'})
	}

	snapshot(id, set.doc, next, whoIs(req), existing ? 'Autosave' : 'Created').catch((err) => console.trace(`${appName}: revision of ${id} failed`, err))

	//Somebody saved the whole document while a live room is open (a non-live client, an import): the room takes it
	//and everyone connected reloads
	let room = rooms.get(id)
	if (room) {
		room.doc = project
		room.rev = next
		room.dirty = false
		room.log = []
		broadcast(room, 'reset', {rev: next})
	}

	res.json({ok: true, rev: next})
})

//Tags and folder for the projects page. Only touches those two fields, no rev bump and no revision, so it can't
//collide with an editor save. Either field can be left out to keep it as it is
router.patch('/api/projects/:id/meta', express.json({limit: '16kb'}), async (req, res) => {
	let id = req.params.id,
		body = req.body || {}

	if (!validID(id)) {
		return res.status(400).json({error: 'Bad project id'})
	}

	let set = {}

	if ('tags' in body) {
		if (!Array.isArray(body.tags) || body.tags.length > maxTags) {
			return res.status(400).json({error: `Tags must be a list of up to ${maxTags}`})
		}

		let tags = []

		for (let raw of body.tags) {
			let tag = cleanLabel(raw, maxLabel)

			if (!tag) {
				return res.status(400).json({error: `Each tag must be 1 to ${maxLabel} characters`})
			}

			//Case-insensitive duplicates collapse into the first spelling
			if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
				tags.push(tag)
			}
		}

		set.tags = tags
	}

	if ('folder' in body) {
		let folder = body.folder === null || body.folder === '' ? null : cleanLabel(body.folder, maxLabel)

		if (body.folder !== null && body.folder !== '' && !folder) {
			return res.status(400).json({error: `A folder name must be 1 to ${maxLabel} characters`})
		}

		set.folder = folder
	}

	if (!Object.keys(set).length) {
		return res.status(400).json({error: 'Nothing to change'})
	}

	let existing = await projects.findOne({_id: id}, {projection: {doc: 0}})

	if (!existing) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, existing)) {
		return
	}

	await projects.updateOne({_id: id}, {$set: set})
	res.json(metaOf({...existing, ...set}))
})

router.delete('/api/projects/:id', async (req, res) => {
	let id = req.params.id

	if (!validID(id)) {
		return res.status(400).json({error: 'Bad project id'})
	}

	let existing = await projects.findOne({_id: id}, {projection: {doc: 0}})

	if (!existing) {
		return res.json({ok: true})
	}

	if (!mayChange(req, res, existing)) {
		return
	}

	//Drop the live room first: no pending autosave or close timer may write the project (or a revision of it) back
	//after it is gone
	let room = rooms.get(id)
	if (room) {
		room.deleted = true
		room.dirty = false
		clearTimeout(room.saveTimer)
		clearTimeout(room.closeTimer)
		rooms.delete(id)
	}

	await removeAssets(id)
	await revisions.deleteMany({project: id})

	//The learners' records go with it
	await userData.deleteMany({project: id})
	await fs.promises.rm(thumbFile(id), {force: true})
	await libraries.deleteOne({_id: id})
	await fs.promises.rm(libraryDir(id), {recursive: true, force: true})
	if (existing.share?.token) await fs.promises.rm(shareFile(existing.share.token), {force: true})
	await projects.deleteOne({_id: id})

	if (room) {
		broadcast(room, 'deleted', {})
		for (let c of room.clients) c.res.end()
	}

	res.json({ok: true})
})

//Copies the project and every asset, under a new id made here. The browser doesn't get to pick it, or it could
//copy into (and over) a project that already exists
router.post('/api/projects/:id/duplicate', express.json(), async (req, res) => {
	let id = req.params.id,
		name = req.body.name

	if (!validID(id)) {
		return res.status(400).json({error: 'Bad project id'})
	}

	let doc = await projects.findOne({_id: id})

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	let newID = safety.newProjectID(),
		project = JSON.parse(doc.doc),
		now = new Date()

	//A random id colliding is next to impossible, but this is the check that makes it a promise
	if (await projects.findOne({_id: newID}, {projection: {_id: 1}}) || fs.existsSync(projectDir(newID))) {
		return res.status(409).json({error: 'Try that again'})
	}

	project.id = newID
	project.name = String(name || `${project.name} copy`).slice(0, 200)
	project.created = project.updated = now.toISOString()

	if (fs.existsSync(projectDir(id))) {
		await fs.promises.cp(projectDir(id), projectDir(newID), {recursive: true})
	}

	await projects.insertOne({_id: newID, name: project.name, created: now, updated: now, doc: JSON.stringify(project), rev: 1, meta: doc.meta, tags: doc.tags || [], folder: doc.folder || null, owner: whoIs(req)})
	res.json({ok: true, id: newID})
})

//Asset routes check the project's owner too. One lookup each, it's not a hot path
const projectFor = async (req, res) => {
	let {id, assetId} = req.params

	if (!validID(id) || (assetId !== undefined && !validID(assetId))) {
		res.status(400).json({error: 'Bad id'})
		return null
	}

	let doc = await projects.findOne({_id: id}, {projection: {doc: 0}})

	if (!doc) {
		res.status(404).json({error: 'No such project'})
		return null
	}

	return mayChange(req, res, doc) ? doc : null
}

router.get('/api/projects/:id/assets', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let dir = projectDir(req.params.id),
		names = fs.existsSync(dir) ? await fs.promises.readdir(dir) : [],
		list = []

	for (let name of names.filter((n) => n.endsWith('.json'))) {
		try {
			let meta = JSON.parse(await fs.promises.readFile(path.join(dir, name), 'utf8'))
			list.push({id: name.slice(0, -5), mime: meta.mime, size: meta.size})
		}
		catch (e) {
			//A half written sidecar, skip it
		}
	}

	res.json(list)
})

//Raw bytes in, raw bytes out. The editor never reuses an asset id for different bytes, so a fetched asset can sit
//in the browser cache for good
router.put('/api/projects/:id/assets/:assetId', express.raw({type: () => true, limit: maxAsset}), async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let {id, assetId} = req.params,
		bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
		mime = String(req.get('content-type') || 'application/octet-stream').slice(0, 100),
		file = assetFile(id, assetId),
		temp = `${file}.${process.pid}.${Date.now()}.tmp`

	await fs.promises.mkdir(projectDir(id), {recursive: true})

	//Write then rename, so a reader never gets half a file
	await fs.promises.writeFile(temp, bytes)
	await fs.promises.rename(temp, file)
	await fs.promises.writeFile(`${file}.json`, JSON.stringify({mime: mime, size: bytes.length, created: new Date()}))

	res.json({ok: true, size: bytes.length})
})

router.get('/api/projects/:id/assets/:assetId', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let file = assetFile(req.params.id, req.params.assetId),
		meta

	try {
		meta = JSON.parse(await fs.promises.readFile(`${file}.json`, 'utf8'))
	}
	catch (e) {
		return res.status(404).json({error: 'No such asset'})
	}

	//Overrides the api no-store, asset ids are never reused
	res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')

	//Uploads are served from this origin, so only the kinds that can't be a page keep their type
	safety.assetHeaders(res, meta.mime)
	res.sendFile(file, (err) => {
		if (err && !res.headersSent) {
			res.status(404).json({error: 'No such asset'})
		}
	})
})

router.delete('/api/projects/:id/assets/:assetId', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	await removeAssets(req.params.id, req.params.assetId)
	res.json({ok: true})
})

//Live editing stream. Server-Sent Events rather than a websocket, so it goes through haproxy like any other
//request. ?since=<seq> replays what a reconnecting client missed, or tells it to reload when that's gone
router.get('/api/projects/:id/live', async (req, res) => {
	let doc = await projectFor(req, res)
	if (!doc) {
		return
	}

	let room = await openRoom(req.params.id)
	if (!room) {
		return res.status(404).json({error: 'No such project'})
	}

	let clientId = String(req.query.clientId || '').slice(0, 64) || `c${Date.now().toString(36)}`,
		me = whoIs(req),
		//An AI agent joining through the MCP server says so (?agent=<name>), so people can see who's editing
		agent = typeof req.query.agent === 'string' ? req.query.agent.replace(/[^\w .-]+/g, '').slice(0, 40) : '',
		//Who they are: the checked session first, then the name the page's own session (fetchActivity) gave it, which
		//only matters where there's no session to check (local dev). It's just a label on the presence list
		claimed = typeof req.query.name === 'string' ? req.query.name.replace(/[^\p{L}\p{N} .'-]+/gu, '').slice(0, 60).trim() : '',
		client = {id: clientId, res, name: agent ? `${agent} (AI)` : me?.name || me?.username || claimed || 'Guest', color: PALETTE[room.nextColor++ % PALETTE.length], presence: {}},
		since = Number(req.query.since)

	res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'})
	res.write(':ok\n\n')

	room.clients.add(client)
	clearTimeout(room.closeTimer)

	if (Number.isFinite(since) && since < room.seq) {
		let missed = room.log.filter((e) => e.seq > since)
		if (!missed.length || missed[0].seq !== since + 1) sseSend(res, 'reset', {rev: room.rev})
		else for (let e of missed) sseSend(res, 'ops', e, e.seq)
	}

	sseSend(res, 'hello', {seq: room.seq, rev: room.rev, clientId, color: client.color, peers: presenceOf(room)})
	broadcast(room, 'presence', {clientId, name: client.name, color: client.color, joined: true})

	//Heartbeat under haproxy's 25s server timeout, or the stream gets cut every half minute
	let beat = setInterval(() => res.write(':\n\n'), 15 * 1000)

	req.on('close', () => {
		clearInterval(beat)
		room.clients.delete(client)
		broadcast(room, 'presence', {clientId, left: true})
		maybeCloseRoom(room)
	})
})

//A batch of ops from one client. The server's order is the order: apply, number, broadcast (the sender
//gets its own back too, which is its ack)
router.post('/api/projects/:id/ops', express.json({limit: '25mb'}), async (req, res) => {
	let doc = await projectFor(req, res)
	if (!doc) {
		return
	}

	let room = await openRoom(req.params.id),
		batch = Array.isArray(req.body.ops) ? req.body.ops : null

	if (!room || !batch) {
		return res.status(400).json({error: 'Bad ops'})
	}

	ops.apply(room.doc, batch)
	let entry = {seq: ++room.seq, clientId: String(req.body.clientId || ''), ops: batch}
	room.log.push(entry)
	if (room.log.length > LOG_KEEP) room.log.splice(0, room.log.length - LOG_KEEP)
	broadcast(room, 'ops', entry, entry.seq)

	room.dirty = true
	clearTimeout(room.saveTimer)
	room.saveTimer = setTimeout(() => persist(room), 1000)
	maybeCloseRoom(room)

	res.json({ok: true, seq: entry.seq})
})

//Cursor, artboard and selection, throttled by the client
router.post('/api/projects/:id/presence', express.json(), async (req, res) => {
	let room = rooms.get(req.params.id),
		client = room && [...room.clients].find((c) => c.id === req.body.clientId)

	if (!client) {
		return res.json({ok: false})
	}

	let pick = req.body.presence || {}
	client.presence = {
		cursor: pick.cursor && Number.isFinite(pick.cursor.x) && Number.isFinite(pick.cursor.y) ? {x: pick.cursor.x, y: pick.cursor.y} : null,
		artboardId: typeof pick.artboardId === 'string' ? pick.artboardId.slice(0, 64) : null,
		selection: Array.isArray(pick.selection) ? pick.selection.slice(0, 200).map(String) : []
	}
	broadcast(room, 'presence', {clientId: client.id, name: client.name, color: client.color, ...client.presence})
	res.json({ok: true})
})

//Project thumbnails for the projects page: a small JPEG of the start artboard, made by the editor as people work.
//Stored outside the asset folders; `thumb` on the project is its time, so the page can cache-bust it
router.put('/api/projects/:id/thumbnail', express.raw({type: () => true, limit: '2mb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	if (!Buffer.isBuffer(req.body) || req.body.length < 4 || req.body[0] !== 0xff || req.body[1] !== 0xd8) {
		return res.status(400).json({error: 'Not a JPEG'})
	}

	await fs.promises.mkdir(path.dirname(thumbFile(id)), {recursive: true})
	await fs.promises.writeFile(thumbFile(id), req.body)
	let thumb = Date.now()
	await projects.updateOne({_id: id}, {$set: {thumb}})
	res.json({ok: true, thumb})
})

router.get('/api/projects/:id/thumbnail', async (req, res) => {
	let doc = await projectFor(req, res)
	if (!doc) {
		return
	}

	//The URL carries ?v=<time>, so the browser can keep it until the next one
	res.set('Cache-Control', 'private, max-age=31536000, immutable')
	res.sendFile(thumbFile(req.params.id), (err) => {
		if (err && !res.headersSent) res.status(404).end()
	})
})

//Revision history: the list (no documents), one revision's document, and restoring one
router.get('/api/projects/:id/revisions', async (req, res) => {
	let id = req.params.id

	if (!validID(id)) {
		return res.status(400).json({error: 'Bad project id'})
	}

	let doc = await projects.findOne({_id: id}, {projection: {doc: 0}})

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	let list = await revisions.find({project: id}, {sort: {created: -1}, projection: {doc: 0}}).limit(revisionCap).toArray()
	res.json(list.map((r) => ({id: String(r._id), created: r.created, rev: r.rev, by: r.by, reason: r.reason, size: r.size})))
})

router.get('/api/projects/:id/revisions/:revID', async (req, res) => {
	let id = req.params.id

	if (!validID(id) || !validRevision(req.params.revID)) {
		return res.status(400).json({error: 'Bad id'})
	}

	let doc = await projects.findOne({_id: id}, {projection: {doc: 0}})

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	let r = await revisions.findOne({_id: req.params.revID, project: id})

	if (!r) {
		return res.status(404).json({error: 'No such revision'})
	}

	res.json({project: JSON.parse(r.doc), created: r.created, rev: r.rev})
})

router.post('/api/projects/:id/revisions/:revID/restore', async (req, res) => {
	let id = req.params.id

	if (!validID(id) || !validRevision(req.params.revID)) {
		return res.status(400).json({error: 'Bad id'})
	}

	let doc = await projects.findOne({_id: id})

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	let r = await revisions.findOne({_id: req.params.revID, project: id})

	if (!r) {
		return res.status(404).json({error: 'No such revision'})
	}

	//Whatever's there now goes into history first, so a restore can itself be undone
	let room = rooms.get(id)
	if (room) await persist(room)
	let current = room ? JSON.stringify(room.doc) : doc.doc,
		currentRev = room ? room.rev : doc.rev
	await snapshot(id, current, currentRev, whoIs(req), 'Before restore', true)

	let project = JSON.parse(r.doc),
		next = currentRev + 1

	//The restored copy keeps this project's id (a revision from before a rename still belongs here)
	project.id = id
	await projects.updateOne({_id: id}, {$set: {doc: JSON.stringify(project), rev: next, updated: new Date(), name: String(project.name || 'Untitled project').slice(0, 200)}})

	if (room) {
		room.doc = project
		room.rev = next
		room.dirty = false
		room.log = []
		broadcast(room, 'reset', {rev: next})
	}

	res.json({ok: true, rev: next})
})

//Share links: the project as one standalone HTML file (built by the editor), at /interactives/s/<token>.
//Anyone with the link can play it, no session (a link opened in a new tab can't carry one), so it's off until
//the owner turns it on, the token is unguessable, and turning it off deletes the file
router.get('/api/projects/:id/share', async (req, res) => {
	let doc = validID(req.params.id) && (await projects.findOne({_id: req.params.id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	res.json({share: doc.share || null})
})

router.put('/api/projects/:id/share', express.text({type: () => true, limit: '200mb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	if (typeof req.body !== 'string' || !req.body.includes('<html')) {
		return res.status(400).json({error: 'Not an HTML page'})
	}

	let token = doc.share?.token || crypto.randomBytes(18).toString('base64url'),
		share = {token, created: doc.share?.created || new Date(), updated: new Date(), by: whoIs(req)}

	await fs.promises.mkdir(path.dirname(shareFile(token)), {recursive: true})
	await fs.promises.writeFile(shareFile(token), req.body)
	await projects.updateOne({_id: id}, {$set: {share}})
	res.json({share})
})

router.delete('/api/projects/:id/share', async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.json({ok: true})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	if (doc.share?.token) await fs.promises.rm(shareFile(doc.share.token), {force: true})
	await projects.updateOne({_id: id}, {$unset: {share: ''}})
	res.json({ok: true})
})

//Component libraries. A project marked as a library (settings.library) publishes a versioned snapshot of its
//"Publish to library" artboards, styles and assets into the libraries collection (one document per library, _id is
//the project id). Other projects copy components out of it and are told when a newer version exists. The pure parts
//(snapshot, hash, access, version number) are in shared/library.mjs. Only the latest snapshot is kept, plus a short
//history of what each version held
const maxSnapshot = 12 * 1024 * 1024,

	libraryMeta = (doc, me) => ({
		id: doc._id,
		name: doc.name,
		owner: doc.owner || null,
		version: doc.version,
		updated: doc.updated,
		note: doc.note || '',
		mine: !!me?.username && doc.owner?.username === me.username,
		//Only the owner sees who it's shared with
		shared: !!me?.username && doc.owner?.username === me.username ? doc.shared || {everyone: false, users: []} : undefined,
		components: doc.components || [],
		internals: doc.internals || [],
		styles: doc.styles ? JSON.parse(doc.styles) : {colors: [], texts: []},
		history: (doc.history || []).slice(0, 10)
	}),

	//Loads a library the person may use, or answers for them. Same pattern as projectFor
	libraryFor = async (req, res, withSnapshot) => {
		let {id, assetId} = req.params

		if (!validID(id) || (assetId !== undefined && !validID(assetId))) {
			res.status(400).json({error: 'Bad id'})
			return null
		}

		let doc = await libraries.findOne({_id: id}, withSnapshot ? {} : {projection: {snapshot: 0}})

		if (!doc) {
			res.status(404).json({error: 'No such library'})
			return null
		}

		if (!library.mayUseLibrary(doc, whoIs(req), enforcing())) {
			console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: library not shared with them`)

			if (enforcing()) {
				res.status(403).json({error: 'That library is not shared with you'})
				return null
			}
		}

		return doc
	}

//Libraries I can use: my own, and the ones shared with me (or with everyone). No snapshots, those are a request each
router.get('/api/libraries', async (req, res) => {
	let me = whoIs(req),
		list = await libraries.find(library.accessFilter(me, enforcing()), {projection: {snapshot: 0}}).sort({updated: -1}).limit(500).toArray()

	res.json(list.map((doc) => libraryMeta(doc, me)))
})

//One library with its snapshot (artboards, variables, assets list, styles), for adding it or updating from it
router.get('/api/libraries/:id', async (req, res) => {
	let doc = await libraryFor(req, res, true)

	if (!doc) {
		return
	}

	res.json({library: libraryMeta(doc, whoIs(req)), snapshot: JSON.parse(doc.snapshot)})
})

//An asset of the latest snapshot. Asset ids are never reused for other bytes, so it caches for good
router.get('/api/libraries/:id/assets/:assetId', async (req, res) => {
	if (!await libraryFor(req, res)) {
		return
	}

	let file = path.join(libraryDir(req.params.id), req.params.assetId),
		meta

	try {
		meta = JSON.parse(await fs.promises.readFile(`${file}.json`, 'utf8'))
	}
	catch (e) {
		return res.status(404).json({error: 'No such asset'})
	}

	res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
	safety.assetHeaders(res, meta.mime)
	res.sendFile(file, (err) => {
		if (err && !res.headersSent) {
			res.status(404).json({error: 'No such asset'})
		}
	})
})

//Publish: snapshot the project as it is now (the live room has the newest) as the library's next version. The owner
//only, and the project has to be marked as a library. Nothing changed since the last version makes no new version
router.post('/api/projects/:id/library/publish', express.json({limit: '16kb'}), async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let id = req.params.id,
		full = await projects.findOne({_id: id}, {projection: {doc: 1}}),
		room = rooms.get(id),
		project = room ? room.doc : JSON.parse(full.doc)

	if (!project.settings?.library) {
		return res.status(400).json({error: 'Turn on "This project is a library" in the project settings first'})
	}

	let snap = library.buildSnapshot(project)

	if (!snap.components.length) {
		return res.status(400).json({error: 'No artboards are marked "Publish to library"'})
	}

	let existing = await libraries.findOne({_id: id}, {projection: {snapshot: 0}}),
		me = whoIs(req),
		now = new Date(),
		plan = library.planPublish(existing, snap, {note: req.body.note, by: me?.username || me?.name || null, now})

	if (plan.unchanged) {
		return res.json({ok: true, unchanged: true, version: plan.version, components: snap.components.length})
	}

	let text = JSON.stringify({...snap, version: plan.version, created: now})

	if (text.length > maxSnapshot) {
		return res.status(413).json({error: 'That library is too big to publish'})
	}

	//Assets first, so a snapshot never names a file that isn't there yet
	let dir = libraryDir(id),
		wanted = new Set(snap.assets.map((a) => a.id))

	await fs.promises.mkdir(dir, {recursive: true})

	for (let assetId of wanted) {
		if (!validID(assetId)) continue

		let from = assetFile(id, assetId),
			to = path.join(dir, assetId)

		if (fs.existsSync(from) && fs.existsSync(`${from}.json`)) {
			await fs.promises.copyFile(from, to, fs.constants.COPYFILE_FICLONE)
			await fs.promises.copyFile(`${from}.json`, `${to}.json`)
		}
	}

	//Files of assets this version doesn't use any more
	for (let name of await fs.promises.readdir(dir)) {
		if (!wanted.has(name.replace(/\.json$/, ''))) await fs.promises.rm(path.join(dir, name), {force: true})
	}

	await libraries.updateOne({_id: id}, {
		$set: {
			name: String(project.name || 'Untitled project').slice(0, 200),
			version: plan.version,
			hash: plan.hash,
			updated: now,
			note: typeof req.body.note === 'string' ? req.body.note.slice(0, 500) : '',
			components: snap.components,
			internals: snap.internals,
			styles: JSON.stringify(snap.styles),
			history: plan.history,

			//Stored as a string for the same reason as projects.doc
			snapshot: text
		},
		$setOnInsert: {owner: doc.owner || me, shared: {everyone: false, users: []}}
	}, {upsert: true})

	await projects.updateOne({_id: id}, {$set: {library: {version: plan.version, updated: now}}})
	res.json({ok: true, unchanged: false, version: plan.version, components: snap.components.length})
})

//Who else can use the library: everyone in the suite and/or named usernames. Owner only, and it has to be published
router.put('/api/projects/:id/library/share', express.json({limit: '16kb'}), async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let shared = library.cleanShare(req.body),
		result = await libraries.updateOne({_id: req.params.id}, {$set: {shared}})

	if (!result.matchedCount) {
		return res.status(409).json({error: 'Publish the library first'})
	}

	res.json({shared})
})

//The library's state for its own project: published or not, version, who it's shared with
router.get('/api/projects/:id/library', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let doc = await libraries.findOne({_id: req.params.id}, {projection: {snapshot: 0}})

	res.json({library: doc ? libraryMeta(doc, whoIs(req)) : null})
})

//Stop publishing. Projects that already copied components keep them, they just stop seeing updates
router.delete('/api/projects/:id/library', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	await libraries.deleteOne({_id: req.params.id})
	await fs.promises.rm(libraryDir(req.params.id), {recursive: true, force: true})
	await projects.updateOne({_id: req.params.id}, {$unset: {library: ''}})
	res.json({ok: true})
})

//Results of a learner who is playing a shared project: lti-analytics.interactives-user-data, one record per
//project + username + course (the unique index is in suite-libs/indexes.js). The learner is whoever the suite
//session says, never anything in the request. These sit outside /api on purpose: that is staff only, and the
//people playing a project are mostly students. The project comes from the share token, so a project only
//collects results while its share link is on. No session (dev, or a link opened outside StudyDesk) means nothing
//is kept here, and the player falls back to the learner's own browser
const learnerOf = (req) => {
	let me = whoIs(req)

	if (!me?.username) {
		return null
	}

	let activity = req.sessionData?.activity || {}

	return {
		username: String(me.username),
		userID: me.userID,
		name: me.name,
		course: String(activity.courseLabel || ''),
		courseLabel: activity.courseLabel,
		courseCode: activity.courseCode,
		lmsURL: activity.lmsURL
	}
}

//The project a share token belongs to, or a 404
const sharedProject = async (req, res) => {
	let token = req.params.token

	if (!/^[\w-]{16,64}$/.test(token)) {
		res.status(404).json({error: 'No such shared project'})
		return null
	}

	let doc = await projects.findOne({'share.token': token}, {projection: {doc: 0}})

	if (!doc) {
		res.status(404).json({error: 'This share link has been turned off, or never existed'})
		return null
	}

	return doc
}

//Two first saves at once both try to insert, the unique index lets one win and the other goes again as an update
const saveRecord = async (key, build) => {
	for (let tries = 0; ; tries++) {
		let existing = await userData.findOne(key)

		try {
			await userData.updateOne(key, {$set: build(existing), $setOnInsert: {created: new Date()}}, {upsert: true})
			return
		}
		catch (e) {
			if (e.code !== 11000 || tries > 2) {
				throw e
			}
		}
	}
}

router.use('/learn', cacheHeaders.api, sessionCheck())

router.get('/learn/:token/progress', async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let doc = await userData.findOne({project: project._id, username: who.username, course: who.course})

	res.json({available: true, progress: learner.progressOut(doc)})
})

router.put('/learn/:token/progress', express.json({limit: '100kb'}), async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let clean = learner.cleanProgress(req.body)

	if (!clean) {
		return res.status(400).json({error: 'That progress is not the right shape'})
	}

	await saveRecord({project: project._id, username: who.username, course: who.course}, (existing) => learner.progressUpdate(existing, clean, who, new Date()))
	res.json({available: true, ok: true})
})

router.post('/learn/:token/report', express.json({limit: '16kb'}), async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let result = learner.cleanResult(req.body)

	if (!result) {
		return res.status(400).json({error: 'That result is not the right shape'})
	}

	await saveRecord({project: project._id, username: who.username, course: who.course}, (existing) => learner.reportUpdate(existing, result, who, new Date()))
	res.json({available: true, ok: true})
})

//The learner page for a share link: the shared project in its sandbox, framed by a small page that does have
//the session. The project asks it (postMessage) to load, save and report for the learner, and it passes that on to
//the routes above with the session id, so the sandboxed project never sees a session itself. Embed this in
//StudyDesk instead of /s/<token> to collect results. The session id comes from the url or sessionStorage the way
//utilities.js finds it, but is added here directly so the page has nothing to load from the suite's host root
const learnerPage = (token, base, nonce, project) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interactives</title>
<style>html,body{margin:0;height:100%;background:#111}iframe{border:0;display:block;width:100%;height:100%}</style>
</head>
<body>
<iframe id="project" src="${base}/s/${token}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" allow="fullscreen" title="Interactive"></iframe>
<script src="/utilities.js"></script>
<script nonce="${nonce}">
(function () {
	var token = ${JSON.stringify(token)}, base = ${JSON.stringify(base)}, frame = document.getElementById('project'), sessionID = null
	try {
		sessionID = new URLSearchParams(location.search).get('sessionID') || sessionStorage.getItem('sessionID')
		if (sessionID && sessionID !== 'null') sessionStorage.setItem('sessionID', sessionID)
	}
	catch (e) {
	}
	var answer = function (m, reply) {
		if (m.rid) frame.contentWindow.postMessage(Object.assign({target: 'interactives', type: 'progress', rid: m.rid}, reply), '*')
	}
	//One request at a time, so a save and a report that leave together can't both try to make the learner's first record
	var chain = Promise.resolve()
	var call = function (method, path, body) {
		var headers = {'Content-Type': 'application/json'}
		if (sessionID && sessionID !== 'null') headers['X-Session-ID'] = sessionID
		var run = function () {
			return fetch(base + '/learn/' + token + '/' + path, {method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive: body !== undefined}).then(function (r) {
				return r.ok ? r.json() : {available: false}
			})
		}
		var done = chain.then(run, run)
		chain = done.catch(function () {
		})
		return done
	}
	//What the learner does, for the project's Insights: the project says it (postMessage), and it goes into the suite's
	//analytics the way every toolbox app's does (reportAnalytics, si-manager's utilities.js), as a lean row with the
	//usual user and course fields. The project is whatever this page was made for, whatever the record claims. Nothing
	//is sent without a signed-in StudyDesk user, and utilities.js drops it in a preview
	var cleanRecord = ${records.cleanRecord.toString()}
	var rowFor = ${records.rowFor.toString()}
	var project = ${JSON.stringify(project)}, run = Math.random().toString(36).slice(2) + Date.now().toString(36), queue = [], taken = 0, known = false, timer = null
	var flushRecords = function () {
		timer = null
		if (!known || typeof reportAnalytics !== 'function') return
		while (queue.length) reportAnalytics.apply(null, rowFor(project, run, queue.shift()))
	}
	var takeRecord = function (raw) {
		var rec = cleanRecord(raw)
		if (!rec || taken >= 600) return
		taken++
		queue.push(rec)
		if (known && !timer) timer = setTimeout(flushRecords, 1500)
	}
	if (typeof fetchActivity === 'function') {
		window.m = window.m || {}
		window.m.app = 'Interactives'
		fetchActivity(function (err, data) {
			if (err || !data || !data.user || !data.user.username) return
			window.m.user = data.user
			window.m.activity = data.activity || {}
			known = true
			if (queue.length && !timer) timer = setTimeout(flushRecords, 300)
		})
	}
	window.addEventListener('message', function (e) {
		if (e.source !== frame.contentWindow) return
		var m = e.data
		if (m && m.source === 'interactives-record') return takeRecord(m.record)
		if (!m || m.source !== 'interactives-progress') return
		var failed = function () {
			answer(m, {ok: false, available: false})
		}
		if (m.op === 'load') {
			call('GET', 'progress').then(function (j) {
				answer(m, {ok: true, available: !!j.available, data: j.progress || null})
			}, failed)
		}
		else if (m.op === 'save') {
			call('PUT', 'progress', m.data).then(function (j) {
				answer(m, {ok: true, available: !!j.available})
			}, failed)
		}
		else if (m.op === 'report') {
			call('POST', 'report', {result: m.result}).catch(function () {
			})

			//The page around this one can hear results too
			if (window.parent !== window) window.parent.postMessage({source: 'interactives', name: 'result', payload: m.result}, '*')
		}
	})
})()
</script>
</body>
</html>
`

router.get('/play/:token', cacheHeaders.api, async (req, res) => {
	let token = req.params.token

	if (!/^[\w-]{16,64}$/.test(token) || !fs.existsSync(shareFile(token))) {
		return res.status(404).send('This share link has been turned off, or never existed')
	}

	//The project the link is for, so the records its learners make are filed under it
	let project = await projects.findOne({'share.token': token}, {projection: {_id: 1}})

	if (!project) {
		return res.status(404).send('This share link has been turned off, or never existed')
	}

	let nonce = crypto.randomBytes(16).toString('base64')

	//Its own script, the suite's utilities.js from this host (script-src 'self') and its own api and the suite's
	//analytics (connect-src 'self'), and the project in its sandbox as the one frame. It can be framed by StudyDesk
	res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}' 'self'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'`)
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('Referrer-Policy', 'no-referrer')
	res.setHeader('X-Robots-Tag', 'noindex')
	res.type('html').send(learnerPage(token, req.baseUrl, nonce, project._id))
})

//What the project's learners have done, for its owner (this is under /api, which is staff). Counts and averages
//of the records, and the most recently active people
router.get('/api/projects/:id/results', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let rows = await userData.find({project: doc._id}, {projection: {variables: 0}}).sort({updated: -1}).limit(5000).toArray()

	res.json({...learner.summarise(rows), truncated: rows.length >= 5000, shared: !!doc.share?.token})
})

//What learners did in the project (the records its learner page sent to the suite's analytics), as counts: artboard
//views, clicks, steps, question answers and named records, for its owner. Totals and numbers of different learners
//only, nobody is listed. ?days= is 7, 30 (the default), 90, 365 or 0 for all of it
router.get('/api/projects/:id/insights', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let asked = Number(req.query.days),
		days = [0, 7, 30, 90, 365].includes(asked) ? asked : 30,
		filter = {app: records.APP, featureID: doc._id}

	if (days) {
		filter.timestamp = {$gte: Date.now() - days * 24 * 60 * 60 * 1000}
	}

	let rows = await ingest.find(filter, {projection: {feature: 1, timestamp: 1, 'meta.user.username': 1, 'meta.activity.courseLabel': 1, 'meta.run': 1, 'meta.rec': 1}}).sort({timestamp: -1}).limit(records.MAX_ROWS).toArray()

	res.json({...records.insights(rows, {truncated: rows.length >= records.MAX_ROWS}), days, shared: !!doc.share?.token})
})

//Start the results afresh (a test run that left records behind, or a new intake)
router.delete('/api/projects/:id/results', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let result = await userData.deleteMany({project: doc._id})

	res.json({ok: true, deleted: result.deletedCount})
})

router.use('/api', (req, res) => {
	res.status(404).json({error: 'No such api route'})
})

//Express 5 passes async throws to here, keep them off the user's screen
router.use('/api', (err, req, res, next) => {
	console.trace(`${appName} api error`, err)

	if (res.headersSent) {
		return next(err)
	}

	res.status(err.status || 500).json({error: err.type === 'entity.too.large' ? 'That is too big to save' : 'Something went wrong on the server'})
})

//A shared project. Tokens are base64url only, so the path can't climb out of storage/shares
router.get('/s/:token', cacheHeaders.api, (req, res) => {
	if (!/^[\w-]{16,64}$/.test(req.params.token)) {
		return res.status(404).send('No such shared project')
	}

	//A shared page is somebody's project with its own scripts, so it runs sandboxed: no cookies, no api, no editor
	safety.shareHeaders(res)

	res.sendFile(shareFile(req.params.token), {headers: {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex'}}, (err) => {
		if (err && !res.headersSent) res.status(404).send('This share link has been turned off, or never existed')
	})
})

//The document. no-cache, it's what hands out everyone else's stamps
router.get(['/', '/index.html'], cacheHeaders.document, (req, res) => {
	res.type('html').send(indexHTML())
})

//Vite's output is content hashed, so those files can be cached hard. Everything else goes through the suite's rules
router.use('/assets', express.static(`${__dirname}/dist/assets`, {immutable: true, maxAge: '1y'}))
router.use(express.static(`${__dirname}/dist`, cacheHeaders.staticOptions))

//The editor routes in the browser (#/project/<id>), so anything else really is a 404
app.use(`/${appName}`, router)

//pm2 restarts send SIGINT/SIGTERM: get open rooms into mongo first
for (let sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, async () => {
		await Promise.all([...rooms.values()].map(persist))
		process.exit(0)
	})
}

//Mongo indexes live in suite-libs/indexes.js. The list query wants owner.username + updated, see the README
client.connect()
	.then(() => {
		analyticsDB = client.db('lti-analytics')
		db = client.db('lti-interactives')
		projects = db.collection('projects')
		revisions = db.collection('revisions')
		prefs = db.collection('prefs')
		libraries = db.collection('libraries')
		userData = analyticsDB.collection('interactives-user-data')
		ingest = analyticsDB.collection('ingest')
		fs.mkdirSync(storageDir, {recursive: true})

		require('../suite-libs/version-reporting')(analyticsDB, appName, version)

		return Promise.all([import('./shared/ops.mjs'), import('./shared/library.mjs'), import('./shared/safety.mjs'), import('./shared/learner.mjs'), import('./shared/records.mjs')])
	})
	.then(([opsMod, libraryMod, safetyMod, learnerMod, recordsMod]) => {
		ops = opsMod
		library = libraryMod
		safety = safetyMod
		learner = learnerMod
		records = recordsMod
		cacheHeaders.watchEpoch()

		app.listen(port, (err) => {
			//Express 5 hands a failed bind to this callback instead of throwing
			if (err) {
				console.error(`${appName} could not listen on port ${port}:`, err.message)
				process.exit(1)
			}

			console.log(`${appName} started on port: ${port} - Date: ${new Date()}`)
		})
	})
	.catch((err) => {
		console.trace(`${appName} failed to start (could not connect to mongo) - Date: ${new Date()}`, err)
	})
