//Ask Ixia on Antigravity: the agy CLI, signed in to one person's Antigravity account on this box, runs the agent, so
//there's no API key and no bill. What it costs is that account's allowance (a 5 hour window and a week), which is why
//the quota monitor at the bottom hides Ask Ixia before it runs out, and brings it back when it refreshes.
//
//Each request is one `agy -p` run in agent-workspace/ (read only, see its README), resumed with --conversation so a
//chat carries on without sending the project again. Five things keep it in its box: --sandbox, the --settings deny
//rules, the PreToolUse guard (agent-workspace/.agents/hooks/guard.mjs, which refuses every tool but ixia-chat and
//reading refs/ and skills), a scrubbed environment with no keys in it, and the ixia-chat MCP server itself, which is a
//one-turn token locked to the open project (POST /api/designer/_mcp in index.js, handled by mcpHandler below).
//
//Like designer-gemini.js nothing in here talks to the database: index.js passes everything in, and the tests drive it
//with a pretend agy
const path = require('path')
const childProcess = require('child_process')
const {DesignerError, STATUS} = require('./designer')

const WORKSPACE = path.join(__dirname, 'agent-workspace'),
	//What one tool may hand back to the model
	MAX_RESULT = 60000,
	//agy calls the plugin's server <plugin>_<server>, so this is what the permission rules and the guard look for
	SERVER = 'ixia_ixia-chat'

const on = (v) => /^(on|1|true|yes)$/i.test(v || '')
const num = (v, d) => Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d

const settings = (env = process.env, storageDir = path.join(__dirname, 'storage')) => ({
	on: on(env.INTERACTIVES_DESIGNER) && (/^antigravity$/i.test(env.INTERACTIVES_DESIGNER_BACKEND || '') || on(env.INTERACTIVES_ANTIGRAVITY)),
	bin: env.INTERACTIVES_ANTIGRAVITY_BIN || 'agy',
	//The pick from 28 Nov 2026: a one-line change took 33 s and 5 steps on gemini-4-neon-low, where gemini-3.8-flash-high
	//read five skills and ran out of time on the same thing
	model: env.INTERACTIVES_ANTIGRAVITY_MODEL || 'gemini-4-neon-low',
	//Unset is the model's own. A model whose name says its effort (gemini-3.8-flash-high) never gets one as well: agy
	//refuses the pair outright (checked 28 Nov 2026)
	effort: /^(low|medium|high)$/i.test(env.INTERACTIVES_ANTIGRAVITY_EFFORT || '') ? env.INTERACTIVES_ANTIGRAVITY_EFFORT.toLowerCase() : '',
	//agy keeps its sign-in, conversations, logs and crash reports under $HOME/.gemini, so it gets a HOME of its own that
	//nothing else uses: none of the box owner's own MCP servers, plugins or permissions come with it
	appDataDir: env.INTERACTIVES_ANTIGRAVITY_APP_DATA_DIR || path.join(storageDir, '_agy-state'),
	timeoutMs: num(env.INTERACTIVES_ANTIGRAVITY_TIMEOUT_MS, 300000),
	//Ixia's own ceilings, whatever the account has left: requests and tokens a day, everyone together (0 is no ceiling)
	dailyRequests: num(env.INTERACTIVES_DESIGNER_DAILY_REQUESTS, 0),
	dailyTokens: num(env.INTERACTIVES_DESIGNER_DAILY_TOKENS, 0),
	//Hide Ask Ixia when either window is down to this much of the allowance (0.02 is 2%)
	minQuota: num(env.INTERACTIVES_DESIGNER_MIN_QUOTA, 0.02),
	//How long to stay hidden after agy says it's out, when it doesn't say until when
	cooldownMs: num(env.INTERACTIVES_DESIGNER_COOLDOWN_MS, 15 * 60 * 1000),
	//Which of the account's model groups to watch: gemini, or 3p (Claude and GPT). Worked out from the model when unset
	group: env.INTERACTIVES_ANTIGRAVITY_GROUP || '',
})

