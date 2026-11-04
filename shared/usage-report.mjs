//The pure part of the usage and errors view for the product's own people: the editor's own analytics rows ('Interactives
//Editor', see src/lib/analytics.ts) and the published projects' diagnostics ('Interactives Player', the learner page) turned
//into the tables the page shows. No mongo, no express; index.js reads the rows and passes them in. Only counts and the
//scrubbed fault text leave here: no names, no content.
//
//Row shapes (all in lti-analytics.ingest, after suite-libs/ingest-lean.js):
//  editor  { app, feature: area, featureID: action, meta: { sid, build, v, user: { username }, ev: { thing, project, n, ms, detail, sum, t0, t1 } } }
//  editor  fault rows: feature 'error', featureID the kind, meta.err { fp, kind, cls, msg, frame, where, detail, project, at }
//  player  { app, feature: kind, featureID: project id, meta: { project, run, diag: { kind, version, fingerprint, message, where, ms, ... } } }

export const EDITOR_APP = 'Interactives Editor'
export const PLAYER_APP = 'Interactives Player'
export const MAX_ROWS = 200000

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v, max = 160) => (typeof v === 'string' ? v.slice(0, max) : '')

const who = (row) => {
	let name = row?.meta?.user?.username
	return typeof name === 'string' && name ? `u:${name}` : `s:${str(row?.meta?.sid || row?.meta?.run || row?._id, 40)}`
}

const bump = (map, key, make) => {
	let hit = map.get(key)
	if (!hit) {
		hit = make()
		map.set(key, hit)
	}
	return hit
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0)

//Rows grouped by feature, action and thing
const usage = (rows, area, pick) => {
	let map = new Map()
	for (let row of rows) {
		if (row.feature !== area) continue
		let ev = row.meta?.ev || {}
		let key = pick(row, ev)
		if (key === null) continue
		let hit = bump(map, key, () => ({key, uses: 0, ms: 0, users: new Set(), rows: 0, last: 0}))
		hit.uses += num(ev.n) || 1
		hit.ms += num(ev.ms)
		hit.users.add(who(row))
		hit.rows++
		hit.last = Math.max(hit.last, num(row.timestamp))
	}
	return [...map.values()].sort((a, b) => b.uses - a.uses).map((h) => ({key: h.key, uses: h.uses, ms: Math.round(h.ms), users: h.users.size, last: h.last}))
}

