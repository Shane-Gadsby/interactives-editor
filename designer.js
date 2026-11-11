//The Activity Designer: a Cogniti agent (UniSQ's AI platform) that builds in the open project. Cogniti caps how many messages
//a person can send an hour (not tokens), and the whole pilot shares one token, so this spends as few as it can: one message
//holds everything the agent needs (a short spec, the open project, the request) and it answers with ONE blueprint, a small
//JSON plan. We build that locally with the editor's own code (the question kit, Describe it, the page's own look), check it
//ourselves, and only go back to the agent, once or twice at most, when something real is still wrong.
//
//Nothing in here talks to the editor or the database, index.js passes in everything it needs, so the tests can drive the
//whole thing with a pretend Cogniti. The token (COGNITI_TOKEN, or a person's own) never leaves this server.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_AGENT = '6af3c21c0eba26d21bfa2427',
	DEFAULT_URL = 'https://cogniti.unisq.edu.au',
	//One to ask, and up to two more to put right what is still wrong. Past this it stops and says so
	MAX_MESSAGES = 3,
	//Each piece of what the agent is told about the project is cut to fit
	CONTEXT_BUDGET = 17000,
	DEFAULT_PER_HOUR = 6

//The agent, address and token, and whether the button shows at all. INTERACTIVES_DESIGNER=off hides it even with a token
const settings = (env = process.env) => ({
	on: !/^(off|0|false|no)$/i.test(env.INTERACTIVES_DESIGNER || '') && !!env.COGNITI_TOKEN,
	token: env.COGNITI_TOKEN || '',
	agent: env.INTERACTIVES_DESIGNER_AGENT || DEFAULT_AGENT,
	url: String(env.INTERACTIVES_COGNITI_URL || DEFAULT_URL).replace(/\/+$/, ''),
	//Requests a person may make an hour on the shared token. 0 (or off) is no limit
	perHour: /^(off|no|none)$/i.test(env.INTERACTIVES_DESIGNER_PER_HOUR || '') ? 0 : env.INTERACTIVES_DESIGNER_PER_HOUR !== undefined && env.INTERACTIVES_DESIGNER_PER_HOUR !== '' && Number.isFinite(Number(env.INTERACTIVES_DESIGNER_PER_HOUR)) ? Math.max(0, Math.floor(Number(env.INTERACTIVES_DESIGNER_PER_HOUR))) : DEFAULT_PER_HOUR,
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
	limitOwn: 'Your own Cogniti allowance has reached its hourly limit. Try again in a little while.',
	blocked: "That was blocked by UniSQ's content safety checks. Try asking in different words.",
	tooLong: 'This chat has got too long for the Activity Designer. Start a new chat and ask again.',
	forbidden: "The Activity Designer isn't available right now. If it keeps happening, tell the Toolbox team.",
	forbiddenOwn: "Cogniti didn't accept your own token. It may have ended, or the Activity Designer may not be shared with you yet. Check it in Preferences, or remove it to use the shared allowance.",
	unavailable: 'The Activity Designer could not be reached. Try again in a minute.',
	empty: "The Activity Designer didn't send anything back. Try again.",
}

//The little client for Cogniti's chat api. Undocumented, found in its own chat page: a conversation is made first, then
//each message goes with the whole history and the answer streams back as lines of {"content":"...","success":true}
//cfg.own: it's a person's own token, so a refusal means something different to them
const cogniti = (cfg, fetcher = (...a) => fetch(...a)) => {
	let call = async (path, body, signal, method = 'POST') => {
		let res
		try {
			res = await fetcher(cfg.url + path, {
				method,
				headers: {Authorization: `Bearer ${cfg.token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
				...(body ? {body: JSON.stringify(body)} : {}),
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
			throw new DesignerError(kind, cfg.own && WORDS[kind + 'Own'] ? WORDS[kind + 'Own'] : WORDS[kind])
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

		//Does this token get in, and can it chat with the Activity Designer? Asked once, when a person adds their own.
		//The list of agents is what the token's owner can see; can_chat is false (or the agent missing) when it isn't shared with them
		async checkAccess(signal) {
			let res
			try {
				res = await fetcher(cfg.url + '/api/v1/agents/', {headers: {Authorization: `Bearer ${cfg.token}`}, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)})
			}
			catch {
				return {ok: false, why: 'unreachable'}
			}
			if (res.status === 401 || res.status === 403) return {ok: false, why: 'refused'}
			if (!res.ok) return {ok: false, why: 'unreachable'}
			let list = await res.json().catch(() => null)
			if (!Array.isArray(list)) list = list?.agents || list?.results || null
			if (!Array.isArray(list)) return {ok: false, why: 'unreachable'}
			let mine = list.find((a) => [a?.id, a?._id, a?.agent_id].includes(cfg.agent))
			if (!mine || mine.can_chat === false) return {ok: false, why: 'notShared'}
			return {ok: true}
		},
	}
}

//---------------------------------------------------------------------------------------------------------------------
//A person's own token, kept encrypted

//The key for sealing tokens: INTERACTIVES_SECRET_KEY, or one made once and kept in storage like the rooms secret
let keyCache = null
const secretKey = (storageDir, env = process.env) => {
	if (env.INTERACTIVES_SECRET_KEY) return crypto.createHash('sha256').update(String(env.INTERACTIVES_SECRET_KEY)).digest()
	if (keyCache && keyCache.dir === storageDir) return keyCache.key
	let file = path.join(storageDir, '.designer-key'),
		secret = ''
	try {
		secret = fs.readFileSync(file, 'utf8').trim()
	}
	catch (e) {
	}
	if (secret.length < 32) {
		secret = crypto.randomBytes(32).toString('hex')
		try {
			fs.writeFileSync(file, secret, {mode: 0o600})
		}
		catch (e) {
			console.warn(`interactives: could not keep the Activity Designer key in ${file}, tokens people added will not open after a restart`, e.message)
		}
	}
	keyCache = {dir: storageDir, key: crypto.createHash('sha256').update(secret).digest()}
	return keyCache.key
}

//AES-256-GCM, with the person's name as associated data so a sealed token can't be moved to someone else's row
const sealToken = (token, username, key) => {
	let iv = crypto.randomBytes(12),
		c = crypto.createCipheriv('aes-256-gcm', key, iv)
	c.setAAD(Buffer.from(String(username)))
	let data = Buffer.concat([c.update(String(token), 'utf8'), c.final()])
	return {iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64')}
}

//The token back, or null when the row isn't one of ours, is for someone else, or the key changed
const openToken = (row, username, key) => {
	try {
		let d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv, 'base64'))
		d.setAAD(Buffer.from(String(username)))
		d.setAuthTag(Buffer.from(row.tag, 'base64'))
		return Buffer.concat([d.update(Buffer.from(row.data, 'base64')), d.final()]).toString('utf8')
	}
	catch {
		return null
	}
}

//---------------------------------------------------------------------------------------------------------------------
//A fair share of the shared token

//Requests per person in the last hour (a sliding window, in memory: a restart gives everyone a fresh hour, which is fine)
const quota = (perHour, now = () => Date.now()) => {
	let used = new Map(),
		HOUR = 60 * 60 * 1000,
		live = (who) => {
			let t = now(),
				list = (used.get(who) || []).filter((x) => t - x < HOUR)
			if (list.length) used.set(who, list)
			else used.delete(who)
			return list
		}
	return {
		//{limit, left, resetsIn (seconds until the oldest of them stops counting)}, or null when there's no limit
		status(who) {
			if (!perHour) return null
			let list = live(who)
			return {limit: perHour, left: Math.max(0, perHour - list.length), resetsIn: list.length ? Math.max(1, Math.ceil((list[0] + HOUR - now()) / 1000)) : 0}
		},
		//Takes one. False when they've none left
		take(who) {
			if (!perHour) return true
			let list = live(who)
			if (list.length >= perHour) return false
			list.push(now())
			used.set(who, list)
			return true
		},
		//A request that never got a message through gives it back
		refund(who) {
			let list = live(who)
			if (list.length) {
				list.pop()
				if (list.length) used.set(who, list)
				else used.delete(who)
			}
		},
	}
}

//---------------------------------------------------------------------------------------------------------------------
//Reading the agent

const BLUEPRINT_KEYS = ['pages', 'variables', 'behaviours', 'raw']

//The agent's reply as a blueprint and the words that go with it. null when it's plain words (finished, or asking something).
//A block that doesn't parse comes back as {error} so the agent can be told and have another go
const parseBlueprint = (reply) => {
	let m = /```blueprint\s*([\s\S]*?)```/i.exec(reply)
	//a block marked json that holds a blueprint is one too
	if (!m) {
		let j = /```json\s*([\s\S]*?)```/i.exec(reply)
		if (j && BLUEPRINT_KEYS.some((k) => new RegExp(`"${k}"\\s*:`).test(j[1]))) m = j
	}
	if (!m) return null
	let words = (reply.slice(0, m.index) + reply.slice(m.index + m[0].length)).trim(),
		bp
	try {
		bp = JSON.parse(m[1])
	}
	catch (err) {
		return {error: `That blueprint was not valid JSON (${String(err.message).slice(0, 80)}). Send it again as one JSON object in a blueprint block.`, words}
	}
	if (!bp || typeof bp !== 'object' || Array.isArray(bp)) return {error: 'That blueprint was not a JSON object. Send one JSON object in a blueprint block.', words}
	return {blueprint: bp, words}
}

//What the panel says while it works. Plain words, never a tool name
const STATUS = {read: 'Reading the project', think: 'Thinking it through', build: 'Building it in your project', check: 'Checking my work'}

const cut = (text, max) => text.length > max ? text.slice(0, max) + '\n...(cut to fit)' : text

let specCache = null
//The spec every request carries: the blueprint format (designer-spec.txt) and, for the rare "raw" part, what the edit tool's
//changes can say. extra is that second part, built from the editor's own tool description so it never drifts
const buildSpec = (extra = '') => {
	specCache ||= fs.readFileSync(path.join(__dirname, 'designer-spec.txt'), 'utf8').trim()
	return specCache + (extra ? `\n\n# Raw changes (the last resort)\nEach item of "raw" is one change from this list, written as the tool describes:\n${extra}` : '')
}

//What good looks like (agent-docs/playbook.md): learning design, question writing, accessibility, voice. It rides along
//with every request instead of sitting in the Cogniti agent's Knowledge, which wouldn't keep it (11 Nov), and this way it
//deploys with the editor. The cap counts messages, not their size, so it costs nothing there
let playbookCache = null
const playbook = () => {
	if (playbookCache === null) {
		try {
			playbookCache = fs.readFileSync(path.join(__dirname, 'agent-docs', 'playbook.md'), 'utf8').trim()
		} catch {
			playbookCache = ''
		}
	}
	return playbookCache
}

//One message holds everything: the spec, how to make it good, where we are, what's wanted
const requestMessage = ({spec, projectId, projectName, firstName, context, message}) =>
	`# Blueprint spec\n${spec}\n\n` + (playbook() ? `# Playbook\nApply this to everything you make.\n\n${playbook().replace(/^# .*\n+/, '')}\n\n` : '') + `# Open project\nid ${projectId}\nname ${JSON.stringify(projectName)}\n\n${context}\n` +
	(firstName ? `\n# Designer\nTheir first name is ${firstName}.\n` : '') +
	`\n# Request\n${message}`

//Only this when the agent has to be told what's still wrong
const problemsMessage = (problems) =>
	'# Problems\nThe editor built your blueprint, but these are still wrong:\n' + problems.slice(0, 12).map((x) => `- ${x}`).join('\n') +
	'\n\nReply with ONE more blueprint that fixes only these. What you already sent is built, so don\'t repeat it: use the names of the pages and layers that are in the project now (adding to a page puts new content below what is there; "behaviours" attaches a phrase to a layer by name). If one of them can\'t be fixed, say so in plain words after the block.'

//The words the designer is shown when everything went through: the agent's own summary, then anything worth a mention
const finalWords = (words, outcome) => {
	let text = words.trim()
	if (!text) text = outcome.notes.length ? `Done. ${outcome.notes.slice(0, 6).join('. ')}.` : 'Nothing needed changing.'
	if (outcome.warnings.length) text += `\n\nWorth a look: ${[...new Set(outcome.warnings)].slice(0, 4).join('. ')}.`
	return text
}

//One request from the person: one message to the agent, a local build, and at most two more messages if real problems are left.
//state is the conversation so far ({conversation, history}), mutated as it goes. Returns {outcome, rounds, changed}; every way
//out has told the panel through emit. rounds is how many messages went to Cogniti
//deps: cogniti, spec, context() -> text about the open project, build(blueprint, known) -> {changed, notes, warnings, problems, known},
//beforeEdit() -> restore point id, emit(event), signal
const run = async (deps, input) => {
	let {cogniti: ai, spec, context, build, beforeEdit, emit, signal} = deps,
		{projectId, projectName, firstName, message, state} = input,
		rounds = 0,
		changed = false,
		restore = null,
		done = (outcome) => ({outcome, rounds, changed}),
		fail = (text, outcome) => {
			emit({type: 'error', text, kind: outcome})
			return done(outcome)
		}

	try {
		//Long chats get slower every message (the whole history goes with each one), so a very long one starts again
		if (state.history.length > 40) {
			state.conversation = null
			state.history = []
		}

		emit({type: 'status', text: STATUS.read})
		let around = ''
		try {
			around = cut((await context()) || '', CONTEXT_BUDGET)
		}
		catch (err) {
			return fail(`The Activity Designer could not open the project (${String(err.message || err).slice(0, 120)}).`, 'error')
		}

		if (!state.conversation) state.conversation = await ai.newConversation(signal)

		let text = requestMessage({spec, projectId, projectName, firstName, context: around, message}),
			//what goes in the chat's history for the message: the request without the project, which is stale next time
			slim = `# Request\n${message}`

		//Across the messages of this request: what the agent said, and what was built, for the one reply at the end
		let said = [],
			built = {notes: [], warnings: []},
			//What was already wrong before the first build, so only what this request caused is ever sent back
			known = null

		while (rounds < MAX_MESSAGES) {
			if (signal?.aborted) return done('cancelled')
			emit({type: 'status', text: rounds ? STATUS.check : STATUS.think})
			let reply = await ai.send(state.conversation, text, state.history, signal)
			rounds++
			state.history.push({role: 'user', content: slim, uuid: crypto.randomUUID()}, {role: 'ai', content: reply, uuid: crypto.randomUUID()})

			let parsed = parseBlueprint(reply)
			if (!parsed) {
				//plain words: finished, asking something, or saying a leftover can't be done. Whatever was built before it is still reported
				emit({type: 'reply', text: [...said, reply.trim()].join('\n\n')})
				return done('replied')
			}

			let problems = [],
				outcome = null
			if (parsed.words) said.push(parsed.words)
			if (parsed.error) problems.push(parsed.error)
			else {
				if (signal?.aborted) return done('cancelled')
				//A restore point before the first change, so "Undo" has something to go back to. If one can't be saved nothing changes
				if (!restore) {
					try {
						restore = await beforeEdit()
					}
					catch (err) {
						console.warn('interactives: designer restore point failed', err?.message)
						return fail("The Activity Designer could not save a copy of your project first, so it stopped before changing anything. Try again in a moment.", 'error')
					}
				}
				emit({type: 'status', text: STATUS.build})
				outcome = await build(parsed.blueprint, known)
				known ??= outcome.known
				if (outcome.changed && !changed) {
					changed = true
					emit({type: 'changed', revision: restore})
				}
				problems = outcome.problems
				built.notes.push(...outcome.notes)
				built.warnings.push(...outcome.warnings)
			}

			if (!problems.length) {
				emit({type: 'reply', text: finalWords(said.join('\n\n'), built)})
				return done('replied')
			}
			if (rounds >= MAX_MESSAGES) {
				//Out of messages: say what's done and what's left, in the designer's words
				let left = problems.slice(0, 5).join('. ')
				emit({type: 'reply', text: `${finalWords(said.join('\n\n'), built)}\n\nI couldn't finish everything. Still to sort out: ${left}.`})
				return done('replied')
			}
			text = problemsMessage(problems)
			slim = '# Problems the editor found (sent back to the agent)'
		}
		return done('replied')
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

module.exports = {settings, cogniti, run, parseBlueprint, buildSpec, requestMessage, problemsMessage, secretKey, sealToken, openToken, quota, DesignerError, WORDS, MAX_MESSAGES, STATUS}
