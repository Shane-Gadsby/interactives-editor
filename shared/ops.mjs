//Document ops for live editing, shared by the server (index.js) and the browser (src/lib/live.ts).
//
//A change to a project is a list of ops addressed by ids rather than array positions, so two people
//editing different layers (or different properties of one layer) never step on each other. Last write
//wins per property, in the order the server puts them in.
//
//	{t: 'set', p: path, v: value}                   set a property (or a whole non-id array)
//	{t: 'ins', p: path, v: element, after: id|null} insert into an id array after an element (null = first)
//	{t: 'del', p: path, id}                         remove an element from an id array
//
//A path is a list of steps: a string is an object key, {i: id} is the element with that id.
//
//There is one more op, {t: 'mv', p: path, id, after: id|null}: move an element within its id array. It never goes
//over the wire (the server and diff() don't know it); a client makes it locally, from orderFixes(), to put a list
//in the order the server will end up with.

//An array is addressed by ids when every element is an object with a string id
export const isIdArray = (a) => Array.isArray(a) && a.length > 0 && a.every((e) => e && typeof e === 'object' && typeof e.id === 'string')

const same = (a, b) => {
	if (a === b) return true
	if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
	if (Array.isArray(a) !== Array.isArray(b)) return false
	let ka = Object.keys(a), kb = Object.keys(b)
	if (ka.length !== kb.length) return false
	for (let k of ka) if (!same(a[k], b[k])) return false
	return true
}

//Longest increasing subsequence of positions, the elements that can stay where they are when reordering
function stayers(order) {
	let tails = [], prev = new Array(order.length), tailIdx = []
	for (let i = 0; i < order.length; i++) {
		let lo = 0, hi = tails.length
		while (lo < hi) {
			let mid = (lo + hi) >> 1
			if (tails[mid] < order[i]) lo = mid + 1
			else hi = mid
		}
		tails[lo] = order[i]
		tailIdx[lo] = i
		prev[i] = lo ? tailIdx[lo - 1] : -1
	}
	let keep = new Set(), k = tailIdx[tails.length - 1]
	while (k !== undefined && k >= 0) {
		keep.add(k)
		k = prev[k]
	}
	return keep
}

//Ops that turn `a` into `b`. Unchanged subtrees are skipped by reference, so with immer's structural sharing
//this only walks what actually changed
export function diff(a, b, path = [], out = []) {
	if (a === b) return out
	let aObj = a && typeof a === 'object', bObj = b && typeof b === 'object'
	if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
		if (!same(a, b)) out.push({t: 'set', p: path, v: b})
		return out
	}
	if (Array.isArray(a)) {
		//The same elements in the same order (an edit inside one, nothing inserted, removed or moved): compare them pairwise,
		//without the id maps a reshuffle needs. The usual case, and the one worth being quick on in a long list of layers
		if (a.length && a.length === b.length) {
			let aligned = true
			for (let i = 0; i < a.length; i++) {
				let x = a[i], y = b[i]
				if (!x || typeof x !== 'object' || typeof x.id !== 'string' || (x !== y && (!y || typeof y !== 'object' || y.id !== x.id))) {
					aligned = false
					break
				}
			}
			if (aligned) {
				for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff(a[i], b[i], [...path, {i: a[i].id}], out)
				return out
			}
		}
		let idArrays = (isIdArray(a) || a.length === 0) && (isIdArray(b) || b.length === 0) && (a.length || b.length)
		if (!idArrays) {
			if (!same(a, b)) out.push({t: 'set', p: path, v: b})
			return out
		}
		let aIds = new Map(a.map((e, i) => [e.id, i])), bIds = new Set(b.map((e) => e.id))
		for (let e of a) if (!bIds.has(e.id)) out.push({t: 'del', p: path, id: e.id})
		//Common elements in b's order; the ones off the longest in-order run get moved (del + ins)
		let common = b.filter((e) => aIds.has(e.id)), keep = stayers(common.map((e) => aIds.get(e.id))), moved = new Set()
		common.forEach((e, i) => {
			if (!keep.has(i)) moved.add(e.id)
		})
		for (let id of moved) out.push({t: 'del', p: path, id})
		b.forEach((e, i) => {
			let after = i ? b[i - 1].id : null
			if (!aIds.has(e.id) || moved.has(e.id)) out.push({t: 'ins', p: path, v: e, after})
			else diff(a[aIds.get(e.id)], e, [...path, {i: e.id}], out)
		})
		return out
	}
	for (let k of Object.keys(a)) if (!(k in b)) out.push({t: 'set', p: [...path, k], v: undefined})
	for (let k of Object.keys(b)) diff(a[k], b[k], [...path, k], out)
	return out
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

