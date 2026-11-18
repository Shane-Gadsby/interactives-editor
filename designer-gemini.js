//The Activity Designer on Gemini. Where the Cogniti one (designer.js) has to get everything done in one message, this one
//has no message cap to work around, so the model drives the editor's own MCP tools itself: it reads the project, looks
//things up in the reference, edits, checks its work and puts right what it broke, for as many steps as the request needs.
//The blueprint builder is still here as one more tool (build), because a whole page or a question is quicker and better
//made by the editor's own kit than layer by layer.
//
//Like designer.js nothing in here talks to the editor or the database, index.js passes everything in, so the tests drive
//it with a pretend Gemini. The key (GEMINI_API_KEY) never leaves this server
const fs = require('fs')
const path = require('path')
const {DesignerError, STATUS, buildSpec} = require('./designer')

const DEFAULT_URL = 'https://generativelanguage.googleapis.com',
	//The one the free tier lets through with tools (18 Nov 2026). INTERACTIVES_DESIGNER_MODEL changes it
	DEFAULT_MODEL = 'gemini-4-hydrogen',
	//Times the model is asked in one request. A big build is 10 to 15, so this is room to finish and not room to wander
	MAX_STEPS = 30,
	//What one tool may hand back to the model. A whole project as JSON would otherwise fill the request
	MAX_RESULT = 60000,
	//Turns of the chat that go with the next request
	MAX_HISTORY = 24

const settings = (env = process.env) => ({
	on: /^(on|1|true|yes)$/i.test(env.INTERACTIVES_DESIGNER || '') && !!env.GEMINI_API_KEY,
	key: env.GEMINI_API_KEY || '',
	model: env.INTERACTIVES_DESIGNER_MODEL || DEFAULT_MODEL,
	url: String(env.INTERACTIVES_GEMINI_URL || DEFAULT_URL).replace(/\/+$/, ''),
	//How hard it thinks before each step: low, medium or high. Unset is the model's own default, which is the slowest
	//(about 40s a step on the free tier, 18 Nov 2026) and the most careful
	thinking: /^(minimal|low|medium|high)$/i.test(env.INTERACTIVES_DESIGNER_THINKING || '') ? env.INTERACTIVES_DESIGNER_THINKING.toLowerCase() : '',
})

const WORDS = {
	limit: 'Ixia has reached its limit for now. Try again in a little while.',
	blocked: "That was blocked by the AI's content safety checks. Try asking in different words.",
	tooLong: 'This chat has got too long for Ixia. Start a new chat and ask again.',
	forbidden: "Ixia isn't available right now. If it keeps happening, tell the Toolbox team.",
	unavailable: 'Ixia could not be reached. Try again in a minute.',
	empty: "Ixia didn't send anything back. Try again.",
	steps: "That's as far as I can get in one go. Have a look at what's there, and ask me to carry on from here.",
}

const wait = (ms, signal) => new Promise((resolve) => {
	let t = setTimeout(resolve, ms)
	signal?.addEventListener('abort', () => {
		clearTimeout(t)
		resolve()
	}, {once: true})
})

