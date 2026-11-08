//The player files shared/marking-kit.mjs is built from, and a hash of them. The bundle's first line carries the hash it was built
//from, and test/server-marking.test.ts fails when the player has moved on without the bundle being made again (npm run build:marking).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

export const markingSources = ['../mcp/marking.ts', ...['question', 'server-marking', 'regex-safe', 'regex-methods', 'regex-linear', 'us-spelling'].map((f) => `../../interactives-player/src/${f}.ts`)]

export const sourcesHash = () => {
	let hash = createHash('sha256')

	for (let f of markingSources) {
		hash.update(readFileSync(here(f)))
	}

	return hash.digest('hex').slice(0, 20)
}
