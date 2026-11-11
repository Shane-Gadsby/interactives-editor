require('../suite-libs/crash-guard')
let port = Number(process.env.PORT) || 3048,
	//What version-reporting and /health say, from package.json so it can't sit at 0.1.0 again
	version = require('./package.json').version,
	appName = 'interactives',
	express = require('express'),
	fs = require('fs'),
	app = express(),
	mongoConnect = require('../suite-libs/mongo-connect'),
	client = mongoConnect(),
	cacheHeaders = require('../suite-libs/cache-headers'),
	precompressed = require('./precompressed'),
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
	designerTokens,
	libraries,
	templates,
	userData,
	activityData,
	sharedRows,
	sharedHidden,
	roomMessages,
	courseRows,
	userLookup,
	ingest,
	commentRows,
	commentNotices,
	docChunks,
	projectsBin,
	auditLog,

	//A whole-document save. Documents too big for one mongo record are split (shared/docstore.mjs), so this is
	//the real ceiling now
	saveLimit = '64mb',

	//Revision ids are strings (time first, so they sort), keeps mongodb's ObjectId out of this app's requires
	revisionID = () => `${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`,
	validRevision = (id) => typeof id === 'string' && /^[a-z0-9]{12,30}$/.test(id)

//Live editing. One room per open project: the document in memory, the op log, and everyone connected over SSE.
//The shared op code is an ES module (the browser uses the same file), so it comes in through import()
let ops = null,
	library = null,
	template = null,
	safety = null,
	learner = null,
	marker = null,
	notesLib = null,
	markLimiter = null,
	records = null,
	media = null,
	commentLib = null,
	responses = null,
	roomsLib = null,
	courseLib = null,
	sharedLimits = {},
	courseLimits = {},
	store = null
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

	//Pinned revisions (named versions) are kept whatever their age, up to pinCap a project; the prune skips them
	pinCap = 20,
	cleanRevisionName = (v) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) || null : null,

	snapshot = async (projectID, docString, rev, by, reason, force, extra = {}) => {
		let last = lastRevision.get(projectID)

		if (!force && last === undefined) {
			let newest = await revisions.findOne({project: projectID}, {sort: {created: -1}, projection: {created: 1}})
			last = newest ? newest.created.getTime() : 0
		}

		if (!force && Date.now() - last < revisionEvery) return

		lastRevision.set(projectID, Date.now())
		let revID = revisionID(),
			fields = await store.put(projectID, `r:${revID}`, docString)
		await revisions.insertOne({_id: revID, project: projectID, created: new Date(), rev, by: by || null, reason: reason || 'Autosave', size: docString.length, ...extra, ...fields})
			.catch(async (err) => {
				await store.drop(fields.docChunks)
				throw err
			})

		//Keep the newest revisionCap
		let old = await revisions.find({project: projectID, pinned: {$ne: true}}, {sort: {created: -1}, skip: revisionCap, projection: {_id: 1, docChunks: 1}}).toArray()
		if (old.length) {
			await revisions.deleteMany({_id: {$in: old.map((r) => r._id)}})
			for (let r of old) await store.drop(r.docChunks)
		}
		return revID
	},

	//Writes a project's document through the doc store (parts for one too big for its row). write(fields) does the
	//actual insert or update with those fields in its $set and says whether the row took them. Then the parts the row
	//no longer points at go: the old set when it moved, the new set when it didn't. Throws what the write threw
	storeProjectDoc = async (id, rev, str, oldRef, write) => {
		let fields = await store.put(id, `p:${id}:${rev}`, str),
			moved = false
		try {
			moved = await write(fields)
		} finally {
			let stale = moved ? oldRef : fields.docChunks
			if (stale && stale.key !== (moved ? fields.docChunks?.key : null)) {
				await store.drop(stale).catch((err) => console.trace(`${appName}: dropping old parts of ${id} failed`, err))
			}
		}
		return {fields, moved}
	},

	//What a failed save says. Mongo's own record limit is the one people actually hit (a project with big inline data),
	//and it used to come back as "saved somewhere else"
	tooBig = (err) => err?.code === 10334 || err?.code === 17419 || /too large|BSONObj size|object to insert too large/i.test(err?.message || ''),
	saveFailure = (err) => tooBig(err)
		? {status: 413, error: 'This project is too big to save. Large pictures or data pasted into layers are the usual cause: move them into the Assets panel'}
		: {status: 500, error: `The server could not save this project (${String(err?.message || err).slice(0, 120)})`},

	//Writes the room's document back to mongo, bumping rev so plain (non-live) saves still see conflicts. A failure
	//keeps the room dirty, tries again (2 s, 4 s... up to a minute) and tells everyone in the room, since their editors
	//said "Saved" the moment the server took their ops
	//One save at a time per room: two overlapping could finish in the wrong order and leave the row on the older copy
	persist = async (room) => {
		while (room.persisting) await room.persisting
		if (!room.dirty || room.deleted) return
		let done
		room.persisting = new Promise((r) => (done = r))
		try {
			await persistNow(room)
		} finally {
			room.persisting = null
			done()
		}
	},

	persistNow = async (room) => {
		room.dirty = false
		room.dirtySince = 0
		clearTimeout(room.saveTimer)
		room.rev++
		let p = room.doc, first = p.artboards?.[0], str = JSON.stringify(p), rev = room.rev
		let agents = room.agentEdits?.size ? [...room.agentEdits] : null
		snapshot(room.id, str, rev, null, agents ? `Autosave (edited with ${agents.join(', ')})` : 'Autosave', false, agents ? {agents} : {})
			.then((revID) => revID && agents && agents.forEach((a) => room.agentEdits.delete(a)))
			.catch((err) => console.trace(`${appName}: revision of ${room.id} failed`, err))
		try {
			let {fields} = await storeProjectDoc(room.id, rev, str, room.docChunks, async (fields) => {
				await projects.updateOne({_id: room.id}, {$set: {
					name: String(p.name || 'Untitled project').slice(0, 200),
					updated: new Date(),
					...fields,
					rev,
					meta: {
						artboards: p.artboards?.length || 0,
						library: !!p.settings?.library,
						preview: first ? {width: first.width, height: first.height, background: first.background?.type === 'solid' ? first.background.color : '#ffffff'} : null
					}
				}})
				return true
			})
			room.docChunks = fields.docChunks
			if (room.storeFailed) {
				room.storeFailed = false
				room.storeRetry = 0
				broadcast(room, 'stored', {ok: true})
			}
		} catch (err) {
			if (room.deleted) return
			room.dirty = true
			room.dirtySince ||= Date.now()
			console.trace(`${appName}: live save of ${room.id} failed`, err)
			room.storeFailed = true
			room.storeError = saveFailure(err).error
			room.storeRetry = Math.min(60000, (room.storeRetry || 1000) * 2)
			broadcast(room, 'stored', {ok: false, error: room.storeError})
			clearTimeout(room.saveTimer)
			room.saveTimer = setTimeout(() => persist(room), room.storeRetry)
		}
	},

	//After an op: save a second after the last one, but never more than liveSaveMax after the first unsaved one, so a
	//room that never goes quiet still reaches mongo
	liveSaveMax = 10 * 1000,
	scheduleSave = (room) => {
		room.dirty = true
		room.dirtySince ||= Date.now()
		if (room.storeFailed) return
		clearTimeout(room.saveTimer)
		room.saveTimer = setTimeout(() => persist(room), Math.max(0, Math.min(1000, room.dirtySince + liveSaveMax - Date.now())))
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
		let parsed = await store.parse(doc)
		if (rooms.has(id)) return rooms.get(id)
		room = {id, doc: parsed, docChunks: doc.docChunks || null, owner: doc.owner || null, rev: doc.rev || 0, seq: 0, log: [], clients: new Set(), dirty: false, dirtySince: 0, saveTimer: null, closeTimer: null, nextColor: 0}
		rooms.set(id, room)
		return room
	},

	//A room keeps agent edits and live ops for up to a second before they reach mongo, and rev only moves when they do.
	//Anything that reads or checks the rev of a project (loading it, a whole-document save, the stale check) lets a dirty
	//room write first, or a tab without live sync would be handed (or checked against) a rev that's about to go stale
	settleRoom = async (id) => {
		let room = rooms.get(id)

		if (room?.dirty && !room.deleted && !room.storeFailed) {
			await persist(room)
		}
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

	//Who may publish, mark and withdraw a brand kit: power users, plus anyone in the si-admin group named by INTERACTIVES_BRAND_GROUP
	//(nobody extra when it isn't set). A brand kit is the one place a library locks what projects take from it
	canMarkBrand = (req) => library.mayMarkBrand(req.sessionData?.access, isPower(req), process.env.INTERACTIVES_BRAND_GROUP),

	//Your own projects only (or ones you've been invited to collaborate on), unless you're a power user. ownerOnly is
	//for the things only the owner does: deleting the project, changing who collaborates. Logs instead of refusing
	//until the box enforces sessions, same as session-check
	//The owner, a power user, or anyone at all for a project with no owner (dev). No logging, no reply: for working out
	//what to offer, mayChange is still the check
	ownsOrPower = (req, doc) => {
		let me = whoIs(req)
		return !doc?.owner?.username || !!(me && (me.username === doc.owner.username || isPower(req)))
	},

	mayChange = (req, res, doc, {ownerOnly = false} = {}) => {
		if (ownsOrPower(req, doc)) {
			return true
		}

		let me = whoIs(req)

		if (!ownerOnly && me?.username && Array.isArray(doc.collaborators) && doc.collaborators.some((c) => c.username === me.username)) {
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
		collaborators: Array.isArray(doc.collaborators) ? doc.collaborators : [],
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
	//The page an update replaced, kept for one-click revert. Tokens are [\w-] only, so /s/<token> can never reach it
	sharePrevFile = (token) => path.join(storageDir, 'shares', `${token}.prev.html`),
	thumbFile = (projectID) => path.join(storageDir, 'thumbs', `${projectID}.jpg`),
	assetFile = (projectID, assetID) => path.join(storageDir, projectID, assetID),

	//A published library keeps its own copy of the assets its snapshot uses, so the snapshot doesn't change under
	//people when the library project edits or deletes an asset. Library ids are project ids, so validID covers them too
	libraryDir = (libraryID) => path.join(storageDir, '_libraries', libraryID),

	//A deleted project's files while it's in the bin: its asset folder as files/, its share page and its thumbnail
	binDir = (projectID) => path.join(storageDir, '_bin', projectID),
	binDays = 30,

	//Same for a saved template: its own copy of the files (and its thumbnail, thumb.jpg, a name no asset id can have)
	templateDir = (templateID) => path.join(storageDir, '_templates', templateID),

	//Smaller copies of an image asset (the editor's canvas proxy, the optimised output for a share or export), as
	//_variants/<assetID>.<key> with a .json sidecar like the asset's. Asset ids can't start with _ or hold a dot, so
	//nothing here can be mistaken for an asset
	variantDir = (projectID) => path.join(storageDir, projectID, '_variants'),
	variantFile = (projectID, assetID, key) => path.join(variantDir(projectID), `${assetID}.${key}`),
	validVariantKey = (key) => typeof key === 'string' && /^[a-z0-9-]{1,40}$/.test(key),
	maxVariants = 8,

	removeVariants = async (projectID, assetID) => {
		let names = []

		try {
			names = await fs.promises.readdir(variantDir(projectID))
		}
		catch (e) {
			return
		}

		for (let name of names.filter((n) => n.startsWith(`${assetID}.`))) {
			await fs.promises.rm(path.join(variantDir(projectID), name), {force: true})
		}
	},

	removeAssets = async (projectID, assetID) => {
		if (assetID) {
			await fs.promises.rm(assetFile(projectID, assetID), {force: true})
			await fs.promises.rm(`${assetFile(projectID, assetID)}.json`, {force: true})
			await removeVariants(projectID, assetID)
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

//For a load balancer, pm2 or a person checking the box: can it reach mongo and write its storage folder. No session
//needed and nothing about anyone's projects, just yes/no and counts. 503 when either check fails
const started = Date.now()
router.get('/health', cacheHeaders.api, async (req, res) => {
	let check = async (fn) => {
		let t = Date.now()
		try {
			await Promise.race([fn(), new Promise((_, no) => setTimeout(() => no(new Error('timed out')), 3000).unref())])
			return {ok: true, ms: Date.now() - t}
		} catch (err) {
			return {ok: false, ms: Date.now() - t, error: String(err?.message || err).slice(0, 80)}
		}
	}
	let mongo = await check(() => projects.findOne({_id: '__health'}, {projection: {_id: 1}})),
		storage = await check(async () => {
			let probe = path.join(storageDir, `.health-${process.pid}`)
			await fs.promises.writeFile(probe, 'ok')
			await fs.promises.rm(probe, {force: true})
		}),
		ok = mongo.ok && storage.ok

	res.status(ok ? 200 : 503).json({ok, app: appName, version, uptime: Math.round((Date.now() - started) / 1000), mongo, storage, rooms: rooms.size, mcp: !mcpOff()})
})

router.use(cacheHeaders.stampGate)

//Every api route: never cached, staff session wanted (log only until SUITE_SESSION_ENFORCE=1)
router.use('/api', cacheHeaders.api, sessionCheck({staff: true, tool: 'interactives'}))

//The Spelling test's synthesised voice: the word in, a wav out, for the author to save as a sound asset (voice.js)
const voice = require('./voice')({express, storageDir})
router.use('/api/voice', voice.router)

//Google Fonts, kept here: the css and files are fetched from Google once and served from storage/_fonts after that, so nobody's browser
//calls Google for a font (fonts-proxy.js says how it is held in check). INTERACTIVES_FONTS_PROXY=off turns it off
const fontsProxy = require('./fonts-proxy')({express, storageDir})
router.use('/fonts', fontsProxy.router)
fontsProxy.prewarm()

//Each person's editor preferences (theme, wheel, default font...), kept per user rather than per browser. Keyed
//by username, so it's an _id lookup and needs no index. No session (dev) means one shared "guest" set
const PREF_KEYS = {wheel: ['zoom', 'ctrl'], theme: ['dark', 'light', 'auto'], codeTheme: ['follow', 'light', 'dark'], tooltips: 'boolean', rulers: 'boolean', showGrid: 'boolean', attachGuides: 'boolean', snapGrid: 'boolean', snapOn: 'boolean', snapArtboard: 'boolean', snapLayers: 'boolean', snapLayersAll: 'boolean', snapGuides: 'boolean', snapSpacing: 'boolean', snapPixels: 'boolean', snapPoints: 'boolean', snapDistance: {min: 2, max: 24}, gridSize: {min: 1, max: 512}, gridSubdivisions: {min: 1, max: 32}, accessibility: 'boolean', screenReader: 'boolean', defaultFont: 'string', commentNotices: 'boolean', ghostOutside: 'boolean', showNotes: 'boolean', askPictureDescription: 'boolean', technicalWording: 'boolean', showNewInteractions: 'boolean', altDragHintAlways: 'boolean', gettingStarted: 'boolean', timelineList: 'boolean', timelineFoldEmpty: 'boolean', timelineHideSound: 'boolean', timelineHideCaptions: 'boolean', timelineHideDescriptions: 'boolean', singleKeys: 'boolean', tutorialBadges: 'boolean', tutorialSound: 'boolean', keymapPreset: ['default', 'illustration']},
	cleanKeymap = (m) => Object.fromEntries(
		Object.entries(m)
			.filter(([k, v]) => /^[a-z][a-z0-9.-]{0,59}$/i.test(k) && Array.isArray(v))
			.map(([k, v]) => [k, v.filter((c) => typeof c === 'string' && c.length > 0 && c.length <= 24 && /^[A-Za-z0-9+,./\\[\]';=`-]+$/.test(c)).slice(0, 4)])
			.slice(0, 600)
	),
	cleanPrefs = (p) => {
		let out = {}
		for (let [k, rule] of Object.entries(PREF_KEYS)) {
			let v = p?.[k]
			if (rule?.min !== undefined) {
				//A whole number inside the range
				if (Number.isInteger(v) && v >= rule.min && v <= rule.max) out[k] = v
			}
			else if (Array.isArray(rule) ? rule.includes(v) : rule === 'string' ? typeof v === 'string' && v.length < 120 : typeof v === rule) out[k] = v
		}
		//Which inspector sections are folded or opened, against each section's own default. An object of short keys to
		//booleans, kept to 300 entries, and anything that isn't a short key with a true/false is dropped
		if (p?.sectionFolds && typeof p.sectionFolds === 'object' && !Array.isArray(p.sectionFolds)) {
			out.sectionFolds = Object.fromEntries(
				Object.entries(p.sectionFolds)
					.filter(([k, v]) => k.length > 0 && k.length <= 60 && k !== '__proto__' && typeof v === 'boolean')
					.slice(0, 300)
			)
		}
		//The order the person put inspector sections (by panel kind) and tool rail groups and tools in. Short keys to short
		//lists of short, different keys: at most 60 places, 80 keys in each, and anything else is dropped
		for (let name of ['sectionOrder', 'toolOrder']) {
			if (p?.[name] && typeof p[name] === 'object' && !Array.isArray(p[name])) {
				out[name] = Object.fromEntries(
					Object.entries(p[name])
						.filter(([k, v]) => k.length > 0 && k.length <= 60 && k !== '__proto__' && Array.isArray(v))
						.map(([k, v]) => [k, [...new Set(v.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 80))].slice(0, 80)])
						.filter(([, v]) => v.length)
						.slice(0, 60)
				)
			}
		}
		//The person's own keyboard shortcuts: command id to a short list of key combos (lib/keymap.ts). Ids and combos are
		//plain short strings, at most 600 commands with 4 combos each (the registry has about 250: every panel, tool and action can take a key), and anything else is dropped
		if (p?.keymap && typeof p.keymap === 'object' && !Array.isArray(p.keymap)) out.keymap = cleanKeymap(p.keymap)
		//Keyboard shortcut sets saved under a name (lib/keymap-sets.ts): an id, a name, which built-in set they start from and
		//the keys changed on top (same rule as keymap). At most 16, none bigger than 10 KB, ids all different. keymapActive is
		//the id of the one the keys in use belong to
		if (Array.isArray(p?.keymapSets)) {
			let seen = new Set()
			out.keymapSets = p.keymapSets
				.filter((s) => s && typeof s === 'object' && !Array.isArray(s) && typeof s.id === 'string' && /^[\w-]{1,40}$/.test(s.id) && typeof s.name === 'string' && s.name.trim().length > 0 && s.name.length <= 60 && ['default', 'illustration'].includes(s.base) && s.keys && typeof s.keys === 'object' && !Array.isArray(s.keys))
				.filter((s) => !seen.has(s.id) && seen.add(s.id))
				.map((s) => ({id: s.id, name: s.name.trim(), base: s.base, keys: cleanKeymap(s.keys)}))
				.filter((s) => JSON.stringify(s).length <= 10000)
				.slice(0, 16)
		}
		if (typeof p?.keymapActive === 'string' && /^[\w-]{1,40}$/.test(p.keymapActive)) out.keymapActive = p.keymapActive
		//What the first-run screen and the Getting started strip remember (which jobs are ticked, whether it was put away).
		//Short keys to booleans, at most 40, same rule as the folds
		if (p?.onboarding && typeof p.onboarding === 'object' && !Array.isArray(p.onboarding)) {
			out.onboarding = Object.fromEntries(
				Object.entries(p.onboarding)
					.filter(([k, v]) => k.length > 0 && k.length <= 40 && k !== '__proto__' && typeof v === 'boolean')
					.slice(0, 40)
			)
		}
		//How far the person is through the tutorials: help topic id to the step numbers ticked and, once finished, when.
		//At most 120 tutorials, 40 steps each, ids short plain keys, and anything else is dropped
		if (p?.tutorialProgress && typeof p.tutorialProgress === 'object' && !Array.isArray(p.tutorialProgress)) {
			out.tutorialProgress = Object.fromEntries(
				Object.entries(p.tutorialProgress)
					.filter(([k, v]) => /^[a-z0-9-]{1,60}$/.test(k) && v && typeof v === 'object' && !Array.isArray(v))
					.map(([k, v]) => {
						let e = {}
						if (Array.isArray(v.steps)) {
							let steps = [...new Set(v.steps.filter((n) => Number.isInteger(n) && n >= 1 && n <= 99))].sort((a, b) => a - b).slice(0, 40)
							if (steps.length) e.steps = steps
						}
						if (Number.isInteger(v.done) && v.done > 0 && v.done < 8.64e15) e.done = v.done
						return [k, e]
					})
					.filter(([, e]) => e.steps || e.done)
					.slice(0, 120)
			)
		}
		//Saved workspaces (panel layouts under a name). The editor checks the layout inside each one itself, so here
		//it's only the shape and the size: at most 12, each with an id and a name and no bigger than 8 KB
		if (Array.isArray(p?.workspaces)) {
			out.workspaces = p.workspaces
				.filter((w) => w && typeof w === 'object' && !Array.isArray(w) && typeof w.id === 'string' && w.id.length <= 40 && typeof w.name === 'string' && w.name.length <= 60)
				.filter((w) => JSON.stringify(w).length <= 8000)
				.slice(-12)
		}
		return out
	}

router.get('/api/prefs', async (req, res) => {
	let user = whoIs(req)?.username || 'guest',
		doc = await prefs.findOne({_id: user})
	res.json({user, prefs: doc?.prefs || {}})
})

router.put('/api/prefs', express.json({limit: '512kb'}), async (req, res) => {
	let user = whoIs(req)?.username || 'guest',
		clean = cleanPrefs(req.body.prefs)
	await prefs.updateOne({_id: user}, {$set: {prefs: clean, updated: new Date()}}, {upsert: true})
	res.json({user, prefs: clean})
})

//Ask the Activity Designer: a Cogniti agent that builds in the open project (designer.js, and the /api/designer routes
//further down by the MCP ones). COGNITI_TOKEN is the one secret, an api token from a Cogniti account (its API tokens
//page; whoever holds that account grants it). Without one, or with INTERACTIVES_DESIGNER=off, the button isn't shown
const designer = require('./designer')

//Who the editor's talking to, for the projects list and the owner badge
router.get('/api/session', (req, res) => {
	res.json({user: whoIs(req), power: isPower(req), brand: canMarkBrand(req), designer: designer.settings().on})
})

//The projects list, mine only (owned or invited to). ?all=1 gets everyone's, but only for power users (god mode),
//and admins don't get it without asking. With no session at all it used to be everything until the box enforced
//sessions, which on test meant anyone whose session didn't come through saw every project. Then it was the ones
//nobody owns, which on prod turned out to be every beta tester's Guest project from before direct sign in, handed
//to anyone whose session didn't arrive. So that's dev only now (no si-manager there, so nobody owns anything),
//and everywhere else no session is an empty list
router.get('/api/projects', async (req, res) => {
	let me = whoIs(req),
		guests = !['testing', 'production'].includes(process.env.NODE_ENV),
		filter = req.query.all === '1' && isPower(req) ? {} : me?.username ? {$or: [{'owner.username': me.username}, {'collaborators.username': me.username}]} : guests ? {'owner.username': null} : {_id: null},
		list = await projects.find(filter, {projection: {doc: 0}}).sort({updated: -1}).limit(1000).toArray(),
		open = new Map()

	//Open review comments per project, for the cards. A hiccup here must not take the list down with it
	try {
		let rows = await commentRows.find({project: {$in: list.map((d) => d._id)}, root: true, status: 'open'}, {projection: {project: 1, assignee: 1}}).toArray()

		for (let r of rows) {
			let have = open.get(r.project) || {open: 0, assigned: 0}

			have.open++

			if (me?.username && r.assignee?.username === me.username) {
				have.assigned++
			}

			open.set(r.project, have)
		}
	}
	catch (err) {
		console.trace(`${appName}: comment counts failed`, err)
	}

	res.json(list.map((d) => ({...metaOf(d), openComments: open.get(d._id)?.open || 0, assignedComments: open.get(d._id)?.assigned || 0})))
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

	//A live room has newer content than mongo until its next save. Let it save first so the rev we hand out is the one
	//the next save will be checked against (an editor with live sync off isn't in the room, and an AI agent may be)
	await settleRoom(req.params.id)

	let room = rooms.get(req.params.id)
	res.json({project: room ? room.doc : await store.parse(doc), rev: room ? room.rev : doc.rev, owner: doc.owner || null, live: room ? room.seq : null, collaborators: (doc.collaborators || []).length})
})

//Just the rev, for an editor that has live sync off to ask now and then (when its tab comes back into view) whether the
//project was changed somewhere else, an AI agent or another tab, without downloading the document
router.get('/api/projects/:id/rev', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	await settleRoom(req.params.id)

	let room = rooms.get(req.params.id),
		now = room ? room.rev : (await projects.findOne({_id: req.params.id}, {projection: {rev: 1}}))?.rev

	res.json({rev: now ?? doc.rev})
})

//Save. The editor sends the rev it loaded, and a mismatch means someone else saved in between,
//so it gets a 409 instead of quietly flattening their work. rev 0 (or none) is a brand new project
router.put('/api/projects/:id', express.json({limit: saveLimit}), async (req, res) => {
	let id = req.params.id,
		project = req.body.project,
		rev = Number(req.body.rev) || 0

	if (!validID(id) || !project || project.id !== id || project.format !== 'interactives' || !Array.isArray(project.artboards)) {
		return res.status(400).json({error: 'Not a valid project'})
	}

	//An agent's edits may still be in the room: let them reach mongo first so the rev check sees them
	await settleRoom(id)

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
		//Stored as a string on purpose. Bindings and logic params use keys like "fill.color", and user
		//data has no business deciding what mongo sees as a field path
		docString = JSON.stringify(project),
		set = {
			name: String(project.name || 'Untitled project').slice(0, 200),
			updated: new Date(),
			rev: next,
			meta: {
				artboards: project.artboards.length,
				library: !!project.settings?.library,
				preview: firstBoard ? {width: firstBoard.width, height: firstBoard.height, background: firstBoard.background?.type === 'solid' ? firstBoard.background.color : '#ffffff'} : null
			}
		}

	//Filter on the rev we checked, so two saves racing each other can't both win. A duplicate key on the insert is
	//the same race for a brand new project. Anything else is the server failing, and says so
	let raced = false,
		stored
	try {
		stored = await storeProjectDoc(id, next, docString, existing?.docChunks, async (fields) => {
			let result = await projects.updateOne(
				existing ? {_id: id, rev: existing.rev} : {_id: id},
				{$set: {...set, ...fields}, $setOnInsert: {created: new Date(), owner: whoIs(req)}},
				{upsert: !existing}
			).catch((err) => {
				//A duplicate key on the insert, or mongo's own write conflict (code 112) under contention: both are
				//another save getting there first
				if (err?.code === 11000 || err?.code === 112 || /write ?conflict/i.test(err?.message || '')) return {matchedCount: 0, raced: true}
				throw err
			})
			raced = !!result.raced || (existing && result.matchedCount === 0)
			return !raced
		})
	} catch (err) {
		console.trace(`${appName}: save of ${id} failed`, err)
		let f = saveFailure(err)
		return res.status(f.status).json({error: f.error})
	}

	if (raced) {
		return res.status(409).json({error: 'This project was saved somewhere else at the same moment'})
	}

	snapshot(id, docString, next, whoIs(req), existing ? 'Autosave' : 'Created').catch((err) => console.trace(`${appName}: revision of ${id} failed`, err))

	//Somebody saved the whole document while a live room is open (a non-live client, an import): the room takes it
	//and everyone connected reloads
	let room = rooms.get(id)
	if (room) {
		room.doc = project
		room.docChunks = stored.fields.docChunks
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

//Governance events, for power users to look back on: who turned a link on or off, changed who's invited, cleared
//results, deleted or restored a project or handed it on. Append only, one helper, and a failure to write it never
//fails the action it's about
//Ids sort in the order things happened, even two in the same millisecond (a counter after the time)
let auditSeq = 0
const audit = (req, event, project, detail = {}) => {
	let me = whoIs(req),
		now = Date.now()
	auditLog.insertOne({_id: `${now.toString(36)}${String(++auditSeq % 1e8).padStart(8, '0')}${crypto.randomBytes(2).toString('hex')}`, at: new Date(now), event, project: project?._id ?? project ?? null, projectName: project?.name ?? null, by: me ? {username: me.username, name: me.name} : null, power: isPower(req) && !(me && project?.owner?.username === me.username), detail})
		.catch((err) => console.trace(`${appName}: audit ${event} not written`, err))
}

//Moving a file or folder that may not be there. rename can't cross filesystems (storage/ is a symlink on test and
//prod, but _bin sits inside it, so it never has to)
const moveIfThere = async (from, to) => {
	try {
		await fs.promises.mkdir(path.dirname(to), {recursive: true})
		await fs.promises.rename(from, to)
		return true
	} catch (err) {
		if (err.code === 'ENOENT') return false
		throw err
	}
}

//Delete puts a project in the bin for binDays days. Its row moves to projects-bin, so no route that serves a project
//(the editor, the share and review links, the learner page) finds it any more, and its files move to storage/_bin.
//Revisions, comments, learner records and a published library stay where they are until it's purged, so a restore
//gets all of it back. The bin is small and only listed per owner, so it has no index
router.delete('/api/projects/:id', async (req, res) => {
	let id = req.params.id

	if (!validID(id)) {
		return res.status(400).json({error: 'Bad project id'})
	}

	let existing = await projects.findOne({_id: id})

	if (!existing) {
		return res.json({ok: true})
	}

	if (!mayChange(req, res, existing, {ownerOnly: true})) {
		return
	}

	//Drop the live room first: no pending autosave or close timer may write the project (or a revision of it) back
	//after it is gone. Whatever it had unsaved goes into the row that moves to the bin
	let room = rooms.get(id)
	if (room) {
		if (room.dirty) {
			await persist(room)
			existing = await projects.findOne({_id: id}) || existing
		}
		room.deleted = true
		room.dirty = false
		clearTimeout(room.saveTimer)
		clearTimeout(room.closeTimer)
		rooms.delete(id)
	}

	let me = whoIs(req)
	await projectsBin.insertOne({...existing, binned: {at: new Date(), by: me ? {username: me.username, name: me.name} : null}})
		.catch(async (err) => {
			//Binned before and restored since, with the old bin row somehow left behind: this copy is the newer one
			if (err?.code !== 11000) throw err
			await projectsBin.deleteOne({_id: id})
			await projectsBin.insertOne({...existing, binned: {at: new Date(), by: me ? {username: me.username, name: me.name} : null}})
		})
	await moveIfThere(projectDir(id), path.join(binDir(id), 'files'))
	if (existing.share?.token) {
		await moveIfThere(shareFile(existing.share.token), path.join(binDir(id), 'share.html'))
		await moveIfThere(sharePrevFile(existing.share.token), path.join(binDir(id), 'share.prev.html'))
	}
	await moveIfThere(thumbFile(id), path.join(binDir(id), 'thumb.jpg'))
	hubEnd(id)
	await projects.deleteOne({_id: id})
	audit(req, 'project-binned', existing)

	if (room) {
		broadcast(room, 'deleted', {})
		for (let c of room.clients) c.res.end()
	}

	res.json({ok: true, bin: binDays})
})

//Gone for good: everything delete used to remove at once. From the bin's Delete forever, and the sweep below
const purgeProject = async (row) => {
	let id = row._id
	await fs.promises.rm(binDir(id), {recursive: true, force: true})
	await revisions.deleteMany({project: id})
	await store.dropProject(id)
	await userData.deleteMany({project: id})
	await activityData.deleteMany({project: id})
	sharedLiveEndProject(id)
	await sharedRows.deleteMany({project: id})
	await sharedHidden.deleteMany({project: id})
	await commentRows.deleteMany({project: id})
	await commentNotices.deleteMany({project: id})
	await libraries.deleteOne({_id: id})
	await fs.promises.rm(libraryDir(id), {recursive: true, force: true})
	await projectsBin.deleteOne({_id: id})
}

//Anything in the bin longer than binDays. At start and every 6 hours; one failure doesn't stop the rest
const sweepBin = async () => {
	let old = await projectsBin.find({'binned.at': {$lt: new Date(Date.now() - binDays * 24 * 60 * 60 * 1000)}}, {projection: {_id: 1}}).toArray()
	for (let row of old) {
		await purgeProject(row).catch((err) => console.trace(`${appName}: purging ${row._id} from the bin failed`, err))
	}
	return old.length
}

//The admin page's table: every project with its owner, size (document plus files), links, library and learners, and
//what's in the bin. Power users only. Sizes come from the sidecars, so a project's files are one readdir each
router.get('/api/admin/projects', async (req, res) => {
	if (!isPower(req)) {
		return res.status(403).json({error: 'Only power users can see every project'})
	}

	let list = await projects.find({}, {projection: {doc: 0}}).sort({updated: -1}).limit(5000).toArray(),
		ids = list.map((d) => d._id),
		learners = new Map(),
		openComments = new Map()

	for (let r of await userData.find({project: {$in: ids}}, {projection: {project: 1}}).limit(200000).toArray()) learners.set(r.project, (learners.get(r.project) || 0) + 1)
	for (let r of await commentRows.find({project: {$in: ids}, root: true, status: 'open'}, {projection: {project: 1}}).toArray()) openComments.set(r.project, (openComments.get(r.project) || 0) + 1)

	const filesOf = async (id) => {
		let total = 0, count = 0
		try {
			for (let name of (await fs.promises.readdir(projectDir(id))).filter((n) => n.endsWith('.json'))) {
				try {
					total += JSON.parse(await fs.promises.readFile(path.join(projectDir(id), name), 'utf8')).size || 0
					count++
				} catch (e) {
					//half written
				}
			}
		} catch (e) {
			//no files
		}
		return {total, count}
	}

	let rows = []
	for (let d of list) {
		let files = await filesOf(d._id),
			//Rows saved before docSize existed have none until their next save
			docBytes = d.docSize ?? null
		rows.push({
			id: d._id, name: d.name, owner: d.owner || null, collaborators: Array.isArray(d.collaborators) ? d.collaborators.length : 0,
			created: d.created, updated: d.updated, docBytes, fileBytes: files.total, files: files.count,
			share: !!d.share?.token, shareUpdated: d.share?.updated || null, review: !!d.review?.token, library: !!d.meta?.library, libraryVersion: d.library?.version || 0,
			learners: learners.get(d._id) || 0, openComments: openComments.get(d._id) || 0, serverMarked: !!d.marking
		})
	}
	let bin = await projectsBin.countDocuments({})
	res.json({projects: rows, bin, generatedAt: new Date()})
})

//The audit log, power users only: newest first, by project if asked (?project=), at most 500
router.get('/api/audit', async (req, res) => {
	if (!isPower(req)) {
		return res.status(403).json({error: 'Only power users can read the audit log'})
	}
	let filter = {}
	if (typeof req.query.project === 'string' && validID(req.query.project)) filter.project = req.query.project
	if (typeof req.query.event === 'string' && /^[a-z-]{2,40}$/.test(req.query.event)) filter.event = req.query.event
	let limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200))
	res.json(await auditLog.find(filter, {projection: {_id: 0}}).sort({at: -1, _id: -1}).limit(limit).toArray())
})

//Your bin (power users with ?all=1: everyone's). Card details only, no documents
router.get('/api/bin', async (req, res) => {
	let me = whoIs(req),
		guests = !['testing', 'production'].includes(process.env.NODE_ENV),
		filter = req.query.all === '1' && isPower(req) ? {} : me?.username ? {'owner.username': me.username} : guests ? {'owner.username': null} : {_id: null},
		list = await projectsBin.find(filter, {projection: {doc: 0, docChunks: 0}}).sort({'binned.at': -1}).limit(500).toArray()

	res.json(list.map((d) => ({
		...metaOf(d),
		binned: d.binned,
		purge: new Date(d.binned.at.getTime() + binDays * 24 * 60 * 60 * 1000)
	})))
})

//The owner (or a power user) of a binned project, as mayChange would judge it if it were still a project
const binnedFor = async (req, res) => {
	let id = req.params.id
	if (!validID(id)) {
		res.status(400).json({error: 'Bad project id'})
		return null
	}
	let row = await projectsBin.findOne({_id: id}, {projection: {doc: 0, docChunks: 0}})
	if (!row) {
		res.status(404).json({error: 'That project is not in the bin'})
		return null
	}
	return mayChange(req, res, row, {ownerOnly: true}) ? row : null
}

router.post('/api/bin/:id/restore', async (req, res) => {
	let row = await binnedFor(req, res)
	if (!row) {
		return
	}

	let id = row._id,
		full = await projectsBin.findOne({_id: id}),
		{binned, ...back} = full

	//Ids are random, but a project made with this one since would be overwritten
	if (await projects.findOne({_id: id}, {projection: {_id: 1}})) {
		return res.status(409).json({error: 'A project with this id exists again, so this one can\'t come back'})
	}

	await moveIfThere(path.join(binDir(id), 'files'), projectDir(id))
	if (back.share?.token) {
		await moveIfThere(path.join(binDir(id), 'share.html'), shareFile(back.share.token))
		await moveIfThere(path.join(binDir(id), 'share.prev.html'), sharePrevFile(back.share.token))
	}
	await moveIfThere(path.join(binDir(id), 'thumb.jpg'), thumbFile(id))
	await projects.insertOne(back)
	await projectsBin.deleteOne({_id: id})
	audit(req, 'project-restored', back)
	await fs.promises.rm(binDir(id), {recursive: true, force: true})

	res.json({ok: true, id})
})

router.get('/api/bin/:id/thumbnail', async (req, res) => {
	let row = await binnedFor(req, res)
	if (!row) {
		return
	}
	res.set('Cache-Control', 'private, max-age=31536000, immutable')
	res.sendFile(path.join(binDir(row._id), 'thumb.jpg'), (err) => {
		if (err && !res.headersSent) res.status(404).end()
	})
})

router.delete('/api/bin/:id', async (req, res) => {
	let row = await binnedFor(req, res)
	if (!row) {
		return
	}
	await purgeProject(row)
	audit(req, 'project-purged', row)
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
		project = rooms.get(id) ? JSON.parse(JSON.stringify(rooms.get(id).doc)) : await store.parse(doc),
		now = new Date()

	//A random id colliding is next to impossible, but this is the check that makes it a promise
	if (await projects.findOne({_id: newID}, {projection: {_id: 1}}) || fs.existsSync(projectDir(newID))) {
		return res.status(409).json({error: 'Try that again'})
	}

	project.id = newID
	project.name = String(name || `${project.name} copy`).slice(0, 200)
	project.created = project.updated = now.toISOString()
	//The copy starts with nobody else on it, so live collaboration starts off again
	if (project.settings) delete project.settings.liveSync

	if (fs.existsSync(projectDir(id))) {
		await fs.promises.cp(projectDir(id), projectDir(newID), {recursive: true})
	}

	await storeProjectDoc(newID, 1, JSON.stringify(project), null, async (fields) => {
		await projects.insertOne({_id: newID, name: project.name, created: now, updated: now, ...fields, rev: 1, meta: doc.meta, tags: doc.tags || [], folder: doc.folder || null, owner: whoIs(req)})
		return true
	})
	res.json({ok: true, id: newID})
})

//Asset routes check the project's owner too. One lookup each, it's not a hot path
const projectFor = async (req, res, opts) => {
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

	return mayChange(req, res, doc, opts) ? doc : null
}

//How live a project is, for the warnings before deleting it or turning its link off: whether the share link (which is
//also the Link for StudyDesk) and the review link are on, and the learners with records, per course, with when each
//course last did anything. Reads interactives-user-data only (its index starts with project), not the big ingest
router.get('/api/projects/:id/in-use', async (req, res) => {
	let doc = await projectFor(req, res)
	if (!doc) {
		return
	}

	let rows = await userData.find({project: doc._id}, {projection: {courseLabel: 1, course: 1, updated: 1}}).limit(20000).toArray(),
		byCourse = new Map(),
		last = null

	for (let r of rows) {
		let key = r.courseLabel || r.course || 'Outside a course',
			c = byCourse.get(key) || {course: key, learners: 0, last: null}
		c.learners++
		if (r.updated && (!c.last || r.updated > c.last)) c.last = r.updated
		if (r.updated && (!last || r.updated > last)) last = r.updated
		byCourse.set(key, c)
	}

	let courses = [...byCourse.values()].sort((a, b) => (b.last?.getTime?.() || 0) - (a.last?.getTime?.() || 0))
	res.json({share: !!doc.share?.token, review: !!doc.review?.token, learners: rows.length, last, courses: courses.slice(0, 8), moreCourses: Math.max(0, courses.length - 8)})
})

router.get('/api/projects/:id/assets', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let dir = projectDir(req.params.id),
		names = fs.existsSync(dir) ? await fs.promises.readdir(dir) : [],
		variants = new Map(),
		list = []

	//Which smaller copies each asset has, with their sizes (0 is "the original is as good", see the variant route)
	try {
		for (let name of (await fs.promises.readdir(variantDir(req.params.id))).filter((n) => n.endsWith('.json'))) {
			try {
				let meta = JSON.parse(await fs.promises.readFile(path.join(variantDir(req.params.id), name), 'utf8')),
					[assetID, key] = name.slice(0, -5).split('.')

				variants.set(assetID, {...variants.get(assetID), [key]: meta.size})
			}
			catch (e) {
				//Half written, skip it
			}
		}
	}
	catch (e) {
		//No variants yet
	}

	for (let name of names.filter((n) => n.endsWith('.json'))) {
		try {
			let meta = JSON.parse(await fs.promises.readFile(path.join(dir, name), 'utf8')),
				id = name.slice(0, -5),
				row = {id: id, mime: meta.mime, size: meta.size}

			if (variants.has(id)) row.variants = variants.get(id)
			list.push(row)
		}
		catch (e) {
			//A half written sidecar, skip it
		}
	}

	res.json(list)
})

//Files in a project with the same bytes, uploaded twice (the same logo dropped on three artboards, a re-import). Groups
//of ids, biggest saving first. The hash goes in the sidecar (keyed by size and mtime) so it's worked out once a file
router.get('/api/projects/:id/assets/duplicates', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let dir = projectDir(req.params.id),
		names = fs.existsSync(dir) ? (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.json')) : [],
		byHash = new Map()

	for (let name of names) {
		let id = name.slice(0, -5),
			file = path.join(dir, id),
			side = path.join(dir, name)
		try {
			let meta = JSON.parse(await fs.promises.readFile(side, 'utf8')),
				st = await fs.promises.stat(file),
				key = `${st.size}:${st.mtimeMs}`

			if (meta.sha256?.key !== key) {
				let hash = crypto.createHash('sha256')
				for await (let chunk of fs.createReadStream(file)) hash.update(chunk)
				meta.sha256 = {key, hex: hash.digest('hex')}
				await fs.promises.writeFile(side, JSON.stringify(meta))
			}
			let group = byHash.get(meta.sha256.hex) || {size: st.size, ids: []}
			group.ids.push(id)
			byHash.set(meta.sha256.hex, group)
		}
		catch (e) {
			//A file without its sidecar or the other way round: not ours to judge
		}
	}

	let groups = [...byHash.values()].filter((g) => g.ids.length > 1).sort((a, b) => b.size * (b.ids.length - 1) - a.size * (a.ids.length - 1))
	res.json({groups})
})

//After the editor merged duplicates in the document: each dropped copy becomes a hard link to the kept file, so the
//disk space comes back but every old id still answers (an Undo in the editor points layers back at them)
router.post('/api/projects/:id/assets/dedupe', express.json({limit: '64kb'}), async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let id = req.params.id,
		plan = Array.isArray(req.body?.plan) ? req.body.plan.slice(0, 500) : [],
		linked = 0,
		freed = 0

	const hashOf = async (assetID) => {
		let hash = crypto.createHash('sha256')
		for await (let chunk of fs.createReadStream(assetFile(id, assetID))) hash.update(chunk)
		return hash.digest('hex')
	}

	for (let p of plan) {
		if (!validID(p?.keep) || !Array.isArray(p.drop)) continue
		let keepFile = assetFile(id, p.keep), keepHash
		try {
			keepHash = await hashOf(p.keep)
		} catch {
			continue
		}
		for (let drop of p.drop.filter(validID)) {
			let file = assetFile(id, drop)
			try {
				let [a, b] = await Promise.all([fs.promises.stat(keepFile), fs.promises.stat(file)])
				//Already one file, or not the same bytes after all: leave it
				if (a.ino === b.ino || await hashOf(drop) !== keepHash) continue
				let tmp = `${file}.link`
				await fs.promises.link(keepFile, tmp)
				await fs.promises.rename(tmp, file)
				linked++
				freed += b.size
			} catch (err) {
				//A filesystem without hard links, or the file's gone: nothing to free, nothing broken
			}
		}
	}

	res.json({ok: true, linked, freed})
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

	//New bytes under an id that had smaller copies made from the old ones
	await removeVariants(id, assetId)

	res.json({ok: true, size: bytes.length})
})

//A smaller copy of an image asset, made in the browser: the canvas proxy (key "edit") or an optimised output (a key
//that says its size and quality). Same owner check and size limit as the asset. An empty body is a real answer, it
//means "the original is already as good", so nobody works that out again. At most maxVariants per asset, the oldest
//goes when there is one too many
router.put('/api/projects/:id/assets/:assetId/variant/:key', express.raw({type: () => true, limit: maxAsset}), async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let {id, assetId, key} = req.params,
		bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
		mime = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase()

	if (!validVariantKey(key)) {
		return res.status(400).json({error: 'Bad variant key'})
	}

	if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
		return res.status(415).json({error: 'A variant is a jpeg, png or webp picture'})
	}

	if (!fs.existsSync(`${assetFile(id, assetId)}.json`)) {
		return res.status(404).json({error: 'No such asset'})
	}

	let file = variantFile(id, assetId, key),
		temp = `${file}.${process.pid}.${Date.now()}.tmp`

	await fs.promises.mkdir(variantDir(id), {recursive: true})

	let mine = []

	for (let name of await fs.promises.readdir(variantDir(id))) {
		if (name.startsWith(`${assetId}.`) && name.endsWith('.json') && name !== `${assetId}.${key}.json`) {
			mine.push({name: name.slice(0, -5), time: (await fs.promises.stat(path.join(variantDir(id), name)).catch(() => ({mtimeMs: 0}))).mtimeMs})
		}
	}

	mine.sort((a, b) => a.time - b.time)

	for (let old of mine.slice(0, Math.max(0, mine.length - (maxVariants - 1)))) {
		await fs.promises.rm(path.join(variantDir(id), old.name), {force: true})
		await fs.promises.rm(path.join(variantDir(id), `${old.name}.json`), {force: true})
	}

	await fs.promises.writeFile(temp, bytes)
	await fs.promises.rename(temp, file)
	await fs.promises.writeFile(`${file}.json`, JSON.stringify({mime: mime, size: bytes.length, created: new Date()}))

	res.json({ok: true, size: bytes.length})
})

router.get('/api/projects/:id/assets/:assetId/variant/:key', async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	let {id, assetId, key} = req.params

	if (!validVariantKey(key)) {
		return res.status(400).json({error: 'Bad variant key'})
	}

	let file = variantFile(id, assetId, key),
		meta

	try {
		meta = JSON.parse(await fs.promises.readFile(`${file}.json`, 'utf8'))
	}
	catch (e) {
		return res.status(404).json({error: 'No such variant'})
	}

	//Revalidated, a PUT under the same key replaces it
	res.setHeader('Cache-Control', 'private, no-cache')
	safety.assetHeaders(res, meta.mime)
	res.sendFile(file, (err) => {
		if (err && !res.headersSent) {
			res.status(404).json({error: 'No such variant'})
		}
	})
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
		client = {id: clientId, res, agent: agent || null, name: agent ? `${agent} (AI)` : me?.name || me?.username || claimed || 'Guest', color: PALETTE[room.nextColor++ % PALETTE.length], presence: {}},
		since = Number(req.query.since)

	//Agent access switched off for this box: an agent can't join a room either
	if (agent && mcpOff()) {
		return res.status(403).json({error: 'AI agent access is turned off on this server'})
	}

	res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'})
	res.write(':ok\n\n')

	room.clients.add(client)
	clearTimeout(room.closeTimer)

	if (Number.isFinite(since) && since < room.seq) {
		let missed = room.log.filter((e) => e.seq > since)
		if (!missed.length || missed[0].seq !== since + 1) sseSend(res, 'reset', {rev: room.rev})
		else for (let e of missed) sseSend(res, 'ops', e, e.seq)
	}

	sseSend(res, 'hello', {seq: room.seq, rev: room.rev, clientId, color: client.color, peers: presenceOf(room), stored: room.storeFailed ? {ok: false, error: room.storeError} : {ok: true}})
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

	//Edits an AI agent made go down in the next revision's reason ("Autosave (edited with Claude (AI))")
	let sender = [...room.clients].find((c) => c.id === entry.clientId)
	if (sender?.agent) (room.agentEdits ||= new Set()).add(sender.name)

	scheduleSave(room)
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

	//The newest revisionCap, plus any pinned ones older than that
	let list = await revisions.find({project: id}, {sort: {created: -1}, projection: {doc: 0, docChunks: 0}}).limit(revisionCap).toArray(),
		have = new Set(list.map((r) => String(r._id))),
		pinned = await revisions.find({project: id, pinned: true}, {sort: {created: -1}, projection: {doc: 0, docChunks: 0}}).toArray()

	list = [...list, ...pinned.filter((r) => !have.has(String(r._id)))]
	res.json(list.map((r) => ({id: String(r._id), created: r.created, rev: r.rev, by: r.by, reason: r.reason, size: r.size, name: r.name || null, pinned: !!r.pinned})))
})

//Save what's there now as a named, pinned version ("Sent to the unit coordinator", "Before the redesign")
router.post('/api/projects/:id/revisions', express.json({limit: '4kb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}
	if (!mayChange(req, res, doc)) {
		return
	}

	let name = cleanRevisionName(req.body?.name)
	if (!name) {
		return res.status(400).json({error: 'Give the version a name'})
	}
	if (await revisions.countDocuments({project: id, pinned: true}) >= pinCap) {
		return res.status(400).json({error: `A project keeps up to ${pinCap} named versions. Unpin one first`})
	}

	let room = rooms.get(id)
	if (room) await persist(room)
	let current = room ? JSON.stringify(room.doc) : await store.get(doc),
		revID = await snapshot(id, current, room ? room.rev : doc.rev, whoIs(req), 'Named version', true, {name, pinned: true})

	res.json({ok: true, id: revID})
})

//Name, rename or pin/unpin a revision. A pinned one is never pruned
router.patch('/api/projects/:id/revisions/:revID', express.json({limit: '4kb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0, docChunks: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}
	if (!mayChange(req, res, doc)) {
		return
	}

	let r = validRevision(req.params.revID) && await revisions.findOne({_id: req.params.revID, project: id}, {projection: {pinned: 1}})
	if (!r) {
		return res.status(404).json({error: 'No such revision'})
	}

	let set = {}
	if ('name' in (req.body || {})) set.name = cleanRevisionName(req.body.name)
	if (typeof req.body?.pinned === 'boolean') {
		if (req.body.pinned && !r.pinned && await revisions.countDocuments({project: id, pinned: true}) >= pinCap) {
			return res.status(400).json({error: `A project keeps up to ${pinCap} named versions. Unpin one first`})
		}
		set.pinned = req.body.pinned
	}

	await revisions.updateOne({_id: r._id}, {$set: set})
	res.json({ok: true, ...set})
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

	res.json({project: await store.parse(r), created: r.created, rev: r.rev})
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
	let current = room ? JSON.stringify(room.doc) : await store.get(doc),
		currentRev = room ? room.rev : doc.rev,
		//The room's save may just have moved the row onto a new set of parts
		oldRef = room ? room.docChunks : doc.docChunks
	await snapshot(id, current, currentRev, whoIs(req), 'Before restore', true)

	let project = await store.parse(r),
		next = currentRev + 1

	//The restored copy keeps this project's id (a revision from before a rename still belongs here)
	project.id = id
	let {fields} = await storeProjectDoc(id, next, JSON.stringify(project), oldRef, async (fields) => {
		await projects.updateOne({_id: id}, {$set: {...fields, rev: next, updated: new Date(), name: String(project.name || 'Untitled project').slice(0, 200)}})
		return true
	})

	if (room) {
		room.doc = project
		room.docChunks = fields.docChunks
		room.rev = next
		room.dirty = false
		room.log = []
		broadcast(room, 'reset', {rev: next})
	}

	res.json({ok: true, rev: next})
})

//Finding someone to invite by name: up to 8 staff from the suite's user-lookup whose name, email or username contains
//what's been typed (escaped, so it's a "contains" match, not a regex anyone gets to write). The username is who they
//are; the name and email are only how they're found. Same staff rule as media-catalogue's share box: isStudent comes
//off someone's latest launch, so a staff address counts as staff whatever the flag says, and a student or disabled
//address never does
const STAFF_EMAIL = /@(test\.)?(usq|unisq)\.edu\.au(\.inv)?$/i,
	NEVER_STAFF = /@umail\.|\.invalid$/i,
	escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

router.get('/api/people', async (req, res) => {
	let me = whoIs(req),
		q = String(req.query.q ?? '').trim().slice(0, 80)

	if (!me?.username && enforcing()) {
		return res.status(401).json({error: 'Sign in to look people up'})
	}

	if (q.length < 2) {
		return res.json({people: []})
	}

	let like = {$regex: escapeRegex(q), $options: 'i'},
		rows = await userLookup.find({username: {$ne: null}, $or: [{username: like}, {firstName: like}, {lastName: like}, {fullName: like}, {email: like}]}, {projection: {_id: 0, username: 1, firstName: 1, lastName: 1, fullName: 1, email: 1, isStudent: 1}}).limit(60).toArray(),
		seen = new Set(),
		people = []

	for (let r of rows) {
		let email = String(r.email || ''),
			staff = !NEVER_STAFF.test(email) && (r.isStudent === false || STAFF_EMAIL.test(email))

		if (!staff || seen.has(r.username) || r.username === me?.username) {
			continue
		}

		seen.add(r.username)
		people.push({username: r.username, name: r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.username, email: email || null})

		if (people.length >= 8) {
			break
		}
	}

	res.json({people})
})

//Collaborators: people the owner invited to open and edit the project with them (live editing, comments, sharing).
//Anyone can see who's on it; only the owner (or a power user) adds or removes people, and only the owner deletes it
const mayManage = (req, doc) => !doc?.owner?.username || whoIs(req)?.username === doc.owner.username || isPower(req)

router.get('/api/projects/:id/collaborators', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	res.json({owner: doc.owner || null, collaborators: Array.isArray(doc.collaborators) ? doc.collaborators : [], canManage: mayManage(req, doc)})
})

router.post('/api/projects/:id/collaborators', express.json({limit: '4kb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc, {ownerOnly: true})) {
		return
	}

	//A username as StudyDesk knows it (letters, digits, dots, dashes, underscores, @), and a name to show if we have one
	let username = String(req.body?.username ?? '').trim().toLowerCase(),
		name = String(req.body?.name ?? '').trim().slice(0, 120)

	if (!/^[a-z0-9._@-]{2,80}$/.test(username)) {
		return res.status(400).json({error: 'That doesn\'t look like a username'})
	}

	if (username === doc.owner?.username) {
		return res.status(400).json({error: 'That\'s the project\'s owner'})
	}

	let list = Array.isArray(doc.collaborators) ? doc.collaborators : []

	if (list.length >= 50) {
		return res.status(400).json({error: 'A project can have up to 50 collaborators'})
	}

	if (!list.some((c) => c.username === username)) {
		list = [...list, {username, name: name || null, added: new Date(), by: whoIs(req)?.username ?? null}]
		await projects.updateOne({_id: id}, {$set: {collaborators: list}})
		audit(req, 'collaborator-added', doc, {username})
	}

	res.json({collaborators: list})
})

router.delete('/api/projects/:id/collaborators/:username', async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	//The owner removes anyone; a collaborator can take themselves off
	let me = whoIs(req),
		leaving = me?.username && me.username === req.params.username

	if (!leaving && !mayChange(req, res, doc, {ownerOnly: true})) {
		return
	}

	let list = (Array.isArray(doc.collaborators) ? doc.collaborators : []).filter((c) => c.username !== req.params.username)

	await projects.updateOne({_id: id}, {$set: {collaborators: list}})
	audit(req, 'collaborator-removed', doc, {username: String(req.params.username).slice(0, 80), left: !!leaving})
	res.json({collaborators: list})
})

//Hand a project to one of its collaborators: they become the owner and the old owner stays on as a collaborator, so
//nobody loses access. Same id, same share token, so every StudyDesk embed keeps working (duplicating, the old
//workaround for a leaver, broke them all). The library published from it and templates saved from it by the old
//owner follow. Owner or power user only
router.post('/api/projects/:id/owner', express.json({limit: '4kb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0, docChunks: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc, {ownerOnly: true})) {
		return
	}

	let username = String(req.body?.username ?? '').trim().toLowerCase(),
		list = Array.isArray(doc.collaborators) ? doc.collaborators : [],
		next = list.find((c) => c.username === username)

	if (!next) {
		return res.status(400).json({error: 'Invite them to collaborate first, then make them the owner'})
	}

	//userID from the suite's user lookup when it knows them (the owner record carries one from a real session)
	let known = await userLookup.findOne({username}, {projection: {userID: 1}}).catch(() => null),
		owner = {username, userID: known?.userID ?? null, name: next.name || username},
		old = doc.owner?.username ? doc.owner : null,
		collaborators = list.filter((c) => c.username !== username)

	if (old && !collaborators.some((c) => c.username === old.username)) {
		collaborators.push({username: old.username, name: old.name || null, added: new Date(), by: whoIs(req)?.username ?? null})
	}

	await projects.updateOne({_id: id}, {$set: {owner, collaborators, ownerChanged: {at: new Date(), from: old?.username || null, by: whoIs(req)?.username ?? null}}})
	await libraries.updateOne({_id: id}, {$set: {owner}}).catch((err) => console.trace(`${appName}: library owner of ${id} not moved`, err))
	if (old) await templates.updateMany({source: id, 'owner.username': old.username}, {$set: {owner}}).catch((err) => console.trace(`${appName}: template owners from ${id} not moved`, err))

	let room = rooms.get(id)
	if (room) room.owner = owner
	audit(req, 'owner-changed', doc, {from: old?.username || null, to: username})

	res.json({owner, collaborators})
})

//Questions that are set to be marked on the server (Question > Mark answers on the server). The share page the editor builds holds
//the whole project as JSON, right answers and all, so before it is kept for learners the answers are taken out of that JSON
//(the player's own stripProject) and the answer key goes on the project's record instead, where /learn/<token>/check marks
//against it. Only the page served to learners is changed: what the owner exports from the editor still marks by itself.
//Returns null when nothing in the page is set that way; throws when something is but the project could not be read, so a page
//that still has its answers in it is never kept
const audioClean = require('./shared/audio-clean.cjs')

const markedIds = (salt) => (frame, real) => crypto.createHmac('sha256', salt).update(`${frame}\0${real}`).digest('base64url').slice(0, 10)

const prepareMarkedShare = (html, oldSalt) => {
	if (!html.includes('"serverMarked":true')) {
		return null
	}

	let open = html.indexOf('id="ix-project">'),
		start = open + 'id="ix-project">'.length,
		end = open < 0 ? -1 : html.indexOf('</script>', start)

	if (end < 0) {
		throw new Error('no project in the page')
	}

	let project = JSON.parse(html.slice(start, end)),
		salt = oldSalt || crypto.randomBytes(16).toString('hex'),
		stripped = marker.stripProject(project, markedIds(salt)),
		ids = Object.keys(stripped.questions)

	if (!ids.length) {
		return null
	}

	if (ids.length > 200) {
		throw new Error('too many questions marked on the server')
	}

	//Spelling questions play a spoken word: what the audio files are called and the tags inside them are as readable as the page
	let audioNotes = Object.values(stripped.questions).some((q) => q.blanks.some((b) => b.spelling)) ? audioClean.cleanAudioAssets(project) : []

	//The same escaping the player's page builder uses for JSON inside a script element
	let json = JSON.stringify(project).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
		pass = project.settings?.reporting?.passMark

	return {
		html: html.slice(0, start) + json + html.slice(end),
		marking: {salt, passMark: typeof pass === 'number' && Number.isFinite(pass) ? pass : null, questions: stripped.questions, skipped: stripped.skipped, updated: new Date()},
		audioNotes
	}
}

//What the project says it uses of the learner's device (Project > Microphone and camera), read out of the page being shared the same way and
//kept on the share record. The learner page builds its consent screen and its limits from this copy, so what a project asks for over
//postMessage is held to what the owner declared when they shared it, never to what the project says now. Null when it declares nothing.
//A project that offers a download (Download a file) with no sensor gets an empty declaration: the learner page still needs the bridge,
//since the project's frame is sandboxed and can't save a file itself
const declaredSensors = (html) => {
	let saves = html.includes('"kind":"action.saveFile"')

	if (!saves && !html.includes('"sensors":')) {
		return null
	}

	let open = html.indexOf('id="ix-project">'),
		start = open + 'id="ix-project">'.length,
		end = open < 0 ? -1 : html.indexOf('</script>', start)

	if (end < 0) {
		return null
	}

	try {
		let sensors = media.cleanSensors(JSON.parse(html.slice(start, end)).settings?.sensors)

		return sensors && media.declaresSensors(sensors) ? sensors : saves ? {} : null
	}
	catch (err) {
		return null
	}
}

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

	//Questions set to be marked on the server get their answers taken out of the page that is served, and the answer key kept here
	let html = req.body,
		prepared = null

	//Sticky notes are the authors' own: the editor leaves them out of the page, and whatever arrives is stripped again here
	try {
		html = notesLib.stripNotesFromPage(html)
	}
	catch (err) {
		console.trace(`${appName}: could not read the project out of the shared page of ${id} to take its notes out`, err)
		return res.status(400).json({error: 'The notes could not be taken out of that page, so it was not shared'})
	}

	try {
		prepared = prepareMarkedShare(html, doc.marking?.salt)
	}
	catch (err) {
		console.trace(`${appName}: could not read the project out of the shared page of ${id}`, err)
		return res.status(400).json({error: 'The answers could not be taken out of that page, so it was not shared'})
	}

	let token = doc.share?.token || crypto.randomBytes(18).toString('base64url'),
		sensors = declaredSensors(html),
		shared = responses.declaredShared(html),
		roomsDeclared = roomsLib.declaredRooms(html),
		share = {token, created: doc.share?.created || new Date(), updated: new Date(), by: whoIs(req), remix: !!doc.share?.remix, ...(sensors ? {sensors} : {}), ...(Object.keys(shared).length ? {shared} : {}), ...(Object.keys(roomsDeclared).length ? {rooms: roomsDeclared} : {})}

	await fs.promises.mkdir(path.dirname(shareFile(token)), {recursive: true})
	//An update keeps the page it replaces (one, not a history), so a bad publish can be undone in a click
	let prevKept = false
	if (doc.share?.token && await moveIfThere(shareFile(token), sharePrevFile(token))) {
		share.previous = {updated: doc.share.updated || null, by: doc.share.by || null, ...(doc.share.sensors ? {sensors: doc.share.sensors} : {}), ...(doc.share.shared ? {shared: doc.share.shared} : {}), ...(doc.share.rooms ? {rooms: doc.share.rooms} : {})}
		prevKept = true
	}
	await fs.promises.writeFile(shareFile(token), prepared ? prepared.html : html)

	//The answer key goes with the page it was made for: the new one for this page, the old one kept beside the kept page
	//so a revert puts both back together
	let set = {share}, unset = {}
	if (prepared) set.marking = prepared.marking
	else unset.marking = ''
	if (prevKept) {
		if (doc.marking) set.previousMarking = doc.marking
		else unset.previousMarking = ''
	}
	await projects.updateOne({_id: id}, Object.keys(unset).length ? {$set: set, $unset: unset} : {$set: set})
	audit(req, doc.share?.token ? 'share-updated' : 'share-on', doc)
	res.json({share, marking: prepared ? {questions: Object.keys(prepared.marking.questions).length, skipped: prepared.marking.skipped, ...(prepared.audioNotes.length ? {audioNotes: prepared.audioNotes} : {})} : null})
})

//Put the previous page back (and keep the one it replaces as the previous, so a revert can itself be undone)
router.post('/api/projects/:id/share/revert', async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0, docChunks: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}
	if (!mayChange(req, res, doc)) {
		return
	}
	let token = doc.share?.token
	if (!token || !doc.share.previous || !fs.existsSync(sharePrevFile(token))) {
		return res.status(400).json({error: 'There is no previous version of this share link to go back to'})
	}

	let swap = path.join(storageDir, 'shares', `${token}.swap.html`)
	await fs.promises.rename(shareFile(token), swap)
	await fs.promises.rename(sharePrevFile(token), shareFile(token))
	await fs.promises.rename(swap, sharePrevFile(token))

	let share = {...doc.share, updated: doc.share.previous.updated, by: doc.share.previous.by, previous: {updated: doc.share.updated || null, by: doc.share.by || null, ...(doc.share.sensors ? {sensors: doc.share.sensors} : {}), ...(doc.share.shared ? {shared: doc.share.shared} : {}), ...(doc.share.rooms ? {rooms: doc.share.rooms} : {})}, reverted: {at: new Date(), by: whoIs(req)}},
		set = {share}, unset = {}

	//The page that came back has the sensors it was shared with
	if (doc.share.previous.sensors) {
		share.sensors = doc.share.previous.sensors
	}
	else {
		delete share.sensors
	}

	//And the shared responses it declared
	if (doc.share.previous.shared) {
		share.shared = doc.share.previous.shared
	}
	else {
		delete share.shared
	}

	//And its rooms
	if (doc.share.previous.rooms) {
		share.rooms = doc.share.previous.rooms
	}
	else {
		delete share.rooms
	}
	//The answer keys swap with their pages
	if (doc.previousMarking) set.marking = doc.previousMarking
	else unset.marking = ''
	if (doc.marking) set.previousMarking = doc.marking
	else unset.previousMarking = ''
	await projects.updateOne({_id: id}, Object.keys(unset).length ? {$set: set, $unset: unset} : {$set: set})
	audit(req, 'share-reverted', doc)
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

	if (doc.share?.token) {
		await fs.promises.rm(shareFile(doc.share.token), {force: true})
		await fs.promises.rm(sharePrevFile(doc.share.token), {force: true})
		audit(req, 'share-off', doc)
		sharedLiveEndProject(id)
	}
	await projects.updateOne({_id: id}, {$unset: {share: '', marking: '', previousMarking: ''}})
	res.json({ok: true})
})

