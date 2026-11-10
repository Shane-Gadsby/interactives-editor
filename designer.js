//The Activity Designer: a Cogniti agent (UniSQ's AI platform) that builds in the open project. Cogniti agents can't call
//tools themselves, so this is the loop that does it for them: the person's request goes to the agent along with the
//editor's own MCP tool list, the agent answers with a ```tool block, we run those tools as the person (index.js hands us
//the function that does), send the results back, and go round again until the agent answers in plain words.
//
//Nothing in here talks to the editor or the database, index.js passes in everything it needs, so the tests can drive the
//whole loop with a pretend Cogniti. The token (COGNITI_TOKEN) never leaves this server.
const crypto = require('crypto')

const DEFAULT_AGENT = '6af3a041a8d105e6274a6bdc',
	DEFAULT_URL = 'https://cogniti.unisq.edu.au',
	//A build takes 3 to 16 rounds. Past this the agent is going round in circles
	MAX_ROUNDS = 20,
	//Tool results are cut to fit, about this much a round shared between that round's calls
	RESULT_BUDGET = 26000,
	//The tools that change the project (the first one saves a restore point)
	CHANGING = new Set(['edit', 'add_note', 'add_graph_note', 'edit_note', 'remove_note']),
	//Only these topics go in the building guide up front, the rest the agent can ask for with read_reference
	GUIDE_TOPICS = ['layers', 'interactions', 'properties', 'expressions']

//The agent, address and token, and whether the button shows at all. INTERACTIVES_DESIGNER=off hides it even with a token
const settings = (env = process.env) => ({
	on: !/^(off|0|false|no)$/i.test(env.INTERACTIVES_DESIGNER || '') && !!env.COGNITI_TOKEN,
	token: env.COGNITI_TOKEN || '',
	agent: env.INTERACTIVES_DESIGNER_AGENT || DEFAULT_AGENT,
	url: String(env.INTERACTIVES_COGNITI_URL || DEFAULT_URL).replace(/\/+$/, ''),
})

//What goes wrong talking to Cogniti, in words a course designer can read. kind is for the audit log
class DesignerError extends Error {
	constructor(kind, message) {
		super(message)
		this.kind = kind
	}
}

const WORDS = {
	limit: 'The Activity Designer has reached its hourly limit. Try again in a little while.',
	blocked: "That was blocked by UniSQ's content safety checks. Try asking in different words.",
	tooLong: 'This chat has got too long for the Activity Designer. Start a new chat and ask again.',
	forbidden: "The Activity Designer isn't available right now. If it keeps happening, tell the Toolbox team.",
	unavailable: 'The Activity Designer could not be reached just now. Try again in a minute.',
	empty: "The Activity Designer didn't send anything back. Try again.",
}

//The little client for Cogniti's chat api. Undocumented, found in its own chat page: a conversation is made first, then
//each message goes with the whole history and the answer streams back as lines of {"content":"...","success":true}
const cogniti = (cfg, fetcher = (...a) => fetch(...a)) => {
	let call = async (path, body, signal) => {
		let res
		try {
			res = await fetcher(cfg.url + path, {
				method: 'POST',
				headers: {Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json'},
				body: JSON.stringify(body),
				signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(240000)]) : AbortSignal.timeout(240000),
			})
		}
		catch (err) {
			if (signal?.aborted) throw err
			throw new DesignerError('unavailable', WORDS.unavailable)
		}
		if (!res.ok) {
			let kind = {429: 'limit', 406: 'blocked', 413: 'tooLong', 401: 'forbidden', 403: 'forbidden'}[res.status] || 'unavailable'
			//Status only, never the body: it could carry the person's words back
			console.warn(`interactives: cogniti ${path} answered ${res.status}`)
			throw new DesignerError(kind, WORDS[kind])
		}
		return res
	}

	return {
		async newConversation(signal) {
			let d = await (await call('/api/v1/conversations/new', {agent_id: cfg.agent}, signal)).json().catch(() => null)
			if (!d?.conversation_id) throw new DesignerError('unavailable', WORDS.unavailable)
			return d.conversation_id
		},

		//Sends one message and gives back everything the agent said
		async send(conversation, text, history, signal) {
			let res = await call('/api/v1/chat/message', {
				agent_id: cfg.agent,
				conversation_id: conversation,
				messages: [{content: text}],
				chat_history: history,
				conversation_operation_id: crypto.randomUUID(),
			}, signal),
				reply = '',
				failed = false,
				line = (l) => {
					if (!l.trim()) return
					try {
						let d = JSON.parse(l)
						if (typeof d.content === 'string') reply += d.content
						else if (d.success === false) failed = true
					}
					catch {
						//a half line or something that isn't ours
					}
				},
				dec = new TextDecoder(),
				buf = ''
			for await (let chunk of res.body) {
				buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, {stream: true})
				let i
				while ((i = buf.indexOf('\n')) >= 0) {
					line(buf.slice(0, i))
					buf = buf.slice(i + 1)
				}
			}
			line(buf)
			if (!reply.trim()) throw new DesignerError(failed ? 'unavailable' : 'empty', failed ? WORDS.unavailable : WORDS.empty)
			return reply
		},
	}
}

