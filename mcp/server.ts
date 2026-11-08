/**
 * Interactives MCP server: lets an AI agent (Claude Code, Claude Desktop, any MCP client) work in a project
 * alongside people. It joins the project's live editing room like an editor tab, so its edits appear for everyone
 * as they happen, it shows up in the editor as "<name> (AI)", and it can see what each person has selected.
 *
 * Plain stdio JSON-RPC (newline-delimited), no dependencies. Built to mcp/dist/interactives-mcp.mjs by
 * `npm run build:mcp`. Configure with:
 *   INTERACTIVES_URL         editor base URL (default http://127.0.0.1:3048/interactives)
 *   INTERACTIVES_SESSION_ID  a suite session id, sent as X-Session-ID (needed where sessions are enforced)
 *   INTERACTIVES_AGENT_NAME  name shown to people in the editor (default "Agent")
 */
import { CATALOG } from '../../interactives-player/src/catalog';
import { ANIMATABLE_PROPS } from '../../interactives-player/src/animation';
import { createNode } from '../../interactives-player/src/defaults';
import { createArtboard, isContainer, uid, walk, type Artboard, type LogicNode, type NodeType, type Project, type SceneNode, type Variable } from '../../interactives-player/src/format';
import { DRAW_API } from '../../interactives-player/src/draw';
import { DRAW_TEMPLATES } from '../../interactives-player/src/draw-templates';
import { SHADER_PRESETS } from '../../interactives-player/src/shader-presets';
import { SHADER_BUILTINS, SHADER_UNIFORM_TYPES } from '../../interactives-player/src/shader-uniforms';
import { runsPatch } from '../../interactives-player/src/textruns';
import { sanitizeLayerInPlace } from '../../interactives-player/src/sanitize';
import { liveProblems } from '../../interactives-player/src/live';
import { checkExpression } from '../../interactives-player/src/expr';
import { diff } from '../shared/ops.mjs';
import { TOPICS, topicBody } from '../src/help/topics';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who this agent is and which editor it talks to. Over stdio there is one, from the environment. Over HTTP (the editor
 * server's /mcp route) each connection brings its own, and `runAs` makes it the current one for everything that call
 * starts, including the live session streams it opens.
 */
export interface McpContext {
  base: string;
  sessionId: string;
  agent: string;
  sessions: Map<string, Session>;
}
const envContext: McpContext = {
  base: (process.env.INTERACTIVES_URL ?? 'http://127.0.0.1:3048/interactives').replace(/\/$/, ''),
  sessionId: process.env.INTERACTIVES_SESSION_ID ?? '',
  agent: process.env.INTERACTIVES_AGENT_NAME ?? 'Agent',
  sessions: new Map(),
};
const contexts = new AsyncLocalStorage<McpContext>();
const ctx = (): McpContext => contexts.getStore() ?? envContext;
export function runAs<T>(c: McpContext, fn: () => T): T {
  return contexts.run(c, fn);
}
const VERSION = '0.1.0';

// ---------------------------------------------------------------- server API

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (ctx().sessionId) headers['X-Session-ID'] = ctx().sessionId;
  const res = await fetch(`${ctx().base}/api/${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `Server said ${res.status}`);
  return body as T;
}

const loadProject = async (id: string) => (await api<{ project: Project }>(`projects/${encodeURIComponent(id)}`)).project;

// ---------------------------------------------------------------- live sessions (one per project)

interface Peer {
  clientId: string;
  name: string;
  artboardId?: string | null;
  selection?: string[];
  left?: boolean;
}
interface Session {
  projectId: string;
  clientId: string;
  peers: Map<string, Peer>;
  abort: AbortController;
  ready: Promise<void>;
}
//The stdio agent's sessions (the tests look at these). HTTP connections each have their own in their context
const sessions = envContext.sessions;

function join(projectId: string): Session {
  const existing = ctx().sessions.get(projectId);
  if (existing) return existing;
  const clientId = `agent-${uid('')}`;
  const abort = new AbortController();
  const s: Session = { projectId, clientId, peers: new Map(), abort, ready: Promise.resolve() };
  s.ready = new Promise<void>((resolve, reject) => {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (ctx().sessionId) headers['X-Session-ID'] = ctx().sessionId;
    fetch(`${ctx().base}/api/projects/${encodeURIComponent(projectId)}/live?clientId=${clientId}&agent=${encodeURIComponent(ctx().agent)}`, { headers, signal: abort.signal })
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error(`Could not join the live session (${res.status})`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            if (!ev || !data) continue;
            const d = JSON.parse(data);
            if (ev === 'hello') {
              for (const p of d.peers ?? []) if (p.clientId !== clientId) s.peers.set(p.clientId, p);
              resolve();
            } else if (ev === 'presence' && d.clientId !== clientId) {
              if (d.left) s.peers.delete(d.clientId);
              else s.peers.set(d.clientId, { ...(s.peers.get(d.clientId) ?? {}), ...d });
            } else if (ev === 'deleted') s.abort.abort();
          }
        }
      })
      .catch((err) => {
        ctx().sessions.delete(projectId);
        reject(err);
      });
  });
  ctx().sessions.set(projectId, s);
  return s;
}

async function presence(s: Session, p: { artboardId?: string | null; selection?: string[]; cursor?: { x: number; y: number } | null }) {
  await api(`projects/${encodeURIComponent(s.projectId)}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: s.clientId, presence: p }) }).catch(() => undefined);
}

// ---------------------------------------------------------------- reading a project