const WORDS = {
	limit: 'Ixia has used all it can for now. It will be back when its allowance refreshes.',
	blocked: "That was blocked by the AI's content safety checks. Try asking in different words.",
	forbidden: "Ixia isn't signed in on this server. Tell the Toolbox team.",
	unavailable: 'Ixia could not be reached. Try again in a minute.',
	empty: "Ixia didn't send anything back. Try again.",
	timeout: "That took longer than Ixia is allowed. Have a look at what's there, and ask me to carry on from here.",
	stalled: "Ixia couldn't get an answer from its AI service just now. Try again in a minute, and if it keeps happening, tell the Toolbox team.",
}

//---------------------------------------------------------------------------------------------------------------------
//The agy run

//Settings for this one run, passed on the command line and never saved. The deny rules are a second wall behind the
//guard hook (which is the one that also stops reading outside the workspace)
const sessionSettings = (workspace = WORKSPACE) => ({
	enableTerminalSandbox: true,
	useG1Credits: false,
	permissions: {
		deny: ['command(*)', 'write_file(*)', 'read_url(*)'],
		allow: [`mcp(${SERVER}/*)`, `read_file(${path.join(workspace, 'refs')})`, `read_file(${path.join(workspace, '.agents', 'skills')})`],
	},
})

const args = (cfg, prompt, conversation, workspace = WORKSPACE) => [
	'-p', prompt,
	'--sandbox',
	'--output-format', 'stream-json',
	'--disable-slash-commands',
	'--settings', JSON.stringify(sessionSettings(workspace)),
	'--print-timeout', `${Math.ceil(cfg.timeoutMs / 1000)}s`,
	...(cfg.model ? ['--model', cfg.model] : []),
	...(cfg.effort && !/-(low|medium|high|xhigh|max)$/i.test(cfg.model || '') ? ['--effort', cfg.effort] : []),
	...(conversation ? ['--conversation', conversation] : []),
]

//Only what agy needs to run and reach the editor. No keys of any kind, no database address, nothing else of the server's
const KEEP = /^(PATH|Path|PATHEXT|SystemRoot|SYSTEMROOT|COMSPEC|TEMP|TMP|TMPDIR|LANG|LC_ALL|TZ|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|http_proxy|https_proxy|no_proxy)$/
const scrubEnv = (env, cfg, extra = {}) => {
	let out = {}
	for (let [k, v] of Object.entries(env || {})) {
		if (KEEP.test(k)) out[k] = v
	}
	out.HOME = cfg.appDataDir
	out.USERPROFILE = cfg.appDataDir
	out.XDG_CONFIG_HOME = path.join(cfg.appDataDir, '.config')
	out.XDG_CACHE_HOME = path.join(cfg.appDataDir, '.cache')
	out.XDG_DATA_HOME = path.join(cfg.appDataDir, '.local', 'share')
	return {...out, ...extra}
}

//What to start for agy. A .js or .mjs bin runs under this node, which is how the tests' pretend agy runs on Windows too
const command = (cfg, rest) => /\.(c|m)?js$/i.test(cfg.bin) ? [process.execPath, [cfg.bin, ...rest]] : [cfg.bin, rest]

const clip = (t, n) => t.length > n ? t.slice(0, n) + '\n...(cut to fit, ask the tools for more)' : t

//The first message of a chat carries the project, small: the agent asks the tools for the rest. After that only the
//request goes, plus a nudge when somebody else has changed the project since
const prompt = (input, around, state) => {
	let where = [input.artboardName ? `Open page: ${input.artboardName}${input.artboardId ? ` (${input.artboardId})` : ''}` : '', input.selection ? `Selected: ${input.selection}` : ''].filter(Boolean).join('\n')
	if (!state.agyConversationId) {
		return [
			`# Open project\nname ${JSON.stringify(input.projectName)}`,
			input.firstName ? `# Designer\nTheir first name is ${input.firstName}.` : '',
			where ? `# Where they are\n${where}` : '',
			around ? clip(around, 4000) : '',
			`# Request\n${input.message}`,
		].filter(Boolean).join('\n\n')
	}
	return [
		where ? `# Where they are\n${where}` : '',
		input.changedOutside ? 'The project has changed since your last turn (someone else edited it). Call get_overview before editing.' : '',
		`# Request\n${input.message}`,
	].filter(Boolean).join('\n\n')
}