//Walk to the container a path points into. Returns null when anything on the way is gone (deleted elsewhere)
function resolve(doc, path) {
	let cur = doc
	for (let step of path) {
		if (cur == null || typeof cur !== 'object') return null
		if (typeof step === 'string') {
			if (UNSAFE.has(step)) return null
			cur = cur[step]
		}
		else if (step && typeof step.i === 'string' && Array.isArray(cur)) cur = cur.find((e) => e && e.id === step.i)
		else return null
	}
	return cur === undefined ? null : cur
}

//Take every copy of an element id out of the child lists below a node. A layer moved to two places at the same
//moment would otherwise end up in both, and then in a list twice
function dropCopies(node, id) {
	let list = node && node.children
	if (!Array.isArray(list)) return
	let at = list.findIndex((e) => e && e.id === id)
	if (at >= 0) list.splice(at, 1)
	for (let e of list) dropCopies(e, id)
}

//Every layer id below a node
function collectIds(node, into) {
	if (!node || !Array.isArray(node.children)) return into
	for (let e of node.children) {
		if (!e) continue
		into.add(e.id)
		collectIds(e, into)
	}
	return into
}

//Leave out of a layer about to be inserted any child that already lives somewhere else. A group moved by one person
//still holds the child another person just moved out of it, and that move is the one that counts
function pruneKnown(node, known) {
	if (!node || !Array.isArray(node.children)) return
	node.children = node.children.filter((e) => !(e && known.has(e.id)))
	for (let e of node.children) pruneKnown(e, known)
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

//Apply ops to a document in place (an immer draft in the browser, a plain object on the server). Ops whose
//target no longer exists are skipped: a set on a deleted layer, an insert into a deleted artboard
export function apply(doc, ops) {
	let applied = 0
	for (let op of ops) {
		if (!op || !Array.isArray(op.p)) continue
		if (op.t === 'set') {
			if (!op.p.length) continue
			let parent = resolve(doc, op.p.slice(0, -1)), last = op.p[op.p.length - 1]
			if (!parent || typeof parent !== 'object') continue
			if (typeof last === 'string') {
				if (UNSAFE.has(last) || Array.isArray(parent)) continue
				if (op.v === undefined) delete parent[last]
				else parent[last] = clone(op.v)
			}
			else if (Array.isArray(parent) && last && typeof last.i === 'string') {
				let i = parent.findIndex((e) => e && e.id === last.i)
				if (i < 0) continue
				parent[i] = clone(op.v)
			}
			applied++
		}
		else if (op.t === 'mv') {
			let arr = op.p.length ? resolve(doc, op.p) : null
			if (!Array.isArray(arr)) continue
			let at = arr.findIndex((e) => e && e.id === op.id)
			if (at < 0) continue
			let [el] = arr.splice(at, 1)
			let pos = op.after == null ? 0 : arr.findIndex((e) => e && e.id === op.after) + 1
			if (op.after != null && pos === 0) pos = arr.length
			arr.splice(pos, 0, el)
			applied++
		}
		else if (op.t === 'ins' || op.t === 'del') {
			let arr = op.p.length ? resolve(doc, op.p) : null
			if (!Array.isArray(arr)) {
				//An id array that doesn't exist yet (first element of a list that was missing)
				if (op.t !== 'ins' || !op.p.length) continue
				let parent = resolve(doc, op.p.slice(0, -1)), last = op.p[op.p.length - 1]
				if (!parent || typeof parent !== 'object' || Array.isArray(parent) || typeof last !== 'string' || UNSAFE.has(last) || parent[last] !== undefined) continue
				parent[last] = arr = []
			}
			let id = op.t === 'del' ? op.id : op.v && op.v.id
			let at = arr.findIndex((e) => e && e.id === id)
			if (at >= 0) arr.splice(at, 1)
			//A layer lives in one place: the last insert of it wins (within its artboard)
			let scope = op.t === 'ins' && typeof id === 'string' && op.p[0] === 'artboards' && op.p.length > 2 && op.p[op.p.length - 1] === 'children' ? resolve(doc, op.p.slice(0, 2)) : null
			if (scope) dropCopies(scope, id)
			if (op.t === 'ins') {
				let pos = op.after == null ? 0 : arr.findIndex((e) => e && e.id === op.after) + 1
				//The element it went after was deleted elsewhere: put it at the end
				if (op.after != null && pos === 0) pos = arr.length
				let el = clone(op.v)
				if (scope && el && Array.isArray(el.children) && el.children.length) pruneKnown(el, collectIds(scope, new Set()))
				arr.splice(pos, 0, el)
			}
			applied++
		}
	}
	return applied
}

//A stable key for the property an op writes, for "is this path still waiting on my own op" checks
export function opKey(op) {
	let parts = op.p.map((s) => (typeof s === 'string' ? s : '#' + s.i))
	if (op.t !== 'set') parts.push('#' + (op.t === 'ins' ? op.v && op.v.id : op.id))
	return parts.join('/')
}

const sameStep = (a, b) => (typeof a === 'string' ? a === b : !!a && typeof a === 'object' && !!b && typeof b === 'object' && a.i === b.i)
const startsWith = (p, head) => head.every((st, i) => sameStep(p[i], st))
const pathKey = (p) => p.map((s) => (typeof s === 'string' ? s : '#' + s.i)).join('/')
//The part of a document an artboard-sized rebase works on: the first step, and the id step after it when there is one
const scopeOf = (p) => p.slice(0, p.length > 1 && typeof p[1] === 'object' ? 2 : 1)

//Ops that put the id arrays in `local` into the order (and, rarely, the membership) the server will end up with.
//
//A client shows the server's document plus the ops of its own the server hasn't answered yet (`own`, in the order
//they were made). When someone else's ops (`remote`) come in first, "insert after X" can land in a different place
//than it will on the server, so lists drift apart. `shadow` is the client's copy of the server's document with
//`remote` already applied. For every artboard (or other top-level part) `remote` inserted into or deleted from, this
//replays `own` on a copy of that part of the shadow, which is exactly what the server will hold once it has our ops
//too, then walks `local` against it and returns the moves, inserts and deletes that make every id array match.
//Nothing is changed in place.
export function orderFixes(local, shadow, own, remote) {
	let scopes = new Map(), fixes = []
	for (let op of remote) {
		if (!op || op.t === 'set' || !Array.isArray(op.p) || !op.p.length) continue
		let sc = scopeOf(op.p)
		scopes.set(pathKey(sc), sc)
	}
	for (let sc of scopes.values()) {
		let mine = own.filter((op) => op && Array.isArray(op.p) && startsWith(op.p, sc))
		if (!mine.length) continue
		let base = resolve(shadow, sc), here = resolve(local, sc)
		if (!base || typeof base !== 'object' || !here || typeof here !== 'object') continue
		let root = {[sc[0]]: sc.length > 1 ? [clone(base)] : clone(base)}
		apply(root, mine)
		let want = resolve(root, sc), dels = [], rest = []
		if (want) fixLists(here, want, sc, dels, rest)
		//Everything that has to go first, so an element wanted in a new place isn't also left in its old one
		fixes.push(...dels, ...rest)
	}
	return fixes
}

const idArrayish = (a) => Array.isArray(a) && (a.length === 0 || isIdArray(a))

//Walk `a` (what we have) and `b` (what we want) together, fixing each id array and then what is inside the elements
//both sides have
function fixLists(a, b, path, dels, rest) {
	if (idArrayish(a) && idArrayish(b)) {
		if (!a.length && !b.length) return
		let want = b.map((e) => e.id), wantSet = new Set(want), cur = [], count = new Map()
		for (let e of a) count.set(e.id, (count.get(e.id) ?? 0) + 1)
		for (let e of a) {
			//Not wanted, or one of several copies (a `del` takes the first, so the last copy is the one that stays)
			let n = count.get(e.id)
			if (!wantSet.has(e.id) || n > 1) {
				dels.push({t: 'del', p: path, id: e.id})
				count.set(e.id, n - 1)
			}
			else cur.push(e.id)
		}
		let inserted = new Set()
		want.forEach((id, i) => {
			if (cur[i] === id) return
			let after = i ? want[i - 1] : null, at = cur.indexOf(id)
			if (at >= 0) {
				cur.splice(at, 1)
				rest.push({t: 'mv', p: path, id, after})
			}
			else {
				rest.push({t: 'ins', p: path, v: clone(b[i]), after})
				inserted.add(id)
			}
			cur.splice(i, 0, id)
		})
		let mine = new Map(a.map((e) => [e.id, e]))
		for (let e of b) if (!inserted.has(e.id) && mine.has(e.id)) fixLists(mine.get(e.id), e, [...path, {i: e.id}], dels, rest)
	}
	else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
		for (let k of Object.keys(a)) if (k in b && !UNSAFE.has(k)) fixLists(a[k], b[k], [...path, k], dels, rest)
	}
}
