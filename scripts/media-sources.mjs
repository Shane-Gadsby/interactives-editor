//The player files shared/media-bridge.mjs is built from, and a hash of them. The bundle's first line carries the hash it was built
//from, and test/server-media.test.ts fails when the player has moved on without the bundle being made again (npm run build:media).
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

//Everything the bridge can reach: the entry, and every file in the player's media folder except the player-side ones (they are not in the bundle)
const PLAYER_ONLY = new Set(['host.ts', 'fake.ts', 'runtime.ts', 'playback.ts', 'index.ts'])

export const mediaSources = () => ['../mcp/media.ts', ...readdirSync(here('../../interactives-player/src/media')).filter((f) => f.endsWith('.ts') && !PLAYER_ONLY.has(f)).sort().map((f) => `../../interactives-player/src/media/${f}`)]

export const sourcesHash = () => {
	let hash = createHash('sha256')

	for (let f of mediaSources()) {
		hash.update(readFileSync(here(f)))
	}

	return hash.digest('hex').slice(0, 20)
}