function locate(p: Project, id: string): { ab: Artboard; node: SceneNode; parent: SceneNode | null } | null {
  for (const ab of p.artboards) {
    let found: { ab: Artboard; node: SceneNode; parent: SceneNode | null } | null = null;
    const rec = (list: SceneNode[], parent: SceneNode | null) => {
      for (const n of list) {
        if (found) return;
        if (n.id === id) found = { ab, node: n, parent };
        else if (isContainer(n)) rec(n.children, n);
      }
    };
    rec(ab.children, null);
    if (found) return found;
  }
  return null;
}

/** A compact outline: one line per layer, indented, top-most first (as the Layers panel shows them). */
function outline(list: SceneNode[], depth: number, maxDepth: number, out: string[], limit: { n: number }) {
  for (const n of [...list].reverse()) {
    if (limit.n-- <= 0) return;
    const extra: string[] = [];
    if (n.type === 'text') extra.push(JSON.stringify(n.text.slice(0, 40)) + (n.runs?.length ? ` (${n.runs.length} runs)` : ''));
    if (n.type === 'button') extra.push(JSON.stringify(n.label.slice(0, 40)));
    if (n.type === 'instance') extra.push(`artboard=${n.artboardId}`);
    if (n.type === 'draw') extra.push(`script layer${n.fps ? ` ${n.fps}fps` : ''}, ${n.code.split('\n').length} lines`);
    if (n.type === 'shader') extra.push(`shader layer, ${n.code.split('\n').length} lines, uniforms: ${(n.uniforms ?? []).map((u) => `${u.name}:${u.type}`).join(',') || 'none'}`);
    if (n.type === 'image' && n.shaderFilter) extra.push(`shader filter, ${n.shaderFilter.code.split('\n').length} lines`);
    if (!n.visible) extra.push('hidden');
    if (n.locked) extra.push('locked');
    if (n.bindings && Object.keys(n.bindings).length) extra.push(`bindings: ${Object.keys(n.bindings).join(',')}`);
    out.push(`${'  '.repeat(depth)}- ${n.name} [${n.type} ${n.id}] @${r(n.x)},${r(n.y)} ${r(n.width)}x${r(n.height)}${extra.length ? ' ' + extra.join(' ') : ''}`);
    if (isContainer(n)) {
      if (depth + 1 >= maxDepth) {
        if (n.children.length) out.push(`${'  '.repeat(depth + 1)}… ${n.children.length} children (use get_layers or a deeper depth)`);
      } else outline(n.children, depth + 1, maxDepth, out, limit);
    }
  }
}
const r = (v: number) => Math.round(v * 10) / 10;

function overview(p: Project, opts: { artboardId?: string; depth?: number }): string {
  const lines: string[] = [`# ${p.name} (${p.id})`, `Start artboard: ${p.settings.startArtboardId}`, ''];
  for (const ab of p.artboards) {
    if (opts.artboardId && ab.id !== opts.artboardId) continue;
    lines.push(`## Artboard ${ab.name} [${ab.id}] ${ab.width}x${ab.height}`);
    if (ab.timelines.length) lines.push(`Timelines: ${ab.timelines.map((t) => `${t.name} [${t.id}] ${t.duration}ms ${t.loop}${t.autoplay ? ' autoplay' : ''} (${t.tracks.length} tracks)`).join('; ')}`);
    if (ab.blends?.length) lines.push(`Blends: ${ab.blends.map((b) => `${b.name} [${b.id}] ${b.mode} (${b.entries.length} timelines)`).join('; ')}`);
    if (ab.logic.nodes.length) lines.push(`Interactions: ${ab.logic.nodes.length} nodes, ${ab.logic.edges.length} connections (use get_interactions)`);
    const out: string[] = [];
    outline(ab.children, 0, opts.depth ?? (opts.artboardId ? 8 : 2), out, { n: opts.artboardId ? 600 : 80 });
    lines.push(...out, '');
  }
  if (p.variables.length) lines.push('## Variables', ...p.variables.map((v) => `- ${v.name} [${v.id}] ${v.type} = ${JSON.stringify(v.initial)}${v.shared ? ' shared' : ''}${v.formula ? ` formula=${JSON.stringify(v.formula)}` : ''}${v.live ? ' live' : ''}${v.userData ? ' userData' : ''}${v.options ? ` options=${v.options.join('|')}` : ''}`), '');
  if (p.dataSources.length) lines.push('## Data sources', ...p.dataSources.map((d) => `- ${d.name} [${d.id}] ${d.kind} from ${d.source === 'url' ? d.url : `asset ${d.assetId}`}`), '');
  if (p.scripts.length) lines.push('## Scripts', ...p.scripts.map((sc) => `- ${sc.name} [${sc.id}]${sc.runOnStart ? ' runs on start' : ''} (${sc.code.split('\n').length} lines)`), '');
  if (p.assets.length) lines.push('## Assets', ...p.assets.map((a) => `- ${a.name} [${a.id}] ${a.mime}`));
  return lines.join('\n');
}

function interactions(p: Project, abId: string): string {
  const ab = p.artboards.find((a) => a.id === abId || a.name === abId);
  if (!ab) throw new Error('No such artboard');
  const names = new Map<string, string>();
  walk(ab.children, (n) => names.set(n.id, n.name));
  const label = (n: LogicNode) => CATALOG.find((d) => d.kind === n.kind)?.label ?? n.kind;
  const lines = ab.logic.nodes.map((n) => {
    const params = Object.entries(n.params)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => `${k}=${typeof v === 'string' && names.has(v) ? `${names.get(v)}(${v})` : JSON.stringify(v)}`)
      .join(' ');
    const outs = ab.logic.edges.filter((e) => e.from === n.id).map((e) => `${e.fromPort !== 'out' ? e.fromPort + ' ' : ''}→ ${e.to}`);
    return `- ${label(n)} [${n.kind} ${n.id}] ${params}${outs.length ? ` ${outs.join(', ')}` : ''}${n.note ? ` // ${n.note}` : ''}`;
  });
  return [`Interactions on ${ab.name} [${ab.id}]`, ...lines].join('\n');
}