//Allow remix on the share link: with it on, the learner page (/play/<token>) offers signed in staff a "Remix this" button that
//copies the project into their own projects. The link has to exist already; this only flips the flag
router.patch('/api/projects/:id/share', express.json({limit: '1kb'}), async (req, res) => {
	let id = req.params.id,
		doc = validID(id) && (await projects.findOne({_id: id}, {projection: {doc: 0}}))

	if (!doc) {
		return res.status(404).json({error: 'No such project'})
	}

	if (!mayChange(req, res, doc)) {
		return
	}

	if (!doc.share?.token) {
		return res.status(409).json({error: 'Create the share link first'})
	}

	let share = {...doc.share, remix: req.body?.remix === true}

	await projects.updateOne({_id: id}, {$set: {share}})
	res.json({share})
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
		brand: !!doc.brand,
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
		full = await projects.findOne({_id: id}, {projection: {doc: 1, docChunks: 1}}),
		room = rooms.get(id),
		project = room ? room.doc : await store.parse(full)

	if (!project.settings?.library) {
		return res.status(400).json({error: 'Turn on "This project is a library" in the project settings first'})
	}

	let snap = library.buildSnapshot(project)

	if (!snap.components.length) {
		return res.status(400).json({error: 'No artboards are marked "Publish to library"'})
	}

	let existing = await libraries.findOne({_id: id}, {projection: {snapshot: 0}}),
		me = whoIs(req)

	//A brand kit is changed by the people who may run one, not by whoever happens to own the project
	if (existing?.brand && !canMarkBrand(req)) {
		console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: not allowed to publish a brand kit`)

		if (enforcing()) {
			return res.status(403).json({error: 'This library is a brand kit, and only the people who look after brand kits can publish it'})
		}
	}

	let now = new Date(),
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

//Mark the published library as a brand kit, or take that off. Its owner, and only someone who may run brand kits
//(canMarkBrand). What projects already copied is locked or unlocked the next time they use or update the library
router.put('/api/projects/:id/library/brand', express.json({limit: '1kb'}), async (req, res) => {
	if (!await projectFor(req, res)) {
		return
	}

	if (!canMarkBrand(req)) {
		console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: not allowed to mark a brand kit`)

		if (enforcing()) {
			return res.status(403).json({error: 'Only the people who look after brand kits can mark one'})
		}
	}

	let brand = req.body?.brand === true,
		result = await libraries.updateOne({_id: req.params.id}, {$set: {brand}})

	if (!result.matchedCount) {
		return res.status(409).json({error: 'Publish the library first'})
	}

	res.json({brand})
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

	if ((await libraries.findOne({_id: req.params.id}, {projection: {brand: 1}}))?.brand && !canMarkBrand(req)) {
		console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: not allowed to withdraw a brand kit`)

		if (enforcing()) {
			return res.status(403).json({error: 'This library is a brand kit, and only the people who look after brand kits can stop publishing it'})
		}
	}

	await libraries.deleteOne({_id: req.params.id})
	await fs.promises.rm(libraryDir(req.params.id), {recursive: true, force: true})
	await projects.updateOne({_id: req.params.id}, {$unset: {library: ''}})
	res.json({ok: true})
})

//Templates. "Save as template" snapshots a whole project into the templates collection (one document per template,
//_id is its own id, not the project's) with a title, a description and a checklist of the things to change. "Use
//template" copies the snapshot and its files into a new project for whoever asks and records, on the new project, the
//baseline the update check needs (shared/template.mjs says how). Saving a template again from its project makes the next
//version, which is what "Update from template" in the copies offers. Visibility is the owner only, or everyone.
//The built-in starters are generated by the editor and never come through here
const maxTemplate = 12 * 1024 * 1024,

	//Yours: made under your username. With no session at all (dev without si-manager) nothing has an owner, and everything is yours
	ownTemplate = (doc, me) => me?.username ? doc.owner?.username === me.username : !enforcing() && !doc.owner?.username,

	templateMeta = (doc, me) => ({
		id: doc._id,
		name: doc.name,
		description: doc.description || '',
		owner: doc.owner || null,
		version: doc.version,
		created: doc.created,
		updated: doc.updated,
		mine: ownTemplate(doc, me),
		everyone: !!doc.shared?.everyone,
		checklist: doc.checklist || [],
		brand: doc.brand || [],
		artboards: doc.artboards || 0,
		preview: doc.preview || null,
		thumb: doc.thumb || null,
		source: ownTemplate(doc, me) ? doc.source || null : undefined,
		history: (doc.history || []).slice(0, 10)
	}),

	//Loads a template the person may use (or, with owner, change), or answers for them. Same pattern as libraryFor
	templateFor = async (req, res, {snapshot = false, owner = false} = {}) => {
		let {id, assetId} = req.params

		if (!validID(id) || (assetId !== undefined && !validID(assetId))) {
			res.status(400).json({error: 'Bad id'})
			return null
		}

		let doc = await templates.findOne({_id: id}, snapshot ? {} : {projection: {snapshot: 0}})

		if (!doc) {
			res.status(404).json({error: 'No such template'})
			return null
		}

		let me = whoIs(req),
			allowed = owner ? (!doc.owner?.username || (me?.username && doc.owner.username === me.username) || isPower(req)) : template.mayUseTemplate(doc, me, enforcing())

		if (!allowed) {
			console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: ${owner ? 'not the template\'s owner' : 'template not shared with them'}`)

			if (enforcing()) {
				res.status(403).json({error: owner ? 'That template belongs to someone else' : 'That template is not shared with you'})
				return null
			}
		}

		return doc
	},

	//A new project from a project document and the folder its files are in. The id is made here (a client picked id could
	//land on a project that exists). Used by Use template and by Remix
	createProjectFrom = async (req, project, {name, filesFrom, thumbFrom, folder, extra = {}}) => {
		let newID = safety.newProjectID(),
			now = new Date()

		if (await projects.findOne({_id: newID}, {projection: {_id: 1}}) || fs.existsSync(projectDir(newID))) {
			throw Object.assign(new Error('Try that again'), {status: 409})
		}

		project.id = newID
		project.name = String(name || project.name || 'Untitled project').slice(0, 200)
		project.created = project.updated = now.toISOString()
		//A new project starts with nobody else on it, so live collaboration starts off whatever the source had
		if (project.settings) delete project.settings.liveSync

		if (filesFrom && fs.existsSync(filesFrom)) {
			await fs.promises.mkdir(projectDir(newID), {recursive: true})

			for (let file of await fs.promises.readdir(filesFrom)) {
				//Only asset files: the id, and its .json sidecar
				if (/^[A-Za-z0-9_-]{4,64}(\.json)?$/.test(file)) await fs.promises.copyFile(path.join(filesFrom, file), path.join(projectDir(newID), file), fs.constants.COPYFILE_FICLONE)
			}
		}

		let thumb = null

		if (thumbFrom && fs.existsSync(thumbFrom)) {
			await fs.promises.mkdir(path.dirname(thumbFile(newID)), {recursive: true})
			await fs.promises.copyFile(thumbFrom, thumbFile(newID))
			thumb = Date.now()
		}

		let firstBoard = project.artboards[0]

		let docString = JSON.stringify(project)
		await storeProjectDoc(newID, 1, docString, null, async (fields) => {
			await projects.insertOne({
				_id: newID,
				name: project.name,
				created: now,
				updated: now,
				...fields,
				rev: 1,
				meta: {
					artboards: project.artboards.length,
					library: !!project.settings?.library,
					preview: firstBoard ? {width: firstBoard.width, height: firstBoard.height, background: firstBoard.background?.type === 'solid' ? firstBoard.background.color : '#ffffff'} : null
				},
				tags: [],
				folder: folder || null,
				thumb,
				owner: whoIs(req),
				...extra
			})
			return true
		})

		return {id: newID, project, doc: docString}
	}

