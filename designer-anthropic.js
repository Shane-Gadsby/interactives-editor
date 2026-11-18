//Ask Ixia on Claude, straight from Anthropic (the user's choice, 18 Nov 2026: one company, one bill, no reseller in
//between). The tool loop is the one in designer-gemini.js, which talks in Gemini's shapes, so like designer-openrouter.js
//this is only a client that turns those into Anthropic's Messages API and back, through their own SDK.
//
//Anthropic says how many tokens a turn used, not what it cost, so the dollars for the daily budget and the ceiling for
//one request are worked out here from the price list below. Keep it in step with platform.claude.com's pricing page
const AnthropicSDK = require('@anthropic-ai/sdk')
const Anthropic = AnthropicSDK.default || AnthropicSDK
const {DesignerError} = require('./designer')
const {WORDS} = require('./designer-gemini')
const {DEFAULT_DAILY_USD, DEFAULT_REQUEST_USD, dollars} = require('./designer-openrouter')

//Chosen from the trial of 18 Nov 2026: nearly as good as Sonnet on the five briefs for under a cent a request
const DEFAULT_MODEL = 'claude-haiku-5-5',
	//US dollars per million tokens: fresh input, input written to the cache, input read back from it, output (Nov 2026).
	//Haiku's are for prompts up to 100,000 tokens, which ours stay well under
	PRICES = {
		'claude-haiku-5-5': {input: 0.10, write: 0.125, read: 0.01, output: 0.50},
		'claude-sonnet-5-5': {input: 2, write: 2.50, read: 0.10, output: 10},
		'claude-opus-5-5': {input: 4, write: 5, read: 0.20, output: 20},
	},
	//A model that isn't on the list is counted at the dearest, so the budget errs towards stopping early
	DEAREST = PRICES['claude-opus-5-5']

const settings = (env = process.env) => ({
	on: /^(on|1|true|yes)$/i.test(env.INTERACTIVES_DESIGNER || '') && !!env.ANTHROPIC_API_KEY,
	key: env.ANTHROPIC_API_KEY || '',
	model: env.INTERACTIVES_DESIGNER_MODEL || DEFAULT_MODEL,
	url: String(env.INTERACTIVES_ANTHROPIC_URL || '').replace(/\/+$/, ''),
	//low, medium or high: how much effort Claude puts in. Unset is the model's own default
	thinking: /^(low|medium|high)$/i.test(env.INTERACTIVES_DESIGNER_THINKING || '') ? env.INTERACTIVES_DESIGNER_THINKING.toLowerCase() : '',
	dailyUsd: dollars(env.INTERACTIVES_DESIGNER_DAILY_USD, DEFAULT_DAILY_USD),
	requestUsd: dollars(env.INTERACTIVES_DESIGNER_REQUEST_USD, DEFAULT_REQUEST_USD),
})

//What a turn cost, from what it says it used
const costOf = (model, u) => {
	let p = PRICES[model] || DEAREST
	return ((u.input_tokens || 0) * p.input + (u.cache_creation_input_tokens || 0) * p.write + (u.cache_read_input_tokens || 0) * p.read + (u.output_tokens || 0) * p.output) / 1e6
}

//The loop's history as Claude's messages. A model turn that came from here carries its blocks exactly as they arrived
//(raw), thinking included, and that is what goes back: Claude checks them. Every answer to the tools of one turn goes
//back in one message, which is what keeps it asking for several at once
const toMessages = (contents) => {
	let out = []
	for (let c of contents) {
		let parts = c.parts || []
		if (c.role === 'model') {
			if (c.raw) out.push({role: 'assistant', content: c.raw})
			else {
				let text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('')
				if (text) out.push({role: 'assistant', content: text})
			}
			continue
		}
		let blocks = []
		for (let p of parts) {
			if (p.functionResponse) {
				let r = p.functionResponse.response || {},
					failed = typeof r.error === 'string'
				blocks.push({type: 'tool_result', tool_use_id: p.functionResponse.id || '', content: failed ? r.error : typeof r.result === 'string' ? r.result : JSON.stringify(r), ...(failed ? {is_error: true} : {})})
			}
			else if (typeof p.text === 'string' && p.text) blocks.push({type: 'text', text: p.text})
		}
		if (blocks.length) out.push({role: 'user', content: blocks})
	}
	return out
}

//What came back, as the loop's parts. Thinking stays out of them (it's kept in raw, for sending back)
const toParts = (content) => {
	let parts = []
	for (let b of content || []) {
		if (b.type === 'text' && b.text) parts.push({text: b.text})
		else if (b.type === 'tool_use') parts.push({functionCall: {name: b.name, args: b.input && typeof b.input === 'object' ? b.input : {}, id: b.id}})
	}
	return parts
}

//fetcher is for the tests. The SDK tries again by itself when Anthropic is busy or says slow down (twice)
const client = (cfg, fetcher) => {
	let api = new Anthropic({apiKey: cfg.key, maxRetries: 2, timeout: 240000, ...(cfg.url ? {baseURL: cfg.url} : {}), ...(fetcher ? {fetch: fetcher} : {})})

	return {
		async generate({system, contents, tools}, signal) {
			let res
			try {
				res = await api.messages.create({
					model: cfg.model,
					max_tokens: 16000,
					...(system ? {system} : {}),
					messages: toMessages(contents),
					...(tools?.length ? {tools: tools.map((t) => ({name: t.name, description: t.description, input_schema: t.parametersJsonSchema || {type: 'object', properties: {}}}))} : {}),
					...(cfg.thinking ? {output_config: {effort: cfg.thinking}} : {}),
					//the instructions and tools are the same every step, so they are read back at a tenth of the price
					cache_control: {type: 'ephemeral'},
				}, {signal})
			}
			catch (err) {
				if (signal?.aborted) throw err
				//Status and kind only, never the message: it could carry the person's words back
				console.warn(`interactives: anthropic answered ${err?.status || 'no answer'} ${err?.type || ''}`)
				//no credit left on the account is a limit to the person asking, the same as being told to slow down
				if (err instanceof Anthropic.RateLimitError || err?.status === 402 || err?.type === 'billing_error') throw new DesignerError('limit', WORDS.limit)
				if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new DesignerError('forbidden', WORDS.forbidden)
				if (err instanceof Anthropic.APIError && err.status === 413) throw new DesignerError('tooLong', WORDS.tooLong)
				throw new DesignerError('unavailable', WORDS.unavailable)
			}

			if (res.stop_reason === 'refusal') throw new DesignerError('blocked', WORDS.blocked)
			let parts = toParts(res.content),
				u = res.usage || {}
			return {
				parts,
				content: {role: 'model', parts, raw: res.content},
				finish: res.stop_reason || '',
				usage: {
					//everything it read, fresh or not, to match what the other clients report
					input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
					cached: u.cache_read_input_tokens || 0,
					output: u.output_tokens || 0,
					cost: costOf(cfg.model, u),
					host: 'Anthropic',
				},
			}
		},
	}
}

module.exports = {settings, client, toMessages, toParts, costOf, PRICES, DEFAULT_MODEL}
