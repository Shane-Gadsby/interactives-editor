//The pure part of learner activity records and Insights, shared with the tests: what a record may hold (checked on the
//learner page before it goes to the suite's analytics, and again when Insights reads it back), the row the suite's
//analytics gets for one, and the counts the project owner sees. No mongo, no express.
//
//A record lands in lti-analytics.ingest the way every other toolbox app's analytics do (si-manager's reportAnalytics
//-> si-analytics /analytics/ingest-bulk): app 'Interactives', feature the kind of record, featureID the project's id,
//meta.rec the record itself and meta.run an id for one page load. The user and the course on the row are the suite's
//usual fields. Insights only ever counts: how many rows, how many different learners. Nobody is listed.
//
//Anyone can post to the analytics endpoint, so what is read back is checked again and treated as the learner's own word.

export const APP = 'Interactives'
export const KINDS = ['view', 'click', 'step', 'answer', 'custom']
export const CELL = 20
export const MAX_ROWS = 100000

//This one is written out in the learner page too (cleanRecord.toString() goes into its script), so it can't lean on
//anything outside itself. It gives back a clean copy of a record, or null when it isn't one
export function cleanRecord(raw) {
	let kinds = ['view', 'click', 'step', 'answer', 'custom'],
		qkinds = ['single', 'multiple', 'truefalse', 'blank', 'ordering', 'matching', 'categorise', 'hotspot'],
		text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '',
		id = (v, max) => typeof v === 'string' && v.length <= max && /^[\w.~:$-]+$/.test(v) ? v : '',
		int = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null

	if (!raw || typeof raw !== 'object' || Array.isArray(raw) || kinds.indexOf(raw.kind) < 0) {
		return null
	}

	let out = {kind: raw.kind},
		artboard = id(raw.artboard, 100),
		artboardName = text(raw.artboardName, 80)

	if (artboard) {
		out.artboard = artboard
	}

	if (artboardName) {
		out.artboardName = artboardName
	}

	if (raw.kind === 'view') {
		return artboard ? out : null
	}

	if (raw.kind === 'click') {
		let layer = id(raw.layer, 100),
			label = text(raw.label, 80),
			x = int(raw.x, 0, 20000),
			y = int(raw.y, 0, 20000)

		if (layer) {
			out.layer = layer
		}

		if (label) {
			out.label = label
		}

		if (x !== null && y !== null) {
			out.x = x
			out.y = y
		}

		return artboard ? out : null
	}

	if (raw.kind === 'step') {
		let step = int(raw.step, 1, 1000),
			steps = int(raw.steps, 1, 1000)

		if (step === null || steps === null) {
			return null
		}

		out.step = step
		out.steps = steps
		return out
	}

	if (raw.kind === 'answer') {
		let question = id(raw.question, 40),
			attempt = int(raw.attempt, 1, 1000)

		if (!question || attempt === null || typeof raw.correct !== 'boolean') {
			return null
		}

		out.question = question
		out.correct = raw.correct
		out.attempt = attempt

		if (qkinds.indexOf(raw.questionKind) > -1) {
			out.questionKind = raw.questionKind
		}

		if (typeof raw.fraction === 'number' && raw.fraction >= 0 && raw.fraction <= 1) {
			out.fraction = Math.round(raw.fraction * 1000) / 1000
		}

		if (Array.isArray(raw.options)) {
			out.options = raw.options.filter((o) => typeof o === 'string' && /^[\w-]{1,20}$/.test(o)).slice(0, 30)
		}

		return out
	}

	//custom: a name, and maybe a short value
	let label = text(raw.label, 60)

	if (!label) {
		return null
	}

	out.label = label

	if (typeof raw.value === 'boolean' || (typeof raw.value === 'number' && Number.isFinite(raw.value))) {
		out.value = raw.value
	}
	else if (typeof raw.value === 'string' && text(raw.value, 120)) {
		out.value = text(raw.value, 120)
	}

	return out
}

//The fields of the analytics row for a clean record, as reportAnalytics takes them: (app, feature, featureID, meta).
//meta.user, meta.activity and the origin are added by reportAnalytics from the session. Written out in the learner
//page too, so the app name is spelled here and not read from APP
export function rowFor(project, run, rec) {
	return ['Interactives', rec.kind, project, {project, run, rec}]
}

//How a published project ran (the player's diagnostics, see interactives-player/src/diagnostics.ts), for bug triage: load
//time, scripts that threw, shader and script layers that failed, data and pictures that would not load. Not learner
//activity, so it has its own app ('Interactives Player'), and nothing in one is a name, a url or anything typed. Like
//cleanRecord this is written out in the learner page (toString), so it can't lean on anything outside itself. It gives back a
//clean copy, or null when it isn't one
export const PLAYER_APP = 'Interactives Player'
export const DIAG_KINDS = ['load', 'error', 'script', 'shader', 'draw', 'asset', 'data']

