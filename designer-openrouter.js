//Ask Ixia on any model OpenRouter sells (Claude, GPT, DeepSeek, GLM and the rest) behind one key. The tool loop is the
//one in designer-gemini.js, which talks in Gemini's shapes (parts, functionCall, functionResponse), so this is only a
//client that turns those into the chat completions shape everyone else uses and back again.
//
//Where a request may go matters as much as which model: INTERACTIVES_DESIGNER_HOSTS names the companies allowed to run
//it (the open models are hosted all over, and staff content shouldn't go to every one of them), and data_collection is
//always refused, so a host that keeps or learns from what it's sent never gets it
const {DesignerError} = require('./designer')
const {WORDS} = require('./designer-gemini')

const DEFAULT_URL = 'https://openrouter.ai/api',
	//Chosen from the trial of 18 Nov 2026: nearly as good as Sonnet on the five briefs for under a cent a request
	DEFAULT_MODEL = 'anthropic/claude-haiku-5.5',
	//The most everyone's requests together may cost in a day, and the most one request may, in US dollars. The account is
	//prepaid as well, so the real ceiling is the credit on it, but these stop a bad day short of that
	DEFAULT_DAILY_USD = 2,
	DEFAULT_REQUEST_USD = 0.25

//A dollar limit from the environment. 0, off or none is no limit, anything unreadable is the default
const dollars = (v, fallback) => /^(0|off|no|none)$/i.test(v || '') ? 0 : v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback

const settings = (env = process.env) => ({
	on: /^(on|1|true|yes)$/i.test(env.INTERACTIVES_DESIGNER || '') && !!env.OPENROUTER_API_KEY,
	key: env.OPENROUTER_API_KEY || '',
	model: env.INTERACTIVES_DESIGNER_MODEL || DEFAULT_MODEL,
	url: String(env.INTERACTIVES_OPENROUTER_URL || DEFAULT_URL).replace(/\/+$/, ''),
	//low, medium or high. Unset is the model's own default
	thinking: /^(minimal|low|medium|high)$/i.test(env.INTERACTIVES_DESIGNER_THINKING || '') ? env.INTERACTIVES_DESIGNER_THINKING.toLowerCase() : '',
	//The only hosts that may run it, by OpenRouter's names ("DeepInfra,Together"). Empty is any host that refuses data collection
	hosts: String(env.INTERACTIVES_DESIGNER_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
	dailyUsd: dollars(env.INTERACTIVES_DESIGNER_DAILY_USD, DEFAULT_DAILY_USD),
	requestUsd: dollars(env.INTERACTIVES_DESIGNER_REQUEST_USD, DEFAULT_REQUEST_USD),
})

const wait = (ms, signal) => new Promise((resolve) => {
	let t = setTimeout(resolve, ms)
	signal?.addEventListener('abort', () => {
		clearTimeout(t)
		resolve()
	}, {once: true})
})

//The loop's history as chat messages. A model turn that came from here carries the message exactly as it arrived (raw),
//and that is what goes back: some models check the reasoning they sent with a tool call
const toMessages = (system, contents) => {
	let out = system ? [{role: 'system', content: system}] : []
	for (let c of contents) {
		let parts = c.parts || []
		if (c.role === 'model') {
			if (c.raw) {
				out.push(c.raw)
				continue
			}
			let calls = parts.filter((p) => p.functionCall)
			out.push({
				role: 'assistant',
				content: parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('') || null,
				...(calls.length ? {tool_calls: calls.map((p, i) => ({id: p.functionCall.id || `call_${i}`, type: 'function', function: {name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {})}}))} : {}),
			})
			continue
		}
		let answers = parts.filter((p) => p.functionResponse)
		for (let p of answers) {
			let r = p.functionResponse.response || {}
			out.push({role: 'tool', tool_call_id: p.functionResponse.id || '', content: typeof r.error === 'string' ? r.error : typeof r.result === 'string' ? r.result : JSON.stringify(r)})
		}
		let text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('')
		if (text || !answers.length) out.push({role: 'user', content: text})
	}
	return out
}