//Templates I can use: my own, and the ones shared with everyone. No snapshots, those are a request each
router.get('/api/templates', async (req, res) => {
	let me = whoIs(req),
		list = await templates.find(template.accessFilter(me, enforcing()), {projection: {snapshot: 0}}).sort({updated: -1}).limit(500).toArray()

	res.json(list.map((doc) => templateMeta(doc, me)))
})

//One template. ?full=1 adds the snapshot (the project), for "Update from template"
router.get('/api/templates/:id', async (req, res) => {
	let full = req.query.full === '1',
		doc = await templateFor(req, res, {snapshot: full})

	if (!doc) {
		return
	}

	res.json({template: templateMeta(doc, whoIs(req)), snapshot: full ? JSON.parse(doc.snapshot) : undefined})
})

//An asset of the template's snapshot, for an update that brings a new picture. They never change under an id
router.get('/api/templates/:id/assets/:assetId', async (req, res) => {
	if (!await templateFor(req, res)) {
		return
	}

	let file = path.join(templateDir(req.params.id), req.params.assetId),
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

router.get('/api/templates/:id/thumbnail', async (req, res) => {
	if (!await templateFor(req, res)) {
		return
	}

	res.set('Cache-Control', 'private, max-age=31536000, immutable')
	res.sendFile(path.join(templateDir(req.params.id), 'thumb.jpg'), (err) => {
		if (err && !res.headersSent) res.status(404).end()
	})
})

//Save a project as a template, or (templateId) save it over one of yours as the next version. The live room has the
//newest copy of the project. Nothing changed since the last version only updates the title, description, checklist
//and who it is shared with
router.post('/api/projects/:id/template', express.json({limit: '64kb'}), async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let id = req.params.id,
		body = req.body || {},
		full = await projects.findOne({_id: id}, {projection: {doc: 1, docChunks: 1}}),
		room = rooms.get(id),
		project = template.cleanProject(room ? room.doc : await store.parse(full)),
		name = template.cleanLine(body.name) || template.cleanLine(project.name) || 'Untitled template',
		existing = null

	if (body.templateId !== undefined) {
		if (!validID(body.templateId)) {
			return res.status(400).json({error: 'Bad template id'})
		}

		existing = await templates.findOne({_id: body.templateId}, {projection: {snapshot: 0}})

		if (!existing) {
			return res.status(404).json({error: 'No such template'})
		}

		let me = whoIs(req)

		if (existing.owner?.username && existing.owner.username !== me?.username && !isPower(req)) {
			console.warn(`${appName}: ${enforcing() ? 'rejected' : 'would reject'} ${req.method} ${req.originalUrl.split('?')[0]}: not the template's owner`)

			if (enforcing()) {
				return res.status(403).json({error: 'That template belongs to someone else'})
			}
		}
	}

	if (!project.artboards?.length) {
		return res.status(400).json({error: 'There is nothing in this project to make a template of'})
	}

	let now = new Date(),
		me = whoIs(req),
		tid = existing?._id || safety.newTemplateID(),
		plan = template.planSave(existing, template.contentHash(project), {note: body.note, by: me?.username || me?.name || null, now}),
		text = JSON.stringify(project)

	if (text.length > maxTemplate) {
		return res.status(413).json({error: 'That project is too big to make a template of'})
	}

	if (!plan.unchanged) {
		//Files first, so a snapshot never names one that isn't there yet
		let dir = templateDir(tid),
			wanted = new Set((project.assets || []).map((a) => a.id).filter(validID))

		await fs.promises.mkdir(dir, {recursive: true})

		for (let assetId of wanted) {
			let from = assetFile(id, assetId),
				to = path.join(dir, assetId)

			if (fs.existsSync(from) && fs.existsSync(`${from}.json`)) {
				await fs.promises.copyFile(from, to, fs.constants.COPYFILE_FICLONE)
				await fs.promises.copyFile(`${from}.json`, `${to}.json`)
			}
		}

		for (let file of await fs.promises.readdir(dir)) {
			if (file !== 'thumb.jpg' && !wanted.has(file.replace(/\.json$/, ''))) await fs.promises.rm(path.join(dir, file), {force: true})
		}
	}

	//The project's thumbnail goes with it (the card in the Templates tab), whenever there is one
	let thumb = existing?.thumb || null

	if (fs.existsSync(thumbFile(id))) {
		await fs.promises.mkdir(templateDir(tid), {recursive: true})
		await fs.promises.copyFile(thumbFile(id), path.join(templateDir(tid), 'thumb.jpg'))
		thumb = Date.now()
	}

	let firstBoard = project.artboards[0],
		set = {
			name,
			description: template.cleanDescription(body.description),
			checklist: template.cleanChecklist(body.checklist, safety.newItemID),
			shared: {everyone: body.everyone === true},
			brand: template.brandKitsOf(project),
			updated: now,
			version: plan.version,
			hash: plan.hash,
			source: id,
			thumb,
			artboards: project.artboards.length,
			preview: firstBoard ? {width: firstBoard.width, height: firstBoard.height, background: firstBoard.background?.type === 'solid' ? firstBoard.background.color : '#ffffff'} : null
		}

	if (!plan.unchanged) {
		set.history = plan.history
		set.snapshot = text
	}

	await templates.updateOne({_id: tid}, {$set: set, $setOnInsert: {owner: doc.owner || me, created: now}}, {upsert: true})
	res.json({ok: true, id: tid, unchanged: plan.unchanged, version: plan.version})
})

//Title, description, checklist and visibility of a template, by its owner
router.put('/api/templates/:id', express.json({limit: '64kb'}), async (req, res) => {
	let doc = await templateFor(req, res, {owner: true})

	if (!doc) {
		return
	}

	let body = req.body || {},
		set = {updated: new Date()}

	if ('name' in body) set.name = template.cleanLine(body.name) || doc.name
	if ('description' in body) set.description = template.cleanDescription(body.description)
	if ('checklist' in body) set.checklist = template.cleanChecklist(body.checklist, safety.newItemID)
	if ('everyone' in body) set.shared = {everyone: body.everyone === true}

	await templates.updateOne({_id: doc._id}, {$set: set})
	res.json(templateMeta({...doc, ...set}, whoIs(req)))
})

router.delete('/api/templates/:id', async (req, res) => {
	let id = req.params.id

	if (!validID(id)) {
		return res.status(400).json({error: 'Bad id'})
	}

	if (!await templates.findOne({_id: id}, {projection: {_id: 1}})) {
		return res.json({ok: true})
	}

	if (!await templateFor(req, res, {owner: true})) {
		return
	}

	await templates.deleteOne({_id: id})
	await fs.promises.rm(templateDir(id), {recursive: true, force: true})
	res.json({ok: true})
})

//Use a template: a new project for the person asking, in the folder they have open. The copy keeps the template's layer
//ids, so the checklist items and the update check still point at things, and carries the baseline, the checklist
//(nothing ticked) and the version it was made from
router.post('/api/templates/:id/use', express.json({limit: '4kb'}), async (req, res) => {
	let doc = await templateFor(req, res, {snapshot: true})

	if (!doc) {
		return
	}

	let project = JSON.parse(doc.snapshot),
		folder = req.body?.folder === undefined || req.body.folder === null || req.body.folder === '' ? null : cleanLabel(req.body.folder, maxLabel)

	project.template = {
		id: doc._id,
		name: doc.name,
		version: doc.version,
		base: template.baselineOf(project),
		checklist: (doc.checklist || []).map((item) => ({...item, done: false}))
	}

	let made = await createProjectFrom(req, project, {name: template.cleanLine(req.body?.name) || doc.name, filesFrom: templateDir(doc._id), thumbFrom: path.join(templateDir(doc._id), 'thumb.jpg'), folder})

	snapshot(made.id, made.doc, 1, whoIs(req), 'Created from a template').catch((err) => console.trace(`${appName}: revision of ${made.id} failed`, err))
	res.json({ok: true, id: made.id})
})

//Examples. Finished projects that ship in this repo (examples/index.json, examples/<key>/project.json with its files and a
//thumbnail), so they are on every box the repo is deployed to and the same for everybody. Nothing about them is stored in
//mongo and there is no route that changes one: they are read only for everyone, owners included. Anyone can play one, or
//"Use" it to get their own copy to change. examples/README.md says how an example is added (scripts/export-example.mjs)
const examplesDir = path.join(__dirname, 'examples'),
	validExample = (key) => typeof key === 'string' && /^[a-z0-9][a-z0-9-]{1,59}$/.test(key),

	exampleIndex = async () => {
		try {
			let list = JSON.parse(await fs.promises.readFile(path.join(examplesDir, 'index.json'), 'utf8'))

			return Array.isArray(list) ? list.filter((e) => validExample(e?.key)) : []
		}
		catch (e) {
			return []
		}
	},

	exampleFor = async (req, res) => {
		let entry = validExample(req.params.key) && (await exampleIndex()).find((e) => e.key === req.params.key)

		if (!entry) {
			res.status(404).json({error: 'No such example'})
			return null
		}

		return entry
	}

router.get('/api/examples', async (req, res) => {
	res.json(await exampleIndex())
})

router.get('/api/examples/:key', async (req, res) => {
	let entry = await exampleFor(req, res)

	if (!entry) {
		return
	}

	res.json({example: entry, project: JSON.parse(await fs.promises.readFile(path.join(examplesDir, entry.key, 'project.json'), 'utf8'))})
})

router.get('/api/examples/:key/thumbnail', async (req, res) => {
	let entry = await exampleFor(req, res)

	if (!entry) {
		return
	}

	res.set('Cache-Control', 'private, max-age=3600')
	res.sendFile(path.join(examplesDir, entry.key, 'thumb.jpg'), (err) => {
		if (err && !res.headersSent) res.status(404).end()
	})
})

router.get('/api/examples/:key/assets/:assetId', async (req, res) => {
	let entry = await exampleFor(req, res)

	if (!entry) {
		return
	}

	if (!validID(req.params.assetId)) {
		return res.status(400).json({error: 'Bad id'})
	}

	let file = path.join(examplesDir, entry.key, 'assets', req.params.assetId),
		meta

	try {
		meta = JSON.parse(await fs.promises.readFile(`${file}.json`, 'utf8'))
	}
	catch (e) {
		return res.status(404).json({error: 'No such asset'})
	}

	res.setHeader('Cache-Control', 'private, max-age=3600')
	safety.assetHeaders(res, meta.mime)
	res.sendFile(file, (err) => {
		if (err && !res.headersSent) {
			res.status(404).json({error: 'No such asset'})
		}
	})
})

//Use an example: the person's own copy, in the folder they have open. Plain copy: no template link, no checklist
router.post('/api/examples/:key/use', express.json({limit: '4kb'}), async (req, res) => {
	let entry = await exampleFor(req, res)

	if (!entry) {
		return
	}

	let project = JSON.parse(await fs.promises.readFile(path.join(examplesDir, entry.key, 'project.json'), 'utf8')),
		folder = req.body?.folder === undefined || req.body.folder === null || req.body.folder === '' ? null : cleanLabel(req.body.folder, maxLabel)

	delete project.template

	let made = await createProjectFrom(req, project, {
		name: template.cleanLine(req.body?.name) || entry.title,
		filesFrom: path.join(examplesDir, entry.key, 'assets'),
		thumbFrom: path.join(examplesDir, entry.key, 'thumb.jpg'),
		folder,
		extra: {example: entry.key}
	})

	snapshot(made.id, made.doc, 1, whoIs(req), 'Copied from an example').catch((err) => console.trace(`${appName}: revision of ${made.id} failed`, err))
	res.json({ok: true, id: made.id})
})

//Review comments. Notes pinned to an artboard (and a layer on it) with replies, resolve and an assignee, kept in
//lti-interactives.comments, one row per message (shared/comments.mjs says how rows become threads). They are not
//part of the project document, so exports, share links and the op log never see them.
//
//Two doors in. The editor (/api/projects/:id/comments..., the owner and power users, like every project route) and
//the review page (/review/:token/..., anyone signed in who has the review link). Reviewers comment under their own
//name and can resolve, and are rate limited per person. Assigning is for the people who can open the project.
//Review links used to allow guests with a typed name, that option is gone and their old comments just keep the label
//Live updates go out over a small SSE hub per project (not the editing room: reviewers aren't in it)
const commentHubs = new Map(),
	commentLimits = {},

	//haproxy appends the address it saw as the last X-Forwarded-For entry, anything before that is the client's own claim
	clientIP = (req) => {
		let forwarded = String(req.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean)

		return forwarded[forwarded.length - 1] || req.socket?.remoteAddress || 'unknown'
	},

	hubSend = (projectID, event, data) => {
		for (let c of commentHubs.get(projectID) || []) {
			sseSend(c.res, event, data)
		}
	},

	hubJoin = (req, res, projectID, token) => {
		let client = {res, token: token || null},
			set = commentHubs.get(projectID) || new Set()

		commentHubs.set(projectID, set)
		set.add(client)
		res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'})
		res.write(':ok\n\n')
		sseSend(res, 'hello', {})

		//Under haproxy's 25s server timeout, same as the editing stream
		let beat = setInterval(() => res.write(':\n\n'), 15 * 1000)

		req.on('close', () => {
			clearInterval(beat)
			set.delete(client)

			if (!set.size) {
				commentHubs.delete(projectID)
			}
		})
	},

	//Everyone watching a project's comments is cut off (the project went, or the review link did)
	hubEnd = (projectID, token) => {
		for (let c of [...(commentHubs.get(projectID) || [])]) {
			if (!token || c.token === token) {
				c.res.end()
			}
		}
	},

	commentID = () => `cm${crypto.randomBytes(9).toString('hex')}`,

	threadOne = async (projectID, threadID) => commentLib.threadsOf(await commentRows.find({project: projectID, thread: threadID}).sort({created: 1}).toArray())[0] || null,

	threadsFor = async (projectID) => commentLib.threadsOf(await commentRows.find({project: projectID}).sort({created: 1}).toArray()),

	//Who is writing. Signed in is the session's word
	commentActor = (req, doc, via, body) => {
		let me = whoIs(req),
			manager = via === 'editor' || (!!me?.username && (me.username === doc.owner?.username || isPower(req)))

		if (me?.username) {
			return {by: {username: me.username, userID: me.userID, name: me.name || me.username}, signed: true, manager}
		}

		//The review page never gets here without a session (reviewProject asks first)
		if (via === 'review') {
			return null
		}

		//The editor with no session at all (dev without si-manager): a label, same as the editing stream's
		return {by: {username: null, name: commentLib.cleanName(body?.name) || 'Guest'}, signed: false, manager: true}
	},

	sameAuthor = (row, actor) => !!actor.by.username && row.by?.username === actor.by.username,

	//Counts one write against the limit, a generous per person ceiling (the address stands in for the editor with no session)
	commentAllowed = (c) => commentLimits.person.hit(c.actor.by.username || c.ip),

	//In-app notices for the people a write is about, unless they switched them off in their preferences
	notify = async (c, thread, kind, text, mentions, assignee) => {
		let list = commentLib.noticesFor({thread, by: c.actor.by, kind, mentions, assignee}),
			now = new Date(),
			sent = []

		for (let n of list) {
			try {
				let p = await prefs.findOne({_id: n.user})

				if (p?.prefs?.commentNotices === false) {
					continue
				}

				await commentNotices.insertOne({_id: commentID(), user: n.user, project: c.doc._id, projectName: c.doc.name, thread: thread.id, n: thread.n, kind: n.kind, by: c.actor.by.name, text: commentLib.snippet(text), at: now, read: false})
				sent.push(n)
			}
			catch (err) {
				console.trace(`${appName}: comment notice for ${n.user} failed`, err)
			}
		}

		return sent
	},

	publish = (c, thread, sent) => hubSend(c.doc._id, 'thread', {thread, by: c.actor.by.name, notify: sent || []}),

	tooMany = {status: 429, body: {error: 'That is a lot of comments in a short time. Wait a few minutes and try again'}},

	commentOps = {
		async create(c, body) {
			let text = commentLib.cleanText(body.text),
				anchor = commentLib.cleanAnchor(body.anchor)

			if (!text) {
				return {status: 400, body: {error: `Write a comment first (up to ${commentLib.LIMITS.text} characters)`}}
			}

			if (!anchor) {
				return {status: 400, body: {error: 'Pin the comment on an artboard'}}
			}

			if (!commentAllowed(c)) {
				return tooMany
			}

			let rows = await commentRows.find({project: c.doc._id}, {projection: {n: 1, root: 1}}).toArray()

			if (rows.length >= commentLib.LIMITS.perProject) {
				return {status: 409, body: {error: 'This project has as many comments as it can hold'}}
			}

			let id = commentID(),
				now = new Date(),
				mentions = commentLib.cleanMentions(body.mentions),
				assignee = null

			if (c.actor.manager && body.assignee) {
				assignee = commentLib.cleanAssignee(body.assignee)
			}

			await commentRows.insertOne({
				_id: id,
				project: c.doc._id,
				thread: id,
				root: true,
				n: rows.reduce((max, r) => r.root ? Math.max(max, r.n || 0) : max, 0) + 1,
				anchor,
				context: commentLib.cleanContext(body.context),
				status: 'open',
				assignee,
				resolved: null,
				by: c.actor.by,
				text,
				mentions,
				created: now,
				updated: now
			})

			let thread = await threadOne(c.doc._id, id),
				sent = await notify(c, thread, 'root', text, mentions, assignee)

			publish(c, thread, sent)

			return {status: 200, body: {thread}}
		},

		async reply(c, threadID, body) {
			let text = commentLib.cleanText(body.text)

			if (!text) {
				return {status: 400, body: {error: `Write a reply first (up to ${commentLib.LIMITS.text} characters)`}}
			}

			let root = commentLib.validCommentID(threadID) && await commentRows.findOne({_id: threadID, project: c.doc._id, root: true})

			if (!root) {
				return {status: 404, body: {error: 'No such comment'}}
			}

			if (!commentAllowed(c)) {
				return tooMany
			}

			let have = await commentRows.find({thread: threadID}, {projection: {_id: 1}}).toArray()

			if (have.length >= commentLib.LIMITS.perThread) {
				return {status: 409, body: {error: 'This conversation is full. Start a new comment'}}
			}

			let now = new Date(),
				mentions = commentLib.cleanMentions(body.mentions)

			await commentRows.insertOne({_id: commentID(), project: c.doc._id, thread: threadID, root: false, by: c.actor.by, text, mentions, created: now})
			await commentRows.updateOne({_id: threadID}, {$set: {updated: now}})

			let thread = await threadOne(c.doc._id, threadID),
				sent = await notify(c, thread, 'reply', text, mentions, null)

			publish(c, thread, sent)

			return {status: 200, body: {thread}}
		},

		//Resolve or reopen (anyone signed in), hand it to someone (the people who can open the project)
		async patch(c, threadID, body) {
			let root = commentLib.validCommentID(threadID) && await commentRows.findOne({_id: threadID, project: c.doc._id, root: true})

			if (!root) {
				return {status: 404, body: {error: 'No such comment'}}
			}

			let set = {},
				assignee = null,
				now = new Date()

			if (body.status !== undefined) {
				let status = commentLib.cleanStatus(body.status)

				if (!status) {
					return {status: 400, body: {error: 'Status is open or resolved'}}
				}

				set.status = status
				set.resolved = status === 'resolved' ? {by: c.actor.by, at: now} : null
			}

			if (body.assignee !== undefined) {
				if (!c.actor.manager) {
					return {status: 403, body: {error: 'Only the people who can open the project can assign comments'}}
				}

				assignee = body.assignee === null ? null : commentLib.cleanAssignee(body.assignee)

				if (body.assignee !== null && !assignee) {
					return {status: 400, body: {error: 'Pick a person'}}
				}

				set.assignee = assignee
			}

			if (!Object.keys(set).length) {
				return {status: 400, body: {error: 'Nothing to change'}}
			}

			if (!commentAllowed(c)) {
				return tooMany
			}

			set.updated = now
			await commentRows.updateOne({_id: threadID}, {$set: set})

			let thread = await threadOne(c.doc._id, threadID),
				sent = assignee && assignee.username !== root.assignee?.username ? await notify(c, thread, 'root', root.text, [], assignee) : []

			publish(c, thread, sent)

			return {status: 200, body: {thread}}
		},

		async edit(c, threadID, messageID, body) {
			let row = commentLib.validCommentID(threadID) && commentLib.validCommentID(messageID) && await commentRows.findOne({_id: messageID, thread: threadID, project: c.doc._id}),
				text = commentLib.cleanText(body.text)

			if (!row) {
				return {status: 404, body: {error: 'No such comment'}}
			}

			if (!sameAuthor(row, c.actor) && !c.actor.manager) {
				return {status: 403, body: {error: 'That comment is somebody else\'s'}}
			}

			if (!text) {
				return {status: 400, body: {error: `Write a comment first (up to ${commentLib.LIMITS.text} characters)`}}
			}

			if (!commentAllowed(c)) {
				return tooMany
			}

			await commentRows.updateOne({_id: messageID}, {$set: {text, mentions: commentLib.cleanMentions(body.mentions), edited: new Date()}})

			let thread = await threadOne(c.doc._id, threadID)

			publish(c, thread)

			return {status: 200, body: {thread}}
		},

		//A reply, or (no message id, or the first message's) the whole thread
		async remove(c, threadID, messageID) {
			let row = commentLib.validCommentID(threadID) && (messageID === undefined || commentLib.validCommentID(messageID)) && await commentRows.findOne({_id: messageID || threadID, thread: threadID, project: c.doc._id})

			if (!row) {
				return {status: 404, body: {error: 'No such comment'}}
			}

			if (!sameAuthor(row, c.actor) && !c.actor.manager) {
				return {status: 403, body: {error: 'That comment is somebody else\'s'}}
			}

			if (row.root) {
				await commentRows.deleteMany({thread: threadID, project: c.doc._id})
				await commentNotices.deleteMany({thread: threadID})
				hubSend(c.doc._id, 'gone', {id: threadID})

				return {status: 200, body: {ok: true}}
			}

			await commentRows.deleteOne({_id: row._id})

			let thread = await threadOne(c.doc._id, threadID)

			publish(c, thread)

			return {status: 200, body: {thread}}
		}
	},

	reply = (res, out) => res.status(out.status).json(out.body)

//The editor's side. projectFor has checked the owner (or power user) and the project id
router.get('/api/projects/:id/comments', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let threads = await threadsFor(doc._id)

	res.json({threads, people: commentLib.peopleOf(threads, doc.owner), me: commentActor(req, doc, 'editor').by, review: doc.review ? {token: doc.review.token} : null})
})

