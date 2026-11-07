//LTI 1.3 for the Interactives editor, so a project can be launched from any LMS and not just StudyDesk's LTI 1.0.
//Self-contained on purpose: index.js mounts the three routers this hands back and asks it who a launched learner is.
//
//What's in here
//	/lti13/login    OIDC third party login initiation (the platform calls this first, we send the browser back to it)
//	/lti13/launch   the platform posts its id_token here: LtiResourceLinkRequest opens a project, LtiDeepLinkingRequest
//	                opens a picker that answers with an LtiDeepLinkingResponse
//	/lti13/pick     the picker's form
//	/lti13/jwks     our public keys
//	/api/lti13      power users only: platforms, who is linked to which editor account, our keys
//
//Grade passback (Assignment and Grade Services, scores only) is `grade.send` below: index.js calls it when a project marked on the
//server finishes. It posts to the line item the launch named, so a launch without one (the platform has no grade set up for the
//link) sends nothing.
//
//Crypto is node's own (RS256 only), no jose or jsonwebtoken. An LTI platform has to offer RS256 and nothing else is
//accepted, so the whole JWT surface is the small verify/sign pair below, with the alg pinned and no alg:none, no HMAC
//with the public key as the secret, and no keys picked out of the token itself (no jku/x5u/jwk headers are read).
const crypto = require('crypto'),
	generateKeyPair = require('util').promisify(crypto.generateKeyPair)

const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/',
	DL = 'https://purl.imsglobal.org/spec/lti-dl/claim/',
	AGS = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
	SCOPE_SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
	STATE_TTL = 10 * 60 * 1000,
	SESSION_TTL = 8 * 60 * 60 * 1000,
	PICK_TTL = 30 * 60 * 1000,
	LEEWAY = 60,
	JWKS_FRESH = 10 * 60 * 1000,
	JWKS_RETRY = 60 * 1000,
	TOKEN_RE = /^[\w-]{16,64}$/,
	SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

class LtiError extends Error {
	constructor(status, why, detail) {
		super(why)
		this.status = status
		this.detail = detail
	}
}

const b64 = (v) => Buffer.from(v).toString('base64url'),
	isString = (v, max = 1000) => typeof v === 'string' && v.length > 0 && v.length <= max,
	text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '',
	esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])),
	safeEqual = (a, b) => {
		let x = Buffer.from(String(a)), y = Buffer.from(String(b))
		return x.length === y.length && crypto.timingSafeEqual(x, y)
	},
	nowSeconds = () => Math.floor(Date.now() / 1000),

	//JWT, RS256 only
	parseJwt = (token) => {
		if (typeof token !== 'string' || token.length > 20000) {
			throw new LtiError(400, 'The token is missing or too big')
		}

		let parts = token.split('.')

		if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
			throw new LtiError(400, 'The token is not a signed JWT')
		}

		try {
			let header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
				payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))

			if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(header) || Array.isArray(payload)) {
				throw new Error('not objects')
			}

			return {header, payload, signed: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], 'base64url')}
		}
		catch (e) {
			throw new LtiError(400, 'The token is not a signed JWT')
		}
	},

	signJwt = (payload, kid, privateKey) => {
		let head = b64(JSON.stringify({alg: 'RS256', typ: 'JWT', kid})),
			body = b64(JSON.stringify(payload)),
			sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey)

		return `${head}.${body}.${b64(sig)}`
	},

	//A platform's JWK as a key we'd accept: RSA, 2048 bits or more, and not marked for some other use or algorithm
	jwkToKey = (jwk) => {
		try {
			if (!jwk || jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig') || (jwk.alg && jwk.alg !== 'RS256')) {
				return null
			}

			let key = crypto.createPublicKey({key: {kty: 'RSA', n: jwk.n, e: jwk.e}, format: 'jwk'})
			return key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails.modulusLength >= 2048 ? key : null
		}
		catch (e) {
			return null
		}
	},

	//Throws unless the signature checks out against the key the platform's JWKS gives for the token's kid
	verifySignature = async (jwt, keyFor) => {
		if (jwt.header.alg !== 'RS256') {
			throw new LtiError(401, 'The token is not signed with RS256')
		}

		if (jwt.header.crit !== undefined || jwt.header.jku !== undefined || jwt.header.x5u !== undefined || jwt.header.jwk !== undefined) {
			throw new LtiError(401, 'The token header asks for something that is not supported')
		}

		let key = await keyFor(typeof jwt.header.kid === 'string' ? jwt.header.kid : null)

		if (!key) {
			throw new LtiError(401, 'No key of the platform matches the token')
		}

		if (!crypto.verify('RSA-SHA256', Buffer.from(jwt.signed), key, jwt.signature)) {
			throw new LtiError(401, 'The token signature is wrong')
		}
	},

	httpsURL = (v, allowHttp) => {
		try {
			let u = new URL(v)
			return (u.protocol === 'https:' || (allowHttp && u.protocol === 'http:')) && !u.username && !u.password ? u.toString() : null
		}
		catch (e) {
			return null
		}
	},

	cookieFor = (state) => `ixlti13_${crypto.createHash('sha256').update(state).digest('hex').slice(0, 24)}`,

	readCookie = (req, name) => {
		for (let part of String(req.get('cookie') || '').split(';')) {
			let i = part.indexOf('=')

			if (i > 0 && part.slice(0, i).trim() === name) {
				return part.slice(i + 1).trim()
			}
		}

		return null
	}