//The agent's reply to a list of calls, if it's one. Null when it's plain words (finished, or asking something). A block
//that doesn't parse comes back as {error} so the agent can be told and have another go
const parseCalls = (reply) => {
	let m = /```tool\s*([\s\S]*?)```/.exec(reply)
	if (!m) return null
	let list
	try {
		list = JSON.parse(m[1])
	}
	catch (err) {
		return {error: `That tool block was not valid JSON (${String(err.message).slice(0, 80)}). Send it again as one JSON array of {"tool": name, "args": {...}}.`}
	}
	if (!Array.isArray(list)) list = [list]
	list = list.filter((c) => c && typeof c === 'object' && typeof c.tool === 'string').slice(0, 12)
	if (!list.length) return {error: 'That tool block had no calls in it. Send a JSON array of {"tool": name, "args": {...}}.'}
	return {calls: list.map((c) => ({tool: c.tool, args: c.args && typeof c.args === 'object' && !Array.isArray(c.args) ? c.args : {}}))}
}

//What the panel says while a tool runs. Plain words, never the tool's name
const statusFor = (tool) => {
	if (CHANGING.has(tool)) return 'Changing the project'
	if (tool === 'validate') return 'Checking the project'
	if (tool === 'read_reference') return 'Looking up how the editor works'
	if (tool === 'leave_session') return null
	if (/^(list_|get_|join_)/.test(tool)) return 'Reading the project'
	return 'Working on it'
}

//The first message of a conversation: the tools, the building guide, where we are and what's wanted. The building guide is
//the editor's own reference, so it always matches the version that's deployed
const firstMessage = ({tools, guide, projectId, projectName, firstName, joined, message}) =>
	'# Tools\n' + JSON.stringify(tools.map((t) => ({name: t.name, description: t.description, input: t.inputSchema}))) +
	'\n\n# Building guide\n' + guide +
	`\n\n# Project\nid ${projectId}\nname ${JSON.stringify(projectName)}\n` +
	(joined ? `You have already joined this project's live session, so skip join_session. What join_session returned:\n${joined}\n` : '') +
	(firstName ? `\n# Designer\nTheir first name is ${firstName}.\n` : '') +
	`\n# Request\n${message}`

const followUp = ({projectId, joined, message}) =>
	`# Project\nid ${projectId}\n` + (joined ? `You are joined to its live session again. Here is where it stands now:\n${joined}\n` : '') + `\n# Request\n${message}`

const cut = (text, max) => text.length > max ? text.slice(0, max) + '\n...(cut to fit, ask for a smaller piece if you need the rest)' : text

