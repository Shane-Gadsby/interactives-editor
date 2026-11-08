//Writes the downloadable question templates (Word, Excel, CSV) to public/templates/. Built from shared/question-template.mjs, which
//the paste reader's tests check them against, so run this after changing an example or a layout rule and commit the files.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_FILES } from '../shared/question-template.mjs'

const dir = fileURLToPath(new URL('../public/templates/', import.meta.url))
mkdirSync(dir, {recursive: true})
for (const [name, make] of Object.entries(TEMPLATE_FILES)) {
	writeFileSync(dir + name, make())
	console.log(`wrote public/templates/${name}`)
}
