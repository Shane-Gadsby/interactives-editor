//Responses an app collects (the Send a response node): one row per response, filed under the person (by name, or by a
//code that is the same for them every time but says nothing about who they are), the time and the setup. Pure: cleaning
//what a browser sent, and turning rows into a table. index.js does the mongo and the sessions.
import crypto from 'node:crypto'

export const LIMITS = {bytes: 16384, depth: 4, string: 2000, keys: 60, items: 500, perHour: 300}

//What came from the browser, kept to plain JSON of a sane size: strings cut, numbers finite, objects and lists only so deep and so long.
//Null when there is nothing left, or it is too big to keep
export const cleanValues = (raw) => {
	let clean = (v, depth) => {
		if (v === null || typeof v === 'boolean') return v
		if (typeof v === 'number') return Number.isFinite(v) ? v : null
		if (typeof v === 'string') return v.slice(0, LIMITS.string)
		if (depth >= LIMITS.depth) return null
		if (Array.isArray(v)) return v.slice(0, LIMITS.items).map((x) => clean(x, depth + 1))
		if (v && typeof v === 'object') {
			let out = {}

			for (let k of Object.keys(v).slice(0, LIMITS.keys)) {
				if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
				out[String(k).slice(0, 80)] = clean(v[k], depth + 1)
			}
			return out
		}
		return null
	}
	let out = clean(raw, 0)

	if (out === null || out === undefined) return null
	return JSON.stringify(out).length > LIMITS.bytes ? null : out
}

//A set's name: what the node calls this kind of response (card-sort, survey), so one app can collect two kinds
export const cleanSet = (v) => (typeof v === 'string' ? v.trim().replace(/[^\w .-]+/g, '').slice(0, 60) : '') || 'responses'

//The same code for the same person in the same project every time, and nothing that leads back to them
export const personCode = (projectID, username) => crypto.createHash('sha256').update(`${projectID}|${username}`).digest('hex').slice(0, 10)

//The suite groups the shared page says it asks about (Project settings > Groups it can check), so the who route only ever says
//whether someone is in one of those, never what else they are in
export const declaredGroups = (html) => {
	let m = /"askGroups"\s*:\s*(\[[^\]]*\])/.exec(html)

	try {
		return m ? JSON.parse(m[1]).filter((g) => typeof g === 'string' && /^[\w-]{1,40}$/.test(g)).slice(0, 10) : []
	}
	catch {
		return []
	}
}

//Whether the shared page says responses carry names (Project settings > Responses > With names)
export const declaredNamed = (html) => /"responses"\s*:\s*\{[^}]*"named"\s*:\s*true/.test(html)

const flat = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

//Rows for a table. A response whose values hold a list of records (a card sort's placements) can come out as one row per record
//of that list, the response's other values repeated on each, which is the shape analysis tools take
export const tableOf = (docs, perItem = false) => {
	let rows = []

	for (let d of docs) {
		let base = {set: d.set || 'responses', at: d.at instanceof Date ? d.at.toISOString() : String(d.at || ''), person: d.username || d.person || '', name: d.name || '', course: d.course || '', setup: d.setup || ''},
			v = d.values,
			list = perItem && v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).find(([, x]) => Array.isArray(x) && x.length && x.every((i) => i && typeof i === 'object' && !Array.isArray(i))) : null

		if (perItem && Array.isArray(v) && v.length && v.every((i) => i && typeof i === 'object' && !Array.isArray(i))) list = ['item', v]
		if (list) {
			let [key, items] = list,
				rest = Array.isArray(v) ? {} : Object.fromEntries(Object.entries(v).filter(([k]) => k !== key))

			items.forEach((item, i) => rows.push({...base, ...rest, [`${key} #`]: i + 1, ...Object.fromEntries(Object.entries(item).map(([k, x]) => [`${key}.${k}`, x]))}))
		}
		else if (v && typeof v === 'object' && !Array.isArray(v)) rows.push({...base, ...v})
		else rows.push({...base, value: v})
	}
	return rows
}

const cell = (v) => {
	let s = flat(v)

	//a cell a spreadsheet would take for a formula is written as text
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csvOf = (rows) => {
	let cols = []

	for (let r of rows) for (let k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
	return [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}
