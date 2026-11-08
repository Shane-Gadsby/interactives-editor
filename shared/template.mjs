//Templates, shared by the server (index.js) and the browser (src/lib/templates.ts).
//
//A template is a snapshot of a whole project, saved by its owner with a title, a description and a checklist of the
//things whoever uses it should change. "Use template" copies the snapshot into a new project. The copy remembers, as a
//hash per artboard, layer, timeline, graph node and variable (its baseline), what the template held at that moment,
//so a later "Update from template" can tell a part nobody touched from one that was changed. This file is the pure
//part: cleaning what the browser sends, the hashes, who may use a template. No mongo, no fs, nothing from the browser.

import {hashOf} from './library.mjs'

export const MAX_CHECKLIST = 40
export const MAX_TEXT = 200
export const MAX_DESCRIPTION = 1000

//A plain single line: control characters out, spaces collapsed, capped. Empty comes back as ''
export const cleanLine = (value, max = MAX_TEXT) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

//The description may run to a few lines
export const cleanDescription = (value) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_DESCRIPTION) : ''

const ID = /^[\w-]{1,64}$/

//The checklist the author wrote: each item has some text and may point at an artboard and a layer on it. Items without
//text are dropped. `makeId` fills in the id of a new item
export const cleanChecklist = (list, makeId) => {
	let out = []

	for (let raw of Array.isArray(list) ? list : []) {
		let text = cleanLine(raw?.text)

		if (!text || out.length >= MAX_CHECKLIST) continue

		let item = {id: typeof raw.id === 'string' && ID.test(raw.id) && !out.some((i) => i.id === raw.id) ? raw.id : makeId(), text}

		if (typeof raw.artboardId === 'string' && ID.test(raw.artboardId)) item.artboardId = raw.artboardId
		if (typeof raw.nodeId === 'string' && ID.test(raw.nodeId)) item.nodeId = raw.nodeId

		out.push(item)
	}

	return out
}

//Who may use a template: its owner, or anybody if it is shared with everyone. With no session at all (dev without
//si-manager) there is nobody to filter on, so it is open until the box enforces sessions
export const mayUseTemplate = (tpl, me, enforcing) => {
	if (!me?.username) return !enforcing
	if (!tpl?.owner?.username) return true

	return tpl.owner.username === me.username || !!tpl.shared?.everyone
}

//The mongo filter for the same rule, for the list route
export const accessFilter = (me, enforcing) => {
	if (!me?.username) return enforcing ? {_id: null} : {}

	return {$or: [{'owner.username': me.username}, {'shared.everyone': true}]}
}

//Where a template's own project is kept apart from the project that made it: the copy keeps layer ids (so the checklist
//and the baseline still point at things) but nothing about where it came from or who it was shared with
export const cleanProject = (project) => {
	let copy = JSON.parse(JSON.stringify(project))

	delete copy.template

	return copy
}

//The brand kits a project has added, as {id, name}. A template made from it is a pre-branded one, and says so on its card
export const brandKitsOf = (project) => (Array.isArray(project?.libraries) ? project.libraries : [])
	.filter((l) => l && l.brand && typeof l.id === 'string')
	.map((l) => ({id: l.id, name: cleanLine(l.name, 120) || 'Brand kit'}))
	.slice(0, 5)

//Hash of what a template holds, for "did saving it again change anything". The project's own identity doesn't count
export const contentHash = (project) => {
	let {id, name, created, updated, template, ...rest} = project

	return hashOf(rest)
}

//Where an artboard sits and which design file it came from is not part of what it holds
const ARTBOARD_LOCAL = ['canvasX', 'canvasY', 'canvasHidden', 'guides', 'source', 'children', 'timelines', 'logic', 'notes']

export const artboardProps = (ab) => Object.fromEntries(Object.entries(ab).filter(([k]) => !ARTBOARD_LOCAL.includes(k)))
export const nodeProps = (node) => {
	let {children, ...rest} = node

	return rest
}

//Every part of a project that "Update from template" looks after: [key, value] pairs, the value being what gets hashed
//(and, for the update itself, what gets copied). a: artboard (its own settings), n: layer without its children,
//t: timeline, g: graph node, e: graph edge, v: variable
export function* partsOf(project) {
	for (let ab of project.artboards || []) {
		yield ['a:' + ab.id, artboardProps(ab)]

		let walk = function* (list) {
			for (let n of list || []) {
				yield ['n:' + n.id, nodeProps(n)]

				if (Array.isArray(n.children)) yield* walk(n.children)
			}
		}

		yield* walk(ab.children)

		for (let t of ab.timelines || []) yield ['t:' + t.id, t]
		for (let g of ab.logic?.nodes || []) yield ['g:' + g.id, g]
		for (let e of ab.logic?.edges || []) yield ['e:' + e.id, e]
	}

	for (let v of project.variables || []) yield ['v:' + v.id, v]
}

//The baseline a new copy of a template starts with: key -> hash of every part
export const baselineOf = (project) => {
	let base = {}

	for (let [key, value] of partsOf(project)) base[key] = hashOf(value)

	return base
}

export const partHash = (value) => hashOf(value)

//What saving a template does to the stored one: nothing new when the content hasn't changed, otherwise the next
//version and a short history entry (the newest 30 are kept)
export const planSave = (existing, hash, {note, by, now}) => {
	if (existing && existing.hash === hash) return {unchanged: true, version: existing.version, hash}

	let version = (existing?.version || 0) + 1,
		entry = {version, created: now, by: by || null, note: typeof note === 'string' ? note.slice(0, 500) : ''}

	return {unchanged: false, version, hash, history: [entry, ...(existing?.history || [])].slice(0, 30)}
}
