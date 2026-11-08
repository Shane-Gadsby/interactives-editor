//The pure part of learner records (lti-analytics.interactives-user-data), shared with the tests: what a learner's
//browser is allowed to say about itself, how a report and a progress save change the record, and the summary the
//project owner sees. No mongo, no express, so the tests run it as it is.
//
//One record per project + username + course. Everything in it is the learner's own word (the player runs in their
//browser), so it is checked for shape and size, never for truth.

//A variable name is a JavaScript identifier (the player's rule), so nothing else gets near the record
const NAME = /^[A-Za-z_$][\w$]*$/

export const MAX_VARIABLES = 100
export const MAX_VARIABLE_BYTES = 64 * 1024
export const MAX_ATTEMPTS = 100000

const finite = (n) => typeof n === 'number' && Number.isFinite(n)
const round2 = (n) => Math.round(n * 100) / 100
const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''

//What a progress save may hold: remembered variables (as one JSON string, so a name never becomes a mongo key), the
//artboard they were on and the attempt count. Null for anything that is not that shape
export const cleanProgress = (body) => {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return null
	}

	let vars = {},
		names = body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables) ? Object.keys(body.variables) : []

	if (names.length > MAX_VARIABLES) {
		return null
	}

	for (let name of names) {
		if (NAME.test(name) && name !== '__proto__') {
			vars[name] = body.variables[name]
		}
	}

	let json = JSON.stringify(vars)

	if (json.length > MAX_VARIABLE_BYTES) {
		return null
	}

	return {
		variables: json,
		artboard: typeof body.artboard === 'string' && body.artboard && body.artboard.length <= 100 ? body.artboard : null,
		attempts: finite(body.attempts) ? Math.min(MAX_ATTEMPTS, Math.max(1, Math.floor(body.attempts))) : 1,
		restart: body.restart === true
	}
}

//A reported result: percent is worked out here from the score, whatever the browser sent for it
export const cleanResult = (body) => {
	let r = body?.result ?? body

	if (!r || typeof r !== 'object' || Array.isArray(r)) {
		return null
	}

	let score = finite(r.score) && Math.abs(r.score) <= 1e9 ? r.score : null,
		max = finite(r.max) && r.max > 0 && r.max <= 1e9 ? r.max : 100

	return {
		completed: r.completed === true,
		score,
		max,
		percent: score === null ? null : round2(Math.min(100, Math.max(0, score / max * 100))),
		passed: score !== null && typeof r.passed === 'boolean' ? r.passed : null
	}
}

//What the spelling guard found in a learner's browser (the player's GuardRecord): which writing tools it saw, how often an answer
//changed without typing, how often the panel came up, and whether a teacher's exemption code was used. The ids are only from
//what the guard knows, so anything else is dropped. The learner's own word again, so shape and size only
const GUARD_TOOL_IDS = new Set(['grammarly', 'languagetool', 'mseditor', 'prowritingaid', 'quillbot', 'ginger', 'answer-changed'])

export const cleanGuard = (body) => {
	let g = body?.guard ?? body

	if (!g || typeof g !== 'object' || Array.isArray(g)) {
		return null
	}

	let count = (n) => finite(n) ? Math.min(100000, Math.max(0, Math.floor(n))) : 0,
		tools = Array.isArray(g.tools) ? [...new Set(g.tools.filter((t) => typeof t === 'string' && GUARD_TOOL_IDS.has(t)))] : []

	return {tools, valueChanges: count(g.valueChanges), shown: count(g.shown), exempt: g.exempt === true, mode: g.mode === 'block' ? 'block' : 'warn'}
}

//The fields to set when a guard record comes in. What was seen is kept for good (the teacher sees what was there, not only what
//is there now), the counts only go up, and the player's tally is for the whole visit so a larger one replaces a smaller
export const guardUpdate = (existing, clean, who, now) => {
	let was = existing?.guard || {}

	return {
		...identity(who),
		guard: {
			tools: [...new Set([...(was.tools || []), ...clean.tools])],
			valueChanges: Math.max(was.valueChanges || 0, clean.valueChanges),
			shown: Math.max(was.shown || 0, clean.shown),
			exempt: !!was.exempt || clean.exempt,
			mode: clean.mode,
			first: was.first || now,
			last: now
		},
		updated: now
	}
}