router.get('/api/projects/:id/comments/live', async (req, res) => {
	let doc = await projectFor(req, res)

	if (doc) {
		hubJoin(req, res, doc._id)
	}
})

//One door for the writes: the project, who is writing, and the address for the limits
const editorComment = (handler) => async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	reply(res, await handler({doc, actor: commentActor(req, doc, 'editor', req.body), ip: clientIP(req), token: null}, req))
}

router.post('/api/projects/:id/comments', express.json({limit: '16kb'}), editorComment((c, req) => commentOps.create(c, req.body)))
router.post('/api/projects/:id/comments/:cid/replies', express.json({limit: '16kb'}), editorComment((c, req) => commentOps.reply(c, req.params.cid, req.body)))
router.patch('/api/projects/:id/comments/:cid', express.json({limit: '16kb'}), editorComment((c, req) => commentOps.patch(c, req.params.cid, req.body)))
router.patch('/api/projects/:id/comments/:cid/messages/:mid', express.json({limit: '16kb'}), editorComment((c, req) => commentOps.edit(c, req.params.cid, req.params.mid, req.body)))
router.delete('/api/projects/:id/comments/:cid/messages/:mid', editorComment((c, req) => commentOps.remove(c, req.params.cid, req.params.mid)))
router.delete('/api/projects/:id/comments/:cid', editorComment((c, req) => commentOps.remove(c, req.params.cid)))

//The review link: a second token, apart from the share link, that opens the project for looking at and commenting on
router.get('/api/projects/:id/review', async (req, res) => {
	let doc = await projectFor(req, res)

	if (doc) {
		//The guests flag an old link might still carry isn't passed on, it does nothing now
		res.json({review: doc.review ? {...doc.review, guests: undefined} : null})
	}
})

router.put('/api/projects/:id/review', express.json({limit: '1kb'}), async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let review = {token: doc.review?.token || crypto.randomBytes(18).toString('base64url'), created: doc.review?.created || new Date(), updated: new Date(), by: whoIs(req)}

	await projects.updateOne({_id: doc._id}, {$set: {review}})
	audit(req, doc.review?.token ? 'review-updated' : 'review-on', doc)
	res.json({review})
})

//Turning it off ends the link and anyone watching through it. The comments stay, for the owner
router.delete('/api/projects/:id/review', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	await projects.updateOne({_id: doc._id}, {$unset: {review: ''}})
	if (doc.review?.token) audit(req, 'review-off', doc)

	if (doc.review?.token) {
		hubEnd(doc._id, doc.review.token)
	}

	res.json({ok: true})
})

//In-app notices: assigned to you, mentioned, a reply in a thread you are in. The newest 50, and what is unread
router.get('/api/notices', async (req, res) => {
	let user = whoIs(req)?.username

	if (!user) {
		return res.json({unread: 0, items: []})
	}

	let items = await commentNotices.find({user}).sort({at: -1}).limit(50).toArray()

	res.json({unread: items.filter((n) => !n.read).length, items})
})

router.post('/api/notices/read', express.json({limit: '4kb'}), async (req, res) => {
	let user = whoIs(req)?.username

	if (!user) {
		return res.json({ok: true})
	}

	let filter = {user, read: false}

	if (typeof req.body.project === 'string' && validID(req.body.project)) {
		filter.project = req.body.project
	}

	if (typeof req.body.thread === 'string' && commentLib.validCommentID(req.body.thread)) {
		filter.thread = req.body.thread
	}

	await commentNotices.updateMany(filter, {$set: {read: true}})
	res.json({ok: true})
})