//deps: express, isPower(req), whoIs(req), clientIP(req), allowHttp (tests and dev only)
module.exports = (deps) => {
	let {express} = deps,
		allowHttp = deps.allowHttp ?? process.env.LTI13_ALLOW_HTTP === '1',
		publicURL = () => (deps.publicURL ?? process.env.INTERACTIVES_PUBLIC_URL ?? '').replace(/\/+$/, ''),
		col = null,
		projects = null,
		envPlatforms = [],
		jwksCache = new Map(),
		keyObjects = new Map(),
		hits = new Map()

	//Platforms registered in the environment (LTI13_PLATFORMS, a JSON array) count too, and can't be edited from the api
	try {
		let raw = deps.platforms ?? process.env.LTI13_PLATFORMS

		if (raw) {
			envPlatforms = (typeof raw === 'string' ? JSON.parse(raw) : raw).map((p) => ({...p, _id: p.id, fromEnv: true})).filter((p) => SLUG_RE.test(p._id || ''))
		}
	}
	catch (e) {
		console.warn('interactives lti13: LTI13_PLATFORMS is not valid JSON, ignored')
	}

	//Where we are, as the platform's admin needs to see it. The base is the folder the router is mounted in (/interactives)
	let origin = (req) => publicURL() || `${String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim()}://${req.get('host')}`,
		appBase = (req) => req.baseUrl.replace(/\/lti13$/, '').replace(/\/api$/, '').replace(/\/api\/lti13$/, ''),
		urls = (req) => {
			let root = `${origin(req)}${appBase(req)}`
			return {login: `${root}/lti13/login`, launch: `${root}/lti13/launch`, jwks: `${root}/lti13/jwks`, deepLinking: `${root}/lti13/launch`, redirect: `${root}/lti13/launch`}
		},

		//Fixed window per address, only to stop the unauthenticated routes being a free way to fill the state collection
		limited = (req) => {
			let ip = deps.clientIP ? deps.clientIP(req) : req.ip,
				now = Date.now(),
				h = hits.get(ip)

			if (!h || h.until < now) {
				if (hits.size > 5000) {
					hits.clear()
				}

				h = {until: now + 60 * 1000, n: 0}
				hits.set(ip, h)
			}

			return ++h.n > 300
		},

		fail = (res, err, what) => {
			let known = err instanceof LtiError

			if (!known) {
				console.trace(`interactives lti13 ${what} error`, err)
			}
			else {
				console.warn(`interactives lti13 ${what} refused: ${err.message}${err.detail ? ` (${JSON.stringify(err.detail)})` : ''}`)
			}

			res.status(known ? err.status : 500).type('text/plain').send(known ? `LTI ${what} failed: ${err.message}.` : `LTI ${what} failed. Something went wrong on the server.`)
		},

		//Platforms
		platformByID = async (id) => envPlatforms.find((p) => p._id === id) || (isString(id, 60) ? await col.platforms.findOne({_id: id}) : null),

		platformFor = async (issuer, clientId) => {
			let all = [...envPlatforms, ...(await col.platforms.find({issuer}).toArray())].filter((p) => p.issuer === issuer && (!clientId || p.clientId === clientId))
			return all.length === 1 ? all[0] : null
		},

		//The platform's keys, fetched when we have none, when they're old, or (at most once a minute) when the token names a kid we haven't seen
		keysOf = async (platform, kid) => {
			let c = jwksCache.get(platform.jwksUrl),
				now = Date.now(),
				fresh = c && now - c.fetched < JWKS_FRESH,
				have = (list) => kid ? list.find((k) => k.kid === kid) : list.length === 1 ? list[0] : null

			if (c && fresh && have(c.keys)) {
				return have(c.keys)
			}

			if (c && (now - c.fetched < JWKS_RETRY || (fresh && !kid))) {
				return have(c.keys) || null
			}

			let url = httpsURL(platform.jwksUrl, allowHttp)

			if (!url) {
				throw new LtiError(500, 'The platform registration has no usable JWKS url')
			}

			let list
			try {
				let r = await fetch(url, {signal: AbortSignal.timeout(5000), headers: {accept: 'application/json'}}),
					body = r.ok ? await r.text() : ''

				if (!r.ok || body.length > 200000) {
					throw new Error(`status ${r.status}`)
				}

				list = JSON.parse(body).keys
				if (!Array.isArray(list)) throw new Error('no keys')
			}
			catch (e) {
				throw new LtiError(502, 'Could not read the platform\'s keys', {jwks: platform.jwksUrl, why: e.message})
			}

			jwksCache.set(platform.jwksUrl, {keys: list.filter((k) => k && typeof k === 'object'), fetched: now})
			return have(jwksCache.get(platform.jwksUrl).keys) || null
		},

		//Our keys. The newest active one signs, retired ones stay published until a power user deletes them
		newKey = async () => {
			let pair = await generateKeyPair('rsa', {modulusLength: 2048}),
				kid = `k${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`,
				jwk = pair.publicKey.export({format: 'jwk'})

			await col.keys.insertOne({_id: kid, privatePem: pair.privateKey.export({type: 'pkcs8', format: 'pem'}), publicJwk: {kty: 'RSA', n: jwk.n, e: jwk.e, kid, use: 'sig', alg: 'RS256'}, state: 'active', created: new Date()})
			return kid
		},

		signingKey = async () => {
			let rows = await col.keys.find({state: 'active'}).sort({created: -1}).toArray()

			if (!rows.length) {
				await newKey()
				rows = await col.keys.find({state: 'active'}).sort({created: -1}).toArray()
			}

			let row = rows[0]

			if (!keyObjects.has(row._id)) {
				keyObjects.set(row._id, crypto.createPrivateKey(row.privatePem))
			}

			return {kid: row._id, key: keyObjects.get(row._id)}
		},

		//The people a deep linking launch can pick for. A platform's user (its sub) is linked to an editor account by a power user
		linkOf = async (platformID, sub) => col.links.findOne({_id: `${platformID}|${sub}`}),

		//Who the launch was, for the learner's records. Never printed or sent anywhere but this app's own records
		learnerFrom = (platform, payload) => {
			let ctx = payload[`${CLAIM}context`] || {},
				name = text(payload.name, 200) || [text(payload.given_name, 100), text(payload.family_name, 100)].filter(Boolean).join(' ')

			//The grade service the launch offered: only the line item for this link, and only when it can take scores
			let endpoint = payload[AGS] || {},
				scopes = (Array.isArray(endpoint.scope) ? endpoint.scope : []).filter((x) => isString(x, 300)).slice(0, 10),
				lineitem = httpsURL(endpoint.lineitem, allowHttp)

			return {
				platform: platform._id,
				sub: text(payload.sub, 255),
				ags: lineitem && scopes.includes(SCOPE_SCORE) ? {lineitem, scope: scopes} : null,
				username: `lti:${platform._id}:${text(payload.sub, 255)}`,
				name: name || null,
				roles: (Array.isArray(payload[`${CLAIM}roles`]) ? payload[`${CLAIM}roles`] : []).filter((r) => isString(r, 300)).slice(0, 20),
				course: text(ctx.id, 200),
				courseLabel: text(ctx.label, 200) || text(ctx.title, 200) || text(ctx.id, 200),
				courseCode: text(ctx.label, 100),
				courseTitle: text(ctx.title, 200),
				lmsURL: platform.issuer
			}
		},

		//Every check on an id_token that isn't the signature. Throws an LtiError on the first one that fails
		checkClaims = (p, platform, state, launchURL) => {
			let now = nowSeconds(),
				aud = Array.isArray(p.aud) ? p.aud : [p.aud]

			if (p.iss !== platform.issuer) throw new LtiError(401, 'The token issuer is not the platform that started the login')
			if (!aud.every((a) => typeof a === 'string') || !aud.includes(platform.clientId)) throw new LtiError(401, 'The token audience is not this tool\'s client id')
			if (aud.length > 1 && p.azp !== platform.clientId) throw new LtiError(401, 'The token has more than one audience and no matching authorized party')
			if (p.azp !== undefined && p.azp !== platform.clientId) throw new LtiError(401, 'The token authorized party is not this tool\'s client id')
			if (typeof p.exp !== 'number' || p.exp + LEEWAY < now) throw new LtiError(401, 'The token has expired')
			if (typeof p.iat !== 'number' || p.iat - LEEWAY > now) throw new LtiError(401, 'The token was issued in the future')
			if (p.nbf !== undefined && (typeof p.nbf !== 'number' || p.nbf - LEEWAY > now)) throw new LtiError(401, 'The token is not valid yet')
			if (!isString(p.nonce, 300) || !safeEqual(p.nonce, state.nonce)) throw new LtiError(401, 'The token nonce is not the one this login made')
			if (p[`${CLAIM}version`] !== '1.3.0') throw new LtiError(400, 'The token is not LTI 1.3.0')

			let deployment = p[`${CLAIM}deployment_id`]

			if (!isString(deployment, 255) || !(platform.deploymentIds || []).includes(deployment)) throw new LtiError(403, 'The deployment id is not one registered for this platform', {deployment: text(deployment, 100)})

			let target = p[`${CLAIM}target_link_uri`]

			if (!isString(target, 2000) || (state.targetLinkUri && target !== state.targetLinkUri)) throw new LtiError(400, 'The target link does not match the login')

			let t = new URL(target)

			if (`${t.origin}${t.pathname}` !== launchURL) throw new LtiError(400, 'The target link is not this tool')
		},

		//The project a resource link points at: ?t=<share token> on the target link, or the custom parameter the deep linking item carried
		projectToken = (p) => {
			let fromURL = new URL(p[`${CLAIM}target_link_uri`]).searchParams.get('t'),
				fromCustom = (p[`${CLAIM}custom`] || {}).ix_project,
				token = fromURL || fromCustom

			return typeof token === 'string' && TOKEN_RE.test(token) ? token : null
		}

	//Assignment and Grade Services. A token for the platform is asked for with our own signed assertion (client credentials) and kept
	//until it is nearly out; the score is posted to the line item's scores. Never throws: a failure comes back as {ok: false, why}
	let tokens = new Map(),
		doFetch = (...args) => (deps.fetch || globalThis.fetch)(...args),

		accessToken = async (platform, scope) => {
			let k = `${platform._id}|${scope}`,
				c = tokens.get(k)

			if (c && c.exp > Date.now() + 30000) {
				return c.token
			}

			let url = httpsURL(platform.tokenUrl, allowHttp)

			if (!url) {
				throw new LtiError(500, 'The platform registration has no usable token url')
			}

			let {kid, key} = await signingKey(),
				now = nowSeconds(),
				assertion = signJwt({iss: platform.clientId, sub: platform.clientId, aud: url, iat: now, exp: now + 300, jti: crypto.randomBytes(16).toString('hex')}, kid, key),
				r = await doFetch(url, {
					method: 'POST',
					headers: {'content-type': 'application/x-www-form-urlencoded', accept: 'application/json'},
					body: new URLSearchParams({grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion, scope}).toString(),
					signal: AbortSignal.timeout(8000)
				}),
				body = r.ok ? JSON.parse((await r.text()).slice(0, 20000)) : null

			if (!r.ok || !body || !isString(body.access_token, 8000)) {
				throw new LtiError(502, `The platform did not give a token (status ${r.status})`)
			}

			let ttl = typeof body.expires_in === 'number' && body.expires_in > 0 ? Math.min(body.expires_in, 3600) : 300

			tokens.set(k, {token: body.access_token, exp: Date.now() + ttl * 1000})
			return body.access_token
		},

		scoresURL = (lineitem) => {
			let u = new URL(lineitem)

			u.pathname = `${u.pathname.replace(/\/+$/, '')}/scores`
			return u.toString()
		}

	const grade = {
		//lti is what a launch gave (learner().lti): {platform, sub, lineitem, scope}. The score is sent as it is with its maximum, the
		//platform scales it to the line item's own maximum
		send: async (lti, score, max) => {
			try {
				if (!lti?.lineitem || !lti.sub || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) {
					return {ok: false, why: 'There is nothing to send the grade to'}
				}

				let platform = await platformByID(lti.platform)

				if (!platform) throw new LtiError(404, 'The platform is not registered any more')
				if (!platform.tokenUrl) throw new LtiError(409, 'The platform has no token url registered, so grades cannot be sent')
				if (!(lti.scope || []).includes(SCOPE_SCORE)) throw new LtiError(403, 'The platform did not offer to take scores for this link')

				let lineitem = httpsURL(lti.lineitem, allowHttp)

				if (!lineitem) throw new LtiError(400, 'The line item is not an https address')

				let token = await accessToken(platform, SCOPE_SCORE),
					r = await doFetch(scoresURL(lineitem), {
						method: 'POST',
						headers: {authorization: `Bearer ${token}`, 'content-type': 'application/vnd.ims.lis.v1.score+json', accept: 'application/json'},
						body: JSON.stringify({userId: lti.sub, scoreGiven: Math.min(max, Math.max(0, score)), scoreMaximum: max, activityProgress: 'Completed', gradingProgress: 'FullyGraded', timestamp: new Date().toISOString()}),
						signal: AbortSignal.timeout(8000)
					})

				if (r.status === 401) {
					tokens.delete(`${platform._id}|${SCOPE_SCORE}`)
				}

				if (!r.ok) throw new LtiError(502, `The platform refused the score (status ${r.status})`)

				return {ok: true}
			}
			catch (e) {
				console.warn(`interactives lti13 grade not sent: ${e.message}`)
				return {ok: false, why: e instanceof LtiError ? e.message : 'The platform could not be reached'}
			}
		}
	}

	const router = new express.Router(),
		urlencoded = express.urlencoded({extended: false, limit: '100kb'}),
		ready = (req, res, next) => col ? next() : res.status(503).type('text/plain').send('LTI is starting, try again in a moment')

	router.use(ready)

	//Step 1. The platform sends the browser here with who is launching; we make a state and nonce, remember them, and send
	//the browser on to the platform's own login endpoint, which will post the id_token to /launch.
	//target_link_uri has to be this tool's own launch url, otherwise this would be an open redirect for whoever can start a login
	let login = async (req, res) => {
		try {
			if (limited(req)) throw new LtiError(429, 'Too many requests, wait a minute')

			let q = {...req.query, ...(req.body || {})},
				launchURL = urls(req).launch,
				platform = isString(q.iss, 500) ? await platformFor(q.iss, isString(q.client_id, 200) ? q.client_id : null) : null

			if (!platform) throw new LtiError(400, 'This platform is not registered with the tool', {iss: text(q.iss, 200), client: text(q.client_id, 100)})
			if (!isString(q.login_hint, 4000)) throw new LtiError(400, 'The login request has no login_hint')
			if (q.lti_deployment_id && !(platform.deploymentIds || []).includes(q.lti_deployment_id)) throw new LtiError(403, 'The deployment id is not one registered for this platform')

			let target = isString(q.target_link_uri, 2000) ? q.target_link_uri : null

			if (target) {
				let t

				try {
					t = new URL(target)
				}
				catch (e) {
					throw new LtiError(400, 'The target link is not a url')
				}

				if (`${t.origin}${t.pathname}` !== launchURL) throw new LtiError(400, 'The target link is not this tool')
			}

			let auth = httpsURL(platform.authLoginUrl, allowHttp)

			if (!auth) throw new LtiError(500, 'The platform registration has no usable login url')

			let state = crypto.randomBytes(24).toString('base64url'),
				nonce = crypto.randomBytes(24).toString('base64url'),
				to = new URL(auth)

			await col.state.insertOne({_id: state, nonce, platform: platform._id, targetLinkUri: target, created: new Date(), expires: new Date(Date.now() + STATE_TTL)})

			for (let [k, v] of Object.entries({scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none', client_id: platform.clientId, redirect_uri: launchURL, login_hint: q.login_hint, state, nonce})) {
				to.searchParams.set(k, v)
			}

			if (isString(q.lti_message_hint, 4000)) to.searchParams.set('lti_message_hint', q.lti_message_hint)

			//One cookie per login, so two launches at once from one page don't trample each other. Partitioned keeps it working
			//in browsers that block third party cookies, which an LMS iframe is
			res.append('Set-Cookie', `${cookieFor(state)}=${state}; Max-Age=${STATE_TTL / 1000}; Path=${appBase(req)}/lti13; Secure; HttpOnly; SameSite=None; Partitioned`)
			res.redirect(302, to.toString())
		}
		catch (e) {
			fail(res, e, 'login')
		}
	}

	router.get('/login', login)
	router.post('/login', urlencoded, login)

	router.get('/jwks', async (req, res) => {
		try {
			let rows = await col.keys.find({}, {projection: {publicJwk: 1, created: 1}}).sort({created: -1}).toArray()

			if (!rows.length) {
				await newKey()
				rows = await col.keys.find({}, {projection: {publicJwk: 1, created: 1}}).sort({created: -1}).toArray()
			}

			res.json({keys: rows.map((r) => r.publicJwk)})
		}
		catch (e) {
			fail(res, e, 'jwks')
		}
	})

	//Step 2. The id_token. Every failure is a plain text page with a short reason (never anything from the request), and the
	//detail goes to the log
	router.post('/launch', urlencoded, async (req, res) => {
		let stateID = req.body?.state

		try {
			if (limited(req)) throw new LtiError(429, 'Too many requests, wait a minute')
			if (!isString(stateID, 100) || !isString(req.body?.id_token, 20000)) throw new LtiError(400, 'The launch has no state or no token')

			//The state is single use, whatever happens next: it goes before anything else is checked, so a token can't be tried twice
			let cookieName = cookieFor(stateID),
				cookie = readCookie(req, cookieName),
				state = await col.state.findOne({_id: stateID}),
				gone = state ? (await col.state.deleteOne({_id: stateID})).deletedCount === 1 : false

			res.append('Set-Cookie', `${cookieName}=; Max-Age=0; Path=${appBase(req)}/lti13; Secure; HttpOnly; SameSite=None; Partitioned`)

			if (!state || !gone) throw new LtiError(401, 'That login was already used or has expired, start the launch again')
			if (state.expires.getTime() < Date.now()) throw new LtiError(401, 'That login has expired, start the launch again')
			if (!cookie || !safeEqual(cookie, stateID)) throw new LtiError(401, 'The browser did not send back this login\'s cookie (are third party cookies blocked?)')

			let platform = await platformByID(state.platform)

			if (!platform) throw new LtiError(401, 'The platform is not registered any more')

			let jwt = parseJwt(req.body.id_token)

			await verifySignature(jwt, (kid) => keysOf(platform, kid).then((jwk) => jwk && jwkToKey(jwk)))

			let launchURL = urls(req).launch,
				p = jwt.payload

			checkClaims(p, platform, state, launchURL)

			let type = p[`${CLAIM}message_type`]

			if (type === 'LtiResourceLinkRequest') {
				if (!isString(p.sub, 255)) throw new LtiError(400, 'The launch does not say who the learner is')
				if (!isString((p[`${CLAIM}resource_link`] || {}).id, 255)) throw new LtiError(400, 'The launch has no resource link')

				let token = projectToken(p)

				if (!token) throw new LtiError(400, 'This link does not point at a project')

				let shared = await projects.findOne({'share.token': token}, {projection: {_id: 1}})

				if (!shared) throw new LtiError(404, 'The project is not shared any more (its owner turned the link off)')

				let sid = crypto.randomBytes(32).toString('base64url')

				await col.sessions.insertOne({_id: sid, kind: 'launch', token, learner: learnerFrom(platform, p), created: new Date(), expires: new Date(Date.now() + SESSION_TTL)})

				//The session goes in the fragment: it never reaches a server log or a Referer, and the learner page moves it into sessionStorage
				res.setHeader('Cache-Control', 'no-store')
				return res.redirect(303, `${appBase(req)}/play/${token}#lti=${sid}`)
			}

			if (type === 'LtiDeepLinkingRequest') {
				let s = p[`${DL}deep_linking_settings`] || {},
					returnURL = httpsURL(s.deep_link_return_url, allowHttp),
					types = Array.isArray(s.accept_types) ? s.accept_types : []

				if (!returnURL) throw new LtiError(400, 'The deep linking request has no usable return url')
				if (!types.includes('ltiResourceLink')) throw new LtiError(400, 'The platform does not accept resource links')

				let sub = isString(p.sub, 255) ? p.sub : null,
					link = sub ? await linkOf(platform._id, sub) : null,
					sid = crypto.randomBytes(32).toString('base64url'),
					mine = []

				if (link) {
					mine = await projects.find({'owner.username': link.username, 'share.token': {$ne: null}}, {projection: {name: 1, 'share.token': 1, updated: 1}}).sort({updated: -1}).limit(200).toArray()
				}

				await col.sessions.insertOne({_id: sid, kind: 'deeplink', platform: platform._id, returnURL, data: s.data === undefined ? undefined : text(String(s.data), 4000), multiple: s.accept_multiple === true, deployment: p[`${CLAIM}deployment_id`], username: link?.username || null, created: new Date(), expires: new Date(Date.now() + PICK_TTL)})

				let nonce = crypto.randomBytes(16).toString('base64')

				res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'`)
				res.setHeader('Cache-Control', 'no-store')
				res.setHeader('Referrer-Policy', 'no-referrer')
				return res.type('html').send(pickerPage({base: appBase(req), sid, multiple: s.accept_multiple === true, rows: mine, linked: !!link, platform, sub, nonce}))
			}

			throw new LtiError(400, 'That kind of launch is not supported', {type: text(type, 100)})
		}
		catch (e) {
			fail(res, e, 'launch')
		}
	})

	//Step 3 of deep linking, the picker's form: sign a response naming the chosen projects and post it back to the platform
	router.post('/pick', urlencoded, async (req, res) => {
		try {
			let sid = req.body?.sid,
				session = isString(sid, 100) ? await col.sessions.findOne({_id: sid, kind: 'deeplink'}) : null

			if (!session || session.expires.getTime() < Date.now() || (await col.sessions.deleteOne({_id: sid})).deletedCount !== 1) {
				throw new LtiError(401, 'This picker has expired or was already used, start again from the platform')
			}

			if (!session.username) throw new LtiError(403, 'This account is not linked to an editor account')

			let wanted = [].concat(req.body.project || []).filter((t) => typeof t === 'string' && TOKEN_RE.test(t)).slice(0, session.multiple ? 50 : 1),
				platform = await platformByID(session.platform)

			if (!platform) throw new LtiError(401, 'The platform is not registered any more')

			//Only the person's own projects that have a share link on, checked again here since the form is just a form
			let found = wanted.length ? await projects.find({'owner.username': session.username, 'share.token': {$in: wanted}}, {projection: {name: 1, 'share.token': 1, 'marking.salt': 1}}).toArray() : []

			if (!found.length) throw new LtiError(400, 'Pick at least one of your shared projects')

			let launchURL = urls(req).launch,
				{kid, key} = await signingKey(),
				now = nowSeconds(),
				payload = {
					iss: platform.clientId,
					aud: platform.issuer,
					iat: now,
					exp: now + 300,
					nonce: crypto.randomBytes(16).toString('hex'),
					jti: crypto.randomBytes(16).toString('hex'),
					[`${CLAIM}message_type`]: 'LtiDeepLinkingResponse',
					[`${CLAIM}version`]: '1.3.0',
					[`${CLAIM}deployment_id`]: session.deployment,
					[`${DL}content_items`]: found.map((d) => ({
					type: 'ltiResourceLink',
					title: text(d.name, 200) || 'Interactive',
					url: `${launchURL}?t=${d.share.token}`,
					custom: {ix_project: d.share.token},
					//A project the server marks is graded, so the course gets a grade item for it (out of 100: the score is sent with its own maximum and scaled)
					...(d.marking?.salt ? {lineItem: {scoreMaximum: 100, label: text(d.name, 200) || 'Interactive', resourceId: d.share.token}} : {})
				}))
				}

			if (session.data !== undefined) {
				payload[`${DL}data`] = session.data
			}

			let nonce = crypto.randomBytes(16).toString('base64')

			res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'`)
			res.setHeader('Cache-Control', 'no-store')
			res.setHeader('Referrer-Policy', 'no-referrer')
			res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Interactives</title></head><body>
<form id="back" method="post" action="${esc(session.returnURL)}"><input type="hidden" name="JWT" value="${esc(signJwt(payload, kid, key))}"><noscript><p>Your pick is ready.</p><button type="submit">Send it to the learning platform</button></noscript></form>
<script nonce="${nonce}">document.getElementById('back').submit()</script>
</body></html>`)
		}
		catch (e) {
			fail(res, e, 'deep linking')
		}
	})

	const pickerPage = ({base, sid, multiple, rows, linked, platform, sub, nonce}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pick an interactive</title>
<style>body{font:15px/1.4 system-ui,sans-serif;margin:0;padding:16px;color:#1b1b1f;background:#fff}h1{font-size:18px;margin:0 0 12px}ul{list-style:none;margin:0 0 16px;padding:0}li{border:1px solid #c9c9d1;border-radius:6px;margin:0 0 6px}label{display:flex;gap:10px;align-items:center;padding:10px 12px;cursor:pointer}li:has(input:checked){border-color:#3b5bfd;background:#eef1ff}button{font:600 14px system-ui,sans-serif;color:#fff;background:#3b5bfd;border:0;border-radius:6px;padding:10px 18px;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #1b1b1f;outline-offset:2px}.muted{color:#55555f}code{background:#eee;padding:1px 4px;border-radius:3px}</style></head>
<body><h1>Pick an interactive</h1>
${!linked
	? `<p>This ${esc(platform.name || 'learning platform')} account is not linked to an Interactives editor account yet. Ask an Interactives power user to link it, giving them this platform id and user id:</p><p><code>${esc(platform._id)}</code> <code>${esc(sub || '(none sent)')}</code></p>`
	: rows.length
		? `<form method="post" action="${esc(base)}/lti13/pick"><input type="hidden" name="sid" value="${esc(sid)}"><ul>${rows.map((r) => `<li><label><input type="${multiple ? 'checkbox' : 'radio'}" name="project" value="${esc(r.share.token)}"${!multiple && r === rows[0] ? ' required' : ''}> <span>${esc(r.name || 'Untitled project')}</span></label></li>`).join('')}</ul><button type="submit">Use ${multiple ? 'these' : 'this one'}</button></form>`
		: `<p>You have no projects with a Link for StudyDesk turned on. Open a project in the editor, choose Share, and make that link, then start again from here.</p><p class="muted">Only your own projects with a link are listed.</p>`}
</body></html>`

	//The key set, platforms and links, for power users. Everything else about a person's access is the session's /api check
	const admin = new express.Router(),
		json = express.json({limit: '20kb'}),
		power = (req, res, next) => deps.isPower(req) ? next() : res.status(403).json({error: 'Power users only'}),
		cleanList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : []).filter((s) => isString(s, 255)).slice(0, 50)

	admin.use(ready, power)

	admin.get('/', async (req, res) => {
		try {
			res.json({
				urls: urls(req),
				platforms: [...envPlatforms.map((p) => ({...p, _id: p._id})), ...(await col.platforms.find({}).sort({created: 1}).toArray())],
				links: await col.links.find({}).sort({created: 1}).limit(1000).toArray(),
				keys: (await col.keys.find({}, {projection: {state: 1, created: 1}}).sort({created: -1}).toArray()).map((k) => ({kid: k._id, state: k.state, created: k.created}))
			})
		}
		catch (e) {
			console.trace('interactives lti13 admin error', e)
			res.status(500).json({error: 'Something went wrong on the server'})
		}
	})

	admin.put('/platforms/:id', json, async (req, res) => {
		let id = req.params.id,
			b = req.body || {}

		if (!SLUG_RE.test(id)) return res.status(400).json({error: 'The id is lowercase letters, digits and dashes'})
		if (envPlatforms.some((p) => p._id === id)) return res.status(409).json({error: 'That platform comes from the environment and is not edited here'})

		let row = {
			name: text(b.name, 100) || id,
			issuer: isString(b.issuer, 300) && !/\s/.test(b.issuer) ? b.issuer : null,
			clientId: isString(b.clientId, 200) ? b.clientId : null,
			deploymentIds: cleanList(b.deploymentIds),
			authLoginUrl: httpsURL(b.authLoginUrl, allowHttp),
			jwksUrl: httpsURL(b.jwksUrl, allowHttp),
			tokenUrl: b.tokenUrl ? httpsURL(b.tokenUrl, allowHttp) : null
		}

		for (let [k, label] of [['issuer', 'issuer'], ['clientId', 'client id'], ['authLoginUrl', 'auth login url (https)'], ['jwksUrl', 'JWKS url (https)']]) {
			if (!row[k]) return res.status(400).json({error: `The ${label} is missing or not valid`})
		}

		if (b.tokenUrl && !row.tokenUrl) return res.status(400).json({error: 'The token url is not valid (https)'})
		if (!row.deploymentIds.length) return res.status(400).json({error: 'At least one deployment id is needed'})

		try {
			let clash = [...envPlatforms, ...(await col.platforms.find({issuer: row.issuer}).toArray())].find((p) => p.clientId === row.clientId && p._id !== id)

			if (clash) return res.status(409).json({error: `That issuer and client id are already registered as ${clash._id}`})

			await col.platforms.updateOne({_id: id}, {$set: {...row, updated: new Date(), by: deps.whoIs(req)?.username || null}, $setOnInsert: {created: new Date()}}, {upsert: true})
			jwksCache.delete(row.jwksUrl)

			//A changed registration (client id, token url) makes any grade token we hold for it worth nothing
			for (let k of [...tokens.keys()]) {
				if (k.startsWith(`${id}|`)) tokens.delete(k)
			}

			res.json({ok: true, platform: {_id: id, ...row}})
		}
		catch (e) {
			console.trace('interactives lti13 admin error', e)
			res.status(500).json({error: 'Something went wrong on the server'})
		}
	})

	admin.delete('/platforms/:id', async (req, res) => {
		if (envPlatforms.some((p) => p._id === req.params.id)) return res.status(409).json({error: 'That platform comes from the environment'})

		await col.platforms.deleteOne({_id: String(req.params.id)})

		for (let k of [...tokens.keys()]) {
			if (k.startsWith(`${req.params.id}|`)) tokens.delete(k)
		}

		res.json({ok: true})
	})

	//Links a person on a platform (the sub the platform sends) to the editor account whose projects they pick from
	admin.put('/links', json, async (req, res) => {
		let b = req.body || {}

		if (!isString(b.platform, 60) || !isString(b.sub, 255) || !isString(b.username, 200)) return res.status(400).json({error: 'platform, sub and username are all needed'})
		if (!await platformByID(b.platform)) return res.status(400).json({error: 'No such platform'})

		await col.links.updateOne({_id: `${b.platform}|${b.sub}`}, {$set: {platform: b.platform, sub: b.sub, username: b.username, by: deps.whoIs(req)?.username || null, updated: new Date()}, $setOnInsert: {created: new Date()}}, {upsert: true})
		res.json({ok: true})
	})

	admin.delete('/links', async (req, res) => {
		if (!isString(req.query.platform, 60) || !isString(req.query.sub, 255)) return res.status(400).json({error: 'platform and sub are needed'})

		await col.links.deleteOne({_id: `${req.query.platform}|${req.query.sub}`})
		res.json({ok: true})
	})

	//Rotation: a new key signs from now on, the old ones stay in the JWKS (platforms cache it) until deleted
	admin.post('/keys/rotate', async (req, res) => {
		await col.keys.updateMany({state: 'active'}, {$set: {state: 'retired', retired: new Date()}})
		let kid = await newKey()
		res.json({ok: true, kid})
	})

	admin.delete('/keys/:kid', async (req, res) => {
		let row = await col.keys.findOne({_id: String(req.params.kid)}, {projection: {state: 1}})

		if (!row) return res.json({ok: true})
		if (row.state === 'active') return res.status(409).json({error: 'That key is the one signing, rotate first'})

		await col.keys.deleteOne({_id: row._id})
		keyObjects.delete(row._id)
		res.json({ok: true})
	})

	return {
		router,
		admin,
		grade,

		//Collections: db is the editor's own database, projects its project collection. Mongo indexes live in suite-libs/indexes.js
		init: async (db, projectsCollection) => {
			col = {platforms: db.collection('lti13-platforms'), keys: db.collection('lti13-keys'), state: db.collection('lti13-state'), sessions: db.collection('lti13-sessions'), links: db.collection('lti13-links')}
			projects = projectsCollection

			//Made now rather than on the first request for the JWKS, so the platform admin finds it there
			await signingKey()
		},

		//For /learn: a launched learner presents their session in X-LTI-Session. No session in that header or an old one, and
		//nothing is set (the suite's own session check then decides)
		attachLearner: async (req, res, next) => {
			try {
				let sid = req.get('x-lti-session')

				if (col && isString(sid, 100) && !req.get('x-session-id')) {
					let s = await col.sessions.findOne({_id: sid, kind: 'launch'})

					if (s && s.expires.getTime() > Date.now()) {
						req.ltiLearner = {token: s.token, ...s.learner}
					}
				}
			}
			catch (e) {
				console.trace('interactives lti13 session error', e)
			}

			next()
		},

		//The shape index.js's learnerOf hands the records, for a launched learner
		learner: (l) => ({username: l.username, userID: null, name: l.name || l.username, course: l.course, courseLabel: l.courseLabel, courseCode: l.courseCode, lmsURL: l.lmsURL, lti: l.ags ? {platform: l.platform, sub: l.sub, lineitem: l.ags.lineitem, scope: l.ags.scope} : null}),

		//Exposed so the tests can say what a token is without going through the routes
		jwt: {parse: parseJwt, sign: signJwt, jwkToKey}
	}
}

module.exports.CLAIM = CLAIM
module.exports.DL = DL
module.exports.AGS = AGS
module.exports.SCOPE_SCORE = SCOPE_SCORE