export function editorReport(rows) {
	let visits = new Set(),
		users = new Set(),
		activeMs = 0,
		builds = new Map(),
		browsers = new Map(),
		firstSeen = 0,
		lastSeen = 0

	//The product funnel: people (or visits, with no signed-in user) who got as far as each step
	let steps = [
		['Opened the editor', () => true],
		['Opened a project', (r) => r.feature === 'project' && r.featureID === 'open'],
		['Added a layer', (r) => r.feature === 'node' && r.featureID === 'add'],
		['Changed a property', (r) => r.feature === 'inspector' && r.featureID === 'change'],
		['Opened the preview', (r) => r.feature === 'preview' && r.featureID === 'open'],
		['Exported or shared', (r) => (r.feature === 'export' && r.featureID === 'download') || (r.feature === 'feature' && r.featureID === 'share-publish')],
	].map(([label, test]) => ({label, test, people: new Set()}))

	let faults = new Map(),
		counted = new Map()

	for (let row of rows) {
		let ev = row.meta?.ev || {},
			who_ = who(row)
		visits.add(str(row.meta?.sid, 40) || who_)
		users.add(who_)
		firstSeen = firstSeen ? Math.min(firstSeen, num(row.timestamp)) : num(row.timestamp)
		lastSeen = Math.max(lastSeen, num(row.timestamp))
		if (row.meta?.build) bump(builds, str(row.meta.build, 20), () => ({n: 0})).n += 1
		for (let step of steps) {
			if (step.test(row)) step.people.add(who_)
		}

		if (row.feature === 'session' && row.featureID === 'active') {
			activeMs += num(ev.ms)
		}
		if (row.feature === 'session' && row.featureID === 'start' && ev.detail?.browser) {
			bump(browsers, `${str(ev.detail.browser, 20)} ${num(ev.detail.major) || ''}`.trim(), () => ({n: 0})).n += 1
		}

		//A fault the editor sent in full
		let err = row.meta?.err
		if (row.feature === 'error' && err && typeof err === 'object') {
			let f = bump(faults, str(err.fp, 20), () => ({fp: str(err.fp, 20), kind: str(err.kind, 30), where: str(err.where, 60), cls: str(err.cls, 40), msg: str(err.msg), frame: str(err.frame, 80), reports: 0, users: new Set(), visits: new Set(), builds: new Set(), projects: new Set(), first: 0, last: 0, status: null, via: ''}))
			f.reports++
			f.users.add(who_)
			f.visits.add(str(row.meta?.sid, 40) || who_)
			if (row.meta?.build) f.builds.add(str(row.meta.build, 20))
			if (err.project) f.projects.add(str(err.project, 60))
			if (err.detail?.status) f.status = num(err.detail.status)
			if (err.via) f.via = str(err.via, 20)
			f.first = f.first ? Math.min(f.first, num(row.timestamp)) : num(row.timestamp)
			f.last = Math.max(f.last, num(row.timestamp))
		}
		//The count of every time it happened, including those held back from being sent in full
		else if (row.feature === 'error' && ev.detail?.fp) {
			bump(counted, str(ev.detail.fp, 20), () => ({n: 0})).n += num(ev.n) || 1
		}
	}

	let faultList = [...faults.values()]
		.map((f) => ({fp: f.fp, kind: f.kind, where: f.where, cls: f.cls, msg: f.msg, frame: f.frame, status: f.status, via: f.via, reports: f.reports, count: Math.max(f.reports, counted.get(f.fp)?.n || 0), users: f.users.size, visits: f.visits.size, builds: [...f.builds].slice(0, 5), projects: f.projects.size, first: f.first, last: f.last}))
		.sort((a, b) => b.last - a.last)

	let toolsUse = usage(rows, 'tool', (r) => (r.featureID === 'use' ? str(r.meta?.ev?.thing, 40) || 'unknown' : null)),
		toolsTime = new Map(usage(rows, 'tool', (r) => (r.featureID === 'time' ? str(r.meta?.ev?.thing, 40) || 'unknown' : null)).map((t) => [t.key, t])),
		panelsOpen = usage(rows, 'panel', (r) => (r.featureID === 'open' ? str(r.meta?.ev?.thing, 40) || 'unknown' : null)),
		panelsTime = new Map(usage(rows, 'panel', (r) => (r.featureID === 'time' ? str(r.meta?.ev?.thing, 40) || 'unknown' : null)).map((t) => [t.key, t]))

	let imports = new Map()
	for (let row of rows) {
		if (row.feature !== 'import' || (row.featureID !== 'ok' && row.featureID !== 'failed')) continue
		let ev = row.meta?.ev || {},
			format = str(ev.thing, 30) || 'unknown',
			hit = bump(imports, format, () => ({format, ok: 0, failed: 0, kb: 0, users: new Set()}))
		hit[row.featureID] += num(ev.n) || 1
		hit.kb += num(ev.sum?.kb)
		hit.users.add(who(row))
	}

	let help = usage(rows, 'help', (r) => (r.featureID === 'topic' ? str(r.meta?.ev?.thing, 40) || 'unknown' : null)),
		searches = rows.filter((r) => r.feature === 'help' && r.featureID === 'search'),
		searched = searches.reduce((n, r) => n + (num(r.meta?.ev?.n) || 1), 0),
		notFound = searches.filter((r) => r.meta?.ev?.detail?.found === false).reduce((n, r) => n + (num(r.meta?.ev?.n) || 1), 0)

	let loads = rows.filter((r) => r.feature === 'preview' && r.featureID === 'loaded'),
		api = usage(rows, 'api', (r) => (r.featureID === 'call' ? `${str(r.meta?.ev?.detail?.method, 8)} ${str(r.meta?.ev?.thing, 60)}` : r.featureID === 'rejected' ? `${str(r.meta?.ev?.detail?.method, 8)} ${str(r.meta?.ev?.thing, 60)} (${num(r.meta?.ev?.detail?.status)})` : null))

	return {
		rows: rows.length,
		visits: visits.size,
		users: users.size,
		activeMs: Math.round(activeMs),
		firstSeen,
		lastSeen,
		builds: [...builds.entries()].map(([build, v]) => ({build, rows: v.n})).sort((a, b) => b.rows - a.rows).slice(0, 8),
		browsers: [...browsers.entries()].map(([browser, v]) => ({browser, visits: v.n})).sort((a, b) => b.visits - a.visits).slice(0, 8),
		funnel: steps.map((s) => ({label: s.label, people: s.people.size})),
		features: usage(rows, 'feature', (r) => `${str(r.featureID, 50)}${r.meta?.ev?.thing ? ` / ${str(r.meta.ev.thing, 30)}` : ''}`).slice(0, 60),
		inspector: usage(rows, 'inspector', (r) => (r.featureID === 'change' ? str(r.meta?.ev?.thing, 40) || 'unknown' : null)).slice(0, 40),
		nodes: usage(rows, 'node', (r) => (r.featureID === 'add' ? str(r.meta?.ev?.thing, 30) || 'unknown' : null)),
		doc: usage(rows, 'doc', (r) => `${str(r.featureID, 40)}${r.meta?.ev?.thing ? ` / ${str(r.meta.ev.thing, 20)}` : ''}`).slice(0, 30),
		history: usage(rows, 'history', (r) => str(r.featureID, 20)),
		tools: toolsUse.map((t) => ({tool: t.key, uses: t.uses, users: t.users, ms: toolsTime.get(t.key)?.ms || 0})),
		panels: panelsOpen.map((t) => ({panel: t.key, opens: t.uses, users: t.users, ms: panelsTime.get(t.key)?.ms || 0})),
		imports: [...imports.values()].map((i) => ({format: i.format, ok: i.ok, failed: i.failed, kb: i.kb, users: i.users.size})).sort((a, b) => b.ok + b.failed - (a.ok + a.failed)),
		exports: usage(rows, 'export', (r) => (r.featureID === 'download' ? str(r.meta?.ev?.thing, 20) || 'unknown' : null)),
		help: {topics: help.slice(0, 30), searches: searched, notFound},
		preview: {opens: usage(rows, 'preview', (r) => (r.featureID === 'open' ? 'open' : null)), loads: loads.length, avgLoadMs: loads.length ? Math.round(loads.reduce((n, r) => n + num(r.meta?.ev?.ms), 0) / loads.reduce((n, r) => n + (num(r.meta?.ev?.n) || 1), 0)) : 0},
		live: usage(rows, 'live', (r) => `${str(r.featureID, 20)}${r.meta?.ev?.thing ? ` / ${str(r.meta.ev.thing, 20)}` : ''}`),
		api: api.slice(0, 40),
		faults: faultList.slice(0, 100),
		faultCount: faultList.length,
	}
}