//The review page's side. The link alone gets nobody in, it takes a signed in session as well: a StudyDesk one inside
//StudyDesk, or the direct sign in token when the link was opened in its own tab. That one is its own tool in si-manager's
//registry ('interactives-review', any staff member) so a reviewer doesn't need to be an Interactives beta tester, but
//someone who already holds the editor's 'interactives' token gets in on that too. A token only resolves for the tool it
//was issued for, so the lookups are tried in turn. The session is read here and refused in reviewProject, with a reply the
//page knows how to read. That refusal doesn't wait for SUITE_SESSION_ENFORCE, the link on its own never opens anything
const REVIEW_TOKEN = /^[\w-]{16,64}$/,
	reviewTools = ['interactives-review', 'interactives'],

	reviewChecks = reviewTools.map((tool) => sessionCheck({optional: true, tool})),

	reviewSession = async (req, res, next) => {
		for (let check of reviewChecks) {
			await new Promise((resolve) => check(req, res, resolve))

			if (req.sessionData?.user) {
				break
			}
		}

		next()
	}

router.use('/review', cacheHeaders.api, reviewSession, (req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('X-Robots-Tag', 'noindex')
	next()
})

const reviewProject = async (req, res, full) => {
	let token = req.params.token,
		doc = REVIEW_TOKEN.test(token) && await projects.findOne({'review.token': token}, full ? {} : {projection: {doc: 0}})

	if (!doc) {
		res.status(404).json({error: 'This review link has been turned off, or never existed'})
		return null
	}

	if (!whoIs(req)?.username) {
		res.status(401).json({error: 'Sign in to StudyDesk to review this project', signin: true})
		return null
	}

	return doc
}

router.get('/review/:token', async (req, res) => {
	let doc = await reviewProject(req, res, true)

	if (!doc) {
		return
	}

	let room = rooms.get(doc._id),
		threads = await threadsFor(doc._id),
		actor = commentActor(req, doc, 'review')

	res.json({
		id: doc._id,
		name: doc.name,
		//Reviewers are not editors: sticky notes stay with the people making the project
		project: notesLib.stripNotes(room ? room.doc : await store.parse(doc)),
		me: actor ? {...actor.by, manager: actor.manager} : null,
		owner: doc.owner ? {username: doc.owner.username, name: doc.owner.name} : null,
		threads,
		people: commentLib.peopleOf(threads, doc.owner)
	})
})

//The project's pictures, fonts and the rest, by the link instead of a session. Same rules as the editor's asset route
router.get('/review/:token/assets/:assetId', async (req, res) => {
	let doc = await reviewProject(req, res)

	if (!doc) {
		return
	}

	if (!validID(req.params.assetId)) {
		return res.status(400).json({error: 'Bad id'})
	}

	let file = assetFile(doc._id, req.params.assetId),
		meta

	try {
		meta = JSON.parse(await fs.promises.readFile(`${file}.json`, 'utf8'))
	}
	catch (e) {
		return res.status(404).json({error: 'No such asset'})
	}

	res.setHeader('Cache-Control', 'private, max-age=3600')
	safety.assetHeaders(res, meta.mime)
	res.sendFile(file, (err) => {
		if (err && !res.headersSent) {
			res.status(404).json({error: 'No such asset'})
		}
	})
})

router.get('/review/:token/live', async (req, res) => {
	let doc = await reviewProject(req, res)

	if (doc) {
		hubJoin(req, res, doc._id, req.params.token)
	}
})

const reviewComment = (handler) => async (req, res) => {
	let doc = await reviewProject(req, res)

	if (!doc) {
		return
	}

	let actor = commentActor(req, doc, 'review', req.body)

	if (!actor) {
		return res.status(401).json({error: 'Sign in to StudyDesk to review this project', signin: true})
	}

	reply(res, await handler({doc, actor, ip: clientIP(req), token: req.params.token}, req))
}

router.post('/review/:token/comments', express.json({limit: '16kb'}), reviewComment((c, req) => commentOps.create(c, req.body)))
router.post('/review/:token/comments/:cid/replies', express.json({limit: '16kb'}), reviewComment((c, req) => commentOps.reply(c, req.params.cid, req.body)))
router.patch('/review/:token/comments/:cid', express.json({limit: '16kb'}), reviewComment((c, req) => commentOps.patch(c, req.params.cid, req.body)))
router.patch('/review/:token/comments/:cid/messages/:mid', express.json({limit: '16kb'}), reviewComment((c, req) => commentOps.edit(c, req.params.cid, req.params.mid, req.body)))
router.delete('/review/:token/comments/:cid/messages/:mid', reviewComment((c, req) => commentOps.remove(c, req.params.cid, req.params.mid)))
router.delete('/review/:token/comments/:cid', reviewComment((c, req) => commentOps.remove(c, req.params.cid)))

router.use('/review', (err, req, res, next) => {
	console.trace(`${appName} review error`, err)

	if (res.headersSent) {
		return next(err)
	}

	res.status(err.status || 500).json({error: err.type === 'entity.too.large' ? 'That is too long' : 'Something went wrong on the server'})
})

//Results of a learner who is playing a shared project: lti-analytics.interactives-user-data, one record per
//project + username + course (the unique index is in suite-libs/indexes.js). The learner is whoever the suite
//session says, never anything in the request. These sit outside /api on purpose: that is staff only, and the
//people playing a project are mostly students. The project comes from the share token, so a project only
//collects results while its share link is on. No session (dev, or a link opened outside StudyDesk) means nothing
//is kept here, and the player falls back to the learner's own browser
//Someone launched from another LMS over LTI 1.3 (lti13.js) has no suite session; their launch session, sent by the learner page
//in X-LTI-Session, stands in for it, but only for the project they were launched into
const lti13 = require('./lti13')({express, isPower: (req) => isPower(req), whoIs: (req) => whoIs(req), clientIP: (req) => clientIP(req)})

const learnerOf = (req) => {
	if (req.ltiLearner) {
		return req.ltiLearner.token === req.params.token ? lti13.learner(req.ltiLearner) : null
	}

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

//Two first saves at once both try to insert, the unique index lets one win and the other goes again as an update.
//build can say no (null) to what it was given, and then nothing is written and this answers false
const saveRecord = async (key, build, into = userData) => {
	for (let tries = 0; ; tries++) {
		let existing = await into.findOne(key),
			set = build(existing)

		if (!set) {
			return false
		}

		try {
			await into.updateOne(key, {$set: set, $setOnInsert: {created: new Date()}}, {upsert: true})
			return true
		}
		catch (e) {
			if (e.code !== 11000 || tries > 2) {
				throw e
			}
		}
	}
}

const learnSession = sessionCheck({tool: 'interactives'})

router.use('/learn', cacheHeaders.api, lti13.attachLearner, (req, res, next) => req.ltiLearner ? next() : learnSession(req, res, next))

//LTI 1.3: the platform-facing routes are open (the id_token is their credential), the admin ones are power users under the /api session check
router.use('/lti13', cacheHeaders.api, lti13.router)
router.use('/api/lti13', lti13.admin)

//Remix: someone who opened a share link that allows it copies the project into their own projects. Needs a signed in
//editor user (the new project is theirs), so it sits under the same staff session check as the api. The copy is the project
//as it is now, with its files, and nothing else: no tags, folder, collaborators, share link, review link or results
router.use('/remix', cacheHeaders.api, sessionCheck({staff: true, tool: 'interactives'}))

router.post('/remix/:token', async (req, res) => {
	let token = req.params.token

	if (!/^[\w-]{16,64}$/.test(token)) {
		return res.status(404).json({error: 'This share link has been turned off, or never existed'})
	}

	let me = whoIs(req)

	if (!me?.username) {
		return res.status(401).json({error: 'Sign in to StudyDesk to remix this'})
	}

	let doc = await projects.findOne({'share.token': token})

	if (!doc || !fs.existsSync(shareFile(token))) {
		return res.status(404).json({error: 'This share link has been turned off, or never existed'})
	}

	if (!doc.share.remix) {
		return res.status(403).json({error: 'The owner has not allowed remixing this project'})
	}

	let room = rooms.get(doc._id),
		project = room ? JSON.parse(JSON.stringify(room.doc)) : await store.parse(doc)

	//A remix starts fresh: it is not tied to a template the original came from, nor to the original's library
	delete project.template

	let made = await createProjectFrom(req, project, {name: `${doc.name} (remix)`, filesFrom: projectDir(doc._id), thumbFrom: fs.existsSync(thumbFile(doc._id)) ? thumbFile(doc._id) : null, extra: {remixOf: {id: doc._id, name: doc.name, owner: doc.owner || null}}})

	snapshot(made.id, made.doc, 1, me, 'Remixed from a share link').catch((err) => console.trace(`${appName}: revision of ${made.id} failed`, err))
	res.json({ok: true, id: made.id})
})

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

	//A project with questions marked on the server takes its results from that marking alone. What the browser says about a score
	//is its own word, so it is dropped (the player still tells the page around it, which is no business of the record)
	if (markingOf(project)) {
		return res.json({available: true, ok: true, ignored: true})
	}

	let result = learner.cleanResult(req.body)

	if (!result) {
		return res.status(400).json({error: 'That result is not the right shape'})
	}

	await saveRecord({project: project._id, username: who.username, course: who.course}, (existing) => learner.reportUpdate(existing, result, who, new Date()))
	res.json({available: true, ok: true})
})

//What the spelling guard found in the learner's browser (writing tools, answers that changed without typing, the exemption code
//used), kept on their record for the teacher. Not marked on the server, so it works the same for server-marked projects
router.post('/learn/:token/guard', express.json({limit: '4kb'}), async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let clean = learner.cleanGuard(req.body)

	if (!clean) {
		return res.status(400).json({error: 'That is not the right shape'})
	}

	await saveRecord({project: project._id, username: who.username, course: who.course}, (existing) => learner.guardUpdate(existing, clean, who, new Date()))
	res.json({available: true, ok: true})
})

//The answer key of a project's server-marked questions, or null when it has none
const markingOf = (project) => project.marking?.questions && Object.keys(project.marking.questions).length ? project.marking : null

//Writes a learner's record only if nobody else has since it was read (markRev counts the writes marking has made), so two checks sent
//at once can't both be counted against the same tries. build gets what is there and returns the fields to set, or null to leave it.
//False if it kept losing the race
const markWrite = async (key, build) => {
	for (let tries = 0; tries < 6; tries++) {
		let existing = await userData.findOne(key),
			set = build(existing)

		if (!set) {
			return true
		}

		let rev = existing?.markRev ?? null

		try {
			let r = await userData.updateOne({...key, markRev: rev}, {$set: {...set, markRev: (rev || 0) + 1}, $setOnInsert: {created: new Date()}}, {upsert: !existing})

			if (!existing || r.matchedCount) {
				return true
			}
		}
		catch (e) {
			if (e.code !== 11000) {
				throw e
			}
		}
	}

	return false
}

//Grade passback. A learner who came in over LTI 1.3 with a line item (lti13.learner gives who.lti) has the result of a project marked
//on the server sent to their gradebook once every question is finished, and again whenever the result on record changes. What was
//sent and whether it got there is kept on their record (grade), so nothing is sent twice and a failure is tried again: a few seconds
//later, and with the learner's next request. It is the server's own marking that is sent, never what the page says.
const gradeRetryMs = Number(process.env.IX_GRADE_RETRY_MS ?? 30000)

const passGradeBack = async (project, key, who, retry = true) => {
	if (!who.lti) {
		return
	}

	let id = {project: project._id, username: who.username, course: who.course},
		record = await userData.findOne(id),
		result = record ? marker.resultOf(key, marker.pruneStates(key, marker.parseStates(record.marked))) : null

	if (!result?.completed) {
		return
	}

	let sent = record.grade

	if (sent && sent.score === result.score && sent.max === result.max && (sent.ok || (retry && Date.now() - new Date(sent.at).getTime() < 20000))) {
		return
	}

	let r = await lti13.grade.send(who.lti, result.score, result.max)

	await userData.updateOne(id, {$set: {grade: {score: result.score, max: result.max, ok: r.ok, ...(r.ok ? {} : {why: r.why}), at: new Date()}}})

	if (!r.ok && retry && gradeRetryMs > 0) {
		setTimeout(() => passGradeBack(project, key, who, false).catch((e) => console.trace(`${appName}: grade passback retry`, e)), gradeRetryMs).unref()
	}
}

//Marking, hints and starting again for a question set to be marked on the server. The learner is whoever the session says; the
//answer is marked by the player's own marking code against the key kept at share time, the tries, hints and the mark that counts
//are kept on the learner's record, and the result is worked out from those. Checks and hints are rate limited per learner
router.post('/learn/:token/check', express.json({limit: '8kb'}), async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let key = markingOf(project)

	if (!key) {
		return res.status(404).json({error: 'Nothing in this project is marked on the server'})
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let request = marker.cleanMarkRequest(req.body)

	if (!request) {
		return res.status(400).json({error: 'That is not a request the marker understands'})
	}

	if (marker.RATE_LIMITED.includes(request.action)) {
		let taken = markLimiter.take(`${project._id}:${who.username}`, Date.now())

		if (!taken.ok) {
			return res.json({available: true, status: 'limited', retryAfter: taken.retryAfter})
		}
	}

	let step = null,
		now = new Date(),
		kept = await markWrite({project: project._id, username: who.username, course: who.course}, (existing) => {
			let before = marker.parseStates(existing?.marked)

			step = marker.stepMarking(key, before, request, markedIds(key.salt))

			if (step.error || step.states === before) {
				return null
			}

			let set = {...learner.identity(who), marked: JSON.stringify(marker.pruneStates(key, step.states)), updated: now}

			//A question finished for the first time: its mark counts now, so the record's result moves with it
			if (step.counted) {
				let result = learner.cleanResult(marker.resultOf(key, step.states))

				set = {...set, ...learner.reportUpdate(existing, result, who, now)}
			}

			return set
		})

	if (step.error) {
		return res.status(400).json({error: step.error})
	}

	if (!kept) {
		return res.json({available: true, status: 'busy'})
	}

	res.json({available: true, ...step.reply})

	if (who.lti) {
		passGradeBack(project, key, who).catch((e) => console.trace(`${appName}: grade passback`, e))
	}
})

//User data (Save user data / Load user data nodes), for the learner whose session this is, in the project the share
//token belongs to. Its own collection, interactives-activity-user-data, so it never gets mixed up with progress. Same
//rules as progress: identity off the session, {available: false} with no session so the player uses the browser
router.get('/learn/:token/user-data', async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let names = learner.userDataNames(req.query.names),
		doc = names.length ? await activityData.findOne({project: project._id, username: who.username, course: who.course}) : null

	res.json({available: true, variables: learner.userDataOut(doc, names)})
})

router.put('/learn/:token/user-data', express.json({limit: '100kb'}), async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let who = learnerOf(req)

	if (!who) {
		return res.json({available: false})
	}

	let clean = learner.cleanUserData(req.body)

	if (!clean) {
		return res.status(400).json({error: 'That user data is not the right shape'})
	}

	if (!await saveRecord({project: project._id, username: who.username, course: who.course}, (existing) => learner.userDataUpdate(existing, clean, who, new Date()), activityData)) {
		return res.status(413).json({error: 'That is more user data than one person can keep in a project'})
	}

	res.json({available: true, ok: true})
})

//Shared responses: short answers people add that a whole class sees counted (a word cloud, a poll). A shared page declares its
//sources when it is shared (share.shared, by data source id: who sees, the limits, the blocklist), and these routes hold to that,
//never to what a browser sends. Identity is the session's, like user data. Answers a person adds for "Only me" are kept apart
//(own) from the ones the class sees (answers), so changing a project's setting later never shows anyone what they kept to themselves.
//Counts come back, never names. A class is a project + course; the unique index on project, source, course and username is what
//makes one list per person.
const sharedCache = new Map(),
	sharedCacheMs = 3000,
	sharedKeyOf = (project, source, course) => `${project}|${source}|${course}`,

	//The class's lists with no usernames in them, held a few seconds so a room full of players polling is not a room full of queries
	sharedClass = async (project, source, course) => {
		let key = sharedKeyOf(project, source, course),
			hit = sharedCache.get(key)

		if (hit && Date.now() - hit.at < sharedCacheMs) {
			return hit
		}

		let docs = await sharedRows.find({project, source, course}, {projection: {username: 0}}).toArray(),
			hidden = await sharedHidden.findOne({project, source, course}),
			next = {at: Date.now(), docs: docs.map((d) => ({answers: d.answers || []})), hidden: new Set(hidden?.keys || [])}

		sharedCache.set(key, next)

		if (sharedCache.size > 500) {
			for (let [k, v] of sharedCache) {
				if (Date.now() - v.at > sharedCacheMs) {
					sharedCache.delete(k)
				}
			}
		}

		return next
	},

	sharedForget = (project, source, course) => sharedCache.delete(sharedKeyOf(project, source, course)),

	//What this person is told: the class's counts or their own list, and their own list and allowance either way
	sharedValue = async (at, who, problem = '') => {
		let {project, person, declared, source} = at,
			row = await sharedRows.findOne({project: project._id, source, course: person.course, username: person.username}),
			mine = (who === 'me' ? row?.own : row?.answers || []) || [],
			klass = who === 'me' ? {docs: [], hidden: new Set()} : await sharedClass(project._id, source, person.course)

		return responses.valueFor({declared, who, docs: klass.docs, mine: mine.map((a) => a.text), hidden: klass.hidden, problem})
	},

	//The project, the person (off the session) and what the owner declared for this source, or the reply already sent
	sharedAt = async (req, res) => {
		let project = await sharedProject(req, res)

		if (!project) {
			return null
		}

		let person = learnerOf(req)

		if (!person) {
			res.json({available: false})
			return null
		}

		let source = req.params.source,
			declared = project.share?.shared?.[source]

		if (!declared) {
			res.status(404).json({error: 'That project has no such shared responses (share it again after adding them)'})
			return null
		}

		return {project, person, declared, source}
	}

router.get('/learn/:token/shared/:source', async (req, res) => {
	let at = await sharedAt(req, res)

	if (!at) {
		return
	}

	let who = responses.effectiveWho(at.declared, req.query.who)

	if (!sharedLimits.read.hit(`${at.project._id}|${at.person.username}`)) {
		return res.json({available: true, ok: true, value: null, problem: 'busy'})
	}

	res.json({available: true, ok: true, value: await sharedValue(at, who)})
})

router.post('/learn/:token/shared/:source', express.json({limit: '4kb'}), async (req, res) => {
	let at = await sharedAt(req, res)

	if (!at) {
		return
	}

	let {project, person, declared, source} = at,
		who = responses.effectiveWho(declared, req.body?.who),
		busy = !sharedLimits.write.hit(`${project._id}|${person.username}`)

	if (busy) {
		return res.json({available: true, ok: true, kept: 0, value: {...(await sharedValue(at, who, 'busy'))}})
	}

	let key = {project: project._id, source, course: person.course, username: person.username},
		field = who === 'me' ? 'own' : 'answers',
		plan = null

	let saved = await saveRecord(key, (existing) => {
		plan = responses.planAdd(existing?.[field] || [], req.body?.answers, declared)

		return plan.kept ? {[field]: plan.list, updated: new Date()} : null
	}, sharedRows)

	if (saved) {
		sharedForget(project._id, source, person.course)

		if (who === 'class') {
			sharedNudge(project._id, source, person.course)
		}
	}

	res.json({available: true, ok: true, kept: saved ? plan.kept : 0, value: await sharedValue(at, who, plan?.problem || '')})
})

router.post('/learn/:token/shared/:source/withdraw', express.json({limit: '4kb'}), async (req, res) => {
	let at = await sharedAt(req, res)

	if (!at) {
		return
	}

	let {project, person, declared, source} = at,
		who = responses.effectiveWho(declared, req.body?.who)

	if (!sharedLimits.write.hit(`${project._id}|${person.username}`)) {
		return res.json({available: true, ok: true, value: await sharedValue(at, who, 'busy')})
	}

	let key = {project: project._id, source, course: person.course, username: person.username},
		field = who === 'me' ? 'own' : 'answers'

	let changed = await saveRecord(key, (existing) => existing && existing[field]?.length ? {[field]: responses.planWithdraw(existing[field], req.body?.answers, declared), updated: new Date()} : null, sharedRows)
	sharedForget(project._id, source, person.course)

	if (changed && who === 'class') {
		sharedNudge(project._id, source, person.course)
	}

	res.json({available: true, ok: true, value: await sharedValue(at, who)})
})

//Live nudges for shared responses. A learner page opens one stream (server-sent events, over fetch, so it can send the session
//headers) and the server says "changed" on it when somebody in the same project and course adds, takes back, hides or clears an
//answer. The nudge is only the source id: no answer, no name, no count. The page hands it to the player, which reads the class
//the normal way (same route, same privacy, same blocked words), so this can never show anybody more than a poll would. The poll
//stays as the fallback, and the player slows it down while the stream is up.
//One stream per open learner page, closed when it leaves and after sharedLiveAge anyway (so a share link turned off, or a session
//that ended, stops holding it). A person has three at most (a second tab, a reconnect before the old one is noticed gone), a course
//has sharedLiveMax, the box has sharedLiveTotalMax, and opening one is rate limited. Over any of those the page just keeps polling.
//Nudges are coalesced: at most one per source every sharedLiveEvery ms for a course, however many people add at once.
const sharedLive = new Map(),
	sharedLiveEvery = 400,
	sharedLiveAge = 20 * 60 * 1000,
	sharedLiveMax = () => Number(process.env.INTERACTIVES_LIVE_PER_COURSE) || 600,
	sharedLiveTotalMax = () => Number(process.env.INTERACTIVES_LIVE_TOTAL) || 5000,
	sharedLiveCount = {open: 0},

	sharedLiveSend = (hub, stream, event, data) => {
		//A page that stopped reading is cut loose rather than buffered for
		if (stream.res.writableLength > 16 * 1024) {
			stream.res.destroy()
			return
		}

		try {
			sseSend(stream.res, event, data)
		}
		catch (e) {
		}
	},

	sharedLiveFlush = (hub) => {
		clearTimeout(hub.timer)
		hub.timer = null
		hub.last = Date.now()

		for (let source of hub.pending) {
			for (let stream of [...hub.streams]) {
				sharedLiveSend(hub, stream, 'changed', {source})
			}
		}

		hub.pending.clear()
	},

	sharedNudge = (project, source, course) => {
		let hub = sharedLive.get(sharedKeyOf(project, '', course || ''))

		if (!hub) {
			return
		}

		hub.pending.add(source)
		let wait = hub.last + sharedLiveEvery - Date.now()

		if (wait <= 0) {
			return sharedLiveFlush(hub)
		}

		if (!hub.timer) {
			hub.timer = setTimeout(() => sharedLiveFlush(hub), wait)
			hub.timer.unref?.()
		}
	},

	//Every stream a project has (its share link went off, or the project is gone): they end, and the pages go back to polling
	sharedLiveEndProject = (project) => {
		roomEndProject(project)

		for (let [key, hub] of [...sharedLive]) {
			if (key.startsWith(`${project}|`)) {
				for (let stream of [...hub.streams]) {
					sharedLiveSend(hub, stream, 'bye', {})
					stream.res.end()
				}
			}
		}
	}

router.get('/learn/:token/shared-live', async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return
	}

	let person = learnerOf(req)

	//No session, or a project with nothing shared in it: nothing to listen for, and the page keeps to its own poll
	if (!person || !Object.keys(project.share?.shared || {}).length) {
		return res.json({available: false})
	}

	if (!sharedLimits.live.hit(`${project._id}|${person.username}`)) {
		return res.status(429).json({available: true, live: false, problem: 'busy'})
	}

	let key = sharedKeyOf(project._id, '', person.course || ''),
		hub = sharedLive.get(key)

	if (sharedLiveCount.open >= sharedLiveTotalMax() || (hub?.streams.size || 0) >= sharedLiveMax()) {
		return res.status(503).json({available: true, live: false, problem: 'full'})
	}

	if (!hub) {
		hub = {streams: new Set(), pending: new Set(), last: 0, timer: null}
		sharedLive.set(key, hub)
	}

	//A fourth tab or a quick reconnect: the person's oldest stream makes way
	let mine = [...hub.streams].filter((s) => s.username === person.username)

	if (mine.length >= 3) {
		mine[0].res.end()
	}

	res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'})
	res.write(':ok\n\n')

	let stream = {res, username: person.username},
		finished = false

	hub.streams.add(stream)
	sharedLiveCount.open++
	sharedLiveSend(hub, stream, 'hello', {live: true})

	//Under haproxy's 25s server timeout, like the editing stream
	let beat = setInterval(() => sharedLiveSend(hub, stream, 'beat', {}), 15 * 1000),
		old = setTimeout(() => {
			sharedLiveSend(hub, stream, 'bye', {})
			res.end()
		}, sharedLiveAge + Math.floor(Math.random() * 2 * 60 * 1000))

	old.unref?.()

	res.on('close', () => {
		if (finished) {
			return
		}

		finished = true
		clearInterval(beat)
		clearTimeout(old)
		hub.streams.delete(stream)
		sharedLiveCount.open--

		if (!hub.streams.size) {
			clearTimeout(hub.timer)

			if (sharedLive.get(key) === hub) {
				sharedLive.delete(key)
			}
		}
	})
})