/** Problems an author would want to know about: references to things that no longer exist, and bad expressions. */
function validate(p: Project): string[] {
  const problems: string[] = [];
  const varIds = new Set(p.variables.map((v) => v.id));
  for (const ab of p.artboards) {
    const ids = new Set<string>();
    walk(ab.children, (n) => ids.add(n.id));
    const tl = new Set(ab.timelines.map((t) => t.id));
    for (const t of ab.timelines) for (const tr of t.tracks) if (!ids.has(tr.nodeId)) problems.push(`${ab.name}: timeline "${t.name}" animates a layer that is gone (${tr.nodeId}, ${tr.prop})`);
    for (const n of ab.logic.nodes) {
      const def = CATALOG.find((d) => d.kind === n.kind);
      if (!def) {
        problems.push(`${ab.name}: unknown interaction node kind ${n.kind} (${n.id})`);
        continue;
      }
      for (const pd of def.params) {
        const v = n.params[pd.key];
        if (v === undefined || v === '') continue;
        if (pd.type === 'node' && !ids.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing layer ${v}`);
        if (pd.type === 'timeline' && !tl.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing timeline ${v}`);
        if (pd.type === 'blend' && !ab.blends?.some((b) => b.id === String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing blend ${v}`);
        if (pd.type === 'variable' && !varIds.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing variable ${v}`);
        if (pd.type === 'variables') for (const id of Array.isArray(v) ? v : []) if (!varIds.has(String(id))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing variable ${id}`);
        if (pd.type === 'expr') {
          try {
            checkExpression(String(v));
          } catch (e) {
            problems.push(`${ab.name}: "${def.label}" (${n.id}) ${pd.label}: ${(e as Error).message} in \`${v}\``);
          }
        }
      }
      if (def.category === 'event' && !ab.logic.edges.some((e) => e.from === n.id)) problems.push(`${ab.name}: "${def.label}" (${n.id}) is not connected to anything`);
    }
    for (const e of ab.logic.edges) if (!ab.logic.nodes.some((n) => n.id === e.to) || !ab.logic.nodes.some((n) => n.id === e.from)) problems.push(`${ab.name}: a connection points at a missing node (${e.id})`);
  }
  problems.push(...liveProblems(p));
  return problems;
}

// ---------------------------------------------------------------- editing

type Change = Record<string, unknown> & { op: string };

