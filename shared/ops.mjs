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
			else if (Array.isArray(parent)) {
				let i = parent.findIndex((e) => e && e.id === last.i)
				if (i < 0) continue
				parent[i] = clone(op.v)
			}
			applied++
		}
		else if (op.t === 'ins' || op.t === 'del') {
			let arr = op.p.length ? resolve(doc, op.p) : null
			if (!Array.isArray(arr)) {
				//An id array that doesn't exist yet (first element of a list that was missing)
				if (op.t !== 'ins' || !op.p.length) continue
				let parent = resolve(doc, op.p.slice(0, -1)), last = op.p[op.p.length - 1]
				if (!parent || typeof last !== 'string' || UNSAFE.has(last) || parent[last] !== undefined) continue
				parent[last] = arr = []
			}
			let id = op.t === 'del' ? op.id : op.v && op.v.id
			let at = arr.findIndex((e) => e && e.id === id)
			if (at >= 0) arr.splice(at, 1)
			if (op.t === 'ins') {
				let pos = op.after == null ? 0 : arr.findIndex((e) => e && e.id === op.after) + 1
				//The element it went after was deleted elsewhere: put it at the end
				if (op.after != null && pos === 0) pos = arr.length
				arr.splice(pos, 0, clone(op.v))
			}
			applied++
		}
	}
	return applied
}

//A stable key for the property an op writes, for "is this path still waiting on my own op" checks
export function opKey(op) {
	let parts = op.p.map((s) => (typeof s === 'string' ? s : '#' + s.i))
	if (op.t !== 'set') parts.push('#' + (op.t === 'del' ? op.id : op.v && op.v.id))
	return parts.join('/')
}