export function playerReport(rows) {
	let loads = [],
		faults = new Map(),
		versions = new Map(),
		projects = new Map(),
		learners = new Set(),
		runs = new Set(),
		firstSeen = 0,
		lastSeen = 0,
		byKind = new Map()

	for (let row of rows) {
		let diag = row.meta?.diag
		if (!diag || typeof diag !== 'object') continue
		let kind = str(row.feature || diag.kind, 20)
		learners.add(who(row))
		runs.add(str(row.meta?.run, 40) || who(row))
		firstSeen = firstSeen ? Math.min(firstSeen, num(row.timestamp)) : num(row.timestamp)
		lastSeen = Math.max(lastSeen, num(row.timestamp))
		bump(versions, str(diag.version, 20) || 'unknown', () => ({n: 0})).n += 1
		bump(byKind, kind, () => ({n: 0})).n += 1
		let project = str(row.featureID, 60)
		let p = bump(projects, project, () => ({project, loads: 0, faults: 0}))
		if (kind === 'load') {
			loads.push(num(diag.ms))
			p.loads++
			continue
		}
		p.faults++
		let key = `${kind}|${str(diag.fingerprint, 20)}|${str(diag.where, 30)}`,
			f = bump(faults, key, () => ({fp: str(diag.fingerprint, 20), kind, where: str(diag.where, 30), msg: str(diag.message), level: str(diag.level, 10), status: num(diag.status) || null, count: 0, learners: new Set(), runs: new Set(), versions: new Set(), projects: new Set(), first: 0, last: 0}))
		f.count++
		f.learners.add(who(row))
		f.runs.add(str(row.meta?.run, 40) || who(row))
		f.versions.add(str(diag.version, 20))
		f.projects.add(project)
		f.first = f.first ? Math.min(f.first, num(row.timestamp)) : num(row.timestamp)
		f.last = Math.max(f.last, num(row.timestamp))
	}

	loads.sort((a, b) => a - b)

	return {
		rows: rows.length,
		pageLoads: runs.size,
		learners: learners.size,
		firstSeen,
		lastSeen,
		loads: {n: loads.length, p50: percentile(loads, 50), p90: percentile(loads, 90), p99: percentile(loads, 99)},
		byKind: [...byKind.entries()].map(([kind, v]) => ({kind, rows: v.n})).sort((a, b) => b.rows - a.rows),
		versions: [...versions.entries()].map(([version, v]) => ({version, rows: v.n})).sort((a, b) => b.rows - a.rows).slice(0, 8),
		faults: [...faults.values()].map((f) => ({fp: f.fp, kind: f.kind, where: f.where, msg: f.msg, level: f.level, status: f.status, count: f.count, learners: f.learners.size, runs: f.runs.size, versions: [...f.versions].slice(0, 5), projects: f.projects.size, first: f.first, last: f.last})).sort((a, b) => b.last - a.last).slice(0, 100),
		projects: [...projects.values()].sort((a, b) => b.faults - a.faults || b.loads - a.loads).slice(0, 15),
	}
}

export function usageReport(editorRows, playerRows, days) {
	return {days, generatedAt: Date.now(), editor: editorReport(editorRows), player: playerReport(playerRows), truncated: editorRows.length >= MAX_ROWS || playerRows.length >= MAX_ROWS}
}