//The little client for Gemini's generateContent. One call is one turn of the model: words, or the tools it wants run
const client = (cfg, fetcher = (...a) => fetch(...a), pause = wait) => {
	let once = async (body, signal) => {
		let res
		try {
			res = await fetcher(`${cfg.url}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
				method: 'POST',
				//the key goes in a header, never the address, so it can't end up in a log line
				headers: {'x-goog-api-key': cfg.key, 'Content-Type': 'application/json'},
				body: JSON.stringify(body),
				signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
			})
		}
		catch (err) {
			if (signal?.aborted) throw err
			return {status: 0}
		}
		if (!res.ok) {
			//Status only, never the body: it could carry the person's words back
			console.warn(`interactives: gemini answered ${res.status}`)
			return {status: res.status}
		}
		return {status: 200, data: await res.json().catch(() => null)}
	}

	return {
		//{parts, content, finish} for one turn. content is the model's turn exactly as it came, which is what has to go back
		//in the history (its tool calls carry signatures the next call checks)
		async generate({system, contents, tools}, signal) {
			let body = {
					...(system ? {systemInstruction: {parts: [{text: system}]}} : {}),
					contents,
					...(tools?.length ? {tools: [{functionDeclarations: tools}]} : {}),
					...(cfg.thinking ? {generationConfig: {thinkingConfig: {thinkingLevel: cfg.thinking}}} : {}),
				},
				out = await once(body, signal)
			//Busy, or the per minute limit: one more go after a breather. A second refusal is the answer
			if ([0, 429, 500, 502, 503, 504].includes(out.status) && !signal?.aborted) {
				await pause(out.status === 429 ? 20000 : 3000, signal)
				if (signal?.aborted) throw new Error('aborted')
				out = await once(body, signal)
			}
			if (out.status !== 200) {
				let kind = {429: 'limit', 413: 'tooLong', 401: 'forbidden', 403: 'forbidden'}[out.status] || 'unavailable'
				throw new DesignerError(kind, WORDS[kind])
			}

			let d = out.data,
				c = d?.candidates?.[0]
			if (d?.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(c?.finishReason)) throw new DesignerError('blocked', WORDS.blocked)
			if (!c) throw new DesignerError('empty', WORDS.empty)
			return {parts: Array.isArray(c.content?.parts) ? c.content.parts : [], content: c.content || null, finish: c.finishReason || ''}
		},
	}
}

//---------------------------------------------------------------------------------------------------------------------
//The tools

//Which of the MCP tools the model gets, and what the panel says while each runs. Nothing that reaches another project is
//on it (list_projects, create_project, join and leave): the designer works in the project that's open and nowhere else
const READS = {get_overview: STATUS.read, get_layers: STATUS.read, get_interactions: STATUS.read, get_variables: STATUS.read, get_selection: STATUS.read, list_notes: STATUS.read, export_project: STATUS.read, read_reference: 'Looking things up', validate: STATUS.check},
	WRITES = {edit: STATUS.build, upload_asset: STATUS.build, add_note: STATUS.build, add_graph_note: STATUS.build, edit_note: STATUS.build, remove_note: STATUS.build}

const BUILD_TOOL = {
	name: 'build',
	description: 'Build a blueprint in the open project with the editor\'s own kit: whole pages in the look of the open page, headings, text, lists, buttons, rows, native question cards with feedback and hints, variables, and behaviours written as plain sentences. The quickest and best way to make a page, a question or a set of them. The format is the Blueprint spec in your instructions. Returns what was built and any problems it left.',
	parametersJsonSchema: {type: 'object', properties: {blueprint: {type: 'object', description: 'The blueprint, as the Blueprint spec describes it'}}, required: ['blueprint']},
}

//The MCP tools as Gemini wants them declared, without project_id: the model never gets to say which project
const declarations = (tools) => [
	...tools.filter((t) => READS[t.name] || WRITES[t.name]).map((t) => {
		let schema = t.inputSchema || {type: 'object', properties: {}},
			{project_id, ...properties} = schema.properties || {}
		return {name: t.name, description: t.description, parametersJsonSchema: {type: 'object', properties, required: (schema.required || []).filter((k) => k !== 'project_id')}}
	}),
	BUILD_TOOL,
]

let systemCache = null
//Who it is and how it works (designer-gemini-system.txt), what good looks like (the playbook) and the blueprint format
const buildSystem = () => {
	if (systemCache === null) {
		let read = (...p) => {
			try {
				return fs.readFileSync(path.join(__dirname, ...p), 'utf8').trim()
			}
			catch {
				return ''
			}
		}
		let book = read('agent-docs', 'playbook.md').replace(/^# .*\n+/, '')
		systemCache = read('designer-gemini-system.txt') + (book ? `\n\n# Playbook\nApply this to everything you make.\n\n${book}` : '') +
			`\n\n# Blueprint spec\nThis is the format of the "blueprint" argument of the build tool. Where it says to reply with a block, pass the JSON to build instead, and leave "raw" out: use the edit tool for those.\n\n${buildSpec()}`
	}
	return systemCache
}

const cut = (text, max) => text.length > max ? text.slice(0, max) + '\n...(cut to fit, ask for a smaller part)' : text

//What a build came to, in words for the model
const buildReport = (o) => [
	o.changed ? 'Built.' : 'Nothing changed.',
	o.notes?.length ? `Done:\n- ${o.notes.join('\n- ')}` : '',
	o.warnings?.length ? `Worth a look:\n- ${[...new Set(o.warnings)].join('\n- ')}` : '',
	o.problems?.length ? `Problems this left, fix them:\n- ${o.problems.slice(0, 20).join('\n- ')}` : '',
].filter(Boolean).join('\n\n')

//One request from the person. The model is asked, runs the tools it wants, is told what came back, and so on until it
//answers in words. state is the chat so far ({history}), mutated as it goes. Returns {outcome, rounds, changed} like
//designer.run, and every way out has told the panel through emit. rounds is how many times Gemini was asked
//deps: ai (client), tools (the MCP bundle's TOOLS), callTool(name, args) -> {error, text}, build(blueprint, known),
//context() -> text about the open project, beforeEdit() -> restore point id, emit(event), signal, system?
const run = async (deps, input) => {
	let {ai, tools, callTool, build, context, beforeEdit, emit, signal} = deps,
		{projectId, projectName, firstName, message, state} = input,
		rounds = 0,
		changed = false,
		restore = null,
		known = null,
		said = '',
		//what the request used, where the client says (OpenRouter does): tokens in, of those read again cheaply, tokens out, dollars
		usage = {input: 0, cached: 0, output: 0, cost: 0, host: ''},
		done = (outcome) => ({outcome, rounds, changed, usage}),
		fail = (text, outcome) => {
			emit({type: 'error', text, kind: outcome})
			return done(outcome)
		},
		status = (text) => {
			if (text && text !== said) emit({type: 'status', text})
			said = text
		}

	try {
		state.history ||= []
		if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY)

		status(STATUS.read)
		let around = ''
		try {
			around = (await context()) || ''
		}
		catch (err) {
			return fail(`Ixia could not open the project (${String(err.message || err).slice(0, 120)}).`, 'error')
		}

		let declared = declarations(tools),
			allowed = new Set(declared.map((t) => t.name)),
			system = deps.system || buildSystem(),
			contents = [...state.history, {role: 'user', parts: [{text:
				`# Open project\nname ${JSON.stringify(projectName)}\n\n${around}\n` + (firstName ? `\n# Designer\nTheir first name is ${firstName}.\n` : '') + `\n# Request\n${message}`}]}],
			nudged = false,
			//the chat only keeps the words, the project and the tool chatter are stale by the next request
			finish = (text) => {
				state.history.push({role: 'user', parts: [{text: `# Request\n${message}`}]}, {role: 'model', parts: [{text}]})
				emit({type: 'reply', text})
				return done('replied')
			}

		while (rounds < MAX_STEPS) {
			if (signal?.aborted) return done('cancelled')
			status(STATUS.think)
			let turn = await ai.generate({system, contents, tools: declared}, signal)
			rounds++
			if (turn.usage) {
				for (let k of ['input', 'cached', 'output', 'cost']) usage[k] += Number(turn.usage[k]) || 0
				usage.host = turn.usage.host || usage.host
			}

			let calls = turn.parts.filter((p) => p.functionCall?.name),
				words = turn.parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim()

			if (!calls.length) {
				if (words) return finish(words)
				//A tool call it couldn't write properly, or nothing at all: say so once and let it have another go
				if (nudged) throw new DesignerError('empty', WORDS.empty)
				nudged = true
				if (turn.content?.parts?.length) contents.push(turn.content)
				contents.push({role: 'user', parts: [{text: 'That came through empty. Carry on: call a tool with valid arguments, or reply to the designer in plain words.'}]})
				continue
			}

			contents.push(turn.content)
			let answers = []
			for (let part of calls) {
				if (signal?.aborted) return done('cancelled')
				let {name, args, id} = part.functionCall,
					out
				args = args && typeof args === 'object' ? args : {}
				if (!allowed.has(name)) out = {error: true, text: `Error: there is no tool called ${name}.`}
				else {
					let writes = !!WRITES[name] || name === 'build'
					//A restore point before the first change, so "Undo" has something to go back to. If one can't be saved nothing changes
					if (writes && !restore) {
						try {
							restore = await beforeEdit()
						}
						catch (err) {
							console.warn('interactives: designer restore point failed', err?.message)
							return fail('Ixia could not save a copy of your project first, so it stopped before changing anything. Try again in a moment.', 'error')
						}
					}
					status(name === 'build' ? STATUS.build : READS[name] || WRITES[name])
					try {
						if (name === 'build') {
							let o = await build(args.blueprint && typeof args.blueprint === 'object' ? args.blueprint : {}, known)
							known ??= o.known
							out = {error: false, text: buildReport(o), changed: !!o.changed}
						}
						else {
							//whatever it says, the project is the open one
							out = await callTool(name, {...args, project_id: projectId})
							out.changed = writes && !out.error && !/^Nothing changed\.?$/.test(out.text.trim())
						}
					}
					catch (err) {
						out = {error: true, text: `Error: ${String(err?.message || err).slice(0, 300)}`}
					}
					//the first change comes with the restore point, the rest only say there's more to show
					if (out.changed) {
						emit(changed ? {type: 'touched'} : {type: 'changed', revision: restore})
						changed = true
					}
				}
				answers.push({functionResponse: {name, ...(id ? {id} : {}), response: out.error ? {error: cut(out.text, MAX_RESULT)} : {result: cut(out.text, MAX_RESULT)}}})
			}
			contents.push({role: 'user', parts: answers})
		}

		//Out of steps. What's built is built, so say so and let them pick it up from there
		return finish(WORDS.steps)
	}
	catch (err) {
		if (signal?.aborted) return done('cancelled')
		if (err instanceof DesignerError) return fail(err.message, err.kind)
		console.warn('interactives: designer run failed', err?.message)
		return fail('Something went wrong in Ixia. Try again in a minute.', 'error')
	}
}

module.exports = {settings, client, run, declarations, buildSystem, WORDS, MAX_STEPS, DEFAULT_MODEL}