//What went wrong, from agy's own words. Only ever logged through whyOf, which takes the person's words out
const classify = (text) => {
	let t = String(text || '')
	if (/print.?timeout|timed? ?out|deadline exceeded/i.test(t)) return 'timeout'
	if (/RESOURCE_EXHAUSTED|\b429\b|quota|rate.?limit|usage limit|limit (reached|exceeded)|out of credits/i.test(t)) return 'limit'
	if (/unauthenticated|not (signed|logged) in|sign in|log ?in required|credential|\b401\b|\b403\b/i.test(t)) return 'forbidden'
	if (/safety|blocked|prohibited/i.test(t)) return 'blocked'
	return 'unavailable'
}

//What agy said went wrong, for the audit row, so a box nobody can open a shell on still says why: its error and stderr,
//with the person's request and the prompt taken out, and never the reply. Cut to 400 characters
const whyOf = (err, result, ...secret) => {
	let t = `${result?.error || ''} ${result?.finished_reason || ''} ${err || ''}`
	for (let s of secret) {
		for (let part of String(s || '').split('\n').map((x) => x.trim()).filter((x) => x.length > 3)) t = t.split(part).join('[...]')
	}
	return t.replace(/\s+/g, ' ').trim().slice(0, 400)
}

//A time agy says the limit comes back, when it says one
const resetFrom = (text) => {
	let m = String(text || '').match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/)
	let t = m ? Date.parse(m[0]) : NaN
	return Number.isFinite(t) && t > Date.now() ? t : null
}