//What came back, as the loop's parts. Arguments that aren't JSON become an empty call, which the tool then refuses in
//words the model can read, better than dropping the turn
const toParts = (message) => {
	let parts = []
	if (typeof message?.content === 'string' && message.content) parts.push({text: message.content})
	for (let call of message?.tool_calls || []) {
		let args = {}
		try {
			args = JSON.parse(call.function?.arguments || '{}')
		}
		catch {
			args = {}
		}
		if (call.function?.name) parts.push({functionCall: {name: call.function.name, args: args && typeof args === 'object' ? args : {}, id: call.id}})
	}
	return parts
}

const client = (cfg, fetcher = (...a) => fetch(...a), pause = wait) => {
	let once = async (body, signal) => {
		let res
		try {
			res = await fetcher(`${cfg.url}/v1/chat/completions`, {
				method: 'POST',
				headers: {Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', 'X-Title': 'Ixia'},
				body: JSON.stringify(body),
				signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(240000)]) : AbortSignal.timeout(240000),
			})
		}
		catch (err) {
			if (signal?.aborted) throw err
			return {status: 0}
		}
		if (!res.ok) {
			//Status only, never the body: it could carry the person's words back
			console.warn(`interactives: openrouter answered ${res.status}`)
			return {status: res.status}
		}
		let data = await res.json().catch(() => null)
		//a host that fell over mid-answer comes back as a 200 with an error inside
		if (data?.error && !data.choices?.length) {
			console.warn(`interactives: openrouter answered an error ${data.error.code || ''}`)
			return {status: Number(data.error.code) || 502}
		}
		return {status: 200, data}
	}

	return {
		async generate({system, contents, tools}, signal) {
			let body = {
					model: cfg.model,
					messages: toMessages(system, contents),
					...(tools?.length ? {tools: tools.map((t) => ({type: 'function', function: {name: t.name, description: t.description, parameters: t.parametersJsonSchema || {type: 'object', properties: {}}}}))} : {}),
					...(cfg.thinking ? {reasoning: {effort: cfg.thinking}} : {}),
					provider: {data_collection: 'deny', ...(cfg.hosts?.length ? {only: cfg.hosts} : {})},
					//Claude only reads the opening again cheaply when asked to (the others do it by themselves). Without this a
					//six step request paid full price for 290,000 tokens that were nearly all the same (18 Nov)
					...(/^~?anthropic\//.test(cfg.model) ? {cache_control: {type: 'ephemeral'}} : {}),
					usage: {include: true},
				},
				out = await once(body, signal)
			if ([0, 408, 429, 500, 502, 503, 504, 529].includes(out.status) && !signal?.aborted) {
				await pause(out.status === 429 ? 15000 : 3000, signal)
				if (signal?.aborted) throw new Error('aborted')
				out = await once(body, signal)
			}
			if (out.status !== 200) {
				//402 is the account out of credit, which to the person is the same as a limit
				let kind = {429: 'limit', 402: 'limit', 413: 'tooLong', 401: 'forbidden', 403: 'forbidden'}[out.status] || 'unavailable'
				throw new DesignerError(kind, WORDS[kind])
			}

			let d = out.data,
				c = d?.choices?.[0]
			if (c?.finish_reason === 'content_filter') throw new DesignerError('blocked', WORDS.blocked)
			if (!c?.message) throw new DesignerError('empty', WORDS.empty)
			let parts = toParts(c.message),
				u = d.usage || {}
			return {
				parts,
				content: {role: 'model', parts, raw: c.message},
				finish: c.finish_reason || '',
				//what this turn used, for the audit row. cost is in US dollars as OpenRouter billed it
				usage: {input: u.prompt_tokens || 0, cached: u.prompt_tokens_details?.cached_tokens || 0, output: u.completion_tokens || 0, cost: typeof u.cost === 'number' ? u.cost : 0, host: d.provider || ''},
			}
		},
	}
}

module.exports = {settings, client, toMessages, toParts, DEFAULT_MODEL, DEFAULT_DAILY_USD, DEFAULT_REQUEST_USD}