/** Apply high-level changes to a copy of the document. Returns the new document and what was created. */
function applyChanges(p0: Project, changes: Change[]): { project: Project; created: Record<string, string>; touched: string[] } {
  const p = structuredClone(p0);
  const created: Record<string, string> = {};
  const touched: string[] = [];
  const ref = (v: unknown) => (typeof v === 'string' && v.startsWith('$') ? (created[v.slice(1)] ?? v) : (v as string));
  const findAb = (id: unknown) => {
    const ab = p.artboards.find((a) => a.id === ref(id) || a.name === id);
    if (!ab) throw new Error(`No artboard ${String(id)}`);
    return ab;
  };
  const resolveRefs = (o: unknown): unknown => (typeof o === 'string' ? ref(o) : Array.isArray(o) ? o.map(resolveRefs) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolveRefs(v)])) : o);
  for (const [i, c] of changes.entries()) {
    const where = `change ${i + 1} (${c.op})`;
    const key = typeof c.ref === 'string' ? c.ref : undefined;
    switch (c.op) {
      case 'set_props': {
        const loc = locate(p, ref(c.id));
        if (!loc) throw new Error(`${where}: no layer ${String(c.id)}`);
        const props = resolveRefs(c.props) as Record<string, unknown>;
        for (const [k, v] of Object.entries(props)) {
          if (k === 'id' || k === 'type' || k === 'children') continue;
          setPath(loc.node as unknown as Record<string, unknown>, k, v);
        }
        syncRuns(loc.node, props);
        // An agent can set any value on any property: put wrong-typed ones right before the layer is shared
        sanitizeLayerInPlace(loc.node);
        touched.push(loc.node.id);
        break;
      }
      case 'add_layer': {
        const ab = findAb(c.artboard_id);
        const node = createNode(c.type as NodeType, (resolveRefs(c.props ?? {}) as Partial<SceneNode>) as never) as SceneNode;
        if (isContainer(node) && Array.isArray(c.children)) node.children = [];
        syncRuns(node, (resolveRefs(c.props ?? {}) as Record<string, unknown>));
        sanitizeLayerInPlace(node);
        let list = ab.children;
        if (c.parent_id) {
          const parent = locate(p, ref(c.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent ${String(c.parent_id)} is not a group or frame`);
          list = parent.node.children;
        }
        const index = typeof c.index === 'number' ? Math.max(0, Math.min(list.length, c.index)) : list.length;
        list.splice(index, 0, node);
        if (key) created[key] = node.id;
        touched.push(node.id);
        break;
      }
      case 'delete': {
        const id = ref(c.id);
        const loc = locate(p, id);
        if (!loc) throw new Error(`${where}: no layer ${id}`);
        const list = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        list.splice(list.indexOf(loc.node), 1);
        break;
      }
      case 'move': {
        const id = ref(c.id);
        const loc = locate(p, id);
        if (!loc) throw new Error(`${where}: no layer ${id}`);
        const from = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        from.splice(from.indexOf(loc.node), 1);
        let to = c.artboard_id ? findAb(c.artboard_id).children : loc.ab.children;
        if (c.parent_id) {
          const parent = locate(p, ref(c.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent is not a group or frame`);
          to = parent.node.children;
        }
        to.splice(typeof c.index === 'number' ? c.index : to.length, 0, loc.node);
        touched.push(id);
        break;
      }
      case 'add_artboard': {
        const right = Math.max(0, ...p.artboards.map((a) => a.canvasX + a.width));
        const ab = createArtboard({ name: String(c.name ?? 'Artboard'), width: Number(c.width ?? 800), height: Number(c.height ?? 600), canvasX: right + 100, canvasY: 0 });
        p.artboards.push(ab);
        if (key) created[key] = ab.id;
        break;
      }
      case 'set_artboard': {
        const ab = findAb(c.id);
        for (const [k, v] of Object.entries(resolveRefs(c.props ?? {}) as Record<string, unknown>)) if (!['id', 'children', 'timelines', 'logic'].includes(k)) (ab as unknown as Record<string, unknown>)[k] = v;
        break;
      }
      case 'add_variable': {
        const v: Variable = { id: uid('v'), name: String(c.name), type: (c.type as Variable['type']) ?? 'number', initial: (c.initial as Variable['initial']) ?? 0 };
        if (Array.isArray(c.options)) v.options = c.options.map(String);
        if (c.shared) v.shared = true;
        if (typeof c.formula === 'string' && c.formula.trim()) v.formula = c.formula;
        if (c.live && v.formula) v.live = true;
        if (c.user_data && !v.live) v.userData = true;
        if (c.persist) v.persist = true;
        if (p.variables.some((x) => x.name === v.name)) throw new Error(`${where}: a variable called ${v.name} already exists`);
        p.variables.push(v);
        if (key) created[key] = v.id;
        break;
      }
      case 'set_variable': {
        const v = p.variables.find((x) => x.id === ref(c.id) || x.name === c.id);
        if (!v) throw new Error(`${where}: no variable ${String(c.id)}`);
        Object.assign(v, resolveRefs(c.props ?? {}), { id: v.id });
        break;
      }
      case 'add_timeline': {
        const ab = findAb(c.artboard_id);
        const tl = {
          id: uid('tl'),
          name: String(c.name ?? `Timeline ${ab.timelines.length + 1}`),
          duration: Number(c.duration ?? 1000),
          loop: (c.loop as 'once' | 'loop' | 'pingpong') ?? 'once',
          autoplay: !!c.autoplay,
          speed: 1,
          tracks: ((c.tracks as { node_id: string; prop: string; keys: { t: number; value: unknown; ease?: unknown }[] }[]) ?? []).map((tr) => ({
            id: uid('tr'),
            nodeId: ref(tr.node_id),
            prop: tr.prop,
            keys: tr.keys.map((k) => ({ id: uid('k'), t: k.t, value: k.value as never, ease: (k.ease as never) ?? 'easeInOut' })),
          })),
        };
        ab.timelines.push(tl);
        if (key) created[key] = tl.id;
        break;
      }
      case 'add_interactions': {
        const ab = findAb(c.artboard_id);
        const localIds: Record<string, string> = {};
        const nodes = (c.nodes as { ref?: string; kind: string; params?: Record<string, unknown>; x?: number; y?: number; note?: string }[]) ?? [];
        const baseY = 40 + Math.max(0, ...ab.logic.nodes.map((n) => n.y));
        nodes.forEach((n, j) => {
          const def = CATALOG.find((d) => d.kind === n.kind);
          if (!def) throw new Error(`${where}: unknown node kind ${n.kind} (see read_reference "interactions")`);
          const id = uid('lg');
          if (n.ref) localIds[n.ref] = id;
          if (n.ref) created[n.ref] = id;
          const defaults = Object.fromEntries(def.params.filter((pd) => pd.default !== undefined).map((pd) => [pd.key, pd.default]));
          ab.logic.nodes.push({ id, kind: n.kind, x: n.x ?? 40 + j * 260, y: n.y ?? baseY, params: { ...defaults, ...(resolveRefs(n.params ?? {}) as Record<string, unknown>) }, ...(n.note ? { note: n.note } : {}) });
        });
        for (const e of (c.edges as { from: string; to: string; from_port?: string }[]) ?? []) {
          const from = localIds[e.from] ?? ref(e.from);
          const to = localIds[e.to] ?? ref(e.to);
          ab.logic.edges.push({ id: uid('e'), from, fromPort: e.from_port ?? 'out', to, toPort: 'in' });
        }
        break;
      }
      case 'remove_interactions': {
        const ab = findAb(c.artboard_id);
        const ids = new Set(((c.ids as string[]) ?? []).map(ref));
        ab.logic.nodes = ab.logic.nodes.filter((n) => !ids.has(n.id));
        ab.logic.edges = ab.logic.edges.filter((e) => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to));
        break;
      }
      case 'add_script': {
        const sc = { id: uid('s'), name: String(c.name ?? 'Script'), code: String(c.code ?? ''), runOnStart: !!c.run_on_start };
        p.scripts.push(sc as never);
        if (key) created[key] = sc.id;
        break;
      }
      case 'set_script': {
        const sc = p.scripts.find((x) => x.id === ref(c.id) || x.name === c.id);
        if (!sc) throw new Error(`${where}: no script ${String(c.id)}`);
        if (typeof c.code === 'string') sc.code = c.code;
        if (typeof c.name === 'string') sc.name = c.name;
        if (typeof c.run_on_start === 'boolean') (sc as { runOnStart?: boolean }).runOnStart = c.run_on_start;
        break;
      }
      default:
        throw new Error(`${where}: unknown op "${c.op}"`);
    }
  }
  return { project: p, created, touched };
}