//How a record's guard reads to a teacher: nothing, or the tools in words and the counts
const GUARD_NAMES = {grammarly: 'Grammarly', languagetool: 'LanguageTool', mseditor: 'Microsoft Editor', prowritingaid: 'ProWritingAid', quillbot: 'QuillBot', ginger: 'Ginger', 'answer-changed': 'Answer changed without typing'}

export const guardLabel = (g) => g && (g.tools?.length || g.exempt) ? [...(g.tools || []).map((t) => GUARD_NAMES[t] || t), ...(g.exempt ? ['Exemption code used'] : [])].join('; ') : ''

//The fields to set on the record when the learner saves progress. A restart (Start over) opens a new attempt:
//this attempt isn't complete, but best score, completion and pass stay on the record
export const progressUpdate = (existing, clean, who, now) => {
	let set = {
		...identity(who),
		variables: clean.variables,
		artboard: clean.artboard,
		attempts: Math.max(existing?.attempts || 1, clean.attempts),
		progressAt: now,
		updated: now
	}

	if (clean.restart) {
		set.attemptCompleted = false
	}

	return set
}

//The fields to set when the learner reports a result. Best is by percentage; completed and passed are "ever"
export const reportUpdate = (existing, result, who, now) => {
	let set = {
		...identity(who),
		attempts: existing?.attempts || 1,
		reports: (existing?.reports || 0) + 1,
		lastScore: result.score,
		lastMax: result.max,
		lastPercent: result.percent,
		lastPassed: result.passed,
		lastReportAt: now,
		updated: now
	}

	if (result.percent !== null && (existing?.bestPercent === undefined || existing?.bestPercent === null || result.percent > existing.bestPercent)) {
		set.bestPercent = result.percent
		set.bestScore = result.score
		set.bestMax = result.max
	}

	if (result.completed) {
		set.completed = true
		set.attemptCompleted = true
		set.completedAt = existing?.completedAt || now
	}

	set.passed = !!existing?.passed || result.passed === true

	return set
}

//Who the record is about, as the suite's session knows them. Only fields the session is trusted for
export const identity = (who) => ({
	userID: who.userID ?? null,
	name: text(who.name, 200) || null,
	courseLabel: text(who.courseLabel, 200) || null,
	courseCode: text(who.courseCode, 100) || null,
	lmsURL: text(who.lmsURL, 300) || null
})

//What a learner gets back when they return
export const progressOut = (doc) => {
	if (!doc) {
		return null
	}

	let variables = {}

	try {
		variables = JSON.parse(doc.variables || '{}') || {}
	}
	catch (e) {
		variables = {}
	}

	return {variables, artboard: doc.artboard || null, attempts: doc.attempts || 1, completed: !!doc.attemptCompleted}
}

//User data, the Save user data and Load user data nodes: lti-analytics.interactives-activity-user-data, one record per
//project + username + course same as progress, but only what a flow chose to save and only when it said to. One JSON
//string again, so a variable's name never turns into a mongo key, and merged here so a save only touches what it names
const userDataOf = (doc) => {
	try {
		let v = JSON.parse(doc?.variables || '{}')

		return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
	}
	catch (e) {
		return {}
	}
}

//What a save may hold: {variables: {name: value}}. Null for anything else, or nothing worth saving
export const cleanUserData = (body) => {
	let vars = body?.variables

	if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
		return null
	}

	let names = Object.keys(vars),
		out = {}

	if (names.length > MAX_VARIABLES) {
		return null
	}

	for (let name of names) {
		if (NAME.test(name) && name !== '__proto__') {
			out[name] = vars[name]
		}
	}

	return Object.keys(out).length ? out : null
}

