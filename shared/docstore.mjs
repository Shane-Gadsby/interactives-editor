//Project documents bigger than one mongo record. A record is capped at 16 MB, and a project that grew past it used to
//fail every save with a 409 that said someone else had saved. Small documents stay in the row's own `doc` field exactly
//as before (no migration, nothing reads differently); a big one goes into `doc-chunks` as numbered parts and the row
//only keeps {key, parts, length} in `docChunks`.
//
//Parts are keyed by something that changes with every write (the project's rev, a revision's own id), so the parts
//the row points at are never touched while a new set goes in. The caller writes the new parts, moves the row over,
//then drops the old parts, and drops the new ones instead if the row didn't move.
//
//Lookups are by _id only (`<key>:<n>`), so the collection needs no index of its own. Dropping a project's parts
//filters on `project`, which is a scan, but only of this collection, which only ever holds the rare huge documents.

//Bytes, not characters: mongo counts the UTF-8 encoding. Leaves a few MB of the 16 for the rest of the row
export const INLINE_MAX = Number(process.env.INTERACTIVES_DOC_INLINE_MAX) || 12 * 1024 * 1024

//Characters per part. At most 3 bytes a character in UTF-8 (a pair of surrogates is 4 bytes for 2), so 4M characters
//stays under 12 MB whatever the text is
export const PART_CHARS = Number(process.env.INTERACTIVES_DOC_PART_CHARS) || 4 * 1024 * 1024

export const byteLength = (s) => Buffer.byteLength(s, 'utf8')

//Cut on character boundaries, never through a surrogate pair
export function split(str, size = PART_CHARS) {
	let parts = []
	for (let i = 0; i < str.length;) {
		let end = Math.min(str.length, i + size),
			code = str.charCodeAt(end - 1)
		//A high surrogate last: leave it for the next part, or take its pair too when it's all this part has
		if (end < str.length && code >= 0xd800 && code <= 0xdbff) end += end - 1 > i ? -1 : 1
		parts.push(str.slice(i, end))
		i = end
	}
	return parts
}

export class MissingPartsError extends Error {
	name = 'MissingPartsError'
}

export function docStore(chunks) {
	return {
		//The fields to $set on the row for this document. Writes parts first when it's too big for the row
		async put(project, key, str) {
			if (byteLength(str) <= INLINE_MAX) {
				return {doc: str, docChunks: null}
			}
			let parts = split(str)
			//A half-written set from an earlier attempt under the same key would make insertOne trip on its _id
			await chunks.deleteMany({key})
			for (let [n, data] of parts.entries()) {
				await chunks.insertOne({_id: `${key}:${n}`, key, project, n, data})
			}
			return {doc: null, docChunks: {key, parts: parts.length, length: str.length}}
		},

		//The document string, from the row or from its parts
		async get(row) {
			if (typeof row?.doc === 'string') {
				return row.doc
			}
			let ref = row?.docChunks
			if (!ref?.key || !ref.parts) {
				throw new MissingPartsError('This project has no saved document')
			}
			let ids = Array.from({length: ref.parts}, (_, n) => `${ref.key}:${n}`),
				found = await chunks.find({_id: {$in: ids}}).toArray(),
				byN = new Map(found.map((c) => [c.n, c.data])),
				str = ids.map((_, n) => byN.get(n)).join('')

			if (byN.size !== ref.parts || str.length !== ref.length) {
				throw new MissingPartsError(`Part of this project's saved document is missing (${byN.size} of ${ref.parts} parts)`)
			}
			return str
		},

		async parse(row) {
			return JSON.parse(await this.get(row))
		},

		//Throw away a set of parts (the row's old set once it has moved on, or a new set it never took)
		async drop(ref) {
			if (ref?.key) await chunks.deleteMany({key: ref.key})
		},

		//Everything a project ever split, its revisions' parts included
		async dropProject(project) {
			await chunks.deleteMany({project})
		}
	}
}
