//Shared responses on the server (the player side is interactives-player/src/shared.ts, and test/shared-parity.test.ts holds
//the two to the same answers). What lives here is pure: reading a project's declaration out of the page it was shared as,
//cleaning an answer, and counting. index.js does the mongo and the sessions.

export const DEFAULTS = {maxLength: 40, perPerson: 5, minCount: 1, refresh: 10}
export const LIMITS = {maxLength: 120, perPerson: 50, blocked: 200, sources: 20}

const whole = (v, def, min, max) => {
	let n = typeof v === 'number' ? v : Number(v)

	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def
}

//What the owner declared for a source when the project was shared. The learner routes hold to this, never to what a browser says:
//who may see (a fixed answer, or whatever the variable the page hangs it on says), the lengths and limits, the blocklist.
//sample is left out, it is for the editor's canvas only
export const cleanDeclaration = (raw) => {
	let o = raw && typeof raw === 'object' ? raw : {},
		words = (Array.isArray(o.blocked) ? o.blocked : []).filter((w) => typeof w === 'string').map((w) => w.trim()).filter(Boolean).slice(0, LIMITS.blocked)

	return {
		who: o.who === 'me' ? 'me' : 'class',
		byVariable: typeof o.whoVariable === 'string' && !!o.whoVariable,
		maxLength: whole(o.maxLength, DEFAULTS.maxLength, 1, LIMITS.maxLength),
		perPerson: whole(o.perPerson, DEFAULTS.perPerson, 1, LIMITS.perPerson),
		minCount: whole(o.minCount, DEFAULTS.minCount, 1, 1000),
		blocked: words
	}
}

//The shared sources a shared page declares, by data source id, read out of the project inside it. Empty when there are none
export const declaredShared = (html) => {
	if (!html.includes('"source":"shared"')) {
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
		if (ds && ds.source === 'shared' && typeof ds.id === 'string' && /^[\w-]{1,64}$/.test(ds.id) && Object.keys(out).length < LIMITS.sources) {
			out[ds.id] = {...cleanDeclaration(ds.shared), name: String(ds.name || '').slice(0, 80)}
		}
	}

	return out
}

//Who sees it for this request: what the owner declared, unless they hung it on a variable, and then the page's own word
export const effectiveWho = (declared, asked) => declared.byVariable && (asked === 'me' || asked === 'class') ? asked : declared.who

//An answer as it is kept: control and invisible characters to spaces, spaces squeezed, cut to the length
export const cleanAnswer = (text, maxLength = DEFAULTS.maxLength) => {
	if (typeof text !== 'string' && typeof text !== 'number') {
		return ''
	}

	let s = String(text).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim()

	return [...s].slice(0, maxLength).join('').trim()
}

//What two answers are compared by: capitals and spacing ignored
export const answerKey = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim()

const stripEnds = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

//Whether an answer holds a blocked word or phrase (whole words, so a blocked "ass" leaves "class" alone)
export const isBlocked = (text, blocked) => {
	if (!blocked || !blocked.length) {
		return false
	}

	let list = new Set(blocked.map((b) => answerKey(stripEnds(b))).filter(Boolean)),
		key = answerKey(text)

	if (list.has(stripEnds(key))) {
		return true
	}

	let tokens = key.split(' ').map(stripEnds).filter(Boolean)

	if (tokens.some((t) => list.has(t))) {
		return true
	}

	return [...list].some((b) => b.includes(' ') && ` ${tokens.join(' ')} `.includes(` ${b} `))
}

//Counts answers: a person's repeats count once, an answer shows once enough people gave it, hidden ones (the teacher's) never,
//most given first and ties alphabetical so the order does not jump. people is a list of each person's answers
export const tally = (people, {minCount = 1, blocked = [], hidden = new Set()} = {}) => {
	let by = new Map()

	for (let answers of people) {
		let seen = new Set()

		for (let text of answers) {
			let key = answerKey(text)

			if (!key || seen.has(key) || hidden.has(key) || isBlocked(text, blocked)) {
				continue
			}

			seen.add(key)

			let have = by.get(key)

			if (have) {
				have.count = have.weight = have.count + 1
			}
			else {
				by.set(key, {text, count: 1, weight: 1})
			}
		}
	}

	return [...by.values()].filter((a) => a.count >= minCount).sort((a, b) => b.count - a.count || (answerKey(a.text) < answerKey(b.text) ? -1 : 1))
}

//What a learner is told. Counts, never names: mine is their own list, the rest is the class's
export const valueFor = ({declared, who, docs, mine, hidden, problem = ''}) => {
	let answers = who === 'me' ? tally([mine], {blocked: declared.blocked}) : tally(docs.map((d) => d.answers.map((a) => a.text)), {minCount: declared.minCount, blocked: declared.blocked, hidden})

	return {
		ready: true,
		who,
		answers,
		total: answers.reduce((n, a) => n + a.count, 0),
		people: who === 'me' ? (mine.length ? 1 : 0) : docs.filter((d) => d.answers.length).length,
		mine,
		left: Math.max(0, declared.perPerson - mine.length),
		limit: declared.perPerson,
		problem
	}
}

//The adds a person's request makes to their list: each answer cleaned, blocked ones refused, repeats ignored, and the limit holding.
//Returns the new list, how many were kept, and why anything was not (the last reason)
export const planAdd = (existing, given, declared) => {
	let list = existing.map((a) => ({...a})),
		kept = 0,
		problem = ''

	for (let raw of (Array.isArray(given) ? given : [given]).slice(0, 20)) {
		let text = cleanAnswer(raw, declared.maxLength)

		if (!text) {
			continue
		}

		if (isBlocked(text, declared.blocked)) {
			problem = 'blocked'
		}
		else if (list.some((a) => answerKey(a.text) === answerKey(text))) {
			continue
		}
		else if (list.length >= declared.perPerson) {
			problem = 'full'
		}
		else {
			list.push({text, at: new Date()})
			kept++
		}
	}

	return {list, kept, problem}
}

//Takes a person's answers out: the ones named, or all of them when none are
export const planWithdraw = (existing, named, declared) => {
	let gone = (Array.isArray(named) ? named : named ? [named] : []).map((n) => answerKey(cleanAnswer(n, declared.maxLength))).filter(Boolean)

	return gone.length ? existing.filter((a) => !gone.includes(answerKey(a.text))) : []
}

//What the teacher sees of a class: every answer with its count, hidden ones marked, before any minimum is applied
export const moderationView = (docs, hidden, declared) => {
	let rows = tally(docs.map((d) => d.answers.map((a) => a.text)), {minCount: 1, blocked: [], hidden: new Set()})

	return {
		people: docs.filter((d) => d.answers.length).length,
		answers: rows.map((r) => ({text: r.text, count: r.count, hidden: hidden.has(answerKey(r.text)), blocked: isBlocked(r.text, declared.blocked), shown: !hidden.has(answerKey(r.text)) && !isBlocked(r.text, declared.blocked) && r.count >= declared.minCount}))
	}
}
