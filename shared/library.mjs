//Component libraries, shared by the server (index.js) and the browser (src/lib/libraries.ts).
//
//A project marked as a library publishes a snapshot of its "Publish to library" artboards (plus whatever those
//artboards use as instances), its styles and the assets they need. This file is the pure part of that: building the
//snapshot, hashing it so "did anything change" is a comparison, deciding who may use a library and what a publish
//does to the version number. No mongo, no fs, nothing from the browser, so the tests can run it as it is.

//A short stable hash (cyrb53), the same in node and the browser. Not for security, only for "did this change"
const cyrb53 = (str) => {
	let h1 = 0xdeadbeef, h2 = 0x41c6ce57

	for (let i = 0; i < str.length; i++) {
		let ch = str.charCodeAt(i)
		h1 = Math.imul(h1 ^ ch, 2654435761)
		h2 = Math.imul(h2 ^ ch, 1597334677)
	}

	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

	return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

//JSON with the keys sorted, so the same content always makes the same string
export const stable = (value) => JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)

export const hashOf = (value) => cyrb53(stable(value)).toString(36)

//Where an artboard sits and who it is linked to is not part of what it looks like
const LOCAL_KEYS = ['canvasX', 'canvasY', 'canvasHidden', 'guides', 'publish', 'library', 'source']

export const hashArtboard = (ab) => hashOf(Object.fromEntries(Object.entries(ab).filter(([k]) => !LOCAL_KEYS.includes(k))))

//The artboard as it goes into a snapshot: no links, no publish flag, no design file link
export const cleanArtboard = (ab) => {
	let copy = JSON.parse(JSON.stringify(ab))

	delete copy.publish
	delete copy.library
	delete copy.source
	delete copy.canvasHidden

	return copy
}

//Artboards an artboard places as instances, at any depth of its layers, and the page master it draws
export const instanceTargets = (ab) => {
	let found = new Set(),
		walk = (list) => {
			for (let n of list || []) {
				if (n.type === 'instance' && n.artboardId) found.add(n.artboardId)
				if (Array.isArray(n.children)) walk(n.children)
			}
		}

	walk(ab.children)

	if (ab.master) found.add(ab.master)

	return [...found]
}

//An artboard and every artboard it uses, nested at any depth: root first, then in the order they're met
export const closureOf = (artboards, rootId) => {
	let byId = new Map(artboards.map((a) => [a.id, a])),
		order = [],
		queue = [rootId]

	while (queue.length) {
		let id = queue.shift(),
			ab = byId.get(id)

		if (!ab || order.includes(id)) continue

		order.push(id)
		queue.push(...instanceTargets(ab))
	}

	return order
}

//Which assets are named anywhere in the given texts: as an image paint or layer, in a variable's initial value, in a
//binding or expression that names one in quotes ('id' or "id"). An id is random, so finding it as a whole token
//(not a piece of a longer word) is exact enough. One pass over the texts, whatever the number of assets
const TOKEN = /[A-Za-z0-9_-]+/g
const assetIdsIn = (assets, texts) => {
	let tokens = new Set()

	for (let t of texts) for (let m of t.matchAll(TOKEN)) tokens.add(m[0])

	return assets.filter((a) => tokens.has(a.id))
}

//What a publish stores. Components are the artboards marked publish, internals are the artboards they use but
//that aren't published themselves. `artboards` holds both, `components`/`internals` are the light index
export const buildSnapshot = (project) => {
	let artboards = project.artboards || [],
		hashes = new Map(artboards.map((a) => [a.id, hashArtboard(a)])),
		published = artboards.filter((a) => a.publish),
		publishedIds = new Set(published.map((a) => a.id)),
		components = [],
		keep = new Set()

	for (let ab of published) {
		let ids = closureOf(artboards, ab.id)

		for (let id of ids) keep.add(id)

		components.push({
			id: ab.id,
			name: ab.name,
			width: ab.width,
			height: ab.height,
			hash: hashOf(ids.map((id) => hashes.get(id))),
			uses: ids.slice(1)
		})
	}

	let members = artboards.filter((a) => keep.has(a.id)).map(cleanArtboard),
		internals = members.filter((a) => !publishedIds.has(a.id)).map((a) => ({id: a.id, name: a.name, hash: hashes.get(a.id)})),
		fonts = project.fonts || [],
		dataSources = project.dataSources || [],
		assets,
		styles = project.styles || {colors: [], texts: []}

	styles = {
		colors: (styles.colors || []).map(({library, ...rest}) => rest),
		texts: (styles.texts || []).map(({library, ...rest}) => rest)
	}
	assets = assetIdsIn(project.assets || [], [stable(members), stable(fonts), stable(dataSources), stable(project.variables || []), stable(styles)])

	return {
		components,
		internals,
		artboards: members,
		variables: project.variables || [],
		fonts,
		dataSources,
		assets,
		styles
	}
}

//The whole snapshot is a library's content, so one hash for it tells a publish with nothing new in it
export const snapshotHash = (snap) => hashOf(snap)

//Who may use a library: its owner, anybody it's shared with (named people, or everyone). With no session at all
//(dev without si-manager) there's nobody to filter on, so it's open until the box enforces sessions
export const mayUseLibrary = (lib, me, enforcing) => {
	if (!me?.username) return !enforcing
	if (!lib?.owner?.username) return true

	return lib.owner.username === me.username || !!lib.shared?.everyone || (lib.shared?.users || []).includes(me.username)
}

//Who may publish, mark and withdraw a brand kit: a power user (the suite's rule, decided by the caller), or anybody whose
//session access list holds the group named in the server's settings. No group set means power users only
export const mayMarkBrand = (access, power, group) => !!power || (typeof group === 'string' && group.trim() !== '' && Array.isArray(access) && access.includes(group.trim()))

//The mongo filter for the same rule, for the list route
export const accessFilter = (me, enforcing) => {
	if (!me?.username) return enforcing ? {_id: null} : {}

	return {$or: [{'owner.username': me.username}, {'shared.everyone': true}, {'shared.users': me.username}]}
}

//Sharing settings from the browser: everyone on/off and a list of usernames. Anything odd is dropped
export const cleanShare = (body, maxUsers = 100) => {
	let users = []

	for (let raw of Array.isArray(body?.users) ? body.users : []) {
		let name = typeof raw === 'string' ? raw.trim() : ''

		if (name && name.length <= 80 && /^[\w.@+-]+$/.test(name) && !users.includes(name)) users.push(name)
	}

	return {everyone: body?.everyone === true, users: users.slice(0, maxUsers)}
}

//What a publish does to the stored library: nothing when the content hasn't changed, otherwise the next version
//number and a short history entry (the newest 50 are kept, the snapshot itself is only ever the latest)
export const planPublish = (existing, snap, {note, by, now}) => {
	let hash = snapshotHash(snap)

	if (existing && existing.hash === hash) {
		return {unchanged: true, version: existing.version, hash}
	}

	let version = (existing?.version || 0) + 1,
		entry = {
			version,
			created: now,
			by: by || null,
			note: typeof note === 'string' ? note.slice(0, 500) : '',
			components: snap.components.map(({id, name, hash: h}) => ({id, name, hash: h}))
		}

	return {unchanged: false, version, hash, history: [entry, ...(existing?.history || [])].slice(0, 50)}
}
