//Sticky notes are the authors' own (project.notes and artboard.notes) and nothing a player is sent may carry them: the share page the
//editor builds is stripped before it leaves the browser, and this does it again on the server, to what is kept at /s/<token> and to
//the project a review link hands out, so a note's text is never in JSON that ships even if a page came from an old editor tab.
//Plain ESM like the rest of shared/, used by index.js and the tests.

//The project without any notes (the same object when it had none)
export const stripNotes = (project) => {
	if (!project || typeof project !== 'object') {
		return project
	}

	let any = project.notes !== undefined || (Array.isArray(project.artboards) && project.artboards.some((a) => a && a.notes !== undefined))

	if (!any) {
		return project
	}

	let {notes, ...rest} = project

	if (Array.isArray(rest.artboards)) {
		rest.artboards = rest.artboards.map((a) => {
			if (!a || a.notes === undefined) {
				return a
			}

			let {notes: gone, ...kept} = a

			return kept
		})
	}

	return rest
}

//A share page with its project's notes taken out. The project is the JSON in <script id="ix-project">, written back with the
//escaping the player's builder uses. Returns the page itself when there is nothing to take out; throws when the page has the word
//"notes" in a project it cannot read, because then there is no knowing
export const stripNotesFromPage = (html) => {
	if (typeof html !== 'string' || !html.includes('"notes"')) {
		return html
	}

	let open = html.indexOf('id="ix-project">'),
		start = open + 'id="ix-project">'.length,
		end = open < 0 ? -1 : html.indexOf('</script>', start)

	if (end < 0) {
		return html
	}

	let project = JSON.parse(html.slice(start, end)),
		stripped = stripNotes(project)

	if (stripped === project) {
		return html
	}

	let json = JSON.stringify(stripped).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

	return html.slice(0, start) + json + html.slice(end)
}
