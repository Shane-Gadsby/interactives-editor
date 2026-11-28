//The ixia-chat MCP server Ask Ixia's Antigravity agent sees (agent-workspace/.agents/plugins/ixia/mcp_config.json starts
//it). It holds nothing itself: each JSON-RPC line from agy goes to the editor's loopback-only POST /api/designer/_mcp
//with the one-turn token index.js handed agy in IXIA_CHAT_TOKEN, and the answer comes back as a line. The token is all
//it has, and it's good for one project for one turn, so there's no session, no key and no database in here
import readline from 'node:readline'

const url = process.env.IXIA_CHAT_URL,
	token = process.env.IXIA_CHAT_TOKEN

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n')

const forward = async (msg) => {
	let reply = null
	try {
		if (!url || !token) throw new Error('Ixia is not connected to a project just now')
		let res = await fetch(url, {
			method: 'POST',
			headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
			body: JSON.stringify(msg),
			signal: AbortSignal.timeout(170000),
		})
		//notifications get a 202 and nothing back
		if (res.status === 202 || res.status === 204) return
		reply = await res.json().catch(() => null)
		if (!res.ok && !reply?.jsonrpc) throw new Error(reply?.error?.message || reply?.error || `the editor answered ${res.status}`)
	}
	catch (err) {
		reply = {jsonrpc: '2.0', id: msg.id ?? null, error: {code: -32000, message: String(err?.message || err).slice(0, 300)}}
	}
	if (msg.id !== undefined && reply) send(reply)
}

readline.createInterface({input: process.stdin}).on('line', (line) => {
	if (!line.trim()) return
	let msg
	try {
		msg = JSON.parse(line)
	}
	catch {
		return send({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}})
	}
	forward(msg)
})