//One request from the person. Runs agy, follows its stream, and hands back {outcome, rounds, changed, usage, exhausted,
//resetAt} like the other backends. The tools themselves are served by mcpHandler through the grant index.js made, which
//is also where changed comes from. deps: cfg, spawn?, env?, workspace?, grant ({url, token, changed}), context() ->
//text, emit(event), signal
const run = async (deps, input) => {
	let {cfg, emit, signal, grant} = deps,
		spawn = deps.spawn || childProcess.spawn,
		workspace = deps.workspace || WORKSPACE,
		state = input.state,
		rounds = 0,
		usage = {input: 0, cached: 0, output: 0, thinking: 0, cost: 0, host: 'antigravity'},
		said = '',
		status = (text) => {
			if (text && text !== said) emit({type: 'status', text})
			said = text
		},
		done = (outcome, more = {}) => ({outcome, rounds, changed: !!grant?.changed, usage, exhausted: false, resetAt: null, ...more}),
		fail = (kind, more = {}) => {
			emit({type: 'error', text: WORDS[kind] || WORDS.unavailable, kind})
			return done(kind === 'limit' ? 'limit' : kind, {exhausted: kind === 'limit', ...more})
		}

	status(STATUS.read)
	let around = ''
	if (!state.agyConversationId) {
		try {
			around = (await deps.context()) || ''
		}
		catch (err) {
			emit({type: 'error', text: `Ixia could not open the project (${String(err.message || err).slice(0, 120)}).`, kind: 'error'})
			return done('error')
		}
	}
	if (signal?.aborted) return done('cancelled')

	let text = prompt(input, around, state),
		started = Date.now(),
		child
	try {
		let [bin, rest] = command(cfg, args(cfg, text, state.agyConversationId, workspace))
		child = spawn(bin, rest, {
			cwd: workspace,
			env: scrubEnv(deps.env || process.env, cfg, {IXIA_CHAT_URL: grant?.url || '', IXIA_CHAT_TOKEN: grant?.token || ''}),
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		})
	}
	catch {
		return fail('unavailable')
	}

	return await new Promise((resolve) => {
		let buf = '',
			err = '',
			reply = '',
			result = null,
			conversation = null,
			finished = false,
			killer = null,
			cancelled = false,
			timedOut = false
		let stop = () => {
			if (child.exitCode !== null || child.killed && killer) return
			try {
				child.kill('SIGTERM')
			}
			catch {}
			killer = setTimeout(() => {
				try {
					child.kill('SIGKILL')
				}
				catch {}
			}, 3000)
			killer.unref?.()
		}
		let onAbort = () => {
			cancelled = true
			stop()
		}
		signal?.addEventListener('abort', onAbort, {once: true})
		//agy has --print-timeout, this is in case it doesn't honour it
		let hard = setTimeout(() => {
			timedOut = true
			stop()
		}, cfg.timeoutMs + 15000)
		hard.unref?.()

		let line = (l) => {
			if (!l.trim()) return
			let e
			try {
				e = JSON.parse(l)
			}
			catch {
				return
			}
			if (e.event === 'init') conversation = e.conversation_id || conversation
			let u = e.step_update
			if (u) {
				conversation = u.conversation_id || conversation
				if (u.step_type === 'agent_response') {
					if (u.state === 'ACTIVE' && !u.text_delta) status(STATUS.think)
					if (u.state === 'DONE' && u.usage) {
						rounds++
					}
				}
				else if (u.step_type === 'tool' && u.state === 'ACTIVE' && /^(view_file|read_file|list_dir|grep_search|find_by_name)$/.test(u.tool_name || '')) {
					status('Looking things up')
				}
			}
			if (e.event === 'result') {
				result = e.result || {}
				conversation = result.conversation_id || conversation
				reply = typeof result.response === 'string' ? result.response : reply
			}
			if (e.event === 'error') err += ' ' + JSON.stringify(e).slice(0, 2000)
		}
		child.stdout.setEncoding?.('utf8')
		child.stdout.on('data', (d) => {
			buf += d
			let parts = buf.split('\n')
			buf = parts.pop()
			parts.forEach(line)
		})
		child.stderr.setEncoding?.('utf8')
		child.stderr.on('data', (d) => {
			if (err.length < 20000) err += d
		})

		let end = (code) => {
			if (finished) return
			finished = true
			clearTimeout(hard)
			if (killer) clearTimeout(killer)
			signal?.removeEventListener('abort', onAbort)
			if (buf) line(buf)
			let u = result?.usage || {}
			usage.input = Number(u.input_tokens) || 0
			usage.cached = Number(u.cache_read_tokens) || 0
			usage.output = Number(u.output_tokens) || 0
			usage.thinking = Number(u.thinking_tokens) || 0
			if (!rounds && result) rounds = Number(result.num_turns) || 1
			if (conversation) state.agyConversationId = conversation

			if (cancelled) return resolve(done('cancelled'))
			if (timedOut) return resolve(fail('timeout', {why: `no answer after ${Math.round((Date.now() - started) / 1000)} s`}))
			let ok = result && /^SUCCESS$/i.test(result.status || '') && code === 0
			if (!ok) {
				let words = `${err} ${result?.error || ''} ${result?.finished_reason || ''}`,
					kind = classify(words),
					why = whyOf(err, result, input.message, text)
				//A timeout well before ours is agy giving up on something else (reaching the model, starting the tools),
				//not the request taking too long, and saying "it took too long" there sends people the wrong way
				if (kind === 'timeout' && Date.now() - started < cfg.timeoutMs * 0.9) kind = 'stalled'
				console.warn(`interactives: agy run failed (${kind}, exit ${code}, after ${Math.round((Date.now() - started) / 1000)} s): ${why}`)
				if (kind === 'limit') return resolve(fail('limit', {resetAt: resetFrom(words), why}))
				return resolve(fail(kind, {why}))
			}
			reply = reply.trim()
			if (!reply) return resolve(fail(result?.denied_actions?.length || /denied|permission/i.test(err) ? 'unavailable' : 'empty'))
			emit({type: 'reply', text: reply})
			resolve(done('replied'))
		}
		child.on('error', () => {
			err += ' spawn failed'
			end(-1)
		})
		child.on('close', (code) => end(code))
	})
}

