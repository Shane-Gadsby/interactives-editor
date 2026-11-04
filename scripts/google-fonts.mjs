//Rebuilds src/data/google-fonts.json, the list of Google Fonts families the font picker searches.
//  node scripts/google-fonts.mjs            fetches https://fonts.google.com/metadata/fonts (no key needed)
//  node scripts/google-fonts.mjs file.json  uses a copy of that response you already have
//Only the family, category and weights are kept (a row is [family, category, [weights]]), most popular first.
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'

const META_URL = 'https://fonts.google.com/metadata/fonts',
	CATEGORY = {'Sans Serif': 's', Serif: 'r', Display: 'd', Handwriting: 'h', Monospace: 'm'}

export function compact(meta) {
	let list = meta.familyMetadataList

	if (!Array.isArray(list) || !list.length) {
		throw new Error('No familyMetadataList in that response')
	}

	return list
		.slice()
		.sort((a, b) => (a.popularity ?? 1e9) - (b.popularity ?? 1e9) || a.family.localeCompare(b.family))
		.map((f) => {
			let cat = CATEGORY[f.category]

			if (!cat) {
				throw new Error(`Unknown category "${f.category}" on ${f.family}`)
			}

			//"400" and "400i" are the same weight as far as we care, and the editor stops at 900 (some variable fonts say 1000)
			let weights = [...new Set(Object.keys(f.fonts ?? {}).map((k) => parseInt(k, 10)).filter((w) => w >= 100 && w <= 900))].sort((a, b) => a - b)
			return [f.family, cat, weights.length ? weights : [400]]
		})
}

export function render(rows, when = new Date()) {
	return `{"updated":"${when.toISOString().slice(0, 10)}","categories":{"s":"Sans serif","r":"Serif","d":"Display","h":"Handwriting","m":"Monospace"},"fonts":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`
}

//(the tests import compact and render, which must not write anything)
if (import.meta.url.startsWith('file:') && process.argv[1] === fileURLToPath(import.meta.url)) {
	let out = fileURLToPath(new URL('../src/data/google-fonts.json', import.meta.url)),
		arg = process.argv[2],
		text = arg ? fs.readFileSync(arg, 'utf8') : await (await fetch(META_URL)).text(),
		//the endpoint can lead with an anti-JSON prefix
		rows = compact(JSON.parse(text.replace(/^\)\]\}'/, '')))

	fs.writeFileSync(out, render(rows))
	console.log(`${rows.length} families -> src/data/google-fonts.json`)
}