//Rooms: a live message list for the people in one project and course, over a WebSocket (the learner page holds it, see roomLink in
//shared/rooms.mjs and the page below). A browser can't put a header on a WebSocket, so the first message is a hello with the share
//token and the session id, and it goes through the same checks a /learn request does (the LTI launch, then the suite session, then
//learnerOf), and the socket is closed if it doesn't come within a few seconds or doesn't check out. What a room may do is what the
//project declared when it was shared (share.rooms), never what the browser says. Nobody is ever told a username: a person is a seat
//(a keyed hash of who they are and the room) or their first name when the author said so.
//Every message goes into mongo (room-messages) and stays there. Each room has a hub in memory: the last few messages, a numbered log
//of what happened (message, hide, show) and who is in it. The numbers are what a reconnecting page asks "since" about, and the epoch
//says which run of the hub they are from (a restart, or a hub that went idle, starts a new one and the page gets a snapshot instead).
//Hiding a message (the owner or a collaborator, over /api) keeps it in mongo but takes it out of what anybody is told, live.
//Caps are option A's: three sockets a person, INTERACTIVES_LIVE_PER_COURSE a course, INTERACTIVES_LIVE_TOTAL a box (live streams and
//sockets together), and twelve opens a minute a person. There is no limit on how much a person may say, only that one message is at
//most 2000 characters and a socket that sends more than 40 frames in a second is cut off.
const {WebSocketServer} = require('ws')

const roomHubs = new Map(),
	roomConns = new Set(),
	roomCourseCounts = new Map(),
	roomLogKeep = 500,
	roomHelloWait = () => Number(process.env.INTERACTIVES_ROOM_HELLO_MS) || 5000,
	roomHubIdle = 5 * 60 * 1000,
	roomBoot = crypto.randomBytes(6).toString('hex'),
	roomPath = `/${appName}/rooms/ws`,
	roomFatal = new Set(['session', 'nothing', 'nocourse']),
	roomSockets = new WebSocketServer({noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false}),
	roomKey = (project, source, course) => `${project}|${source}|${course}`

//Seats are a keyed hash, so they need a secret that stays the same: INTERACTIVES_ROOM_SECRET, or one made once and kept in storage/
let roomSecretValue = null

const roomSecret = () => {
	if (roomSecretValue) {
		return roomSecretValue
	}

	if (process.env.INTERACTIVES_ROOM_SECRET) {
		return roomSecretValue = process.env.INTERACTIVES_ROOM_SECRET
	}

	let file = path.join(storageDir, '.room-secret')

	try {
		roomSecretValue = fs.readFileSync(file, 'utf8').trim()
	}
	catch (e) {
	}

	if (!roomSecretValue || roomSecretValue.length < 32) {
		roomSecretValue = crypto.randomBytes(32).toString('hex')

		try {
			fs.writeFileSync(file, roomSecretValue, {mode: 0o600})
		}
		catch (e) {
			console.warn(`${appName}: could not keep the room secret in ${file}, seats will change at the next restart`, e.message)
		}
	}

	return roomSecretValue
}

//A message as one person is told it
const roomView = (doc, username) => ({...roomsLib.publicMessage(doc), mine: doc.username === username}),
	roomEventFor = (ev, username) => ev.doc ? {seq: ev.seq, e: ev.e, m: roomView(ev.doc, username)} : {seq: ev.seq, e: ev.e, id: ev.id},
	roomHere = (hub) => new Set([...hub.clients].map((m) => m.username)).size,

	roomPush = (conn, text) => {
		if (conn.ws.readyState !== 1) {
			return
		}

		//A page that stopped reading is cut loose rather than buffered for
		if (conn.ws.bufferedAmount > 64 * 1024) {
			conn.ws.terminate()
			return
		}

		try {
			conn.ws.send(typeof text === 'string' ? text : JSON.stringify(text))
		}
		catch (e) {
		}
	},

	roomBye = (conn, reason) => {
		roomPush(conn, {t: 'bye', reason})

		try {
			conn.ws.close(1000, reason)
		}
		catch (e) {
		}
	},

	roomBroadcast = (hub, ev) => {
		let others = JSON.stringify({t: 'event', room: hub.source, ...roomEventFor(ev, '')}),
			author = ev.doc ? JSON.stringify({t: 'event', room: hub.source, ...roomEventFor(ev, ev.doc.username)}) : others

		for (let m of hub.clients) {
			roomPush(m.conn, ev.doc && ev.doc.username === m.username ? author : others)
		}
	},

	roomLog = (hub, ev) => {
		hub.log.push(ev)

		if (hub.log.length > roomLogKeep) {
			hub.log.shift()
		}
	},

	//Who is here, said at most once a second however many come and go
	roomScheduleHere = (hub) => {
		if (hub.hereTimer) {
			return
		}

		hub.hereTimer = setTimeout(() => {
			hub.hereTimer = null

			let text = JSON.stringify({t: 'here', room: hub.source, n: roomHere(hub)})

			for (let m of hub.clients) {
				roomPush(m.conn, text)
			}
		}, 1000)

		hub.hereTimer.unref?.()
	},

	roomHubFor = async (project, source, course, declared) => {
		let key = roomKey(project, source, course),
			hub = roomHubs.get(key)

		if (!hub) {
			hub = {key, project, source, course, declared, epoch: crypto.randomBytes(4).toString('hex'), seq: 0, log: [], clients: new Set(), messages: [], hereTimer: null, idleTimer: null, chain: Promise.resolve()}
			hub.ready = roomMessages.find({project, source, course, hidden: {$ne: true}}).sort({_id: -1}).limit(declared.show).toArray().then((rows) => {
				hub.messages = rows.reverse()
			})
			roomHubs.set(key, hub)
		}

		hub.declared = declared
		clearTimeout(hub.idleTimer)
		hub.idleTimer = null

		try {
			await hub.ready
		}
		catch (e) {
			if (roomHubs.get(key) === hub) {
				roomHubs.delete(key)
			}

			throw e
		}

		return hub
	},

	roomLeave = (conn, source) => {
		let m = conn.rooms.get(source)

		if (!m) {
			return
		}

		conn.rooms.delete(source)
		m.hub.clients.delete(m)
		roomScheduleHere(m.hub)

		//A hub nobody is in stays a few minutes (a page that dropped and is coming back finds its log), then goes
		if (!m.hub.clients.size && !m.hub.idleTimer) {
			m.hub.idleTimer = setTimeout(() => {
				clearTimeout(m.hub.hereTimer)

				if (!m.hub.clients.size && roomHubs.get(m.hub.key) === m.hub) {
					roomHubs.delete(m.hub.key)
				}
			}, roomHubIdle)
			m.hub.idleTimer.unref?.()
		}
	},

	roomJoin = async (conn, frame) => {
		let source = typeof frame.room === 'string' ? frame.room : '',
			declared = conn.project.share?.rooms?.[source]

		if (!declared || (conn.rooms.size >= 8 && !conn.rooms.has(source))) {
			return roomPush(conn, {t: 'closed', room: source.slice(0, 64)})
		}

		let hub = await roomHubFor(conn.project._id, source, conn.person.course, declared)

		if (conn.dead || conn.ws.readyState !== 1) {
			return
		}

		roomLeave(conn, source)
		clearTimeout(hub.idleTimer)
		hub.idleTimer = null

		let seat = roomsLib.seatFor(roomSecret(), conn.project._id, source, conn.person.course, conn.username),
			m = {conn, hub, username: conn.username, display: roomsLib.displayName(declared, seat, conn.firstName)}

		conn.rooms.set(source, m)
		hub.clients.add(m)

		//A page that is back with an epoch and a number from this hub, and has not missed more than the log holds, is given what it
		//missed. Anything else (a restart, a hub that went idle, a first visit) is a fresh look at the room
		let since = Number.isInteger(frame.since) ? frame.since : -1,
			first = hub.log.length ? hub.log[0].seq : hub.seq + 1,
			here = roomHere(hub)

		if (frame.epoch === hub.epoch && since >= 0 && since <= hub.seq && since >= first - 1) {
			roomPush(conn, {t: 'replay', room: source, epoch: hub.epoch, seq: hub.seq, me: m.display, here, events: hub.log.filter((ev) => ev.seq > since).map((ev) => roomEventFor(ev, conn.username))})
		}
		else {
			roomPush(conn, {t: 'snapshot', room: source, epoch: hub.epoch, seq: hub.seq, me: m.display, here, messages: hub.messages.filter((doc) => !roomsLib.isBlockedMessage(doc.text, declared.blocked)).map((doc) => roomView(doc, conn.username))})
		}

		roomScheduleHere(hub)
	},

	roomSend = (conn, frame) => {
		let source = typeof frame.room === 'string' ? frame.room : '',
			m = conn.rooms.get(source),
			cid = typeof frame.cid === 'string' ? frame.cid.slice(0, 20) : '',
			ack = (ok, problem = '') => roomPush(conn, {t: 'sent', room: source, cid, ok, problem})

		if (!m) {
			return ack(false, 'offline')
		}

		let hub = m.hub,
			text = roomsLib.cleanMessage(frame.text)

		if (!text) {
			return ack(false, 'empty')
		}

		if (roomsLib.isBlockedMessage(text, hub.declared.blocked)) {
			return ack(false, 'blocked')
		}

		let doc = {_id: roomsLib.messageId(), project: hub.project, source, course: hub.course, username: conn.username, seat: m.display, text, at: new Date(), hidden: false}

		//One at a time per room, so the numbers and the ids come out in the same order
		hub.chain = hub.chain.then(async () => {
			await roomMessages.insertOne(doc)

			let ev = {seq: ++hub.seq, e: 'message', doc}

			roomLog(hub, ev)
			hub.messages.push(doc)

			if (hub.messages.length > hub.declared.show) {
				hub.messages.splice(0, hub.messages.length - hub.declared.show)
			}

			roomBroadcast(hub, ev)
			ack(true)
		}).catch((err) => {
			console.trace(`${appName}: room message not kept`, err)
			ack(false, 'busy')
		})
	},

	//The owner hid (or showed again) a message: everybody in the room hears it at once
	roomHideLive = (project, source, course, id, hidden) => {
		let hub = roomHubs.get(roomKey(project, source, course))

		if (!hub) {
			return Promise.resolve()
		}

		hub.chain = hub.chain.then(async () => {
			let ev

			if (hidden) {
				hub.messages = hub.messages.filter((doc) => doc._id !== id)
				ev = {seq: ++hub.seq, e: 'hide', id}
			}
			else {
				let doc = await roomMessages.findOne({_id: id})

				if (!doc || doc.hidden) {
					return
				}

				hub.messages = [...hub.messages.filter((d) => d._id !== id), doc].sort((a, b) => a._id < b._id ? -1 : 1).slice(-hub.declared.show)
				ev = {seq: ++hub.seq, e: 'show', doc}
			}

			roomLog(hub, ev)
			roomBroadcast(hub, ev)
		}).catch((err) => console.trace(`${appName}: room hide not sent`, err))

		return hub.chain
	},

	//The share link went off or the project is gone: the sockets for it end, and the pages stop asking
	roomEndProject = (project) => {
		for (let conn of [...roomConns]) {
			if (conn.project && String(conn.project._id) === String(project)) {
				roomBye(conn, 'nothing')
			}
		}
	},

	//Who this is: the same two checks /learn runs (an LTI launch's own session, then the suite's), run on a stand-in for the request
	//a hello stands for, and then learnerOf. Null when neither knows them
	roomWho = async (conn, token, frame) => {
		let session = typeof frame.session === 'string' && frame.session !== 'null' ? frame.session.slice(0, 1000) : '',
			lti = typeof frame.lti === 'string' ? frame.lti.slice(0, 100) : '',
			headers = {'x-session-id': session, 'x-lti-session': lti, 'user-agent': conn.agent, host: conn.host, referer: ''},
			req = {method: 'WS', originalUrl: roomPath, params: {token}, query: {}, body: {}, sessionData: null, get: (name) => headers[String(name).toLowerCase()] || ''},
			go = (middleware) => new Promise((resolve) => {
				let res = {sendStatus: () => resolve(false), status: () => res, json: () => resolve(false)},
					timer = setTimeout(() => resolve(false), 5000)

				Promise.resolve(middleware(req, res, () => resolve(true))).catch(() => resolve(false)).finally(() => clearTimeout(timer))
			})

		if (!await go(lti13.attachLearner)) {
			return null
		}

		if (!req.ltiLearner && !await go(learnSession)) {
			return null
		}

		let person = learnerOf(req)

		if (!person?.username) {
			return null
		}

		let first = req.sessionData?.user?.firstName || req.sessionData?.user?.firstname || (req.ltiLearner ? String(person.name || '').split(' ')[0] : '')

		return {person, first}
	},

	roomHello = async (conn, frame) => {
		let token = typeof frame.token === 'string' ? frame.token : ''

		if (!/^[\w-]{16,64}$/.test(token)) {
			return roomBye(conn, 'nothing')
		}

		let project = await projects.findOne({'share.token': token}, {projection: {doc: 0}})

		if (!project || !Object.keys(project.share?.rooms || {}).length) {
			return roomBye(conn, 'nothing')
		}

		let who = await roomWho(conn, token, frame)

		if (!who) {
			return roomBye(conn, 'session')
		}

		//A room is a course's: with no course there is nobody to put this person in a room with
		if (!who.person.course) {
			return roomBye(conn, 'nocourse')
		}

		if (conn.dead || conn.ws.readyState !== 1) {
			return
		}

		if (!sharedLimits.rooms.hit(`${project._id}|${who.person.username}`)) {
			return roomBye(conn, 'busy')
		}

		let courseKey = `${project._id}|${who.person.course}`

		if (sharedLiveCount.open + roomConns.size > sharedLiveTotalMax() || (roomCourseCounts.get(courseKey) || 0) >= sharedLiveMax()) {
			return roomBye(conn, 'full')
		}

		//A fourth tab or a quick reconnect: the person's oldest socket makes way
		let mine = [...roomConns].filter((c) => c.helloed && c.username === who.person.username && String(c.project._id) === String(project._id))

		if (mine.length >= 3) {
			roomBye(mine[0], 'refresh')
		}

		conn.helloed = true
		conn.project = project
		conn.person = who.person
		conn.username = who.person.username
		conn.firstName = who.first
		conn.courseKey = courseKey
		roomCourseCounts.set(courseKey, (roomCourseCounts.get(courseKey) || 0) + 1)
		conn.old = setTimeout(() => roomBye(conn, 'refresh'), sharedLiveAge + Math.floor(Math.random() * 2 * 60 * 1000))
		conn.old.unref?.()
		roomPush(conn, {t: 'ready', epoch: roomBoot})
	},

	roomClosed = (conn) => {
		if (conn.dead) {
			return
		}

		conn.dead = true
		clearTimeout(conn.helloTimer)
		clearTimeout(conn.old)

		for (let source of [...conn.rooms.keys()]) {
			roomLeave(conn, source)
		}

		roomConns.delete(conn)

		if (conn.courseKey) {
			let n = (roomCourseCounts.get(conn.courseKey) || 1) - 1

			if (n > 0) {
				roomCourseCounts.set(conn.courseKey, n)
			}
			else {
				roomCourseCounts.delete(conn.courseKey)
			}
		}
	},

	roomConnect = (ws, req) => {
		let conn = {ws, rooms: new Map(), helloed: false, helloing: false, dead: false, alive: true, frames: 0, windowStart: Date.now(), agent: String(req.headers['user-agent'] || ''), host: String(req.headers.host || ''), project: null, person: null, username: ''}

		roomConns.add(conn)
		conn.helloTimer = setTimeout(() => ws.close(4001, 'hello'), roomHelloWait())
		conn.helloTimer.unref?.()
		ws.on('pong', () => {
			conn.alive = true
		})
		ws.on('error', () => {
		})
		ws.on('close', () => roomClosed(conn))
		ws.on('message', (data, isBinary) => {
			//Not ours to understand: text only, and no more than 40 frames in a second (not a limit on talking, a guard for the box)
			let now = Date.now()

			if (isBinary) {
				return ws.close(1003, 'text only')
			}

			if (now - conn.windowStart > 1000) {
				conn.windowStart = now
				conn.frames = 0
			}

			if (++conn.frames > 40) {
				return ws.close(1008, 'too fast')
			}

			let frame

			try {
				frame = JSON.parse(data.toString())
			}
			catch (e) {
				return
			}

			if (!frame || typeof frame !== 'object') {
				return
			}

			let fail = (err) => console.trace(`${appName}: room frame ${String(frame.t).slice(0, 20)} failed`, err)

			if (!conn.helloed) {
				if (frame.t !== 'hello' || conn.helloing) {
					return ws.close(4002, 'hello first')
				}

				conn.helloing = true
				clearTimeout(conn.helloTimer)
				roomHello(conn, frame).catch((err) => {
					fail(err)
					roomBye(conn, 'busy')
				})
				return
			}

			if (frame.t === 'join') {
				roomJoin(conn, frame).catch((err) => {
					fail(err)
					roomPush(conn, {t: 'closed', room: String(frame.room).slice(0, 64)})
				})
			}
			else if (frame.t === 'send') {
				roomSend(conn, frame)
			}
			else if (frame.t === 'leave' && typeof frame.room === 'string') {
				roomLeave(conn, frame.room)
			}
		})
	},

	//Only our own path, and only from a page on this host (a page on some other site has no business here, same as /mcp). Programs that
	//send no Origin are let through to the hello, where they need a session like everybody
	roomUpgrade = (req, socket, head) => {
		let url = null

		try {
			url = new URL(req.url, 'http://localhost')
		}
		catch (e) {
		}

		if (!url || url.pathname !== roomPath) {
			return socket.destroy()
		}

		let origin = req.headers.origin,
			originHost = null

		try {
			originHost = origin ? new URL(origin).host : null
		}
		catch (e) {
			originHost = '(bad)'
		}

		if (origin && originHost !== req.headers.host) {
			socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
			return socket.destroy()
		}

		//Sockets that have not said hello yet count too, or a flood of them would be free
		if (sharedLiveCount.open + roomConns.size >= sharedLiveTotalMax() + 100) {
			socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
			return socket.destroy()
		}

		roomSockets.handleUpgrade(req, socket, head, (ws) => roomConnect(ws, req))
	},

	//Every 20 seconds: a beat the page can hear (it drops a link that goes quiet) and a ping to find the ones that went away
	roomBeat = () => {
		for (let conn of [...roomConns]) {
			if (!conn.alive) {
				conn.ws.terminate()
				continue
			}

			conn.alive = false

			try {
				conn.ws.ping()
			}
			catch (e) {
			}

			if (conn.helloed) {
				roomPush(conn, '{"t":"beat"}')
			}
		}
	},

	roomAttach = (server) => {
		server.on('upgrade', roomUpgrade)
		setInterval(roomBeat, 20 * 1000).unref()
	}

//What the owner, a collaborator or a power user sees of a project's rooms: every room the shared page declares and, for each course that
//has said anything, the latest messages with who sent them (the one place a username is shown, and only here), hidden ones marked.
//Hiding keeps a message but takes it out of what the class is told (live, and in every snapshot after), and showing puts it back
router.get('/api/projects/:id/rooms', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let out = []

	for (let [source, declared] of Object.entries(doc.share?.rooms || {})) {
		let courses = [],
			names = (await roomMessages.distinct('course', {project: doc._id, source})).map((c) => String(c || '')).sort().slice(0, 30)

		for (let course of names) {
			let rows = await roomMessages.find({project: doc._id, source, course}).sort({_id: -1}).limit(100).toArray(),
				hub = roomHubs.get(roomKey(doc._id, source, course))

			courses.push({course, here: hub ? roomHere(hub) : 0, messages: rows.map((r) => ({id: r._id, seat: r.seat, username: r.username, text: r.text, at: new Date(r.at).getTime(), hidden: !!r.hidden, hiddenBy: r.hiddenBy || null}))})
		}

		out.push({source, name: declared.name || source, declared: {names: declared.names, show: declared.show, blocked: declared.blocked}, courses})
	}

	res.json({sources: out})
})

router.put('/api/projects/:id/rooms/:source/messages/:mid/hidden', express.json({limit: '1kb'}), async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let source = req.params.source,
		mid = req.params.mid

	if (!doc.share?.rooms?.[source]) {
		return res.status(404).json({error: 'That project has no such room. Share it again after adding one'})
	}

	let row = /^[a-z0-9]{12,30}$/.test(mid) ? await roomMessages.findOne({_id: mid, project: doc._id, source}) : null

	if (!row) {
		return res.status(404).json({error: 'No such message'})
	}

	let hidden = req.body?.hidden !== false

	await roomMessages.updateOne({_id: mid}, {$set: {hidden, hiddenBy: whoIs(req)?.username ?? null, hiddenAt: new Date()}})
	await roomHideLive(doc._id, source, row.course, mid, hidden)
	audit(req, hidden ? 'room-hide' : 'room-show', doc, {source, course: row.course})
	res.json({ok: true, hidden})
})


//Course collections: named stamps and counters that every project in the same course can read and add to, for one learner. Not a
//project's: the key is the person, their course and the collection name, so a passport that one piece adds to is there for the next
//piece, whatever project it is. Identity and course come off the session (learnerOf), never the request, and a person only ever
//reaches their own row. No session, or a session that is in no course, has nowhere to keep it ({available: false}) and the player
//keeps it in the browser instead. The share token only has to be a link that is on, so a project can't collect while its link is off.
//Adds are one atomic update, $addToSet for stamps and $max for counters, upserted on the unique index, so two tabs (or two pieces)
//at once can neither duplicate a row nor take a counter backwards. Rows are kept until someone clears them: deleting a project doesn't
//touch them, since they were never its own
const courseAt = async (req, res) => {
	let project = await sharedProject(req, res)

	if (!project) {
		return null
	}

	let person = learnerOf(req)

	if (!person?.course) {
		res.json({available: false})
		return null
	}

	let collection = courseLib.cleanCollection(req.params.collection)

	if (!collection) {
		res.status(400).json({error: 'A collection needs a name'})
		return null
	}

	return {project, person, collection, key: {username: person.username, course: person.course, collection}}
}

const busyCourse = {stamps: [], counts: {}, course: true, changed: 0, problem: 'busy'}

router.get('/learn/:token/course/:collection', async (req, res) => {
	let at = await courseAt(req, res)

	if (!at) {
		return
	}

	if (!courseLimits.read.hit(at.person.username)) {
		return res.json({available: true, ok: true, value: busyCourse})
	}

	res.json({available: true, ok: true, value: courseLib.valueOf(await courseRows.findOne(at.key))})
})

router.post('/learn/:token/course/:collection', express.json({limit: '4kb'}), async (req, res) => {
	let at = await courseAt(req, res)

	if (!at) {
		return
	}

	let {person, key} = at

	if (!courseLimits.write.hit(person.username)) {
		return res.json({available: true, ok: true, value: busyCourse})
	}

	//Never more than a handful in one go, whatever the body says
	let stamps = Array.isArray(req.body?.stamps) ? req.body.stamps.slice(0, 50) : [],
		counts = Object.fromEntries(Object.entries(req.body?.counts && typeof req.body.counts === 'object' && !Array.isArray(req.body.counts) ? req.body.counts : {}).slice(0, 50))

	for (let tries = 0; ; tries++) {
		let row = await courseRows.findOne(key),
			plan = courseLib.planAdd(row, {stamps, counts})

		//A person can only keep so many collections in a course
		if (!row && courseLib.changed(plan) && await courseRows.countDocuments({username: person.username, course: person.course}) >= courseLib.LIMITS.collections) {
			return res.json({available: true, ok: true, value: courseLib.valueOf(null, {changed: 0, problem: 'full'})})
		}

		if (!courseLib.changed(plan)) {
			return res.json({available: true, ok: true, value: courseLib.valueOf(row, {changed: 0, problem: plan.problem})})
		}

		try {
			await courseRows.updateOne(key, courseLib.updateFor(plan, new Date()), {upsert: true})

			//Read it back, so the answer has whatever the other tab added meanwhile
			return res.json({available: true, ok: true, value: courseLib.valueOf(await courseRows.findOne(key), {changed: courseLib.changed(plan), problem: plan.problem})})
		}
		catch (e) {
			//Two first adds at once: the unique index let one insert, and this goes again as an update
			if (e.code !== 11000 || tries > 2) {
				throw e
			}
		}
	}
})

//What the owner (or a power user) sees and does about a project's shared responses: every source the shared page declares, and for each
//course the answers with their counts before the minimum applies. Hiding an answer keeps it but takes it out of what the class
//sees (and can be undone); removing it takes it out of everyone's lists; clearing empties the course. None of it touches what
//people keep for themselves under Only me
const sharedSourceOf = async (req, res) => {
	let doc = await projectFor(req, res, {ownerOnly: true})

	if (!doc) {
		return null
	}

	let source = req.params.source,
		declared = doc.share?.shared?.[source]

	if (!declared) {
		res.status(404).json({error: 'That project has no such shared responses. Share it again after adding them'})
		return null
	}

	return {doc, source, declared}
}

const sharedCourse = (req) => typeof req.body?.course === 'string' ? req.body.course : typeof req.query.course === 'string' ? req.query.course : ''

router.get('/api/projects/:id/shared', async (req, res) => {
	let doc = await projectFor(req, res, {ownerOnly: true})

	if (!doc) {
		return
	}

	let out = []

	for (let [source, declared] of Object.entries(doc.share?.shared || {})) {
		let rows = await sharedRows.find({project: doc._id, source}, {projection: {username: 0, own: 0}}).toArray(),
			hiddenRows = await sharedHidden.find({project: doc._id, source}).toArray(),
			courses = new Map()

		for (let row of rows) {
			let list = courses.get(row.course || '') || []

			list.push({answers: row.answers || []})
			courses.set(row.course || '', list)
		}

		for (let h of hiddenRows) {
			if (!courses.has(h.course || '')) {
				courses.set(h.course || '', [])
			}
		}

		out.push({
			source,
			name: declared.name || source,
			declared: {who: declared.who, byVariable: declared.byVariable, minCount: declared.minCount, perPerson: declared.perPerson, maxLength: declared.maxLength, blocked: declared.blocked},
			courses: [...courses.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([course, docs]) => ({course, ...responses.moderationView(docs, new Set(hiddenRows.find((h) => (h.course || '') === course)?.keys || []), declared)}))
		})
	}

	res.json({sources: out})
})

