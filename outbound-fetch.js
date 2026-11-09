//fetch for calls that leave the box (Google Fonts, the voice model download). Node's own fetch ignores HTTP_PROXY/HTTPS_PROXY,
//and test and prod can only get out through the proxy those name, so there every call to Google timed out and the fonts route
//answered 502. When the env names a proxy this is undici's fetch with an agent that reads them (NO_PROXY included), otherwise
//it's the plain global one. Same idea as suite-libs/request-shim.js, which only exports the request-style api.
let dispatcher,
	undiciFetch

const proxyEnv = () => process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy

module.exports = (url, opts = {}) => {
	if (dispatcher === undefined) {
		dispatcher = null

		if (proxyEnv()) {
			try {
				let undici = require('undici')

				dispatcher = new undici.EnvHttpProxyAgent()
				undiciFetch = undici.fetch
			}
			catch (e) {
				console.error('outbound-fetch: a proxy is set but undici is missing, run npm install', e.message)
			}
		}
	}

	return dispatcher ? undiciFetch(url, {...opts, dispatcher}) : fetch(url, opts)
}