export function cleanDiag(raw) {
	let kinds = ['load', 'error', 'script', 'shader', 'draw', 'asset', 'data'],
		tok = (v, max) => typeof v === 'string' && v.length <= max && /^[\w.$@<>-]+$/.test(v) ? v : undefined,
		num = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined,
		scrub = (v) => {
			let t = typeof v === 'string' ? v : ''
			t = t.replace(/[\u0000-\u001f\u007f]+/g, ' ')
				.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
				.replace(/(["'`])(?:(?!\1).){0,400}\1/g, '$1?$1')
				.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
				.replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<id>')
				.replace(/\d{4,}/g, 'N')
				.replace(/\s+/g, ' ')
				.trim()
			return t.length > 160 ? t.slice(0, 159) + '\u2026' : t
		}

	if (!raw || typeof raw !== 'object' || Array.isArray(raw) || kinds.indexOf(raw.kind) < 0) {
		return null
	}

	let out = {kind: raw.kind, version: tok(raw.version, 20) || ''},
		fp = tok(raw.fingerprint, 16),
		where = tok(raw.where, 30),
		ms = num(raw.ms, 3600000),
		artboards = num(raw.artboards, 100000),
		scripts = num(raw.scripts, 100000),
		layers = num(raw.layers, 10000000),
		status = num(raw.status, 999)

	if (fp) {
		out.fingerprint = fp
	}
	if (typeof raw.message === 'string' && raw.message) {
		out.message = scrub(raw.message)
	}
	if (where) {
		out.where = where
	}
	if (raw.level === 'error' || raw.level === 'warning') {
		out.level = raw.level
	}
	if (ms !== undefined) {
		out.ms = ms
	}
	if (artboards !== undefined) {
		out.artboards = artboards
	}
	if (scripts !== undefined) {
		out.scripts = scripts
	}
	if (layers !== undefined) {
		out.layers = layers
	}
	if (typeof raw.sandbox === 'boolean') {
		out.sandbox = raw.sandbox
	}
	if (status !== undefined) {
		out.status = status
	}

	return out
}

//The row for one diagnostic. Like learner records, featureID is the project's id (so the read uses the existing
//app + featureID + timestamp index) and feature is the kind. The project is whatever the page was made for.
export function diagRow(project, run, diag) {
	return ['Interactives Player', diag.kind, project, {project, run, diag}]
}

const learnerOf = (row) => {
	let name = row?.meta?.user?.username

	return typeof name === 'string' && name ? `u:${name}` : `r:${String(row?.meta?.run || row?._id || '')}`
}

const bump = (map, key, make) => {
	let hit = map.get(key)

	if (!hit) {
		hit = make()
		map.set(key, hit)
	}

	return hit
}

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10)

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n)

//Counts for one project from its ingest rows (newest first or any order). Only totals and distinct-learner counts
//come out. `rows` that are not records, or are for some other kind, are skipped
export const insights = (rows, opts = {}) => {
	let learners = new Set(),
		visits = new Set(),
		views = new Map(),
		clicks = new Map(),
		layers = new Map(),
		steps = new Map(),
		questions = new Map(),
		custom = new Map(),
		courses = new Map(),
		days = new Map(),
		counted = 0,
		first = null,
		last = null,
		clickTotal = 0,
		clickPositioned = 0,
		clickOnLayers = 0

	for (let row of rows) {
		let rec = cleanRecord({...row?.meta?.rec, kind: row?.feature})

		if (!rec) {
			continue
		}

		let who = learnerOf(row),
			at = typeof row.timestamp === 'number' ? row.timestamp : null

		counted++
		learners.add(who)
		visits.add(`${who}|${row?.meta?.run || ''}`)

		if (at !== null) {
			first = first === null ? at : Math.min(first, at)
			last = last === null ? at : Math.max(last, at)
			bump(days, dayOf(at), () => new Set()).add(who)
		}

		let course = row?.meta?.activity?.courseLabel

		if (typeof course === 'string' && course) {
			bump(courses, course.slice(0, 100), () => new Set()).add(who)
		}

		let ab = rec.artboard ? bump(views, rec.artboard, () => ({id: rec.artboard, name: '', views: 0, who: new Set()})) : null

		if (ab && rec.artboardName) {
			ab.name = rec.artboardName
		}

		if (rec.kind === 'view') {
			ab.views++
			ab.who.add(who)
		}
		else if (rec.kind === 'click') {
			let a = bump(clicks, rec.artboard, () => ({id: rec.artboard, name: '', clicks: 0, cells: new Map()}))

			a.name = rec.artboardName || a.name
			a.clicks++
			clickTotal++

			if (rec.x !== undefined) {
				clickPositioned++
				let key = `${Math.floor(rec.x / CELL)},${Math.floor(rec.y / CELL)}`

				a.cells.set(key, (a.cells.get(key) || 0) + 1)
			}

			if (rec.layer) {
				clickOnLayers++
				let l = bump(layers, `${rec.artboard}|${rec.layer}`, () => ({artboard: rec.artboard, layer: rec.layer, label: '', clicks: 0, who: new Set()}))

				l.label = rec.label || l.label
				l.clicks++
				l.who.add(who)
			}
		}
		else if (rec.kind === 'step') {
			let s = bump(steps, `${rec.artboard || ''}|${rec.step}`, () => ({artboard: rec.artboard || '', name: '', step: rec.step, steps: rec.steps, visits: 0, who: new Set()}))

			s.name = rec.artboardName || s.name
			s.steps = Math.max(s.steps, rec.steps)
			s.visits++
			s.who.add(who)
		}
		else if (rec.kind === 'answer') {
			let q = bump(questions, rec.question, () => ({question: rec.question, kind: '', checks: 0, correct: 0, who: new Set(), firstTry: new Set(), firstTryRight: new Set(), options: new Map(), attempts: 0}))

			q.kind = rec.questionKind || q.kind
			q.checks++
			q.correct += rec.correct ? 1 : 0
			q.who.add(who)

			if (rec.attempt === 1) {
				q.firstTry.add(who)

				if (rec.correct) {
					q.firstTryRight.add(who)
				}
			}

			for (let o of rec.options || []) {
				q.options.set(o, (q.options.get(o) || 0) + 1)
			}
		}
		else if (rec.kind === 'custom') {
			let c = bump(custom, rec.label, () => ({name: rec.label, count: 0, who: new Set(), values: new Map()}))

			c.count++
			c.who.add(who)

			if (rec.value !== undefined) {
				let v = String(rec.value)

				c.values.set(v, (c.values.get(v) || 0) + 1)
			}
		}
	}

	return {
		records: counted,
		learners: learners.size,
		visits: visits.size,
		first,
		last,
		truncated: !!opts.truncated,
		artboards: [...views.values()].filter((a) => a.views).map((a) => ({id: a.id, name: a.name, views: a.views, learners: a.who.size})),
		clicks: {
			total: clickTotal,
			positioned: clickPositioned,
			onLayers: clickOnLayers,
			cell: CELL,
			artboards: [...clicks.values()].map((a) => ({
				id: a.id,
				name: a.name,
				clicks: a.clicks,
				cells: [...a.cells.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3000).map(([key, n]) => ({x: Number(key.split(',')[0]) * CELL, y: Number(key.split(',')[1]) * CELL, n}))
			})),
			layers: [...layers.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 200).map((l) => ({artboard: l.artboard, layer: l.layer, label: l.label, clicks: l.clicks, learners: l.who.size}))
		},
		steps: [...steps.values()].map((s) => ({artboard: s.artboard, name: s.name, step: s.step, steps: s.steps, visits: s.visits, learners: s.who.size})),
		questions: [...questions.values()].map((q) => ({
			question: q.question,
			kind: q.kind,
			checks: q.checks,
			correct: q.correct,
			learners: q.who.size,
			firstTry: q.firstTry.size,
			firstTryRight: q.firstTryRight.size,
			options: top(q.options, 30).map(([id, n]) => ({id, n}))
		})),
		custom: [...custom.values()].sort((a, b) => b.count - a.count).slice(0, 100).map((c) => ({name: c.name, count: c.count, learners: c.who.size, values: top(c.values, 20).map(([value, n]) => ({value, n}))})),
		courses: [...courses.entries()].map(([course, who]) => ({course, learners: who.size})).sort((a, b) => b.learners - a.learners).slice(0, 50),
		daily: [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, who]) => ({day, learners: who.size}))
	}
}

