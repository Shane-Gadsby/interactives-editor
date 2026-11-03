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
import { diff } from '../shared/ops.mjs';
import { TOPICS, topicBody } from '../src/help/topics';

const BASE = (process.env.INTERACTIVES_URL ?? 'http://127.0.0.1:3048/interactives').replace(/\/$/, '');
const SESSION = process.env.INTERACTIVES_SESSION_ID ?? '';
const AGENT = process.env.INTERACTIVES_AGENT_NAME ?? 'Agent';
const VERSION = '0.1.0';

// ---------------------------------------------------------------- server API

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (SESSION) headers['X-Session-ID'] = SESSION;
  const res = await fetch(`${BASE}/api/${path}`, { ...init, headers });
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
const sessions = new Map<string, Session>();

function join(projectId: string): Session {
  const existing = sessions.get(projectId);
  if (existing) return existing;
  const clientId = `agent-${uid('')}`;
  const abort = new AbortController();
  const s: Session = { projectId, clientId, peers: new Map(), abort, ready: Promise.resolve() };
  s.ready = new Promise<void>((resolve, reject) => {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (SESSION) headers['X-Session-ID'] = SESSION;
    fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}/live?clientId=${clientId}&agent=${encodeURIComponent(AGENT)}`, { headers, signal: abort.signal })
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
        sessions.delete(projectId);
        reject(err);
      });
  });
  sessions.set(projectId, s);
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
    if (n.type === 'text') extra.push(JSON.stringify(n.text.slice(0, 40)));
    if (n.type === 'button') extra.push(JSON.stringify(n.label.slice(0, 40)));
    if (n.type === 'instance') extra.push(`artboard=${n.artboardId}`);
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
    if (ab.logic.nodes.length) lines.push(`Interactions: ${ab.logic.nodes.length} nodes, ${ab.logic.edges.length} connections (use get_interactions)`);
    const out: string[] = [];
    outline(ab.children, 0, opts.depth ?? (opts.artboardId ? 8 : 2), out, { n: opts.artboardId ? 600 : 80 });
    lines.push(...out, '');
  }
  if (p.variables.length) lines.push('## Variables', ...p.variables.map((v) => `- ${v.name} [${v.id}] ${v.type} = ${JSON.stringify(v.initial)}${v.shared ? ' shared' : ''}${v.options ? ` options=${v.options.join('|')}` : ''}`), '');
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
        if (pd.type === 'variable' && !varIds.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing variable ${v}`);
        if (pd.type === 'expr') {
          try {
            new Function(`return (${String(v)}\n);`);
          } catch (e) {
            problems.push(`${ab.name}: "${def.label}" (${n.id}) ${pd.label}: ${(e as Error).message} in \`${v}\``);
          }
        }
      }
      if (def.category === 'event' && !ab.logic.edges.some((e) => e.from === n.id)) problems.push(`${ab.name}: "${def.label}" (${n.id}) is not connected to anything`);
    }
    for (const e of ab.logic.edges) if (!ab.logic.nodes.some((n) => n.id === e.to) || !ab.logic.nodes.some((n) => n.id === e.from)) problems.push(`${ab.name}: a connection points at a missing node (${e.id})`);
  }
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
        touched.push(loc.node.id);
        break;
      }
      case 'add_layer': {
        const ab = findAb(c.artboard_id);
        const node = createNode(c.type as NodeType, (resolveRefs(c.props ?? {}) as Partial<SceneNode>) as never) as SceneNode;
        if (isContainer(node) && Array.isArray(c.children)) node.children = [];
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
    const types: NodeType[] = ['rect', 'ellipse', 'polygon', 'star', 'path', 'text', 'image', 'group', 'frame', 'button', 'input', 'link', 'embed', 'video', 'instance'];
    return (
      'Every layer has: id, type, name, x, y (top-left in the parent), width, height, rotation (deg), scaleX, scaleY, originX/originY (0-1), opacity, visible, locked, blendMode, cursor, link {url, target}, shadow, blur, ariaLabel, className, bindings {prop: expression}, layoutItem, constraints.\n' +
      'Paths: paths: [{closed, points: [{x, y, in?: {x,y}, out?: {x,y}}]}] in the layer\'s own box. Paint: {type:"solid", color} | {type:"linear", angle, stops:[{offset, color}]} | {type:"radial", stops} | {type:"image", assetId, fit}. Stroke: {paint, width, dash?, trimStart?, trimEnd?, trimOffset?}.\n\nDefaults per type (what add_layer fills in):\n' +
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
      return `Joined "${p.name}" as ${AGENT} (AI).\n\n${people(s, p)}\n\n${overview(p, {})}`;
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
      'add_variable {name, type: number|string|boolean|color|enum, initial, options?, shared?, ref?}; set_variable {id or name, props}; ' +
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
      const s = sessions.get(String(a.project_id));
      s?.abort.abort();
      sessions.delete(String(a.project_id));
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

async function handle(msg: { id?: number | string; method: string; params?: Record<string, unknown> }) {
  const reply = (result: unknown) => msg.id !== undefined && send({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code: number, message: string) => msg.id !== undefined && send({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
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
  for (const s of sessions.values()) s.abort.abort();
  process.exit(0);
});
