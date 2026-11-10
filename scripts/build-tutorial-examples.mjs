//Writes the Build it tutorials' finished projects into examples/ (see scripts/tutorial-examples/kit.ts). Usage:
//  node scripts/build-tutorial-examples.mjs [key ...] [--all]
//Each one is built from its module, written to examples/<key>/project.json with its line in index.json (group Build it),
//then put through the examples upgrade like every other example (graph tidy, notes). Name the keys to rebuild those. With
//no keys it builds only the ones that have no project.json yet and puts every Build it line in index.json back in order,
//which is what to run after merging branches that each added one. --all rebuilds every one (ids and dates come out new
//each time, so that rewrites every file). The card picture (thumb.jpg) is made separately, see examples/README.md.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'

let root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
	dir = path.join(root, 'examples'),
	only = process.argv.slice(2).filter((a) => !a.startsWith('--')),
	everything = process.argv.includes('--all'),
	server = await createServer({root, appType: 'custom', server: {middlewareMode: true, hmr: false, watch: null}, logLevel: 'error', optimizeDeps: {noDiscovery: true}})

try {
	let {tutorialExamples} = await server.ssrLoadModule('/scripts/tutorial-examples/kit.ts'),
		{upgradeExample} = await server.ssrLoadModule('/scripts/examples-upgrade.ts'),
		{makeColorResolver, resolveBackground, defaultTheme, hasTokens} = await server.ssrLoadModule('interactives-player'),
		all = tutorialExamples(),
		picked = only.length ? all.filter((t) => only.includes(t.key)) : everything ? all : all.filter((t) => !fs.existsSync(path.join(dir, t.key, 'project.json')))

	for (let k of only) if (!all.some((t) => t.key === k)) throw new Error(`no tutorial example called "${k}"`)

	let indexFile = path.join(dir, 'index.json'),
		index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))

	//the card's line in index.json, from the module and the project as written
	let entryFor = (t, p) => {
		let ab = p.artboards[0],
			//the card's background as the default theme draws it
			bg = hasTokens(p.themes) ? resolveBackground(ab, makeColorResolver(p.themes, defaultTheme(p.themes).id)) : ab.background
		return {
			key: t.key,
			title: t.title,
			description: t.description,
			group: 'Build it',
			tags: ['tutorial', ...t.tags.filter((x) => x !== 'tutorial')],
			artboards: p.artboards.length,
			preview: {width: ab.width, height: ab.height, background: bg?.type === 'solid' ? bg.color : '#ffffff'},
		}
	}
	let setEntry = (entry) => {
		let at = index.findIndex((e) => e.key === entry.key)
		if (at >= 0) index[at] = entry
		else index.push(entry)
	}

	for (let t of picked) {
		let p = t.build()
		fs.mkdirSync(path.join(dir, t.key), {recursive: true})
		fs.writeFileSync(path.join(dir, t.key, 'project.json'), JSON.stringify(p))
		setEntry(entryFor(t, p))
	}

	//an example that is there already keeps its file but gets its line back (two merged branches each added lines, and the
	//merge kept one side's index.json)
	if (!only.length) {
		for (let t of all) {
			if (picked.includes(t)) continue
			let file = path.join(dir, t.key, 'project.json')
			if (fs.existsSync(file)) setEntry(entryFor(t, JSON.parse(fs.readFileSync(file, 'utf8'))))
		}
	}

	//the tutorial examples last, in key order, so a rebuild writes the same file
	if (!only.length) index = [...index.filter((e) => e.group !== 'Build it'), ...index.filter((e) => e.group === 'Build it').sort((a, b) => a.key.localeCompare(b.key))]
	fs.writeFileSync(indexFile, JSON.stringify(index, null, '\t') + '\n')

	for (let t of picked) {
		//twice: the upgrade puts graph notes beside the nodes before it tidies them, so a freshly built graph moves under its
		//notes the first time, and the second pass sets them where the tidied graph is (what the examples test checks)
		upgradeExample(dir, t.key)
		let r = upgradeExample(dir, t.key)
		console.log(`${t.key}: ${r.notes} note(s), ${r.graphs.map((g) => `${g.page} ${g.nodes} nodes`).join(', ') || 'no graph'}`)
	}
} finally {
	await server.close()
}