//The fields to set for a save: what was there with this save's variables over the top. Null when the result is too
//big to keep (the same limits as remembered progress), so the route can say so instead of quietly dropping some
export const userDataUpdate = (existing, clean, who, now) => {
	let merged = {...userDataOf(existing), ...clean},
		json = JSON.stringify(merged)

	if (Object.keys(merged).length > MAX_VARIABLES || json.length > MAX_VARIABLE_BYTES) {
		return null
	}

	return {...identity(who), variables: json, updated: now}
}

//The names a load asks for, off the query string (a,b,c). Anything that isn't a variable name is dropped
export const userDataNames = (raw) => String(raw || '').split(',').filter((n) => NAME.test(n) && n !== '__proto__').slice(0, MAX_VARIABLES)

//What a load gets back: only the names asked for, and only the ones that were saved
export const userDataOut = (doc, names) => {
	let all = userDataOf(doc),
		out = {}

	for (let name of names) {
		if (Object.prototype.hasOwnProperty.call(all, name)) {
			out[name] = all[name]
		}
	}

	return out
}

const mean = (list) => list.length ? round2(list.reduce((a, b) => a + b, 0) / list.length) : null

//The project owner's view: counts, averages and the people. `rows` are records without their variables
export const summarise = (rows, limit = 200) => {
	let people = new Set(rows.map((r) => r.username)),
		scored = rows.filter((r) => typeof r.bestPercent === 'number'),
		courses = new Map()

	for (let r of rows) {
		let label = r.courseLabel || r.course || 'No course',
			c = courses.get(label) || {course: label, learners: 0, completed: 0}

		c.learners++
		c.completed += r.completed ? 1 : 0
		courses.set(label, c)
	}

	let completed = rows.filter((r) => r.completed).length,
		passed = rows.filter((r) => r.passed).length

	return {
		learners: people.size,
		records: rows.length,
		completed,
		completionRate: rows.length ? round2(completed / rows.length * 100) : null,
		passed,
		scored: scored.length,
		passRate: scored.length ? round2(scored.filter((r) => r.passed).length / scored.length * 100) : null,
		averageBestPercent: mean(scored.map((r) => r.bestPercent)),
		averageAttempts: mean(rows.map((r) => r.attempts || 1)),
		courses: [...courses.values()].sort((a, b) => b.learners - a.learners).slice(0, 20),
		list: [...rows]
			.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0))
			.slice(0, limit)
			.map((r) => ({
				username: r.username,
				name: r.name || null,
				course: r.courseLabel || null,
				attempts: r.attempts || 1,
				completed: !!r.completed,
				passed: !!r.passed,
				guard: r.guard && (r.guard.tools?.length || r.guard.exempt) ? {tools: r.guard.tools || [], valueChanges: r.guard.valueChanges || 0, shown: r.guard.shown || 0, exempt: !!r.guard.exempt, label: guardLabel(r.guard)} : null,
				bestPercent: r.bestPercent ?? null,
				lastPercent: r.lastPercent ?? null,
				updated: r.updated || null
			}))
	}
}

//One row per learner for a spreadsheet. A cell starting with = + - @ (or a tab/return) gets a leading quote, so a
//name or course label can't turn into a formula when it's opened
const csvCell = (v) => {
	if (v === null || v === undefined) return ''
	let s = v instanceof Date ? v.toISOString() : String(v)
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const RESULTS_CSV_COLUMNS = ['username', 'name', 'course', 'completed', 'passed', 'attempts', 'best score', 'best max', 'best percent', 'last score', 'last max', 'last percent', 'completed at', 'last active']

//The writing tools column is only there when the spelling guard found something for somebody, so a project without one has the file it always had
export const resultsCsv = (rows) => {
	let guarded = rows.some((r) => guardLabel(r.guard))

	return [
		guarded ? [...RESULTS_CSV_COLUMNS, 'writing tools found'] : RESULTS_CSV_COLUMNS,
		...[...rows]
			.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0))
			.map((r) => [r.username, r.name, r.courseLabel || r.course, r.completed ? 'yes' : 'no', r.passed ? 'yes' : 'no', r.attempts || 1, r.bestScore, r.bestMax, r.bestPercent, r.lastScore, r.lastMax, r.lastPercent, r.completedAt, r.updated, ...(guarded ? [guardLabel(r.guard)] : [])])
	].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
