//Copies a project from a running editor server into examples/<key>/ so it ships with the repo as an example on the
//Templates tab. Usage:
//  node scripts/export-example.mjs <projectId> <key> --title "Title" --description "What it shows" [--tags a,b] [--group Docs] [--from http://127.0.0.1:3048/interactives]
//Writes project.json and every asset the project names (assets/<id> and assets/<id>.json), and adds or replaces the entry in
//examples/index.json. The thumbnail (thumb.jpg) is made separately, see examples/README.md
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

let args = process.argv.slice(2),
	positional = [],
	opts = {}

for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i]
	else positional.push(args[i])
}

let [projectId, key] = positional,
	from = (opts.from || 'http://127.0.0.1:3048/interactives').replace(/\/$/, ''),
	root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples')

if (!projectId || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(key || '') || !opts.title) {
	console.error('usage: node scripts/export-example.mjs <projectId> <key> --title "Title" --description "..." [--tags a,b] [--group Docs] [--from url]')
	process.exit(1)
}

let get = async (url) => {
		let res = await fetch(from + url)

		if (!res.ok) throw new Error(`${url}: ${res.status}`)

		return res
	},
	dir = path.join(root, key),
	{project} = await (await get(`/api/projects/${projectId}`)).json()

delete project.template
project.id = `ex-${key}`
project.name = opts.title
fs.rmSync(dir, {recursive: true, force: true})
fs.mkdirSync(path.join(dir, 'assets'), {recursive: true})

let bytes = 0

for (let a of project.assets || []) {
	let res = await get(`/api/projects/${projectId}/assets/${a.id}`),
		buf = Buffer.from(await res.arrayBuffer())

	fs.writeFileSync(path.join(dir, 'assets', a.id), buf)
	fs.writeFileSync(path.join(dir, 'assets', `${a.id}.json`), JSON.stringify({mime: a.mime || res.headers.get('content-type') || 'application/octet-stream', size: buf.length}))
	bytes += buf.length
}

fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project))

let first = project.artboards.find((a) => a.id === project.settings?.startArtboardId) || project.artboards[0],
	file = path.join(root, 'index.json'),
	list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [],
	entry = {
		key,
		title: opts.title,
		description: opts.description || '',
		group: opts.group || 'Examples',
		tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
		artboards: project.artboards.length,
		preview: first ? {width: first.width, height: first.height, background: first.background?.type === 'solid' ? first.background.color : '#ffffff'} : null
	},
	at = list.findIndex((e) => e.key === key)

if (at >= 0) list[at] = entry
else list.push(entry)

fs.writeFileSync(file, JSON.stringify(list, null, '\t') + '\n')
console.log(`${key}: ${project.artboards.length} artboards, ${(project.assets || []).length} files, ${Math.round(bytes / 1024)} KB of assets`)
