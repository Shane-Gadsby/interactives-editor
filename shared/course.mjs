//Course collections on the server (the player side is interactives-player/src/course.ts, and test/course-parity.test.ts holds the two
//to the same answers). Pure: cleaning names, working out what a request would change. index.js does the mongo and the sessions.
import {answerKey, cleanAnswer} from './responses.mjs'

export const LIMITS = {collections: 20, collectionName: 40, stamp: 60, stamps: 200, counterName: 40, counters: 100, maxCount: 1e9}

//A collection's name as it is compared and kept
export const cleanCollection = (raw) => {
	if (typeof raw !== 'string' && typeof raw !== 'number') {
		return ''
	}

	let s = String(raw).toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, ' ').replace(/\s+/g, ' ').trim()

	return [...s].slice(0, LIMITS.collectionName).join('').trim()
}

export const cleanStamp = (raw) => cleanAnswer(raw, LIMITS.stamp)

export const cleanCounterName = (raw) => [...cleanCollection(raw)].slice(0, LIMITS.counterName).join('').trim()

export const cleanCount = (raw) => {
	let n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN

	if (!Number.isFinite(n)) {
		return null
	}

	return Math.round(Math.min(LIMITS.maxCount, Math.max(0, n)) * 1000) / 1000
}

//Every stamp once, whatever the capitals (the first spelling stays)
export const uniqueStamps = (list) => {
	let seen = new Set(),
		out = []

	for (let raw of Array.isArray(list) ? list : []) {
		let s = cleanStamp(raw),
			k = answerKey(s)

		if (!s || seen.has(k)) {
			continue
		}

		seen.add(k)
		out.push(s)
	}

	return out
}

export const cleanCounts = (raw) => {
	let out = {}

	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return out
	}

	for (let [k, v] of Object.entries(raw)) {
		let name = cleanCounterName(k),
			n = cleanCount(v)

		if (!name || n === null) {
			continue
		}

		out[name] = Math.max(out[name] ?? 0, n)
	}

	return out
}

//What adding this to what is there would change: the stamps not held yet and the counters that go up, and 'full' if a limit stopped some
export const planAdd = (have, add) => {
	let held = uniqueStamps(have?.stamps),
		known = new Set(held.map(answerKey)),
		counts = cleanCounts(have?.counts),
		plan = {stamps: [], counts: {}, problem: ''}

	for (let s of uniqueStamps(add?.stamps)) {
		if (known.has(answerKey(s))) {
			continue
		}

		if (held.length + plan.stamps.length >= LIMITS.stamps) {
			plan.problem = 'full'
			break
		}

		plan.stamps.push(s)
	}

	for (let [name, n] of Object.entries(cleanCounts(add?.counts))) {
		if (n <= (counts[name] ?? -1)) {
			continue
		}

		if (!(name in counts) && Object.keys(counts).length + Object.keys(plan.counts).length >= LIMITS.counters) {
			plan.problem = 'full'
			continue
		}

		plan.counts[name] = n
	}

	return plan
}

export const changed = (plan) => plan.stamps.length + Object.keys(plan.counts).length

//The collection after a plan
export const applyPlan = (have, plan) => {
	let counts = cleanCounts(have?.counts)

	for (let [name, n] of Object.entries(plan.counts)) {
		counts[name] = Math.max(counts[name] ?? 0, n)
	}

	return {stamps: [...uniqueStamps(have?.stamps), ...plan.stamps], counts}
}

//The mongo update that makes a plan true, however many tabs are doing the same at once: $addToSet never repeats a stamp (the plan only
//holds ones that are not there, and a clash in capitals is tidied on read), $max never takes a counter back
export const updateFor = (plan, now) => {
	let update = {$set: {updated: now}, $setOnInsert: {created: now}}

	if (plan.stamps.length) {
		update.$addToSet = {stamps: {$each: plan.stamps}}
	}

	if (Object.keys(plan.counts).length) {
		update.$max = Object.fromEntries(Object.entries(plan.counts).map(([name, n]) => [`counts.${name}`, n]))
	}

	return update
}

//What the learner is told about a stored row
export const valueOf = (row, extra = {}) => ({stamps: uniqueStamps(row?.stamps), counts: cleanCounts(row?.counts), course: true, ...extra})