//What the learner page tells a project about the course and the person playing, for its built-in `context` data source. It
//lives here with the other things the learner page writes out into its script, and none of it is a record.
//
//Only what a project might greet or branch on goes across: the course (label, title, system) and the learner's first name,
//the name to greet them by and whether they are a student. No username, email, id or profile link ever leaves the page, so
//a project, its scripts and anything they record cannot hold them either. None of this goes into analytics or diagnostics.

//This one is written out in the learner page too (contextFrom.toString() goes into its script), so it can't lean on anything
//outside itself. It takes the suite session's user and activity (fetchActivity) and gives back the context, or null when
//nobody is signed in
export function contextFrom(user, activity) {
	let text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

	if (!user || typeof user !== 'object' || !user.username) {
		return null
	}

	let act = activity && typeof activity === 'object' ? activity : {},
		first = text(user.firstName, 100),
		full = text(user.fullName, 200),
		label = text(act.courseLabel, 200)

	return {
		courseLabel: label,
		courseCode: text(act.courseCode, 100) || label.split('_')[0],
		courseName: text(act.courseTitle, 200),
		lmsUrl: text(act.lmsURL, 200),
		lmsName: text(act.lmsName, 200),
		firstName: first,
		displayName: full || [first, text(user.lastName, 100)].filter(Boolean).join(' '),
		signedIn: true,
		isStudent: user.isStudent === true,
		isStaff: user.isStudent !== true
	}
}