router.put('/api/projects/:id/shared/:source/hidden', express.json({limit: '4kb'}), async (req, res) => {
	let at = await sharedSourceOf(req, res)

	if (!at) {
		return
	}

	let course = sharedCourse(req),
		text = responses.cleanAnswer(req.body?.text, 120),
		key = responses.answerKey(text)

	if (!key) {
		return res.status(400).json({error: 'Which answer?'})
	}

	let where = {project: at.doc._id, source: at.source, course},
		existing = await sharedHidden.findOne(where),
		keys = new Set(existing?.keys || [])

	if (req.body?.hidden === false) {
		keys.delete(key)
	}
	else if (keys.size < 1000) {
		keys.add(key)
	}

	await sharedHidden.updateOne(where, {$set: {keys: [...keys], updated: new Date()}}, {upsert: true})
	sharedForget(at.doc._id, at.source, course)
	sharedNudge(at.doc._id, at.source, course)
	audit(req, req.body?.hidden === false ? 'shared-unhide' : 'shared-hide', at.doc, {source: at.source, course})
	res.json({ok: true, hidden: keys.has(key)})
})

router.delete('/api/projects/:id/shared/:source/answers', express.json({limit: '4kb'}), async (req, res) => {
	let at = await sharedSourceOf(req, res)

	if (!at) {
		return
	}

	let course = sharedCourse(req),
		text = responses.cleanAnswer(req.body?.text ?? req.query.text, 120),
		key = responses.answerKey(text),
		where = {project: at.doc._id, source: at.source, course}

	//One answer from everyone's list, or (with no text) every answer in the course
	let removed = 0

	if (key) {
		for (let row of await sharedRows.find(where).toArray()) {
			let keep = (row.answers || []).filter((a) => responses.answerKey(a.text) !== key)

			if (keep.length !== (row.answers || []).length) {
				await sharedRows.updateOne({...where, username: row.username}, {$set: {answers: keep, updated: new Date()}})
				removed++
			}
		}
	}
	else {
		let r = await sharedRows.updateMany(where, {$set: {answers: [], updated: new Date()}})
		removed = r.modifiedCount ?? r.matchedCount ?? 0
		await sharedHidden.deleteMany(where)
	}

	sharedForget(at.doc._id, at.source, course)
	sharedNudge(at.doc._id, at.source, course)
	audit(req, key ? 'shared-removed' : 'shared-cleared', at.doc, {source: at.source, course, people: removed})
	res.json({ok: true, people: removed})
})

//The learner page for a share link: the shared project in its sandbox, framed by a small page that does have
//the session. The project asks it (postMessage) to load, save and report for the learner, and it passes that on to
//the routes above with the session id, so the sandboxed project never sees a session itself. Embed this in
//StudyDesk instead of /s/<token> to collect results. The session id comes from the url or sessionStorage the way
//utilities.js finds it, but is added here directly so the page has nothing to load from the suite's host root
//JSON that is safe inside a script element, free text and all
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