//One request from the person, as many rounds as it takes. state is the conversation so far ({conversation, history}),
//mutated as it goes. Returns {outcome, rounds, changed}; every way out has told the panel through emit
//deps: cogniti, tools, guide, callTool(name, args) -> {text, error}, beforeEdit() -> restore point id, emit(event), signal,
//join() -> text, to join the project's session (so the agent doesn't spend a round on it)
const run = async (deps, input) => {
	let {cogniti: ai, tools, guide, callTool, beforeEdit, emit, signal, join} = deps,
		{projectId, projectName, firstName, message, state} = input,
		rounds = 0,
		changed = false,
		restore = null,
		fresh = !state.conversation,
		done = (outcome) => ({outcome, rounds, changed}),
		fail = (text, outcome) => {
			emit({type: 'error', text})
			return done(outcome)
		}

	try {
		//Long chats get slower every round (the whole history goes with each message), so a very long one starts again
		if (state.history.length > 80) {
			state.conversation = null
			state.history = []
			fresh = true
		}

		emit({type: 'status', text: 'Reading the project'})
		let joined = ''
		try {
			joined = cut((await join()) || '', 9000)
		}
		catch (err) {
			return fail(`The Activity Designer could not open the project (${String(err.message || err).slice(0, 120)}).`, 'error')
		}

		if (!state.conversation) state.conversation = await ai.newConversation(signal)

		let text = fresh ? firstMessage({tools, guide, projectId, projectName, firstName, joined, message}) : followUp({projectId, joined, message})

		for (; rounds < MAX_ROUNDS; ) {
			if (signal?.aborted) return done('cancelled')
			emit({type: 'status', text: 'Thinking it through'})
			let reply = await ai.send(state.conversation, text, state.history, signal)
			rounds++
			state.history.push({role: 'user', content: text, uuid: crypto.randomUUID()}, {role: 'ai', content: reply, uuid: crypto.randomUUID()})

			let parsed = parseCalls(reply)
			if (!parsed) {
				emit({type: 'reply', text: reply.trim()})
				return done('replied')
			}

			let results = []
			if (parsed.error) results.push({error: parsed.error})
			else {
				let share = Math.max(2000, Math.floor(RESULT_BUDGET / parsed.calls.length))
				for (let c of parsed.calls) {
					//Stop after the tool that's running, not in the middle of one
					if (signal?.aborted) return done('cancelled')
					let words = statusFor(c.tool)
					if (words) emit({type: 'status', text: words})

					//Only this project: the restore point and the undo button are for it
					let asked = [c.args.project_id, c.args.projectId, c.args.project].find((x) => typeof x === 'string')
					if (asked && asked !== projectId) {
						results.push({tool: c.tool, ok: false, result: 'Error: you can only work in the project the designer has open (id ' + projectId + ').'})
						continue
					}

					//A restore point before the first change, so "Undo" has something to go back to. If one can't be saved nothing changes
					if (CHANGING.has(c.tool) && !restore) {
						try {
							restore = await beforeEdit()
						}
						catch (err) {
							console.warn('interactives: designer restore point failed', err?.message)
							return fail("The Activity Designer could not save a copy of your project first, so it stopped before changing anything. Try again in a moment.", 'error')
						}
					}

					let out = await callTool(c.tool, c.args)
					if (CHANGING.has(c.tool) && !out.error && !changed) {
						changed = true
						emit({type: 'changed', revision: restore})
					}
					results.push({tool: c.tool, ok: !out.error, result: cut(String(out.text ?? ''), share)})
				}
			}
			text = 'Tool results:\n' + JSON.stringify(results)
		}

		//Round cap: it was still working. What it did stays (and can be undone)
		emit({type: 'reply', text: "I wasn't able to finish that in one go. Have a look at what's in the project now, then tell me what's left or ask again with a smaller piece."})
		return done('round-cap')
	}
	catch (err) {
		if (signal?.aborted) return done('cancelled')
		if (err instanceof DesignerError) {
			//The agent's half of the conversation can't be trusted after this, so the next request starts clean
			if (err.kind === 'tooLong') state.conversation = null
			return fail(err.message, err.kind)
		}
		console.warn('interactives: designer run failed', err?.message)
		return fail('Something went wrong in the Activity Designer. Try again in a minute.', 'error')
	}
}

//The building guide: the editor's own references, joined. mcp is the loaded MCP module; built once
let guideCache = null
const buildGuide = (mcp) => guideCache ||= GUIDE_TOPICS.map((t) => `## ${t}\n${mcp.reference(t)}`).join('\n\n')

module.exports = {settings, cogniti, run, parseCalls, statusFor, buildGuide, DesignerError, WORDS, CHANGING, MAX_ROUNDS}
