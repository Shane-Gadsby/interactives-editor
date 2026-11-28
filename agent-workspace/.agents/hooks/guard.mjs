//Every tool Ask Ixia's agent wants to use comes through here first (plugins/ixia/hooks.json, PreToolUse on "*"), and anything not
//on the short list below is refused. That list is the ixia-chat MCP tools, a few harmless planning steps, and reading
//files inside refs/ and .agents/ (plus the tool schemas agy keeps for ixia-chat in its own state folder). No commands,
//no writing, no web, no browser, no subagents, no other MCP servers, no file outside those folders.
//
//It fails closed: bad input, a path that can't be resolved, a crash, all come out as deny. agy also treats a hook that
//exits non-zero as a refusal (checked 28 Nov 2026), so even a broken guard blocks rather than lets through.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url)),
	workspace = path.resolve(here, '..', '..'),
	SERVER = 'ixia_ixia-chat'

//Reading only, and only in here
const FILE_TOOLS = new Set(['read_file', 'view_file', 'list_dir', 'grep_search', 'find_by_name'])
//The agent's own bookkeeping, which touches nothing
const PLANNING = new Set(['update_steps', 'finish'])

const real = (p) => {
	try {
		return fs.realpathSync(p)
	}
	catch {
		return null
	}
}

//Where reading is allowed. Each root is resolved too, so a symlinked checkout still matches itself
export const roots = (env = process.env) => {
	let list = [path.join(workspace, 'refs'), path.join(workspace, '.agents', 'skills'), path.join(workspace, '.agents', 'rules')]
	//agy keeps each MCP tool's full schema as a file and the agent reads it before the first call
	if (env.HOME) list.push(path.join(env.HOME, '.gemini', 'antigravity-cli', 'mcp', SERVER))
	return list.map(real).filter(Boolean)
}

const inside = (p, allowed) => allowed.some((r) => p === r || p.startsWith(r + path.sep))

//Every argument that names a file or folder, whatever the tool calls it (Path, DirectoryPath, SearchPath, ...)
const pathArgs = (args) => {
	let found = []
	for (let [k, v] of Object.entries(args || {})) {
		if (!/path|dir|file|uri|folder/i.test(k)) continue
		for (let one of Array.isArray(v) ? v : [v]) {
			if (typeof one === 'string') found.push(one)
			else found.push(null)
		}
	}
	return found
}

export const decide = (input, env = process.env) => {
	let call = input?.toolCall,
		name = call?.name,
		args = call?.args && typeof call.args === 'object' ? call.args : {}
	if (typeof name !== 'string' || !name) return {decision: 'deny', reason: 'No tool named.'}

	if (name === 'call_mcp_tool') {
		return args.ServerName === SERVER ? {decision: 'allow'} : {decision: 'deny', reason: 'Only the ixia-chat tools can be used here.'}
	}
	if (PLANNING.has(name)) return {decision: 'allow'}
	if (FILE_TOOLS.has(name)) {
		let paths = pathArgs(args),
			allowed = roots(env),
			cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : workspace
		if (!paths.length) return {decision: 'deny', reason: 'Say which file or folder, inside refs/ or .agents/skills/.'}
		for (let p of paths) {
			if (!p) return {decision: 'deny', reason: 'That path could not be read.'}
			let raw = p.startsWith('file://') ? fileURLToPath(p) : p,
				full = real(path.resolve(cwd, raw))
			if (!full || !inside(full, allowed)) return {decision: 'deny', reason: 'Only files inside refs/ and .agents/skills/ can be read.'}
		}
		return {decision: 'allow'}
	}

	return {decision: 'deny', reason: `${name} is not available to Ixia. Use the ixia-chat tools, and read refs/ for help.`}
}

//Run as the hook: one JSON object in on stdin, one decision out on stdout
const main = () => {
	let text = ''
	process.stdin.setEncoding('utf8')
	process.stdin.on('data', (d) => {
		text += d
		//nobody needs a megabyte to ask about one tool call
		if (text.length > 1024 * 1024) {
			process.stdout.write(JSON.stringify({decision: 'deny', reason: 'Too big.'}))
			process.exit(0)
		}
	})
	process.stdin.on('end', () => {
		let out
		try {
			out = decide(JSON.parse(text))
		}
		catch {
			out = {decision: 'deny', reason: 'The guard could not read that tool call.'}
		}
		process.stdout.write(JSON.stringify(out))
	})
}

if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main()