//A project that declared sensors (microphone, camera, photos) has the trusted media bridge in this page: it owns the devices, and the project
//asks it by postMessage. Only what was declared when the link was shared is allowed. The frame's address carries a nonce the bridge expects
//on every request (#ixm=<nonce>), since the frame's own origin is opaque and a window is not proof enough: a frame that navigated away
//keeps the window but loses the address. Without a declaration none of it is in the page
const learnerPage = (token, base, nonce, project, remix, sensors, mediaNonce) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interactives</title>
<style>html,body{margin:0;height:100%;background:#111}iframe{border:0;display:block;width:100%;height:100%}#remix{position:fixed;right:12px;bottom:12px;z-index:2;display:none;font:600 13px/1 system-ui,sans-serif;color:#fff;background:#3b5bfd;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);text-decoration:none}#remix:hover,#remix:focus-visible{background:#2f49d0}#remix[aria-disabled=true]{opacity:.7;cursor:progress}#remix.err{background:#b3261e}</style>
</head>
<body>
<iframe id="project" src="${base}/s/${token}${sensors ? `#ixm=${mediaNonce}` : ''}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" allow="fullscreen; autoplay" title="Interactive"></iframe>
${remix ? '<a id="remix" href="#" role="button" title="Copy this project into your own projects, to change as you like">Remix this</a>' : ''}
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
	//Launched from another LMS over LTI 1.3: the launch hands its session over in the url fragment, which goes into sessionStorage
	//and off the address bar. It stands in for the StudyDesk session (and there is no StudyDesk account to remix into)
	var ltiSession = null
	try {
		var fromHash = new URLSearchParams(location.hash.slice(1)).get('lti')
		if (fromHash) {
			sessionStorage.setItem('ixlti', fromHash)
			history.replaceState(null, '', location.pathname + location.search)
		}
		if (!sessionID || sessionID === 'null') ltiSession = sessionStorage.getItem('ixlti')
	}
	catch (e) {
	}
	var answer = function (m, reply) {
		if (m.rid) frame.contentWindow.postMessage(Object.assign({target: 'interactives', type: 'progress', rid: m.rid}, reply), '*')
	}
	//One request at a time, so a save and a report that leave together can't both try to make the learner's first record
	var chain = Promise.resolve()
	var diagQueue = [], diagTaken = 0, diagSettled = false, diagTimer = null, lastHeight = 0
	var call = function (method, path, body) {
		var headers = {'Content-Type': 'application/json'}
		if (sessionID && sessionID !== 'null') headers['X-Session-ID'] = sessionID
		else if (ltiSession) headers['X-LTI-Session'] = ltiSession
		var run = function () {
			return fetch(base + '/learn/' + token + '/' + path, {method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive: body !== undefined}).then(function (r) {
				//Saving and reporting results is this page's own job, so when it fails that is worth knowing (the route and status, nothing else)
				if (!r.ok && r.status >= 500) takeDiag({kind: 'error', where: 'learn-' + method.toLowerCase(), status: r.status, fingerprint: 'learn-' + method.toLowerCase() + '-' + r.status})
				return r.ok ? r.json() : {available: false}
			}, function () {
				takeDiag({kind: 'error', where: 'learn-' + method.toLowerCase(), fingerprint: 'learn-' + method.toLowerCase() + '-network'})
				throw new Error('network')
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
	//Remix this: only for someone signed in to StudyDesk (the copy becomes theirs), and only when the owner allowed it
	var remixOn = ${remix ? 'true' : 'false'} && !ltiSession, remixLink = document.getElementById('remix'), remixBusy = false
	var showRemix = function () {
		if (!remixOn || !remixLink) return
		remixLink.style.display = 'block'
		remixLink.addEventListener('click', function (e) {
			if (remixLink.target === '_blank') return
			e.preventDefault()
			if (remixBusy) return
			remixBusy = true
			remixLink.setAttribute('aria-disabled', 'true')
			remixLink.textContent = 'Copying...'
			var headers = {}
			if (sessionID && sessionID !== 'null') headers['X-Session-ID'] = sessionID
			fetch(base + '/remix/' + token, {method: 'POST', headers: headers}).then(function (r) {
				return r.json().then(function (j) {
					return {ok: r.ok, body: j}
				})
			}).then(function (r) {
				remixBusy = false
				remixLink.removeAttribute('aria-disabled')
				if (!r.ok || !r.body.id) throw new Error((r.body && r.body.error) || 'That did not work')
				remixLink.href = base + '/#/p/' + r.body.id
				remixLink.target = '_blank'
				remixLink.rel = 'noopener'
				remixLink.textContent = 'Open your copy'
				window.open(remixLink.href, '_blank', 'noopener')
			}).catch(function (err) {
				remixBusy = false
				remixLink.removeAttribute('aria-disabled')
				remixLink.className = 'err'
				remixLink.textContent = err.message || 'That did not work'
			})
		})
	}
	//Shared responses go live: once the project reads a class, this page keeps one stream open to the server (fetch, so the session
	//headers go with it) and tells the player when it says something changed. All that comes down is the source id, the player
	//reads the class itself the usual way. Anything that goes wrong (no session, a full course, a dropped connection) leaves the
	//player on its own poll, and this page tries again in a while. It is closed when the page goes
	var live = {started: false, ctl: null, tries: 0, timer: null, gone: false}
	var tellLive = function (msg) {
		if (frame.contentWindow) frame.contentWindow.postMessage(Object.assign({target: 'interactives', type: 'shared-live'}, msg), '*')
	}
	var liveAgain = function (wait) {
		if (live.gone) return
		clearTimeout(live.timer)
		live.timer = setTimeout(liveConnect, wait + Math.floor(Math.random() * 1500))
	}
	var liveConnect = function () {
		if (live.gone || typeof AbortController === 'undefined') return
		var ctl = new AbortController(), headers = {}, up = false
		live.ctl = ctl
		if (sessionID && sessionID !== 'null') headers['X-Session-ID'] = sessionID
		else if (ltiSession) headers['X-LTI-Session'] = ltiSession
		var ended = function () {
			if (up) tellLive({up: false})
			up = false
			live.tries++
			liveAgain(Math.min(60000, 2000 * Math.pow(2, Math.min(live.tries, 5))))
		}
		fetch(base + '/learn/' + token + '/shared-live', {headers: headers, signal: ctl.signal}).then(function (r) {
			if ((r.headers.get('content-type') || '').indexOf('text/event-stream') !== 0 || !r.ok || !r.body) {
				//No session or nothing shared: never. A busy server or a full course: later
				if (r.ok) return
				throw new Error('later')
			}
			up = true
			live.tries = 0
			tellLive({up: true})
			var reader = r.body.getReader(), decoder = new TextDecoder(), buf = ''
			var pump = function () {
				return reader.read().then(function (chunk) {
					if (chunk.done) return
					buf += decoder.decode(chunk.value, {stream: true})
					var at
					while ((at = buf.indexOf('\\n\\n')) >= 0) {
						var block = buf.slice(0, at)
						buf = buf.slice(at + 2)
						var ev = /^event: (.*)$/m.exec(block), data = /^data: (.*)$/m.exec(block)
						if (ev && ev[1] === 'changed' && data) {
							try {
								var d = JSON.parse(data[1])
								tellLive({changed: true, source: typeof d.source === 'string' ? d.source.slice(0, 64) : ''})
							}
							catch (e) {
							}
						}
					}
					return pump()
				})
			}
			return pump().then(ended, ended)
		}).catch(function () {
			if (!live.gone) ended()
		})
	}
	var openLive = function () {
		if (live.started) return
		live.started = true
		liveConnect()
	}
	//Rooms: one WebSocket for every room the project has (a browser can't put a header on one, so its first message is a hello with
	//the session). The link reconnects with a back off, asks the server for what it missed, and hands every frame to the project as
	//it came. Nothing about who anybody is comes down it, only seats or first names
	var createRoomLink = ${roomsLib.createRoomLink.toString()}
	var roomLink = null
	var tellRoom = function (msg) {
		if (frame.contentWindow) frame.contentWindow.postMessage(Object.assign({target: 'interactives', type: 'room'}, msg), '*')
	}
	var openRooms = function () {
		if (roomLink) return roomLink
		roomLink = createRoomLink({
			url: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + base + '/rooms/ws',
			WS: window.WebSocket,
			hello: function () {
				return {token: token, session: sessionID && sessionID !== 'null' ? sessionID : null, lti: ltiSession}
			},
			onFrame: function (f) {
				tellRoom({frame: f})
			},
			onState: function (s) {
				tellRoom(s)
			}
		})
		return roomLink
	}
	window.addEventListener('pagehide', function () {
		live.gone = true
		clearTimeout(live.timer)
		if (live.ctl) live.ctl.abort()
		if (roomLink) roomLink.close()
	})
	var cleanRecord = ${records.cleanRecord.toString()}
	var rowFor = ${records.rowFor.toString()}
	var cleanDiag = ${records.cleanDiag.toString()}
	var diagRow = ${records.diagRow.toString()}
	var contextFrom = ${records.contextFrom.toString()}
	//The project's built-in context (course, first name, student or staff) is answered from the session once fetchActivity has
	//one. Never the username, email or id, and it is not sent to analytics. A project that asks before then waits in the queue
	var contextReady = false, contextData = null, contextAsks = []
	var answerContext = function (m) {
		answer(m, {ok: true, available: !!contextData, data: contextData})
	}
	var project = ${JSON.stringify(project)}, run = Math.random().toString(36).slice(2) + Date.now().toString(36), queue = [], taken = 0, known = false, timer = null
	var flushRecords = function () {
		timer = null
		if (!known || typeof reportAnalytics !== 'function') return
		while (queue.length) reportAnalytics.apply(null, rowFor(project, run, queue.shift()))
	}
	//How the project ran (the player's diagnostics: load time, scripts and layers that failed, assets that would not load), for
	//bug triage only. Unlike the learner's records these are sent whether or not anybody is signed in, since nothing in one is
	//about a person; the user is on the row when the session knows it. At most 40 a page load
	var flushDiags = function () {
		diagTimer = null
		if (!diagSettled || typeof reportAnalytics !== 'function') return
		while (diagQueue.length) reportAnalytics.apply(null, diagRow(project, run, diagQueue.shift()))
	}
	var takeDiag = function (raw) {
		var diag = cleanDiag(raw)
		if (!diag || diagTaken >= 40) return
		diagTaken++
		diagQueue.push(diag)
		if (diagSettled && !diagTimer) diagTimer = setTimeout(flushDiags, 1500)
	}
	var settleDiags = function () {
		diagSettled = true
		if (diagQueue.length && !diagTimer) diagTimer = setTimeout(flushDiags, 300)
	}
	//Waiting to hear who this is, but not for long
	setTimeout(settleDiags, 4000)
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
			settleDiags()
			contextData = err || !data ? null : contextFrom(data.user, data.activity)
			contextReady = true
			while (contextAsks.length) answerContext(contextAsks.shift())
			if (err || !data || !data.user || !data.user.username) return
			window.m.user = data.user
			window.m.activity = data.activity || {}
			known = true
			showRemix()
			if (queue.length && !timer) timer = setTimeout(flushRecords, 300)
		})
	}
	else contextReady = true
	window.addEventListener('message', function (e) {
		if (e.source !== frame.contentWindow) return
		var m = e.data
		if (m && m.source === 'interactives-record') return takeRecord(m.record)
		if (m && m.source === 'interactives-diag') return takeDiag(m.diag)
		//The player's height for its width, handed on to the page around this one the way every toolbox app does (setILARSize), so
		//the embed code's iframe in StudyDesk tracks the project. The player's own message goes to the top window, where si-manager
		//can't tell which iframe it came from, since it came out of two frames down. Only a sane number is passed on
		if (m && typeof m.height === 'number' && isFinite(m.height) && m.height > 0 && m.height <= 20000 && typeof m.cacheID === 'string') {
			if (window.parent !== window && typeof setILARSize === 'function' && m.height !== lastHeight) {
				lastHeight = m.height
				setILARSize(null, Math.ceil(m.height), m.cacheID.slice(0, 200))
			}
			return
		}
		if (!m || m.source !== 'interactives-progress') return
		var failed = function () {
			answer(m, {ok: false, available: false})
		}
		if (m.op === 'context') {
			if (contextReady) answerContext(m)
			else contextAsks.push(m)
		}
		else if (m.op === 'load') {
			call('GET', 'progress').then(function (j) {
				answer(m, {ok: true, available: !!j.available, data: j.progress || null})
			}, failed)
		}
		else if (m.op === 'save') {
			call('PUT', 'progress', m.data).then(function (j) {
				answer(m, {ok: true, available: !!j.available})
			}, failed)
		}
		else if (m.op === 'userdata-save') {
			call('PUT', 'user-data', {variables: m.variables}).then(function (j) {
				answer(m, {ok: !!j.ok, available: !!j.available})
			}, failed)
		}
		else if (m.op === 'userdata-load') {
			var names = Array.isArray(m.names) ? m.names.filter(function (n) { return typeof n === 'string' }) : []
			call('GET', 'user-data?names=' + encodeURIComponent(names.join(','))).then(function (j) {
				answer(m, {ok: true, available: !!j.available, data: j.variables || null})
			}, failed)
		}
		else if (m.op === 'shared-read') {
			if (m.who !== 'me') openLive()
			call('GET', 'shared/' + encodeURIComponent(m.sharedSource) + '?who=' + encodeURIComponent(m.who || '')).then(function (j) {
				answer(m, {ok: true, available: !!j.available && !!j.value, data: j.value || null})
			}, failed)
		}
		else if (m.op === 'shared-add') {
			call('POST', 'shared/' + encodeURIComponent(m.sharedSource), {who: m.who, answers: m.answers}).then(function (j) {
				answer(m, {ok: true, available: !!j.available && !!j.value, data: j.value ? Object.assign({kept: j.kept || 0}, j.value) : null})
			}, failed)
		}
		else if (m.op === 'shared-withdraw') {
			call('POST', 'shared/' + encodeURIComponent(m.sharedSource) + '/withdraw', {who: m.who, answers: m.answers}).then(function (j) {
				answer(m, {ok: true, available: !!j.available && !!j.value, data: j.value || null})
			}, failed)
		}
		else if (m.op === 'room-join' && typeof m.roomSource === 'string') {
			if (typeof WebSocket === 'undefined') return failed()
			openRooms().join(m.roomSource.slice(0, 64))
			answer(m, {ok: true, available: true, data: null})
		}
		else if (m.op === 'room-send' && typeof m.roomSource === 'string') {
			if (typeof WebSocket === 'undefined') return failed()
			openRooms().send(m.roomSource.slice(0, 64), typeof m.text === 'string' ? m.text.slice(0, 2000) : '').then(function (r) {
				answer(m, {ok: true, available: true, data: {problem: r.problem || ''}})
			})
		}
		else if (m.op === 'course-read' && typeof m.collection === 'string') {
			call('GET', 'course/' + encodeURIComponent(m.collection)).then(function (j) {
				answer(m, {ok: true, available: !!j.available && !!j.value, data: j.value || null})
			}, failed)
		}
		else if (m.op === 'course-add' && typeof m.collection === 'string') {
			call('POST', 'course/' + encodeURIComponent(m.collection), {stamps: m.stamps, counts: m.counts}).then(function (j) {
				answer(m, {ok: true, available: !!j.available && !!j.value, data: j.value || null})
			}, failed)
		}
		else if (m.op === 'mark') {
			//A question marked on the server: the project sends the answer, the server marks it and says how it went
			call('POST', 'check', {question: m.question, action: m.action, answer: m.answer}).then(function (j) {
				answer(m, {ok: true, available: !!j.available, data: j})
			}, failed)
		}
		else if (m.op === 'guard') {
			call('POST', 'guard', {guard: m.guard}).catch(function () {
			})
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
${sensors ? `<script type="module" nonce="${nonce}">
import {startBridge} from ${JSON.stringify(`${base}/media-bridge.mjs`)}
startBridge({frame: document.getElementById('project'), nonce: ${JSON.stringify(mediaNonce)}, declaration: ${scriptJson(sensors)}})
</script>` : ''}
</body>
</html>
`

//The trusted media bridge the learner page loads (a module, from this host, so script-src 'self' lets it in). Revalidated, never stale
router.get('/media-bridge.mjs', cacheHeaders.document, (req, res) => {
	res.type('text/javascript').sendFile(path.join(__dirname, 'shared', 'media-bridge.mjs'), {headers: {'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'}})
})

router.get('/play/:token', cacheHeaders.api, async (req, res) => {
	let token = req.params.token

	if (!/^[\w-]{16,64}$/.test(token) || !fs.existsSync(shareFile(token))) {
		return res.status(404).send('This share link has been turned off, or never existed')
	}

	//The project the link is for, so the records its learners make are filed under it
	let project = await projects.findOne({'share.token': token}, {projection: {_id: 1, 'share.remix': 1, 'share.sensors': 1, 'share.rooms': 1}})

	if (!project) {
		return res.status(404).send('This share link has been turned off, or never existed')
	}

	let nonce = crypto.randomBytes(16).toString('base64')

	//Its own script, the suite's utilities.js from this host (script-src 'self') and its own api and the suite's
	//analytics (connect-src 'self'), and the project in its sandbox as the one frame. It can be framed by StudyDesk.
	//media-src blob: is the one thing added for the media bridge: a recorded video plays from memory in the page
	//A project with rooms talks to a WebSocket back to this host, and not every browser takes 'self' to cover ws: and wss: for it
	let host = String(req.get('host') || ''),
		sockets = Object.keys(project.share?.rooms || {}).length && /^[\w.:\[\]-]{1,200}$/.test(host) ? ` ws://${host} wss://${host}` : ''

	res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}' 'self'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'${sockets}; media-src blob:; base-uri 'none'; form-action 'none'`)
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('Referrer-Policy', 'no-referrer')
	res.setHeader('X-Robots-Tag', 'noindex')
	res.type('html').send(learnerPage(token, req.baseUrl, nonce, project._id, !!project.share?.remix, project.share?.sensors || null, crypto.randomBytes(16).toString('hex')))
})

//What the project's learners have done, for its owner (this is under /api, which is staff). Counts and averages
//of the records, and the most recently active people
router.get('/api/projects/:id/results', async (req, res) => {
	let doc = await projectFor(req, res)

	if (!doc) {
		return
	}

	let rows = await userData.find({project: doc._id}, {projection: {variables: 0, marked: 0}}).sort({updated: -1}).limit(5000).toArray()

	res.json({...learner.summarise(rows), truncated: rows.length >= 5000, shared: !!doc.share?.token, mayClear: ownsOrPower(req, doc)})
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

//How the product is used and where it breaks, for the people who make it (power users only): the editor's own analytics
//('Interactives Editor', src/lib/analytics.ts) and the published projects' diagnostics ('Interactives Player', the learner
//page), read back from lti-analytics.ingest and counted. Nothing in those rows is content, so nothing here is either.
//?days= is 1, 7 (the default), 30, 90 or 365. The rows are read with a projection and counted here, like Insights
router.get('/api/analytics/usage', async (req, res) => {
	if (!isPower(req)) {
		return res.status(403).json({error: 'Usage and errors are for power users'})
	}

	let report = await import('./shared/usage-report.mjs'),
		asked = Number(req.query.days),
		days = [1, 7, 30, 90, 365].includes(asked) ? asked : 7,
		since = {$gte: Date.now() - days * 24 * 60 * 60 * 1000},
		read = (app) => ingest.find({app, timestamp: since}, {projection: {feature: 1, featureID: 1, timestamp: 1, 'meta.sid': 1, 'meta.build': 1, 'meta.run': 1, 'meta.user.username': 1, 'meta.ev': 1, 'meta.err': 1, 'meta.diag': 1}}).sort({timestamp: -1}).limit(report.MAX_ROWS).maxTimeMS(20000).toArray(),
		[editor, player] = await Promise.all([read(report.EDITOR_APP), read(report.PLAYER_APP)])

	res.json(report.usageReport(editor, player, days))
})

//Start the results afresh (a test run that left records behind, or a new intake)
//Every learner's record as a CSV file (the dialog only lists the latest 200). Same access as the Results dialog
router.get('/api/projects/:id/results.csv', async (req, res) => {
	let doc = await projectFor(req, res)
	if (!doc) {
		return
	}

	let rows = await userData.find({project: doc._id}, {projection: {variables: 0, marked: 0}}).sort({updated: -1}).limit(20000).toArray(),
		name = String(doc.name || 'project').replace(/[^\w .-]+/g, '').trim().slice(0, 60) || 'project'

	res.set('Content-Type', 'text/csv; charset=utf-8')
	res.set('Content-Disposition', `attachment; filename="${name} results.csv"`)
	//A BOM so Excel reads the names as UTF-8
	res.send('\ufeff' + learner.resultsCsv(rows))
})

//Wiping every learner's record is the owner's call (or a power user's), not a collaborator's
router.delete('/api/projects/:id/results', async (req, res) => {
	let doc = await projectFor(req, res, {ownerOnly: true})

	if (!doc) {
		return
	}

	let result = await userData.deleteMany({project: doc._id})
	audit(req, 'results-cleared', doc, {records: result.deletedCount})

	res.json({ok: true, deleted: result.deletedCount})
})

//The Activity Designer's chat. The panel posts {projectId, artboardId?, conversation?, message} and gets progress back as
//lines of json as it happens: status (plain words about what it's doing), changed (it has changed the project, here's the
//restore point to undo with), reply, error and done (with the chat's handle and what's left of their shared allowance). The
//Cogniti conversation and its history stay in here per person and project, so the browser holds nothing but the handle.
//Each request costs one Cogniti message (designer.js): the agent answers with a blueprint, which mcp.buildBlueprint compiles
//with the editor's own code and sends to the live room as the person (same session, same audit rows, shows in the live
//session as "Activity Designer (AI)"). Only someone who can change the project gets to use it
let designerChats = new Map(),
	designerRunning = new Set(),
	DESIGNER_IDLE_MS = 2 * 60 * 60 * 1000,
	//Who has made how many requests this hour on the shared token. Rebuilt when INTERACTIVES_DESIGNER_PER_HOUR changes
	designerShared = {perHour: -1, q: null},
	//How often a person may try a token of their own an hour (each try asks Cogniti)
	designerTokenTries = null

setInterval(() => {
	let now = Date.now()
	for (let [k, c] of designerChats) {
		if (now - c.used > DESIGNER_IDLE_MS) designerChats.delete(k)
	}
}, 10 * 60 * 1000).unref()

const designerKey = (req, id) => `${whoIs(req)?.username || 'guest'}|${id}`

const sharedQuota = () => {
	let n = designer.settings().perHour
	if (!designerShared.q || designerShared.perHour !== n) {
		designerShared = {perHour: n, q: designer.quota(n)}
	}

	return designerShared.q
}

//A person's own Cogniti token, opened. Null when they haven't added one (or it can't be opened: the key changed)
const ownDesignerToken = async (username) => {
	if (!username || !designerTokens) {
		return null
	}

	let row = await designerTokens.findOne({_id: username})
	return row ? designer.openToken(row, username, designer.secretKey(storageDir)) : null
}

//What the panel and Preferences are told about allowances. Never the token, not even its end
const designerStatus = async (req) => {
	let cfg = designer.settings(),
		me = whoIs(req),
		row = me?.username && designerTokens ? await designerTokens.findOne({_id: me.username}, {projection: {added: 1, ends: 1}}) : null
	return {
		on: cfg.on,
		mine: row ? {connected: true, added: row.added, ends: row.ends || null} : null,
		//only people on the shared token have a share to count
		shared: row ? null : sharedQuota().status(me?.username || 'guest'),
	}
}

router.get('/api/designer/status', async (req, res) => {
	if (!whoIs(req)?.username && enforcing()) {
		return res.status(401).json({error: 'Sign in to use the Activity Designer'})
	}

	res.json(await designerStatus(req))
})

//Use my own Cogniti allowance: a personal token, checked once against Cogniti, then kept encrypted (AES-256-GCM, designer.js)
router.put('/api/designer/token', express.json({limit: '4kb'}), async (req, res) => {
	let cfg = designer.settings(),
		me = whoIs(req)
	if (!cfg.on) return res.status(404).json({error: 'The Activity Designer is switched off here'})
	if (!me?.username) return res.status(401).json({error: 'Sign in to add your own Cogniti token'})

	let token = typeof req.body?.token === 'string' ? req.body.token.trim() : '',
		ends = typeof req.body?.ends === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.ends) && !Number.isNaN(Date.parse(req.body.ends)) ? new Date(`${req.body.ends}T00:00:00Z`) : null
	if (!token || token.length < 8 || token.length > 2000 || /\s/.test(token)) {
		return res.status(400).json({error: 'That does not look like a Cogniti API token. Copy the whole token from Cogniti and paste it in.'})
	}

	designerTokenTries ||= designer.quota(10)
	if (!designerTokenTries.take(me.username)) return res.status(429).json({error: 'Too many tries. Wait a little while and try again.'})

	let access = await designer.cogniti({...cfg, token}).checkAccess()
	if (!access.ok) {
		let why = {
			refused: "Cogniti didn't accept that token. Check you copied all of it, and that it hasn't ended.",
			notShared: "That token works, but your Cogniti account can't chat with the Activity Designer yet. Ask the Toolbox team to share it with you, then try again.",
			unreachable: 'Cogniti could not be reached just now to check the token. Try again in a minute.',
		}[access.why]
		return res.status(access.why === 'unreachable' ? 502 : 400).json({error: why, why: access.why})
	}

	let added = new Date()
	await designerTokens.updateOne({_id: me.username}, {$set: {...designer.sealToken(token, me.username, designer.secretKey(storageDir)), added, ends}}, {upsert: true})
	audit(req, 'designer-token-set', null, {ends})
	res.json({ok: true, mine: {connected: true, added, ends}})
})

router.delete('/api/designer/token', async (req, res) => {
	let me = whoIs(req)
	if (!me?.username) return res.status(401).json({error: 'Sign in first'})

	let had = await designerTokens.deleteOne({_id: me.username})
	if (had?.deletedCount !== 0) audit(req, 'designer-token-removed', null, {})
	res.json({ok: true})
})

router.post('/api/designer/chat', express.json({limit: '16kb'}), async (req, res) => {
	let cfg = designer.settings(),
		me = whoIs(req)
	if (!cfg.on) return res.status(404).json({error: 'The Activity Designer is switched off here'})
	if (!me?.username && enforcing()) return res.status(401).json({error: 'Sign in to use the Activity Designer'})

	let id = req.body?.projectId,
		message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
	if (!validID(id)) return res.status(400).json({error: 'Bad id'})
	if (!message) return res.status(400).json({error: 'Say what you would like built'})
	if (message.length > 4000) return res.status(413).json({error: 'That is too long for one message. Try a shorter request, then add to it'})

	let doc = await projects.findOne({_id: id})
	if (!doc) return res.status(404).json({error: 'No such project'})
	if (!mayChange(req, res, doc)) return

	let who = me?.username || 'guest'
	if (designerRunning.has(who)) return res.status(409).json({error: 'The Activity Designer is still working on your last request. Wait for it to finish.'})

	//Their own token when they've added one; otherwise the shared one, and a fair share of it an hour
	let own = await ownDesignerToken(me?.username),
		shared = sharedQuota()
	if (own) {
		cfg = {...cfg, token: own, own: true}
	}
	else if (!shared.take(who)) {
		let s = shared.status(who),
			mins = Math.max(1, Math.ceil(s.resetsIn / 60))
		return res.status(429).json({error: `You have used your ${s.limit} shared Activity Designer requests for this hour. The next one comes back in about ${mins} ${mins === 1 ? 'minute' : 'minutes'}. You can use your own Cogniti allowance instead.`, kind: 'quota', quota: s})
	}

	designerRunning.add(who)

	res.status(200).set({'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
	res.flushHeaders()
	let ctl = new AbortController(),
		emit = (e) => {
			if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(e) + '\n')
		}
	//A Cogniti message can sit quiet for a minute or more, and haproxy cuts a response that says nothing for its
	//timeout server (25s on dev, 120s on test and prod). So a blank line every 10s keeps it open, and the panel skips
	//blank lines. INTERACTIVES_DESIGNER_BEAT_MS changes the 10s (the test uses a short one)
	let beat = setInterval(() => {
		if (!res.writableEnded && !res.destroyed) res.write('\n')
	}, Number(process.env.INTERACTIVES_DESIGNER_BEAT_MS) || 10000)
	//The browser went (closed the tab, or Stop): finish what's running and no more
	res.on('close', () => {
		clearInterval(beat)
		if (!res.writableFinished) ctl.abort()
	})

	let key = designerKey(req, id),
		state = designerChats.get(key),
		ctx = {base: `http://127.0.0.1:${port}/${appName}`, sessionId: mcpSessionID(req), agent: 'Activity Designer', sessions: new Map()},
		mcp = null,
		artboardId = typeof req.body.artboardId === 'string' ? req.body.artboardId.slice(0, 100) : '',
		result = {outcome: 'error', rounds: 0, changed: false}

	try {
		//The same chat carries on only when the panel hands back its handle; no handle is a new chat
		if (!state || !req.body.conversation || state.chatId !== req.body.conversation || Date.now() - state.used > DESIGNER_IDLE_MS) {
			state = {chatId: crypto.randomBytes(9).toString('base64url'), conversation: null, history: [], used: Date.now()}
		}
		designerChats.set(key, state)
		if (designerChats.size > 1000) designerChats.delete(designerChats.keys().next().value)

		mcp = await loadMCP()
		let callTool = async (name, args) => {
			if (mcpLimited(req)) return {error: true, text: 'Error: too many requests just now. Wait a few seconds and try again.'}
			let msg = {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}},
				reply = await mcp.runAs(ctx, () => mcp.respond(msg))
			mcpAudit(req, ctx, msg, reply)
			if (reply?.error) return {error: true, text: `Error: ${reply.error.message}`}
			return {error: !!reply?.result?.isError, text: (reply?.result?.content || []).map((c) => c.text).join('\n')}
		}

		result = await designer.run({
			cogniti: designer.cogniti(cfg),
			spec: designer.buildSpec(mcp.rawReference()),
			//Where things stand: joins the live session (people there and the outline of every page), then the open page in full
			context: async () => {
				//each part is cut on its own, so a big page can't push out the rest
				let clip = (t, n) => t.length > n ? t.slice(0, n) + '\n...(cut to fit)' : t,
					joined = await callTool('join_session', {project_id: id})
				if (joined.error) throw new Error(joined.text)
				let parts = [`# Where things stand\n${clip(joined.text, 6500)}`]
				if (artboardId) {
					let page = await callTool('get_overview', {project_id: id, artboard_id: artboardId}),
						graph = await callTool('get_interactions', {project_id: id, artboard_id: artboardId})
					if (!page.error) parts.push(`# The open page in full\n${clip(page.text, 6500)}`)
					if (!graph.error) parts.push(`# Its interactions\n${clip(graph.text, 3000)}`)
				}

				return parts.join('\n\n')
			},
			//The agent's blueprint, built in the open project as one batch to the live room
			build: async (blueprint, known) => {
				let out = await mcp.runAs(ctx, () => mcp.buildBlueprint(id, blueprint, {artboardId, known: known || undefined}))
				mcpAudit(req, ctx, {method: 'tools/call', params: {name: 'designer_build', arguments: {project_id: id}}}, {})
				return out
			},
			//A named revision of how the project is right now (the room saved first), which "Undo" restores
			beforeEdit: async () => {
				let now = await projects.findOne({_id: id}),
					room = rooms.get(id)
				if (room) await persist(room)
				let current = room ? JSON.stringify(room.doc) : await store.get(now)
				return snapshot(id, current, room ? room.rev : now.rev, whoIs(req), 'Before the Activity Designer', true, {name: 'Before the Activity Designer'})
			},
			emit,
			signal: ctl.signal,
		}, {
			projectId: id,
			projectName: String(doc.name || 'Untitled project').slice(0, 200),
			firstName: String(req.sessionData?.user?.firstName || req.sessionData?.user?.firstname || (me?.name || '').split(' ')[0] || '').slice(0, 40),
			message,
			state,
		})
	}
	catch (err) {
		console.trace(`${appName}: designer failed`, err)
		emit({type: 'error', text: 'Something went wrong in the Activity Designer. Try again in a minute.'})
	}
	finally {
		clearInterval(beat)
		if (mcp) mcp.closeContext(ctx)
		designerRunning.delete(who)
	}

	//A request that never got a message to Cogniti didn't use any of the shared allowance
	if (!own && !result.rounds) shared.refund(who)

	//A run that didn't end in a plain reply leaves the agent's side of the chat half done, so the next one starts clean
	if (result.outcome === 'replied') state.used = Date.now()
	else designerChats.delete(key)
	//Who, which project, how it went. Never what was said
	audit(req, 'designer-run', doc, {rounds: result.rounds, outcome: result.outcome, changed: result.changed, own: !!own})
	emit({type: 'done', conversation: result.outcome === 'replied' ? state.chatId : null, quota: own ? null : shared.status(who)})
	res.end()
})

//New chat: forget the conversation for this person and project
router.post('/api/designer/reset', express.json({limit: '1kb'}), (req, res) => {
	if (!validID(req.body?.projectId)) return res.status(400).json({error: 'Bad id'})
	designerChats.delete(designerKey(req, req.body.projectId))
	res.json({ok: true})
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

	if (err.type === 'entity.too.large') {
		let wholeProject = req.method === 'PUT' && /^\/projects\/[^/]+$/.test(req.path)
		return res.status(413).json({error: wholeProject ? `This project is too big to save (over ${saveLimit.replace('mb', ' MB')}). Large pictures or data pasted into layers are the usual cause: move them into the Assets panel` : 'That is too big to save'})
	}

	//A split document whose parts are not all there (shared/docstore.mjs). Say so rather than hand back half a project
	if (err.name === 'MissingPartsError') {
		return res.status(500).json({error: err.message})
	}

	res.status(err.status || 500).json({error: 'Something went wrong on the server'})
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

//The MCP server over the network (MCP's "streamable HTTP", plain JSON replies, no server push), so an agent connects
//with a URL instead of needing a copy of mcp/dist on its own machine. It's the same code as the stdio one, loaded
//once, with each connection carrying its own session id, agent name and live sessions. Its tool calls go back
//into this server's own api over loopback with the caller's X-Session-ID, so an agent can only do what that
//session could do in the editor, and with no session it gets what a signed out browser gets
let mcpModule = null,
	mcpConnections = new Map(),
	MCP_IDLE_MS = 2 * 60 * 60 * 1000,
	MCP_MAX_CONNECTIONS = 200

let loadMCP = () => {
	if (!mcpModule) {
		//Stops the bundle starting its own stdio loop on our stdin
		process.env.INTERACTIVES_MCP_NO_STDIO = '1'
		mcpModule = import('./mcp/dist/interactives-mcp.mjs')
	}
	return mcpModule
}

//Who's calling: X-Session-ID like every other suite request, or the same id as a bearer token, since that's what most
//MCP clients have a setting for
let mcpSessionID = (req) => {
	let auth = String(req.get('authorization') || '')
	return String(req.get('x-session-id') || (auth.match(/^Bearer\s+(\S+)$/i) || [])[1] || '').slice(0, 200)
}

//Connections that went quiet: drop them and leave any live rooms they were sitting in
setInterval(async () => {
	if (!mcpConnections.size) return
	let mcp = await loadMCP(),
		now = Date.now()
	for (let [id, c] of mcpConnections) {
		if (now - c.used > MCP_IDLE_MS) {
			mcp.closeContext(c.ctx)
			mcpConnections.delete(id)
		}
	}
}, 10 * 60 * 1000).unref()

//IT can switch AI agent access off for a box without a code change: INTERACTIVES_MCP=off (and a restart). The MCP
//endpoint then answers 503 to everything and agents can't join live rooms
const mcpOff = () => /^(off|0|false|no)$/i.test(process.env.INTERACTIVES_MCP || '')
router.use('/mcp', (req, res, next) => {
	if (!mcpOff()) {
		return next()
	}
	res.status(503).json({jsonrpc: '2.0', id: null, error: {code: -32000, message: 'AI agent access is turned off on this server'}})
})

//Who the caller is, for the audit and the limits: the bearer is the same session id, so hand it to the suite's own
//session check the way a browser would send it. Optional: a call with no session gets what a signed out browser gets
router.use('/mcp', (req, res, next) => {
	let sid = mcpSessionID(req)
	if (sid && !req.get('x-session-id')) req.headers['x-session-id'] = sid
	next()
}, sessionCheck({optional: true, tool: 'interactives'}))

//Limits per caller and per address, a minute at a time (INTERACTIVES_MCP_PER_MIN, INTERACTIVES_MCP_IP_PER_MIN). An agent
//working normally makes a few calls a second at most; anything past this is a loop, or someone hammering the box
let mcpWindow = {start: 0, counts: new Map()}
const mcpLimited = (req) => {
	let now = Date.now()
	if (now - mcpWindow.start >= 60 * 1000) mcpWindow = {start: now, counts: new Map()}
	let me = whoIs(req),
		keys = [[`ip:${req.ip}`, Number(process.env.INTERACTIVES_MCP_IP_PER_MIN) || 600]]
	if (me?.username) keys.push([`u:${me.username}`, Number(process.env.INTERACTIVES_MCP_PER_MIN) || 240])
	let over = false
	for (let [k, max] of keys) {
		let n = (mcpWindow.counts.get(k) || 0) + 1
		mcpWindow.counts.set(k, n)
		if (n > max) over = true
	}
	return over ? Math.ceil((mcpWindow.start + 60 * 1000 - now) / 1000) : 0
}

//Every tool an agent runs goes in the audit log: who, which agent, which tool and project, and whether it worked. The
//Activity Designer's in-process calls (further down) go through the same one
const mcpAudit = (req, ctx, msg, reply) => {
	if (msg.method !== 'tools/call') return
	let args = msg.params?.arguments || {},
		project = [args.project_id, args.projectId, args.project].find((x) => typeof x === 'string' && validID(x)) || null
	audit(req, 'agent-tool', project, {agent: ctx.agent, tool: String(msg.params?.name || '').slice(0, 60), ok: !reply?.error && !reply?.result?.isError})
}

router.post('/mcp', cacheHeaders.api, express.json({limit: '4mb'}), async (req, res) => {
	//A browser page on some other site has no business driving this (DNS rebinding and friends). Agents send no Origin
	let origin = req.get('origin'),
		originHost = null
	try {
		originHost = origin ? new URL(origin).host : null
	}
	catch {
		originHost = '(bad)'
	}
	if (origin && originHost !== req.get('host')) {
		return res.status(403).json({jsonrpc: '2.0', id: null, error: {code: -32000, message: 'Origin not allowed'}})
	}

	let wait = mcpLimited(req)
	if (wait) {
		return res.set('Retry-After', String(wait)).status(429).json({jsonrpc: '2.0', id: req.body?.id ?? null, error: {code: -32000, message: `Too many requests, try again in ${wait} s`}})
	}

	let mcp = await loadMCP(),
		msg = req.body,
		id = req.get('mcp-session-id'),
		conn = id ? mcpConnections.get(id) : null

	if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') {
		//A reply from the client to something we asked (we never ask), or a batch (dropped from the spec)
		if (msg && typeof msg === 'object' && !Array.isArray(msg) && ('result' in msg || 'error' in msg)) return res.status(202).end()
		return res.status(400).json({jsonrpc: '2.0', id: null, error: {code: -32600, message: 'Send one JSON-RPC request per POST'}})
	}

	if (msg.method === 'initialize') {
		if (mcpConnections.size >= MCP_MAX_CONNECTIONS) {
			//Full up: make room by dropping whoever has been quiet longest
			let oldest = [...mcpConnections.entries()].sort((a, b) => a[1].used - b[1].used)[0]
			mcp.closeContext(oldest[1].ctx)
			mcpConnections.delete(oldest[0])
		}
		id = crypto.randomBytes(18).toString('base64url')
		conn = {
			used: Date.now(),
			ctx: {
				base: `http://127.0.0.1:${port}/${appName}`,
				sessionId: mcpSessionID(req),
				agent: String(req.query.agent || req.get('x-agent-name') || 'Agent').replace(/[^\w .'()-]/g, '').slice(0, 40) || 'Agent',
				sessions: new Map(),
			},
		}
		mcpConnections.set(id, conn)
		res.set('Mcp-Session-Id', id)
	}
	else if (!conn) {
		//Unknown or expired: the spec says 404, and the client starts again with initialize
		return res.status(404).json({jsonrpc: '2.0', id: msg.id ?? null, error: {code: -32001, message: 'Unknown or expired MCP session, initialize again'}})
	}
	else {
		conn.used = Date.now()
		//A session that signed in again since: follow the newest id it sends
		let sid = mcpSessionID(req)
		if (sid) conn.ctx.sessionId = sid
	}

	let reply = await mcp.runAs(conn.ctx, () => mcp.respond(msg))
	mcpAudit(req, conn.ctx, msg, reply)
	if (!reply) return res.status(202).end()
	res.json(reply)
})

//No server-initiated stream: every reply comes back on its own POST
router.get('/mcp', (req, res) => {
	res.set('Allow', 'POST, DELETE').status(405).end()
})

router.delete('/mcp', async (req, res) => {
	let id = req.get('mcp-session-id'),
		conn = id && mcpConnections.get(id)
	if (!conn) return res.status(404).end()
	;(await loadMCP()).closeContext(conn.ctx)
	mcpConnections.delete(id)
	res.status(204).end()
})

//The document. no-cache, it's what hands out everyone else's stamps
router.get(['/', '/index.html'], cacheHeaders.document, (req, res) => {
	res.type('html').send(indexHTML())
})

//Vite's output is content hashed, so those files can be cached hard. Everything else goes through the suite's rules
//Compressed copies of the text files (brotli, gzip) are made in the background after boot, into storage/_compressed
//(outside git), and handed out ahead of express.static to browsers that accept them. Until a file's copy exists, or when
//one can't be used (a Range request, an out of date copy), the plain file goes out as before
let assetOptions = {immutable: true, maxAge: '1y'},
	compressed = precompressed(`${__dirname}/dist`, `${storageDir}/_compressed`)
router.use('/assets', compressed.serve(`${__dirname}/dist/assets`, assetOptions), express.static(`${__dirname}/dist/assets`, assetOptions))
router.use(compressed.serve(`${__dirname}/dist`, cacheHeaders.staticOptions), express.static(`${__dirname}/dist`, cacheHeaders.staticOptions))

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
		designerTokens = db.collection('designer-tokens')
		libraries = db.collection('libraries')
		templates = db.collection('templates')
		commentRows = db.collection('comments')
		commentNotices = db.collection('comment-notices')
		docChunks = db.collection('doc-chunks')
		projectsBin = db.collection('projects-bin')
		auditLog = db.collection('audit')
		userData = analyticsDB.collection('interactives-user-data')
		activityData = analyticsDB.collection('interactives-activity-user-data')
		sharedRows = db.collection('shared-responses')
		sharedHidden = db.collection('shared-hidden')
		roomMessages = db.collection('room-messages')
		courseRows = analyticsDB.collection('interactives-course-collections')
		ingest = analyticsDB.collection('ingest')
		userLookup = analyticsDB.collection('user-lookup')
		fs.mkdirSync(storageDir, {recursive: true})

		//Mongo indexes for the lti13-* collections are in suite-libs/indexes.js
		lti13.init(db, projects).catch((err) => console.trace(`${appName}: LTI 1.3 could not start`, err))

		require('../suite-libs/version-reporting')(analyticsDB, appName, version)

		return Promise.all([import('./shared/ops.mjs'), import('./shared/library.mjs'), import('./shared/safety.mjs'), import('./shared/learner.mjs'), import('./shared/marking-kit.mjs'), import('./shared/records.mjs'), import('./shared/media-bridge.mjs'), import('./shared/comments.mjs'), import('./shared/template.mjs'), import('./shared/docstore.mjs'), import('./shared/notes.mjs'), import('./shared/responses.mjs'), import('./shared/course.mjs'), import('./shared/rooms.mjs')])
	})
	.then(([opsMod, libraryMod, safetyMod, learnerMod, markerMod, recordsMod, mediaMod, commentsMod, templateMod, docstoreMod, notesMod, responsesMod, courseMod, roomsMod]) => {
		ops = opsMod
		store = docstoreMod.docStore(docChunks)
		library = libraryMod
		template = templateMod
		safety = safetyMod
		learner = learnerMod
		marker = markerMod
		notesLib = notesMod
		responses = responsesMod
		courseLib = courseMod
		roomsLib = roomsMod
		markLimiter = markerMod.makeLimiter()
		records = recordsMod
		media = mediaMod
		commentLib = commentsMod

		//Sliding window for comments, per person
		commentLimits.person = new commentsMod.Limiter(60, 10 * 60 * 1000)

		//Shared responses: how often one person may add or take back (per project), and how often they may read
		sharedLimits.write = new commentsMod.Limiter(30, 60 * 1000)
		sharedLimits.read = new commentsMod.Limiter(180, 60 * 1000)
		sharedLimits.live = new commentsMod.Limiter(12, 60 * 1000)

		//Rooms: sockets one person may open a minute, the same number as the live streams
		sharedLimits.rooms = new commentsMod.Limiter(12, 60 * 1000)

		//Course collections: per person, whatever the project
		courseLimits.write = new commentsMod.Limiter(60, 60 * 1000)
		courseLimits.read = new commentsMod.Limiter(180, 60 * 1000)
		cacheHeaders.watchEpoch()

		//The bin, now and every 6 hours
		let sweep = () => sweepBin().then((n) => n && console.log(`${appName}: purged ${n} project(s) from the bin`)).catch((err) => console.trace(`${appName}: bin sweep failed`, err))
		sweep()
		setInterval(sweep, 6 * 60 * 60 * 1000).unref()

		let server = app.listen(port, (err) => {
			//Express 5 hands a failed bind to this callback instead of throwing
			if (err) {
				console.error(`${appName} could not listen on port ${port}:`, err.message)
				process.exit(1)
			}

			console.log(`${appName} started on port: ${port} - Date: ${new Date()}`)

			//Not before we are answering, and not at all with INTERACTIVES_PRECOMPRESS=0. A restart finds the copies it
			//made last time and only does the files that changed
			if (process.env.INTERACTIVES_PRECOMPRESS !== '0') {
				compressed.build()
					.then((r) => console.log(`${appName}: compressed copies ready, ${r.made} made, ${r.reused} reused, ${r.removed} cleared, ${(r.br / 1024).toFixed(0)} KB brotli in ${(r.ms / 1000).toFixed(1)} s`))
					.catch((err) => console.warn(`${appName}: making compressed copies failed (plain files are served)`, err.message))
			}
		})

		//Rooms are a WebSocket on the same port, under /interactives so haproxy's path rule already sends it here
		roomAttach(server)
	})
	.catch((err) => {
		console.trace(`${appName} failed to start (could not connect to mongo) - Date: ${new Date()}`, err)
	})