/** Keep a text layer's `text` and `runs` consistent after an edit: runs win when given, and plain `text` alone replaces them. */
function syncRuns(node: SceneNode, props: Record<string, unknown>): void {
  if (node.type !== 'text') return;
  if (Array.isArray(props.runs)) {
    const patch = runsPatch(props.runs.filter((r): r is { text: string } => !!r && typeof (r as { text?: unknown }).text === 'string'));
    node.text = patch.text;
    if (patch.runs) node.runs = patch.runs;
    else delete node.runs;
  } else if ('text' in props || props.runs === null) delete node.runs;
}

function setPath(obj: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (k === '__proto__' || k === 'constructor') return;
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = v;
}

// ---------------------------------------------------------------- reference text for agents

function reference(topic: string): string {
  if (topic === 'interactions') {
    return CATALOG.map((d) => `### ${d.kind} — ${d.label} (${d.category})\n${d.description}${d.outputs.length > 1 || d.outputs[0]?.label ? `\nOutputs: ${d.outputs.map((o) => o.id).join(', ')}` : ''}\n${d.params.map((pd) => `- ${pd.key} (${pd.type}${pd.options ? `: ${pd.options.map((o) => o.value).join('|')}` : ''}${pd.default !== undefined ? `, default ${JSON.stringify(pd.default)}` : ''})${pd.help ? `: ${pd.help}` : ''}`).join('\n')}`).join('\n\n');
  }
  if (topic === 'properties') return ANIMATABLE_PROPS.map((a) => `- ${a.prop} (${a.kind}): ${a.label}`).join('\n');
  if (topic === 'layers') {
    const types: NodeType[] = ['rect', 'ellipse', 'polygon', 'star', 'path', 'text', 'image', 'group', 'frame', 'button', 'input', 'link', 'embed', 'video', 'instance', 'draw', 'shader', 'bone'];
    return (
      'Every layer has: id, type, name, x, y (top-left in the parent), width, height, rotation (deg), scaleX, scaleY, originX/originY (0-1), opacity, visible, locked, blendMode, cursor, link {url, target}, shadow, blur, ariaLabel (text alternative), ariaDescription, role (button|checkbox|heading|image|region), headingLevel, ariaChecked, ariaExpanded, ariaPressed (a toggle button: true/false), ariaCurrent (true, or page|step|location|date|time: the current tab, page or step), decorative (hide from assistive tech), focusable (tab stop override), tabOrder, shortcut (a key that clicks the layer, e.g. "r", "1", "Ctrl+Enter"), className, bindings {prop: expression}, converters {prop: [{type: format|round|invert|range|map|toNumber|toText|toBoolean|duration|expr, ...}]} (applied to the binding value in order), layoutItem, constraints, draggable {tags[], axis both|x|y, bounds none|parent|artboard|<layer id>, onMiss stay|return, hit center|pointer|overlap, grid, glideMs, step, tapToMove, holdToDrag, label, silent, zoneVariable} (let viewers drag the layer; also by keyboard and tap), dropZone {accepts[] (tags, empty = any), capacity (0 = no limit), whenFull reject|swap, snap none|center|topLeft, label, highlight, contentsVariable} (where draggable layers can be dropped; the zone goes behind the layers that go in it). Buttons and inputs take disabled (bindable) and disabledOpacity (0-1, default 0.5, how dimmed they look while disabled). A frame can be a dialog: dialog {modal (default true), scrim (a solid paint over the artboard behind it), closeOnEscape (default true), closeOnOutsideClick, initialFocus (layer id), returnFocus (default true), openVariable (variable id: the frame shows while it is on, Escape turns it off)}. A frame or group can carry keyNav {mode: list|grid|radio, orientation: vertical|horizontal|both, columns (grid on a container; a grid repeater uses its own), wrap, indexVariable (variable id, number from 0)}: one item is the Tab stop and the arrows, Home and End move between a repeater\'s copies or a container\'s children; radio mode also selects (clicks) the item it lands on.\n' +
      'Text layers can hold rich text: runs: [{text, fontFamily?, fontSize?, fontWeight?, italic?, color?, underline?, strike?, letterSpacing?, link?: {url, target}}]; each run lists only how it differs from the layer\'s own text style. `text` always equals the runs joined (it is rewritten for you when you set runs); setting `text` alone replaces the runs with that plain text, so set `runs` to restyle part of a text.\n' +
      'Text layers can animate per letter/word/line with modifiers: [{unit: letter|word|line, start, end, offset (percent of the text; offset -100..100 slides the range), shape: square|ramp-up|ramp-down|triangle|round|smooth, ease?, randomize?, seed?, strength (0-100), x, y (px), rotation (deg), scale (factor), opacity (factor 0-1), color? (mix to), letterSpacing (px), blur (px)}]. Units inside the range get that fraction of each change. Animate them with timeline tracks on `modifiers.<index>.offset` (also start, end, strength, x, y, rotation, scale, opacity, color, letterSpacing, blur); a typewriter is a letter modifier with start 0, end 100, opacity 0 and an offset track from 0 to 100.\n' +
      'Script layers (type "draw", shown as "Script layer"): a box painted by a script every frame, for generative art, particles, charts and custom visualisations. Fields: code (the script), fps (0 = every frame, else a cap), pixelRatio ("auto" or a number), runInEditor (paint on the editor canvas, one still frame). The code defines function draw(g, t, dt) and optionally function setup(g); g records drawing commands, it is not a canvas. The script runs in the sandbox (projects with settings.scriptSandbox, the default; without the sandbox bundle the layer shows nothing). Errors stop that layer only. Starter scripts to adapt (set as `code`): ' + DRAW_TEMPLATES.map((t) => `"${t.name}"`).join(', ') + '. The g API:\n' + DRAW_API.map(([sig, what]) => `  ${sig}: ${what}`).join('\n') + '\nExample: {"type":"draw","name":"Pulse","width":320,"height":200,"code":"function draw(g, t) {\\n  g.clear(\'#10131a\');\\n  g.fill(\'#6f8cff\');\\n  g.circle(g.width / 2, g.height / 2, 24 + Math.sin(t * 2) * 8);\\n}"}.\n' +
      'Shader layers (type "shader", shown as "Shader layer"): a box painted by a GPU fragment shader (WebGL, GLSL). Fields: code, uniforms, fps (0 = every frame), pixelRatio ("auto" or a number, capped at 3), animateInEditor (run live on the editor canvas; default off, one still frame). The code defines void mainImage(out vec4 fragColor, in vec2 fragCoord): fragCoord is in canvas pixels with the origin bottom-left, fragColor is straight (not premultiplied) alpha. Built in: ' + SHADER_BUILTINS.join(', ') + ' (u_time seconds; u_resolution vec2 canvas pixels; u_mouse vec3 = pointer 0-1 over the layer with y up and z = 1 while the button is down; u_frame; v_uv vec2 0-1 y up). `uniforms` is a list of {name, type: ' + SHADER_UNIFORM_TYPES.join('|') + ', value, min?, max?}: the name is the GLSL identifier and is declared for the shader automatically, so the code just uses it (a color is a vec4; an image is a sampler2D plus name_size, a vec2; its value is an asset id). Values: float a number, vec2/3/4 an array, color a CSS colour, image an asset id. Animate them with timeline tracks on `uniforms.<index>.value` (a float, a colour, or an image asset id as a step), and `uniforms.<index>.value.<k>` (k = 0-3) for the parts of a vector; bindings use the same paths. A compile error stops that layer only: the editor shows the message with line numbers (in the code) and the layer shows a placeholder. All shader layers share one WebGL context, off-screen layers and hidden tabs are paused, and a layer that reads neither u_time nor u_mouse is only redrawn when something changes. Presets to start from (set code and uniforms to the same preset\'s): ' + SHADER_PRESETS.map((p) => `"${p.id}" (${p.name}${p.kind === 'filter' ? ', reads u_image' : ''})`).join(', ') + '. Example: {"type":"shader","name":"Glow","width":400,"height":240,"code":"void mainImage(out vec4 fragColor, in vec2 fragCoord) {\\n  vec2 uv = fragCoord / u_resolution;\\n  fragColor = vec4(uv, 0.5 + 0.5 * sin(u_time * speed), 1.0);\\n}","uniforms":[{"name":"speed","type":"float","value":1}]}.\n' +
      'Shader filter: an image layer can also carry shaderFilter: {preset?, code, uniforms, fps?, pixelRatio?, animateInEditor?}. Same code and uniforms as a shader layer, plus u_image (sampler2D, the layer\'s own picture with its fit applied) and u_image_size; its uniforms animate and bind as `shaderFilter.uniforms.<index>.value`. It only works on image layers (not with a 9-slice) and the plain picture shows until the shader has drawn and if it fails. There is no generic filter for other layer types.\n' +
      'Bones (type "bone"): a container whose origin is its base; its width is its length, it points along local +x, and a child bone sits at its parent\'s tip (x = parent width, y = 0). Pose with x, y, rotation, scaleX/Y, width (all animatable). A path is skinned by `skin: {bones: [{bone: boneId, bind: [a,b,c,d,e,f]}], weights: [[{w: [{b: boneIndex, w: weight}]}]]}` (weights[subPath][point], up to 4 influences summing to 1; bind = inverse(boneWorld) * layerWorld at bind time); an image by `mesh: {vertices: [{x,y,u,v}], triangles: [i,j,k...], skin}`. Constraints `ik` (on the end bone: target, bones = chain length, invertBend, strength) and `distance` (target, distance px, mode within|outside|exact) pose bones before skinning.\n' +
      'Paths: paths: [{closed, points: [{x, y, in?: {x,y}, out?: {x,y}}]}] in the layer\'s own box. Paint: {type:"solid", color} | {type:"linear", angle, stops:[{offset, color}], from?: {x,y}, to?: {x,y}} | {type:"radial", stops, center?: {x,y}, radius?} | {type:"image", assetId, fit}. With from/to (or center/radius) a gradient sits exactly there, in px from the layer\'s top-left, instead of running corner to corner along the angle; they can be animated as `fill.from.x`, `fill.to.y`, `fill.center.x`, `fill.radius` (also `stroke.paint.…`, `fills.0.…`). Stroke: {paint, width, dash?, trimStart?, trimEnd?, trimOffset?, cap?, join?, align?: "center"|"inside"|"outside"}. Several fills and strokes: fill/stroke is the first (bottom) one and fills: Paint[] / strokes: Stroke[] hold the ones painted on top, bottom to top. All fills are under all strokes unless paintOrder says otherwise: paintOrder: ("fill"|"stroke")[], one entry per paint from the bottom up, e.g. ["stroke","fill"] draws the stroke under the fill (left out = plain order). Any paint or stroke may also have opacity (0-1), blend, visible (false hides it), feather (soft blur, px) and offsetX/offsetY, so a drop shadow is an extra fill that is dark, see-through, feathered and offset. Paths for set_props and tracks: "fills.0.color", "fills.0.opacity", "strokes.0.width", "strokes.0.paint.color".\n\nDefaults per type (what add_layer fills in):\n' +
      types.map((t) => `- ${t}: ${JSON.stringify(Object.fromEntries(Object.entries(createNode(t)).filter(([k]) => !['id', 'name', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'originX', 'originY', 'opacity', 'visible'].includes(k))))}`).join('\n')
    );
  }
  const t = TOPICS.find((x) => x.id === topic);
  if (t) return `# ${t.title}\n${t.summary}\n\n${topicBody(t)}`;
  return `Topics: interactions, properties, layers, and the help pages: ${TOPICS.map((x) => x.id).join(', ')}`;
}

