//Upgrades the shipped examples to the native features, tidies them and adds their author notes (see scripts/examples-upgrade.ts for
//what it does to each one). Safe to run again. Usage:
//  node scripts/upgrade-examples.mjs [key ...]
//It loads the TypeScript through vite (so the editor's own tidy helpers and the player source resolve like they do in the app).
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'

let root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
	server = await createServer({root, appType: 'custom', server: {middlewareMode: true, hmr: false, watch: null}, logLevel: 'error', optimizeDeps: {noDiscovery: true}})

try {
	let {upgradeAll, updateIndex} = await server.ssrLoadModule('/scripts/examples-upgrade.ts'),
		dir = path.join(root, 'examples'),
		results = upgradeAll(dir, process.argv.slice(2))

	for (let r of results) {
		console.log(`${r.key}: ${r.notes} note(s), ${r.bytes[0]} -> ${r.bytes[1]} bytes`)
		for (let c of r.changes) console.log(`  ${c}`)
		for (let g of r.graphs) console.log(`  graph "${g.page}": ${g.nodes} nodes, ${g.moved} moved by the tidy`)
		if (r.artboardsMoved) console.log('  artboards moved by the canvas tidy')
	}

	if (!process.argv.slice(2).length && updateIndex(dir)) console.log('index.json: dusk-poster description updated')
} finally {
	await server.close()
}
