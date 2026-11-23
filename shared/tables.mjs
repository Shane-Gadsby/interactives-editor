//Shared tables: rows the people using an app add, change and take away (a sign-up sheet, a board, a register, a booking list),
//with a rule for each action and limits, all checked here on the server. The player side is readTable/writeTable in player.ts.
//Pure: reading a project's declaration out of the page it was shared as, cleaning a row, deciding what a person may do, and
//what they are shown. index.js does the mongo and the sessions.

export const LIMITS = {sources: 20, fields: 30, text: 500, maxRows: 2000}
export const DEFAULTS = {add: 'signed-in', change: 'own', remove: 'own', perPerson: 0, perSlot: 0, maxRows: 500, refresh: 10}

const whole = (v, def, min, max) => {
	let n = typeof v === 'number' ? v : Number(v)

	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def
}
const oneOf = (v, list, def) => (list.includes(v) ? v : def)

//What the owner declared for a table when it was shared: its fields, who may add, change and remove, and the limits
export const cleanDeclaration = (raw) => {
	let o = raw && typeof raw === 'object' ? raw : {},
		fields = (Array.isArray(o.fields) ? o.fields : []).filter((f) => typeof f === 'string' && /^[A-Za-z_][\w]{0,39}$/.test(f)).slice(0, LIMITS.fields)

	return {
		fields,
		add: oneOf(o.add, ['signed-in', 'staff'], DEFAULTS.add),
		change: oneOf(o.change, ['own', 'staff', 'signed-in'], DEFAULTS.change),
		remove: oneOf(o.remove, ['own', 'staff'], DEFAULTS.remove),
		perPerson: whole(o.perPerson, DEFAULTS.perPerson, 0, 1000),
		slotField: typeof o.slotField === 'string' && fields.includes(o.slotField) ? o.slotField : '',
		perSlot: whole(o.perSlot, DEFAULTS.perSlot, 0, 1000),
		maxRows: whole(o.maxRows, DEFAULTS.maxRows, 1, LIMITS.maxRows),
		showNames: o.showNames === true
	}
}

//The shared tables a shared page declares, by data source id. Empty when there are none
export const declaredTables = (html) => {
	if (!html.includes('"source":"table"')) {
		return {}
	}

	let open = html.indexOf('id="ix-project">'),
		start = open + 'id="ix-project">'.length,
		end = open < 0 ? -1 : html.indexOf('</script>', start),
		project

	if (end < 0) {
		return {}
	}
	try {
		project = JSON.parse(html.slice(start, end))
	}
	catch {
		return {}
	}

	let out = {}

	for (let ds of Array.isArray(project.dataSources) ? project.dataSources : []) {
		if (ds && ds.source === 'table' && typeof ds.id === 'string' && /^[\w-]{1,64}$/.test(ds.id) && Object.keys(out).length < LIMITS.sources) {
			out[ds.id] = {...cleanDeclaration(ds.table), name: String(ds.name || '').slice(0, 80)}
		}
	}
	return out
}

//A row as it is kept: only the declared fields, text cut short, numbers finite, true and false
export const cleanValues = (decl, raw) => {
	let o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {},
		out = {}

	for (let f of decl.fields) {
		let v = o[f]

		if (typeof v === 'string') out[f] = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, LIMITS.text)
		else if (typeof v === 'number' && Number.isFinite(v)) out[f] = v
		else if (typeof v === 'boolean') out[f] = v
	}
	return out
}

//Whether this person may do this to this row (none for adding). staff: the session says not a student, or they own or help make the project
export const mayDo = (decl, op, person, row) => {
	let rule = decl[op === 'add' ? 'add' : op === 'change' ? 'change' : 'remove']

	if (rule === 'staff') return !!person.staff
	if (rule === 'own') return !!person.staff || (!!row && row.username === person.username)
	return true
}

//Whether an add (or a change that moves a row into another slot) keeps within the limits: the table's size, one person's rows,
//and a slot's rows (so many per time slot). The problem's name when it would not
export const overLimit = (decl, rows, person, values, movingID = null) => {
	let others = rows.filter((r) => String(r._id) !== String(movingID))

	if (!movingID && others.length >= decl.maxRows) return 'full'
	if (!movingID && decl.perPerson > 0 && others.filter((r) => r.username === person.username).length >= decl.perPerson) return 'per-person'
	if (decl.slotField && decl.perSlot > 0 && values[decl.slotField] !== undefined && others.filter((r) => r.values?.[decl.slotField] === values[decl.slotField]).length >= decl.perSlot) return 'slot-full'
	return ''
}

//What this person is shown: every row (oldest first), each saying whether it is theirs, the names only when the owner said so,
//and the limits, so an app can say how many places are left
export const valueFor = (decl, rows, person, problem = '') => ({
	rows: rows.map((r) => ({id: String(r._id), ...r.values, mine: r.username === person.username, ...(decl.showNames ? {by: r.name || ''} : {}), at: r.at instanceof Date ? r.at.toISOString() : r.at})),
	count: rows.length,
	max: decl.maxRows,
	mine: rows.filter((r) => r.username === person.username).length,
	perPerson: decl.perPerson,
	ready: true,
	problem
})