//---------------------------------------------------------------------------------------------------------------------
//The ixia-chat tools, as agy sees them through designer-antigravity-mcp.mjs and POST /api/designer/_mcp

const READS = {get_overview: STATUS.read, get_layers: STATUS.read, get_interactions: STATUS.read, get_variables: STATUS.read, get_selection: STATUS.read, list_notes: STATUS.read, export_project: STATUS.read, read_reference: 'Looking things up', validate: STATUS.check},
	WRITES = {edit: STATUS.build, upload_asset: STATUS.build, add_note: STATUS.build, add_graph_note: STATUS.build, edit_note: STATUS.build, remove_note: STATUS.build}

const BUILD_TOOL = {
	name: 'build',
	description: 'Build a blueprint in the open project with the editor\'s own kit: whole pages in the look of the open page, headings, text, lists, buttons, rows, native question cards with feedback and hints, variables, and behaviours written as plain sentences. The quickest and best way to make a page, a question or a set of them. The format is in the ixia-blueprint skill (.agents/skills/ixia-blueprint/SKILL.md). Returns what was built and any problems it left.',
	inputSchema: {type: 'object', properties: {blueprint: {type: 'object', description: 'The blueprint, as the ixia-blueprint skill describes it'}}, required: ['blueprint']},
}

//The edit tool's own description is 5 KB of syntax that would ride along with every turn. The agent gets the list of
//ops here and the full syntax from the ixia-edit-ops skill when it needs it
const shortEdit = (description) => {
	let ops = [...new Set([...String(description || '').matchAll(/(?:^|[;:.] |\(|, )([a-z][a-z_]+) \{/g)].map((m) => m[1]))]
	return `Change the open project: changes is a list of {op, ...} applied in order as one batch, reaching the live session at once (revision history keeps the before). Ops: ${ops.join(', ')}. Read the ixia-edit-ops skill (.agents/skills/ixia-edit-ops/SKILL.md) for every op's fields and ref/$ref batching before your first edit. explain is one line for the editor log.`
}

//The MCP bundle's tools, cut to the ones that stay inside the open project, with no project_id for the agent to fill in
const toolList = (tools) => [
	...tools.filter((t) => READS[t.name] || WRITES[t.name]).map((t) => {
		let schema = t.inputSchema || {type: 'object', properties: {}},
			{project_id, ...properties} = schema.properties || {}
		return {
			name: t.name,
			description: t.name === 'edit' ? shortEdit(t.description) : t.description,
			inputSchema: {type: 'object', properties, required: (schema.required || []).filter((k) => k !== 'project_id')},
		}
	}),
	BUILD_TOOL,
]

//What a build came to, in words for the model
const buildReport = (o) => [
	o.changed ? 'Built.' : 'Nothing changed.',
	o.notes?.length ? `Done:\n- ${o.notes.join('\n- ')}` : '',
	o.warnings?.length ? `Worth a look:\n- ${[...new Set(o.warnings)].join('\n- ')}` : '',
	o.problems?.length ? `Problems this left, fix them:\n- ${o.problems.slice(0, 20).join('\n- ')}` : '',
].filter(Boolean).join('\n\n')

const cut = (text, max) => text.length > max ? text.slice(0, max) + '\n...(cut to fit, ask for a smaller part)' : text

//One JSON-RPC message from agy, answered for the grant it came with. grant: {projectId, emit, beforeEdit, restore?,
//changed?, known?}. deps: tools (the MCP bundle's TOOLS), callTool(name, args) -> {error, text}, build(blueprint, known),
//limited() -> true when the caller is over the per minute limit. Null for a notification
const mcpHandler = async (grant, deps, msg) => {
	let reply = (result) => ({jsonrpc: '2.0', id: msg.id ?? null, result}),
		oops = (code, message) => ({jsonrpc: '2.0', id: msg.id ?? null, error: {code, message}})
	if (!msg || typeof msg.method !== 'string') return oops(-32600, 'Send one JSON-RPC request')
	if (msg.id === undefined || msg.id === null && msg.method.startsWith('notifications/')) return null

	if (msg.method === 'initialize') {
		return reply({protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-03-26', capabilities: {tools: {}}, serverInfo: {name: 'ixia-chat', version: '1'}})
	}
	if (msg.method === 'ping') return reply({})
	if (msg.method === 'tools/list') return reply({tools: toolList(deps.tools)})
	if (msg.method !== 'tools/call') return oops(-32601, `No method ${msg.method}`)

	let name = msg.params?.name,
		a = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {},
		text = (t, isError = false) => reply({content: [{type: 'text', text: cut(String(t), MAX_RESULT)}], ...(isError ? {isError: true} : {})})
	if (name !== 'build' && !READS[name] && !WRITES[name]) return text(`Error: there is no tool called ${name}.`, true)
	if (deps.limited?.()) return text('Error: too many requests just now. Wait a few seconds and try again.', true)

	let writes = !!WRITES[name] || name === 'build'
	//A restore point before the first change, so "Undo" has something to go back to. If one can't be saved nothing changes
	if (writes && !grant.restore) {
		try {
			grant.restore = await grant.beforeEdit()
		}
		catch (err) {
			console.warn('interactives: designer restore point failed', err?.message)
			return text('Error: Ixia could not save a copy of the project first, so nothing was changed. Stop and tell the designer to try again in a moment.', true)
		}
	}
	grant.emit({type: 'status', text: name === 'build' ? STATUS.build : READS[name] || WRITES[name]})

	let out
	try {
		if (name === 'build') {
			let o = await deps.build(a.blueprint && typeof a.blueprint === 'object' ? a.blueprint : {}, grant.known)
			grant.known ??= o.known
			out = {error: false, text: buildReport(o), changed: !!o.changed}
		}
		else {
			//whatever it says, the project is the open one
			out = await deps.callTool(name, {...a, project_id: grant.projectId})
			out.changed = writes && !out.error && !/^Nothing changed\.?$/.test(String(out.text).trim())
		}
	}
	catch (err) {
		out = {error: true, text: `Error: ${String(err?.message || err).slice(0, 300)}`}
	}
	if (out.changed) {
		grant.emit(grant.changed ? {type: 'touched'} : {type: 'changed', revision: grant.restore})
		grant.changed = true
	}
	return text(out.text, !!out.error)
}

//---------------------------------------------------------------------------------------------------------------------
//The allowance. `agy --print /usage --output-format json` says, per group of models, how much of the 5 hour window and
//the week is left and when each refreshes (checked 28 Nov 2026):
//command.data.groups[{name, buckets[{id: gemini-5h | gemini-weekly | 3p-5h | 3p-weekly, window: 5h | weekly,
//remaining_fraction, reset_time}]}]. A reset_time of 1970 is a window nobody has used yet

const groupFor = (cfg) => cfg.group || (/^(claude|gpt)/i.test(cfg.model || '') ? '3p' : 'gemini')

//The probe's answer, as {buckets, exhausted, resetAt}, or null when it isn't one
const parseUsage = (json, cfg, now = Date.now()) => {
	let groups = json?.command?.data?.groups
	if (!Array.isArray(groups)) return null
	let want = groupFor(cfg),
		buckets = groups.flatMap((g) => Array.isArray(g.buckets) ? g.buckets : []).filter((b) => typeof b.id === 'string' && b.id.startsWith(`${want}-`))
	if (!buckets.length) return null
	let low = buckets.filter((b) => Number(b.remaining_fraction) <= cfg.minQuota),
		reset = (b) => {
			let t = Date.parse(b.reset_time)
			return Number.isFinite(t) && t > now ? t : null
		}
	//weekly wins when both are out: it's the later one
	let governing = low.find((b) => b.window === 'weekly') || low[0]
	return {
		buckets: buckets.map((b) => ({id: b.id, window: b.window, left: Number(b.remaining_fraction), resetAt: reset(b)})),
		exhausted: low.length > 0,
		resetAt: governing ? reset(governing) || now + cfg.cooldownMs : null,
	}
}

//Keeps an eye on the allowance: asks on boot, every 10 minutes while idle and after each request, and when it's out sets
//a timer for when it refreshes. deps: cfg, spawn?, env?, now?, timers? ({setTimeout, clearTimeout, setInterval}),
//onChange?(status). A probe that fails leaves things as they were, except that the first one failing counts as
//available, so a box where agy is briefly slow doesn't lose Ask Ixia until the next look
const createQuotaMonitor = (deps) => {
	let cfg = deps.cfg,
		spawn = deps.spawn || childProcess.spawn,
		now = deps.now || Date.now,
		timers = deps.timers || {setTimeout, clearTimeout, setInterval, clearInterval},
		st = {exhausted: false, resetAt: null, buckets: [], checked: null, reason: null},
		reprobe = null,
		poll = null,
		running = null

	let set = (next) => {
		let was = st.exhausted
		st = {...st, ...next}
		if (was !== st.exhausted) deps.onChange?.({...st})
		if (reprobe) timers.clearTimeout(reprobe)
		reprobe = null
		if (st.exhausted && st.resetAt) {
			reprobe = timers.setTimeout(() => probe(), Math.max(1000, st.resetAt + 5000 - now()))
			reprobe?.unref?.()
		}
	}

	//One look at /usage. Resolves with the status either way
	let probe = () => running ||= new Promise((resolve) => {
		let out = '',
			child
		try {
			let [bin, rest] = command(cfg, ['--print', '/usage', '--output-format', 'json'])
			child = spawn(bin, rest, {cwd: deps.workspace || WORKSPACE, env: scrubEnv(deps.env || process.env, cfg), stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true})
		}
		catch {
			running = null
			return resolve({...st})
		}
		let t = timers.setTimeout(() => {
			try {
				child.kill('SIGKILL')
			}
			catch {}
		}, 30000)
		t?.unref?.()
		child.stdout.setEncoding?.('utf8')
		child.stdout.on('data', (d) => {
			if (out.length < 200000) out += d
		})
		let finish = () => {
			timers.clearTimeout(t)
			running = null
			let parsed = null
			try {
				parsed = parseUsage(JSON.parse(out), cfg, now())
			}
			catch {}
			if (parsed) set({exhausted: parsed.exhausted, resetAt: parsed.resetAt, buckets: parsed.buckets, checked: now(), reason: parsed.exhausted ? 'allocation' : null})
			//a marked-out state stays until a real answer says otherwise; nothing else to do
			resolve({...st})
		}
		child.on('error', finish)
		child.on('close', finish)
	})

	return {
		probe,
		start() {
			probe()
			poll = timers.setInterval(() => probe(), 10 * 60 * 1000)
			poll?.unref?.()
			return this
		},
		stop() {
			if (poll) timers.clearInterval(poll)
			if (reprobe) timers.clearTimeout(reprobe)
			poll = reprobe = null
		},
		//agy said it's out in the middle of a request: hide straight away, look again when it says (or after the cooldown)
		markExhausted(resetAt) {
			set({exhausted: true, resetAt: resetAt || now() + cfg.cooldownMs, reason: 'allocation'})
		},
		status: () => {
			//past the reset, and the re-probe hasn't answered yet: still out until it does
			return {...st}
		},
	}
}

module.exports = {whyOf, command, settings, sessionSettings, args, scrubEnv, prompt, classify, resetFrom, run, toolList, shortEdit, mcpHandler, parseUsage, createQuotaMonitor, groupFor, WORDS, WORKSPACE, SERVER, MAX_RESULT}