// ---------------------------------------------------------------- tools

const S = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required });
const str = (description: string) => ({ type: 'string', description });

const TOOLS: { name: string; description: string; inputSchema: unknown; run: (a: Record<string, unknown>) => Promise<string> }[] = [
  {
    name: 'list_projects',
    description: 'List the Interactives projects this session can see (id, name, last change).',
    inputSchema: S({}),
    run: async () => {
      const list = await api<{ id: string; name: string; updated: string; artboards: number }[]>('projects');
      return list.map((x) => `- ${x.name} [${x.id}] ${x.artboards} artboards, updated ${x.updated}`).join('\n') || 'No projects.';
    },
  },
  {
    name: 'join_session',
    description:
      'Join a project\'s live editing session, the same way an editor tab does. People in the editor see you as "<name> (AI)" and see your edits as they happen. Returns who is there and what each person has selected. Call this before editing.',
    inputSchema: S({ project_id: str('Project id, e.g. from list_projects or the editor URL #/p/<id>') }, ['project_id']),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const p = await loadProject(s.projectId);
      return `Joined "${p.name}" as ${ctx().agent} (AI).\n\n${people(s, p)}\n\n${overview(p, {})}`;
    },
  },
  {
    name: 'get_selection',
    description: 'What each person in the session has selected (full layer JSON), so you can act on "this" or "the selected layer".',
    inputSchema: S({ project_id: str('Project id') }, ['project_id']),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const p = await loadProject(s.projectId);
      const out: string[] = [people(s, p)];
      for (const peer of s.peers.values())
        for (const id of peer.selection ?? []) {
          const loc = locate(p, id);
          if (loc) out.push(`\n${peer.name} selected ${loc.node.name} on ${loc.ab.name}:\n${JSON.stringify(loc.node, null, 1)}`);
        }
      return out.join('\n');
    },
  },
  {
    name: 'get_overview',
    description: 'Outline of a project: artboards, layer trees (name, type, id, position, size), timelines, variables, data sources, scripts, assets. Give artboard_id for one artboard in full depth.',
    inputSchema: S({ project_id: str('Project id'), artboard_id: str('Optional: one artboard (id or name), shown in more depth'), depth: { type: 'number', description: 'How many levels of nesting to show' } }, ['project_id']),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      const ab = a.artboard_id ? p.artboards.find((x) => x.id === a.artboard_id || x.name === a.artboard_id) : undefined;
      return overview(p, { artboardId: ab?.id, depth: typeof a.depth === 'number' ? a.depth : undefined });
    },
  },
  {
    name: 'get_layers',
    description: 'Full JSON of specific layers (by id), including children.',
    inputSchema: S({ project_id: str('Project id'), ids: { type: 'array', items: { type: 'string' } } }, ['project_id', 'ids']),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      return (a.ids as string[]).map((id) => locate(p, id)?.node ?? { missing: id }).map((n) => JSON.stringify(n, null, 1)).join('\n\n');
    },
  },
  {
    name: 'get_interactions',
    description: "An artboard's interaction graph: each event/action/logic node with its settings and where it connects.",
    inputSchema: S({ project_id: str('Project id'), artboard_id: str('Artboard id or name') }, ['project_id', 'artboard_id']),
    run: async (a) => interactions(await loadProject(String(a.project_id)), String(a.artboard_id)),
  },
  {
    name: 'edit',
    description:
      'Change the project. Changes apply in order as one batch and reach everyone in the live session immediately (the server keeps revision history, so a person can roll back). ' +
      'Each change is {op, ...}: ' +
      'set_props {id, props: {path: value}} (paths like "fill.color", "stroke.width", "bindings.width"); ' +
      'add_layer {artboard_id, type, props?, parent_id?, index?, ref?}; delete {id}; move {id, parent_id?, artboard_id?, index?}; ' +
      'add_artboard {name, width, height, ref?}; set_artboard {id, props}; ' +
      'add_variable {name, type: number|string|boolean|color|enum|list, initial (for a list: JSON text, an array of objects), options? (enum), shared?, formula? (an expression worked out at the start), live? (needs a formula: keep it up to date as what it reads changes; read only, nothing can set it), user_data? (save for the learner, loaded before the start), persist?, ref?}; set_variable {id or name, props (formula, live, userData, persist...)}; ' +
      'add_timeline {artboard_id, name, duration, loop: once|loop|pingpong, autoplay, tracks: [{node_id, prop, keys: [{t, value, ease}]}], ref?}; ' +
      'add_interactions {artboard_id, nodes: [{ref, kind, params, note?}], edges: [{from, to, from_port?}]} (from/to are refs or ids); remove_interactions {artboard_id, ids}; ' +
      'add_script {name, code, run_on_start, ref?}; set_script {id or name, code?, name?, run_on_start?}. ' +
      'Give "ref" to name something you create, then use "$ref" in later changes in the same batch. Read read_reference("layers"), ("interactions") and ("properties") first.',
    inputSchema: S({ project_id: str('Project id'), changes: { type: 'array', items: { type: 'object' } }, explain: str('One line saying what this does (shown in the editor log)') }, ['project_id', 'changes']),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const before = await loadProject(s.projectId);
      const { project, created, touched } = applyChanges(before, a.changes as Change[]);
      const ops = diff(before, project);
      if (!ops.length) return 'Nothing changed.';
      await api(`projects/${encodeURIComponent(s.projectId)}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: s.clientId, ops }) });
      // Show people what the agent is working on
      const first = touched.map((id) => locate(project, id)).find(Boolean);
      if (first) await presence(s, { artboardId: first.ab.id, selection: touched.slice(0, 50), cursor: { x: first.ab.canvasX + first.node.x + first.node.width, y: first.ab.canvasY + first.node.y } });
      const problems = validate(project);
      return `Applied ${(a.changes as unknown[]).length} change(s) as ${ops.length} op(s).${Object.keys(created).length ? `\nCreated: ${JSON.stringify(created)}` : ''}${problems.length ? `\n\nProblems now in the project:\n- ${problems.slice(0, 30).join('\n- ')}` : ''}`;
    },
  },
  {
    name: 'validate',
    description: 'Check a project for broken references (layers, timelines, variables that no longer exist), unconnected events and expressions that do not parse.',
    inputSchema: S({ project_id: str('Project id') }, ['project_id']),
    run: async (a) => {
      const problems = validate(await loadProject(String(a.project_id)));
      return problems.length ? `- ${problems.join('\n- ')}` : 'No problems found.';
    },
  },
  {
    name: 'read_reference',
    description: 'Reference for building: "layers" (layer types, fields and defaults), "interactions" (every event/action/logic node and its params), "properties" (animatable/bindable property paths), or any help page id (e.g. "expressions", "scripts", "auto-layout", "repeaters", "data-sources", "timelines"). No topic lists them.',
    inputSchema: S({ topic: str('Topic id') }),
    run: async (a) => reference(String(a.topic ?? '')),
  },
  {
    name: 'leave_session',
    description: 'Leave a project\'s live session (people stop seeing you).',
    inputSchema: S({ project_id: str('Project id') }, ['project_id']),
    run: async (a) => {
      const s = ctx().sessions.get(String(a.project_id));
      s?.abort.abort();
      ctx().sessions.delete(String(a.project_id));
      return s ? 'Left the session.' : 'Was not in that session.';
    },
  },
];

function people(s: Session, p: Project): string {
  const list = [...s.peers.values()].filter((x) => !x.left);
  if (!list.length) return 'Nobody else is in this project right now.';
  return (
    'In the session:\n' +
    list
      .map((x) => {
        const ab = p.artboards.find((a) => a.id === x.artboardId);
        const sel = (x.selection ?? []).map((id) => locate(p, id)?.node.name ?? id);
        return `- ${x.name}${ab ? ` on ${ab.name}` : ''}${sel.length ? `, selected: ${sel.join(', ')}` : ''}`;
      })
      .join('\n')
  );
}

// ---------------------------------------------------------------- MCP over stdio

const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + '\n');

type RpcMessage = { id?: number | string; method: string; params?: Record<string, unknown> };
type RpcReply = { jsonrpc: '2.0'; id: number | string; result?: unknown; error?: { code: number; message: string } };

/** One JSON-RPC message in, its reply out (undefined for a notification). The stdio loop and the HTTP route both use it. */
async function respond(msg: RpcMessage): Promise<RpcReply | undefined> {
  const reply = (result: unknown): RpcReply | undefined => (msg.id !== undefined ? { jsonrpc: '2.0', id: msg.id, result } : undefined);
  const fail = (code: number, message: string): RpcReply | undefined => (msg.id !== undefined ? { jsonrpc: '2.0', id: msg.id, error: { code, message } } : undefined);
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'interactives', version: VERSION },
        instructions:
          'Interactives is a 2D interactive builder. Start with list_projects, then join_session on the project the person is editing, so your edits show live and you can see their selection. Read read_reference("layers") and ("interactions") before editing, make changes with edit, and check them with validate.',
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool ${String(msg.params?.name)}`);
      try {
        const text = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {});
        return reply({ content: [{ type: 'text', text }] });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

async function handle(msg: RpcMessage) {
  const r = await respond(msg);
  if (r) send(r);
}

/** Stop every live session a context has open (an HTTP connection ending, or stdin closing). */
function closeContext(c: McpContext) {
  for (const s of c.sessions.values()) s.abort.abort();
  c.sessions.clear();
}

// The stdio loop only runs when this file is the server. The tests import the pieces below and drive them directly
export { TOOLS, applyChanges, closeContext, handle, interactions, locate, overview, reference, respond, sessions, setPath, syncRuns, validate };

if (!process.env.INTERACTIVES_MCP_NO_STDIO) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        void handle(JSON.parse(line));
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
    }
  });
  process.stdin.on('end', () => {
    closeContext(envContext);
    process.exit(0);
  });
}
