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
import { ANIMATABLE_PROPS, layerOwnProps } from '../../interactives-player/src/animation';
import { cloneWithNewIds, createNode, DEFAULT_TEXT_STYLE } from '../../interactives-player/src/defaults';
import { createArtboard, isContainer, uid, walk, type Artboard, type DataKind, type DataSource, type LogicNode, type NodeType, type Project, type SceneNode, type TextStyleDef, type Variable } from '../../interactives-player/src/format';
import { countTokenUse, defaultTheme, findTheme, isTokenRef, tokenByName, tokenIdOf, tokenRef } from '../../interactives-player/src/themes';
import { addTheme, addToken, lookDefaults, newProjectWithThemes, removeTheme, removeToken, setTokenValue } from '../src/lib/themes';
import { ALL_COLOURWAYS, addColourwayTheme, addLearnerSwitcher, removeLearnerSwitcher, setColourway } from '../src/lib/branded/colourway';
import { syncNodeStyles } from '../src/lib/libraries';
import { STARTERS, projectFromStarter, starterByKey } from '../src/lib/template-starters';
import { DRAW_API } from '../../interactives-player/src/draw';
import { DRAW_TEMPLATES } from '../../interactives-player/src/draw-templates';
import { SHADER_PRESETS } from '../../interactives-player/src/shader-presets';
import { SHADER_BUILTINS, SHADER_UNIFORM_TYPES } from '../../interactives-player/src/shader-uniforms';
import { runsPatch } from '../../interactives-player/src/textruns';
import { huggedHeight } from '../../interactives-player/src/hug';
import { sanitizeLayerInPlace } from '../../interactives-player/src/sanitize';
import { migrateProjectGuides } from '../../interactives-player/src/guides';
import { liveProblems } from '../../interactives-player/src/live';
import { checkExpression } from '../../interactives-player/src/expr';
import { cleanNotes, makeNote, NOTE_COLOURS } from '../../interactives-player/src/notes';
import type { Note } from '../../interactives-player/src/format';
import { diff } from '../shared/ops.mjs';
import { IDENT_RE, renameVariable } from '../src/lib/rename-variable';
import { compileBlueprint, type Blueprint } from '../src/lib/designer-blueprint';
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

const loadProject = async (id: string) => {
  const project = (await api<{ project: Project }>(`projects/${encodeURIComponent(id)}`)).project;
  //an old project's every-page guides are the start page's now (guides are endless lines of one page)
  migrateProjectGuides(project);
  return project;
};

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

// ---------------------------------------------------------------- files

/** Put bytes on the server as one of the project's assets; the document's asset record is added separately (the add_asset op). */
async function putAsset(projectId: string, assetId: string, bytes: Uint8Array, mime: string): Promise<number> {
  const res = await api<{ size: number }>(`projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: 'PUT', headers: { 'Content-Type': mime || 'application/octet-stream' }, body: bytes as unknown as BodyInit });
  return res.size;
}

const DATA_MIME: Record<string, string> = { json: 'application/json', csv: 'text/csv', tsv: 'text/tab-separated-values', text: 'text/plain' };
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', vtt: 'text/vtt', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', json: DATA_MIME.json, csv: DATA_MIME.csv, tsv: DATA_MIME.tsv, txt: DATA_MIME.text, md: 'text/markdown', pdf: 'application/pdf' };
const guessMime = (name: string) => MIME_BY_EXT[/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** An add_data_source that brings its contents as text: the text goes up as a file first, and the op points at it. */
async function uploadDataText(projectId: string, changes: Change[]): Promise<Change[]> {
  const out: Change[] = [];
  for (const c of changes) {
    if (c.op !== 'add_data_source' || typeof c.text !== 'string') {
      out.push(c);
      continue;
    }
    const kind = ['json', 'csv', 'tsv', 'text'].includes(String(c.kind)) ? String(c.kind) : 'json';
    if (kind === 'json') {
      try {
        JSON.parse(c.text);
      } catch (e) {
        throw new Error(`The text for data source ${String(c.name)} is not JSON: ${(e as Error).message}`);
      }
    }
    const id = uid('as');
    const bytes = new TextEncoder().encode(c.text);
    const size = await putAsset(projectId, id, bytes, DATA_MIME[kind]);
    const { text: _text, ...rest } = c;
    out.push({ op: 'add_asset', id, name: `${String(c.name ?? 'data')}.${kind === 'text' ? 'txt' : kind}`, mime: DATA_MIME[kind], size }, { ...rest, asset_id: id });
  }
  return out;
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
    if (n.type === 'progress') extra.push(`progress ${n.value}/${n.max}, ${n.orientation}, ${n.semantics}`);
    if (n.type === 'chart') extra.push(`${n.kind} chart of ${JSON.stringify(n.data.slice(0, 40))}`);
    if (n.type === 'connector') extra.push(`${n.route} connector ${connectorEnd(n.from)} to ${connectorEnd(n.to)}${n.label ? ` labelled ${JSON.stringify(n.label.slice(0, 30))}` : ''}`);
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
/** A connector end for the outline: the layer it hangs on (a copy of a repeated one says which), or its loose spot. */
function connectorEnd(e: { layer: string | { repeat: string; index: string }; x?: number; y?: number; side?: string }): string {
  const side = e.side && e.side !== 'auto' ? `.${e.side}` : '';
  if (typeof e.layer === 'string') return e.layer ? `${e.layer}${side}` : `(${r(e.x ?? 0)},${r(e.y ?? 0)})`;
  return `${e.layer?.repeat}[${e.layer?.index}]${side}`;
}

function overview(p: Project, opts: { artboardId?: string; depth?: number }): string {
  const lines: string[] = [`# ${p.name} (${p.id})`, `Start artboard: ${p.settings.startArtboardId}`, ''];
  for (const ab of p.artboards) {
    if (opts.artboardId && ab.id !== opts.artboardId) continue;
    //A page that fits its content is only as tall as its layers make it, so say what that is rather than leaving the stored height to be read as the real one
    const fitted = ab.hugHeight ? huggedHeight(ab, ab.children) : null;
    const size = fitted === null ? `${ab.width}x${ab.height}` : `${ab.width}x${fitted} (fits its height to its content: ${fitted}px for the layers as they start${fitted === ab.height ? '' : `, stored height ${ab.height} is stale until an editor recalculates it`}; it keeps changing as the project plays)`;
    lines.push(`## Artboard ${ab.name} [${ab.id}] ${size}`);
    const master = ab.master ? p.artboards.find((a) => a.id === ab.master) : null;
    if (master) lines.push(`Page master: ${master.name} [${master.id}]${ab.masterHide?.length ? `, leaves out ${ab.masterHide.join(', ')}` : ''}${ab.masterSlots ? `, text slots ${JSON.stringify(ab.masterSlots)}` : ''} (its layers are drawn on this page, read only: edit them on the master)`);
    const users = p.artboards.filter((a) => a.master === ab.id).length;
    if (users) lines.push(`Used as a page master by ${users} page${users === 1 ? '' : 's'}${ab.masterOver?.length ? `; drawn over the pages: ${ab.masterOver.join(', ')}` : ''}`);
    if (ab.props?.length) {
      const named = ab.props.map((pr) => {
        const v = p.variables.find((x) => x.id === pr.variable);
        return `${pr.label || v?.label || v?.name || pr.variable} -> ${v?.name ?? '(deleted variable)'}${v ? ` (${v.type}${v.options?.length ? `: ${v.options.join('|')}` : ''})` : ''}`;
      });
      lines.push(`Takes as a component: ${named.join('; ')} (set them in an instance's inputs, by the variable name)`);
    }
    if (ab.timelines.length) lines.push(`Timelines: ${ab.timelines.map((t) => `${t.name} [${t.id}] ${t.duration}ms ${t.loop}${t.autoplay ? ' autoplay' : ''} (${t.tracks.length} tracks)`).join('; ')}`);
    if (ab.notes?.length) lines.push(`Notes: ${ab.notes.length} (use list_notes)`);
    if (ab.blends?.length) lines.push(`Blends: ${ab.blends.map((b) => `${b.name} [${b.id}] ${b.mode} (${b.entries.length} timelines)`).join('; ')}`);
    if (ab.logic.notes?.length) lines.push(`Graph notes: ${ab.logic.notes.length} (use list_notes)`);
    if (ab.logic.nodes.length) lines.push(`Interactions: ${ab.logic.nodes.length} nodes, ${ab.logic.edges.length} connections (use get_interactions)`);
    const out: string[] = [];
    outline(ab.children, 0, opts.depth ?? (opts.artboardId ? 8 : 2), out, { n: opts.artboardId ? 600 : 80 });
    lines.push(...out, '');
  }
  if (p.notes?.length) lines.push(`Notes on the canvas outside any artboard: ${p.notes.length} (use list_notes)`, '');
  if (p.variables.length) lines.push('## Variables', ...p.variables.map((v) => `- ${v.name} [${v.id}] ${v.type} = ${short(JSON.stringify(v.initial))}${v.shared ? ' shared' : ''}${v.formula ? ` formula=${JSON.stringify(v.formula)}` : ''}${v.live ? ' live' : ''}${v.userData ? ' userData' : ''}${v.options ? ` options=${v.options.join('|')}` : ''}`), '');
  if (p.dataSources.length) lines.push('## Data sources', ...p.dataSources.map((d) => `- ${d.name} [${d.id}] ${d.kind} from ${d.source === 'url' ? d.url : d.source === 'shared' ? `shared responses (${d.shared?.who === 'me' ? 'only me' : 'everyone in the class'}${d.shared?.whoVariable ? `, switched by variable ${d.shared.whoVariable}` : ''})` : `asset ${d.assetId}`}`), '');
  if (p.scripts.length) lines.push('## Scripts', ...p.scripts.map((sc) => `- ${sc.name} [${sc.id}]${sc.runOnStart ? ' runs on start' : ''} (${sc.code.split('\n').length} lines)`), '');
  if (p.assets.length) lines.push('## Assets', ...p.assets.map((a) => `- ${a.name} [${a.id}] ${a.mime}`), '');
  lines.push(...themesReport(p));
  const texts = p.styles?.texts ?? [];
  if (texts.length) lines.push('## Text styles (a layer follows one with styleRefs.text: its id or name)', ...texts.map((s) => `- ${s.name} [${s.id}] ${s.fontFamily} ${s.fontSize}px ${s.fontWeight}${s.fontStyle === 'italic' ? ' italic' : ''} line ${s.lineHeight}${s.color ? ` ${s.color}` : ''}`), '');
  return lines.join('\n').trimEnd();
}

/** Long values (a list variable's whole JSON) cut short, so an overview stays an overview: get_variables has them in full. */
const short = (s: string | undefined, max = 80) => (s === undefined ? 'undefined' : s.length > max ? `${s.slice(0, max)}… (${s.length} chars, see get_variables)` : s);

/** The project's themes and colour tokens, with each token's value in every theme. */
function themesReport(p: Project): string[] {
  const t = p.themes;
  if (!t?.list.length) return ['## Themes', 'None. add_theme or add_colourway make them (the starter tokens come with the first).', ''];
  const def = defaultTheme(t);
  const out = ['## Themes', ...t.list.map((th) => `- ${th.name} [${th.id}]${th.mode ? ` ${th.mode}` : ''}${th.highContrast ? ' high contrast' : ''}${th.id === def.id ? ' (default)' : ''}`)];
  out.push(`Follows the viewer's dark and contrast settings: ${t.follow === false ? 'no' : 'yes'}`, '');
  if (t.tokens.length) {
    out.push('## Colour tokens (a colour of "token:<id>" or "token:<name>" follows the theme)');
    for (const tk of t.tokens) out.push(`- ${tk.name} [${tk.id}] ${t.list.map((th) => `${th.name} ${tk.values[th.id] ?? `(${tk.values[def.id] ?? 'none'})`}`).join(', ')}`);
    out.push('');
  }
  return out;
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
    // Colours that follow a token the project doesn't have draw as nothing, and the editor says "Missing token"
    const used = countTokenUse(ab.children);
    if (ab.background?.type === 'solid' && isTokenRef(ab.background.color)) used.set(tokenIdOf(ab.background.color), 1);
    for (const id of used.keys()) if (!p.themes?.tokens.some((x) => x.id === id) && !tokenByName(p.themes, id)) problems.push(`${ab.name}: a colour follows a token that does not exist (token:${id}); see the colour tokens in get_overview`);
    // A layer nowhere near its artboard is usually a stray from a slipped drag: nobody will ever see it
    const reach = Math.max(ab.width, ab.height);
    for (const n of ab.children) {
      if (n.type === 'connector') continue;
      const off = Math.max(-(n.x + n.width), n.x - ab.width, -(n.y + n.height), n.y - ab.height);
      if (off > reach) problems.push(`${ab.name}: "${n.name}" (${n.id}) is ${Math.round(off)} px outside the artboard, at ${r(n.x)},${r(n.y)}: a stray? Delete it or move it in`);
    }
  }
  problems.push(...liveProblems(p));
  return problems;
}

/** Every note of a project with where it lives (the artboard, none for the canvas, or `graph` when it is on an artboard's interaction graph). */
function listNotes(p: Project): { note: Note; ab: Artboard | null; list: Note[]; graph?: boolean }[] {
  return [
    ...(p.notes ?? []).map((note) => ({ note, ab: null as Artboard | null, list: p.notes! })),
    ...p.artboards.flatMap((ab) => (ab.notes ?? []).map((note) => ({ note, ab: ab as Artboard | null, list: ab.notes! }))),
    ...p.artboards.flatMap((ab) => (ab.logic.notes ?? []).map((note) => ({ note, ab: ab as Artboard | null, list: ab.logic.notes!, graph: true }))),
  ];
}
/** A node or group of an artboard's graph, by id: where its top left corner is. */
const graphOrigin = (ab: Artboard, id: string): { x: number; y: number } | undefined => ab.logic.nodes.find((n) => n.id === id) ?? ab.logic.groups?.find((g) => g.id === id);
const findNote = (p: Project, id: string) => listNotes(p).find((x) => x.note.id === id);

function notesReport(p: Project, artboardId?: string): string {
  const rows = listNotes(p).filter((x) => !artboardId || x.ab?.id === artboardId);
  if (!rows.length) return 'No notes.';
  return rows
    .map(({ note: n, ab, graph }) => `- [${n.id}] ${graph ? `on the interaction graph of ${ab!.name} [${ab!.id}]` : ab ? `on ${ab.name} [${ab.id}]` : 'on the canvas'} at ${r(n.x)},${r(n.y)} ${r(n.w)}x${r(n.h)} ${n.colour ?? 'gold'}${n.anchor ? ` follows ${graph ? 'node or group' : 'layer'} ${n.anchor.layerId}` : ''}${n.author ? ` by ${n.author}` : ''}\n${n.text.split('\n').map((l) => `    ${l}`).join('\n')}`)
    .join('\n');
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
  // A colour may name its token (token:color/primary) or a token made earlier in the batch (token:$brand): stored by id, the
  // way the editor stores it, so the Themes tab can count and rename it
  const fixToken = (s: string): string => {
    if (!isTokenRef(s)) return s;
    const want = tokenIdOf(s);
    if (want.startsWith('$') && created[want.slice(1)]) return tokenRef(created[want.slice(1)]);
    if (p.themes?.tokens.some((x) => x.id === want)) return s;
    const t = tokenByName(p.themes, want);
    return t ? tokenRef(t.id) : s;
  };
  const resolveRefs = (o: unknown): unknown => (typeof o === 'string' ? fixToken(ref(o)) : Array.isArray(o) ? o.map(resolveRefs) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolveRefs(v)])) : o);
  let stylesTouched = false;
  /** A layer's styleRefs may name their styles: kept as ids, like the editor keeps them. */
  const fixStyleRefs = (n: SceneNode) => {
    if (!n.styleRefs) return;
    stylesTouched = true;
    const s = n.styleRefs as Record<string, string | undefined>;
    for (const k of Object.keys(s)) {
      const v = s[k];
      if (typeof v !== 'string') continue;
      const list: { id: string; name: string }[] = k === 'text' ? (p.styles?.texts ?? []) : (p.styles?.colors ?? []);
      s[k] = list.find((x) => x.id === v)?.id ?? list.find((x) => x.name === v)?.id ?? v;
    }
  };
  /**
   * What an interaction node's setting points at, given by id or by name (a variable, script, layer on that artboard,
   * timeline, blend, artboard or asset), as the id the player wants. A name that matches nothing is left for validate to report.
   */
  const paramIds = (ab: Artboard, kind: string, params: Record<string, unknown>, where: string): Record<string, unknown> => {
    const def = CATALOG.find((d) => d.kind === kind);
    if (!def) return params;
    const out = { ...params };
    const pick = (list: { id: string; name: string }[], v: unknown, what: string): unknown => {
      if (typeof v !== 'string' || !v || list.some((x) => x.id === v)) return v;
      const hits = list.filter((x) => x.name === v);
      if (hits.length > 1) throw new Error(`${where}: ${hits.length} ${what}s are called "${v}", give its id`);
      return hits[0]?.id ?? v;
    };
    const layers: SceneNode[] = [];
    walk(ab.children, (n) => layers.push(n));
    for (const pd of def.params) {
      const v = out[pd.key];
      if (v === undefined || v === '') continue;
      if (pd.type === 'variable') out[pd.key] = pick(p.variables, v, 'variable');
      else if (pd.type === 'variables' && Array.isArray(v)) out[pd.key] = v.map((x) => pick(p.variables, x, 'variable'));
      else if (pd.type === 'script') out[pd.key] = pick(p.scripts, v, 'script');
      else if (pd.type === 'node') out[pd.key] = pick(layers, v, 'layer');
      else if (pd.type === 'timeline') out[pd.key] = pick(ab.timelines, v, 'timeline');
      else if (pd.type === 'blend') out[pd.key] = pick(ab.blends ?? [], v, 'blend');
      else if (pd.type === 'artboard') out[pd.key] = pick(p.artboards, v, 'artboard');
      else if (pd.type === 'asset') out[pd.key] = pick(p.assets, v, 'asset');
    }
    return out;
  };
  /** A layer from add_layer's spec, with its children: the starter token colours unless it gives its own, as the editor does. */
  const build = (spec: Record<string, unknown>, where: string): SceneNode => {
    const props = resolveRefs(spec.props ?? {}) as Record<string, unknown>;
    const node = createNode(spec.type as NodeType, { ...lookDefaults(p, spec.type as NodeType), ...props } as never) as SceneNode;
    syncRuns(node, props);
    sanitizeLayerInPlace(node);
    fixStyleRefs(node);
    if (Array.isArray(spec.children)) {
      if (!isContainer(node)) throw new Error(`${where}: a ${String(spec.type)} can't hold children (a group or frame can)`);
      node.children = spec.children.map((ch, j) => build(ch as Record<string, unknown>, `${where} child ${j + 1}`));
    }
    if (typeof spec.ref === 'string') created[spec.ref] = node.id;
    touched.push(node.id);
    return node;
  };
  const themeId = (v: unknown, where: string): string => {
    const th = findTheme(p.themes, String(v ?? ''));
    if (!th) throw new Error(`${where}: no theme ${String(v)} (the themes are in get_overview)`);
    return th.id;
  };
  const tokenOf = (v: unknown, where: string) => {
    const id = ref(String(v ?? ''));
    const t = p.themes?.tokens.find((x) => x.id === id) ?? tokenByName(p.themes, id);
    if (!t) throw new Error(`${where}: no colour token ${String(v)}`);
    return t;
  };
  /** values: {theme id or name: colour}, onto a token. */
  const setValues = (tokenId: string, values: unknown, where: string) => {
    if (!values || typeof values !== 'object') return;
    for (const [th, colour] of Object.entries(values as Record<string, unknown>)) {
      if (typeof colour !== 'string' || !colour.trim()) throw new Error(`${where}: the colour for ${th} is not a colour`);
      setTokenValue(p, tokenId, themeId(th, where), colour.trim());
    }
  };
  const dataName = (v: unknown, where: string, self?: string): string => {
    const name = String(v ?? '').trim();
    if (!IDENT_RE.test(name)) throw new Error(`${where}: ${name || 'an empty name'} can't be a data source name (letters, digits and _, not starting with a digit)`);
    if (p.dataSources.some((d) => d.id !== self && d.name === name) || p.variables.some((x) => x.name === name)) throw new Error(`${where}: something is already called ${name}`);
    return name;
  };
  for (const [i, c] of changes.entries()) {
    const where = `change ${i + 1} (${c.op})`;
    const key = typeof c.ref === 'string' ? c.ref : undefined;
    switch (c.op) {
      case 'set_props': {
        // One layer (id) or the same props on several (ids)
        const ids = Array.isArray(c.ids) ? c.ids : [c.id];
        const props = resolveRefs(c.props) as Record<string, unknown>;
        for (const id of ids) {
          const loc = locate(p, ref(id));
          if (!loc) throw new Error(`${where}: no layer ${String(id)}`);
          for (const [k, v] of Object.entries(props)) {
            if (k === 'id' || k === 'type' || k === 'children') continue;
            setPath(loc.node as unknown as Record<string, unknown>, k, v);
          }
          syncRuns(loc.node, props);
          // An agent can set any value on any property: put wrong-typed ones right before the layer is shared
          sanitizeLayerInPlace(loc.node);
          fixStyleRefs(loc.node);
          touched.push(loc.node.id);
        }
        break;
      }
      case 'add_layer': {
        const ab = findAb(c.artboard_id);
        const node = build(c, where);
        let list = ab.children;
        if (c.parent_id) {
          const parent = locate(p, ref(c.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent ${String(c.parent_id)} is not a group or frame`);
          list = parent.node.children;
        }
        const index = typeof c.index === 'number' ? Math.max(0, Math.min(list.length, c.index)) : list.length;
        list.splice(index, 0, node);
        break;
      }
      case 'duplicate': {
        // count copies of a layer (with everything inside it), each dx, dy on from the last; with columns they wrap into a grid
        const loc = locate(p, ref(c.id));
        if (!loc) throw new Error(`${where}: no layer ${String(c.id)}`);
        const count = Math.max(1, Math.min(200, Math.floor(Number(c.count ?? 1)) || 1));
        const dx = typeof c.dx === 'number' ? c.dx : 20;
        const dy = typeof c.dy === 'number' ? c.dy : typeof c.dx === 'number' ? 0 : 20;
        const columns = typeof c.columns === 'number' && c.columns > 0 ? Math.floor(c.columns) : 0;
        const list = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        let at = list.indexOf(loc.node);
        for (let n = 1; n <= count; n++) {
          const copy = cloneWithNewIds(loc.node);
          copy.x = loc.node.x + (columns ? (n % columns) * dx : n * dx);
          copy.y = loc.node.y + (columns ? Math.floor(n / columns) * dy : n * dy);
          if (typeof c.name === 'string') copy.name = c.name.replace(/\{n\}/g, String(n + 1));
          list.splice(++at, 0, copy);
          if (key) created[count === 1 ? key : `${key}${n}`] = copy.id;
          touched.push(copy.id);
        }
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
      case 'delete_artboard': {
        const ab = findAb(c.id);
        if (p.artboards.length < 2) throw new Error(`${where}: a project needs at least one artboard`);
        const used = p.artboards.filter((a) => a.id !== ab.id && (a.master === ab.id || JSON.stringify(a.children).includes(`"${ab.id}"`)));
        if (used.length && !c.force) throw new Error(`${where}: ${ab.name} is used by ${used.map((a) => a.name).join(', ')} (as a page master or a component). Pass force true to delete it anyway.`);
        p.artboards = p.artboards.filter((a) => a.id !== ab.id);
        for (const a of p.artboards) if (a.master === ab.id) delete a.master;
        if (p.settings.startArtboardId === ab.id) p.settings.startArtboardId = p.artboards[0].id;
        break;
      }
      case 'set_artboard': {
        const ab = findAb(c.id);
        for (const [k, v] of Object.entries(resolveRefs(c.props ?? {}) as Record<string, unknown>)) {
          if (['id', 'children', 'timelines', 'logic'].includes(k)) continue;
          // A page master can be given by artboard name
          if (k === 'master' && typeof v === 'string') (ab as unknown as Record<string, unknown>)[k] = p.artboards.find((a) => a.id === v || a.name === v)?.id ?? v;
          else (ab as unknown as Record<string, unknown>)[k] = v;
        }
        // A page that fits its content is as tall as its layers now (the editor and player keep it so)
        if (ab.hugHeight) ab.height = huggedHeight(ab, ab.children);
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
        const { name, ...rest } = resolveRefs(c.props ?? {}) as Record<string, unknown>;
        //A new name goes through the rename, so what reads the variable follows it
        if (typeof name === 'string' && name.trim() && name.trim() !== v.name) {
          const to = name.trim();
          if (!IDENT_RE.test(to) || p.variables.some((x) => x.id !== v.id && x.name === to) || p.dataSources.some((d) => d.name === to)) throw new Error(`${where}: can't rename to ${to}`);
          renameVariable(p, v.id, to);
        }
        Object.assign(v, rest, { id: v.id, name: v.name });
        break;
      }
      case 'rename_variable': {
        //Through the same function as the Variables panel, so every binding, template, expression and (unless scripts: false) script follows
        const v = p.variables.find((x) => x.id === ref(c.id) || x.name === c.id);
        if (!v) throw new Error(`${where}: no variable ${String(c.id)}`);
        const to = String(c.name ?? '').trim();
        if (!IDENT_RE.test(to)) throw new Error(`${where}: ${to || 'an empty name'} is not a variable name (letters, digits and _, not starting with a digit)`);
        if (p.variables.some((x) => x.id !== v.id && x.name === to) || p.dataSources.some((d) => d.name === to)) throw new Error(`${where}: something is already called ${to}`);
        renameVariable(p, v.id, to, { scripts: c.scripts !== false });
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
          tracks: ((c.tracks as { node_id: string; prop: string; dip?: boolean; keys: { t: number; value: unknown; ease?: unknown }[] }[]) ?? []).map((tr) => ({
            id: uid('tr'),
            nodeId: ref(tr.node_id),
            prop: tr.prop,
            ...(tr.dip === true ? { dip: true } : {}),
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
          ab.logic.nodes.push({ id, kind: n.kind, x: n.x ?? 40 + j * 260, y: n.y ?? baseY, params: { ...defaults, ...paramIds(ab, n.kind, resolveRefs(n.params ?? {}) as Record<string, unknown>, where) }, ...(n.note ? { note: n.note } : {}) });
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
      case 'add_note': {
        // artboard_id puts the note on that artboard (x, y in its pixels); without one it sits on the canvas. layer_id makes it follow that layer
        const ab = c.artboard_id ? findAb(c.artboard_id) : null;
        const layer = c.layer_id && ab ? locate(p, ref(c.layer_id)) : null;
        if (c.layer_id && (!layer || layer.ab !== ab)) throw new Error(`${where}: no layer ${String(c.layer_id)} on that artboard`);
        const at = { x: typeof c.x === 'number' ? c.x : layer ? layer.node.x + layer.node.width + 12 : 0, y: typeof c.y === 'number' ? c.y : layer ? layer.node.y : 0 };
        const note = makeNote({ ...at, w: typeof c.w === 'number' ? c.w : undefined, h: typeof c.h === 'number' ? c.h : undefined, text: String(c.text ?? ''), colour: NOTE_COLOURS.includes(c.colour as never) ? (c.colour as Note['colour']) : undefined, author: typeof c.author === 'string' && c.author ? c.author : `${ctx().agent} (AI)`, created: new Date().toISOString() });
        // A layer's own box starts at its corner, so a note placed beside it keeps that offset
        if (layer) note.anchor = { layerId: layer.node.id, lx: Math.round((at.x - layer.node.x) * 10) / 10, ly: Math.round((at.y - layer.node.y) * 10) / 10 };
        if (ab) (ab.notes ??= []).push(note);
        else (p.notes ??= []).push(note);
        if (key) created[key] = note.id;
        break;
      }
      case 'add_graph_note': {
        // A note on an artboard's interaction graph (x, y in graph coordinates). node_id (a node or a group of that graph) makes it follow it; it is placed above it unless x and y say otherwise
        const ab = findAb(c.artboard_id);
        const host = c.node_id ? graphOrigin(ab, ref(c.node_id)) : undefined;
        if (c.node_id && !host) throw new Error(`${where}: no node or group ${String(c.node_id)} on ${ab.name}`);
        const at = { x: typeof c.x === 'number' ? c.x : host ? host.x : 0, y: typeof c.y === 'number' ? c.y : host ? host.y - 130 : 0 };
        const note = makeNote({ ...at, w: typeof c.w === 'number' ? c.w : 220, h: typeof c.h === 'number' ? c.h : 110, text: String(c.text ?? ''), colour: NOTE_COLOURS.includes(c.colour as never) ? (c.colour as Note['colour']) : undefined, author: typeof c.author === 'string' && c.author ? c.author : `${ctx().agent} (AI)`, created: new Date().toISOString() });
        if (host) note.anchor = { layerId: ref(c.node_id), lx: Math.round((at.x - host.x) * 10) / 10, ly: Math.round((at.y - host.y) * 10) / 10 };
        (ab.logic.notes ??= []).push(note);
        if (key) created[key] = note.id;
        break;
      }
      case 'set_note': {
        const found = findNote(p, ref(c.id));
        if (!found) throw new Error(`${where}: no note ${String(c.id)}`);
        const n = found.note;
        if (found.graph) {
          // a graph note follows a node or group (anchor_id; null lets go)
          for (const k of ['x', 'y', 'w', 'h'] as const) if (typeof c[k] === 'number') n[k] = c[k] as number;
          if (typeof c.text === 'string') n.text = c.text;
          if (NOTE_COLOURS.includes(c.colour as never)) n.colour = c.colour as Note['colour'];
          if (c.anchor_id === null) delete n.anchor;
          else if (typeof c.anchor_id === 'string') {
            const host = graphOrigin(found.ab!, ref(c.anchor_id));
            if (!host) throw new Error(`${where}: no node or group ${c.anchor_id} on that note's graph`);
            n.anchor = { layerId: ref(c.anchor_id), lx: Math.round((n.x - host.x) * 10) / 10, ly: Math.round((n.y - host.y) * 10) / 10 };
          }
          break;
        }
        for (const k of ['x', 'y', 'w', 'h'] as const) if (typeof c[k] === 'number') n[k] = c[k] as number;
        if (typeof c.text === 'string') n.text = c.text;
        if (NOTE_COLOURS.includes(c.colour as never)) n.colour = c.colour as Note['colour'];
        if (c.layer_id === null) delete n.anchor;
        else if (typeof c.layer_id === 'string') {
          const layer = locate(p, ref(c.layer_id));
          if (!layer || layer.ab !== found.ab) throw new Error(`${where}: no layer ${c.layer_id} on that note's artboard`);
          n.anchor = { layerId: layer.node.id, lx: Math.round((n.x - layer.node.x) * 10) / 10, ly: Math.round((n.y - layer.node.y) * 10) / 10 };
        }
        break;
      }
      case 'delete_note': {
        const found = findNote(p, ref(c.id));
        if (!found) throw new Error(`${where}: no note ${String(c.id)}`);
        found.list.splice(found.list.indexOf(found.note), 1);
        if (!found.list.length) {
          if (found.graph) delete found.ab!.logic.notes;
          else if (found.ab) delete found.ab.notes;
          else delete p.notes;
        }
        break;
      }
      case 'set_interaction': {
        // Change a node where it is, its edges untouched. Params merge into what it has (a null removes one)
        const ab = findAb(c.artboard_id);
        const n = ab.logic.nodes.find((x) => x.id === ref(c.id));
        if (!n) throw new Error(`${where}: no interaction node ${String(c.id)} on ${ab.name}`);
        if (c.params && typeof c.params === 'object') {
          const next = { ...n.params, ...paramIds(ab, n.kind, resolveRefs(c.params) as Record<string, unknown>, where) };
          for (const [k, v] of Object.entries(next)) if (v === null) delete next[k];
          n.params = next;
        }
        if (c.note === null || c.note === '') delete n.note;
        else if (typeof c.note === 'string') n.note = c.note;
        if (typeof c.x === 'number') n.x = c.x;
        if (typeof c.y === 'number') n.y = c.y;
        break;
      }
      case 'connect': {
        const ab = findAb(c.artboard_id);
        const from = ref(c.from);
        const to = ref(c.to);
        for (const id of [from, to]) if (!ab.logic.nodes.some((x) => x.id === id)) throw new Error(`${where}: no interaction node ${id} on ${ab.name}`);
        const fromPort = typeof c.from_port === 'string' ? c.from_port : 'out';
        if (!ab.logic.edges.some((e) => e.from === from && e.to === to && e.fromPort === fromPort)) {
          const e = { id: uid('e'), from, fromPort, to, toPort: 'in' };
          ab.logic.edges.push(e);
          if (key) created[key] = e.id;
        }
        break;
      }
      case 'disconnect': {
        // By the edge's id, or by its ends (and output, when the node has several)
        const ab = findAb(c.artboard_id);
        const before = ab.logic.edges.length;
        ab.logic.edges = ab.logic.edges.filter((e) => (c.id ? e.id !== ref(c.id) : !(e.from === ref(c.from) && e.to === ref(c.to) && (typeof c.from_port !== 'string' || e.fromPort === c.from_port))));
        if (ab.logic.edges.length === before) throw new Error(`${where}: no such connection`);
        break;
      }
      case 'add_theme': {
        // The first theme brings the starter themes and tokens with it, as the Themes tab does
        const fresh = !p.themes?.list.length;
        const th = addTheme(p, String(c.name ?? 'Theme'), c.copy_from ? themeId(c.copy_from, where) : undefined);
        if (c.mode === 'light' || c.mode === 'dark') th.mode = c.mode;
        if (c.high_contrast) th.highContrast = true;
        if (key) created[key] = th.id;
        if (fresh && c.starters === false) {
          p.themes!.list = [th];
          p.themes!.tokens = [];
        }
        break;
      }
      case 'remove_theme': {
        if (!removeTheme(p, themeId(c.id, where))) throw new Error(`${where}: the last theme can't go`);
        break;
      }
      case 'add_colourway': {
        // One of the branded colourways, as + Colourway in the Themes tab: its theme, and the brand tokens it needs
        const want = String(c.colourway ?? '').trim().toLowerCase();
        const way = ALL_COLOURWAYS.find((w) => w.id === want || w.name.toLowerCase() === want);
        if (!way) throw new Error(`${where}: no colourway ${String(c.colourway)} (${ALL_COLOURWAYS.map((w) => w.id).join(', ')})`);
        addColourwayTheme(p, way);
        if (c.default) p.themes!.default = `theme-${way.id}`;
        if (key) created[key] = `theme-${way.id}`;
        break;
      }
      case 'add_token': {
        const t = addToken(p, String(c.name ?? ''), typeof c.value === 'string' ? c.value : undefined);
        setValues(t.id, c.values, where);
        if (key) created[key] = t.id;
        break;
      }
      case 'set_token': {
        const t = tokenOf(c.id, where);
        if (typeof c.name === 'string' && c.name.trim()) t.name = c.name.trim();
        if (typeof c.value === 'string') for (const th of p.themes!.list) setTokenValue(p, t.id, th.id, c.value);
        setValues(t.id, c.values, where);
        break;
      }
      case 'remove_token': {
        removeToken(p, tokenOf(c.id, where).id);
        break;
      }
      case 'set_themes': {
        // default: the theme the project opens in; follow: switch with the viewer's dark and contrast settings
        if (!p.themes?.list.length) throw new Error(`${where}: the project has no themes yet (add_theme)`);
        if (c.default !== undefined) {
          const id = themeId(c.default, where);
          // A branded colourway goes through the same path as the Inspector, so the brand record follows
          if (!setColourway(p, id)) p.themes.default = id;
        }
        if (typeof c.follow === 'boolean') p.themes.follow = c.follow;
        if (typeof c.learner_switcher === 'boolean') {
          if (c.learner_switcher) {
            if (!addLearnerSwitcher(p)) throw new Error(`${where}: a switcher needs two or more colourway themes (add_colourway)`);
          } else removeLearnerSwitcher(p);
        }
        break;
      }
      case 'set_project_settings': {
        for (const [k, v] of Object.entries(resolveRefs(c.props ?? {}) as Record<string, unknown>)) setPath(p.settings as unknown as Record<string, unknown>, k, v);
        if (typeof c.name === 'string' && c.name.trim()) p.name = c.name.trim().slice(0, 200);
        break;
      }
      case 'add_asset': {
        // The record for bytes upload_asset has already put on the server
        if (typeof c.id !== 'string' || !c.id) throw new Error(`${where}: an asset needs the id upload_asset gave it`);
        if (!p.assets.some((a) => a.id === c.id)) p.assets.push({ id: c.id, name: String(c.name ?? c.id), mime: String(c.mime ?? 'application/octet-stream'), size: Number(c.size) || 0 });
        if (key) created[key] = c.id;
        break;
      }
      case 'add_data_source': {
        // A file (asset_id; the edit tool uploads text for you) or an address fetched when the project plays
        const kind = (['json', 'csv', 'tsv', 'text'].includes(String(c.kind)) ? c.kind : 'json') as DataKind;
        const ds: DataSource = { id: uid('ds'), name: dataName(c.name, where), kind, source: c.url ? 'url' : 'asset' };
        if (c.url) {
          ds.url = String(c.url);
          if (typeof c.refresh === 'number' && c.refresh > 0) ds.refresh = c.refresh;
        } else {
          const asset = ref(String(c.asset_id ?? ''));
          if (!p.assets.some((a) => a.id === asset)) throw new Error(`${where}: give url, text or the asset_id of an uploaded file`);
          ds.assetId = asset;
        }
        p.dataSources.push(ds);
        if (key) created[key] = ds.id;
        break;
      }
      case 'set_data_source': {
        const ds = p.dataSources.find((d) => d.id === ref(c.id) || d.name === c.id);
        if (!ds) throw new Error(`${where}: no data source ${String(c.id)}`);
        if (c.name !== undefined) ds.name = dataName(c.name, where, ds.id);
        if (typeof c.kind === 'string' && ['json', 'csv', 'tsv', 'text'].includes(c.kind)) ds.kind = c.kind as DataKind;
        if (typeof c.url === 'string') {
          ds.source = 'url';
          ds.url = c.url;
          delete ds.assetId;
        }
        if (typeof c.asset_id === 'string') {
          ds.source = 'asset';
          ds.assetId = ref(c.asset_id);
          delete ds.url;
        }
        if (typeof c.refresh === 'number') ds.refresh = c.refresh;
        break;
      }
      case 'remove_data_source': {
        const before = p.dataSources.length;
        p.dataSources = p.dataSources.filter((d) => d.id !== ref(c.id) && d.name !== c.id);
        if (p.dataSources.length === before) throw new Error(`${where}: no data source ${String(c.id)}`);
        break;
      }
      case 'add_text_style': {
        // A named text style (H1, Body...); layers follow it with styleRefs.text and change when it does
        p.styles ??= { colors: [], texts: [] };
        const name = String(c.name ?? '').trim();
        if (!name) throw new Error(`${where}: a text style needs a name`);
        if (p.styles.texts.some((s) => s.name === name)) throw new Error(`${where}: there is a text style called ${name} already`);
        const d = DEFAULT_TEXT_STYLE;
        const st: TextStyleDef = { id: uid('ts'), name, fontFamily: d.fontFamily, fontSize: d.fontSize, fontWeight: d.fontWeight, fontStyle: d.fontStyle, lineHeight: d.lineHeight, letterSpacing: d.letterSpacing };
        Object.assign(st, textStyleProps(resolveRefs(c.props ?? {}) as Record<string, unknown>));
        p.styles.texts.push(st);
        stylesTouched = true;
        if (key) created[key] = st.id;
        break;
      }
      case 'set_text_style': {
        const st = p.styles?.texts.find((s) => s.id === ref(c.id) || s.name === c.id);
        if (!st) throw new Error(`${where}: no text style ${String(c.id)}`);
        if (st.library) throw new Error(`${where}: ${st.name} comes from a library, change it there`);
        Object.assign(st, textStyleProps(resolveRefs(c.props ?? {}) as Record<string, unknown>));
        stylesTouched = true;
        break;
      }
      default:
        throw new Error(`${where}: unknown op "${c.op}"`);
    }
  }
  // An agent can write any value into a note: put wrong-typed ones right before they are shared
  if (p.notes) {
    const list = cleanNotes(p.notes);
    if (list) p.notes = list;
    else delete p.notes;
  }
  // Layers following a style get its look now, as they would in the editor
  if (stylesTouched) syncNodeStyles(p);
  for (const ab of p.artboards) {
    if (ab.notes) {
      const list = cleanNotes(ab.notes);
      if (list) ab.notes = list;
      else delete ab.notes;
    }
    if (ab.logic.notes) {
      const list = cleanNotes(ab.logic.notes);
      if (list) ab.logic.notes = list;
      else delete ab.logic.notes;
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

/** The parts of a text style an agent can set, checked: anything else is dropped. A bare family gets the usual fallbacks. */
function textStyleProps(o: Record<string, unknown>): Partial<TextStyleDef> {
  const out: Partial<TextStyleDef> = {};
  if (typeof o.fontFamily === 'string' && o.fontFamily.trim()) out.fontFamily = o.fontFamily.includes(',') ? o.fontFamily : `"${o.fontFamily.replace(/"/g, '').trim()}", system-ui, sans-serif`;
  for (const k of ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const) if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k] as number;
  if (o.fontStyle === 'italic' || o.fontStyle === 'normal') out.fontStyle = o.fontStyle;
  if (typeof o.color === 'string') out.color = o.color;
  if (o.color === null) out.color = undefined;
  return out;
}

function setPath(obj: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split('.');
  if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return;
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (k === '__proto__' || k === 'constructor') return;
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = v;
}

// ---------------------------------------------------------------- reference text for agents

const coloursReference = () => `# Colour values
Anywhere a colour goes (fill.color, stroke.paint.color, color on text, buttons and links, gradient stops, barFill, shadow.color, chart colors, an artboard's background) takes:
- a CSS colour: "#1e1e1e", "rgb(30 30 30)", "rgba(0,0,0,0.5)", "transparent";
- a theme token, "token:<id>" or "token:<name>" (like "token:color/primary"), which takes its value from the theme being shown, so the layer follows Light, Dark, High contrast and any colourway. The edit tool stores a name as the token's id; "token:$ref" is a token add_token made earlier in the same batch. get_overview lists the tokens with their ids and values, and validate reports a token that does not exist (the editor shows those as "Missing token" and draws nothing).
A fill can also be a shader: {"type":"shader","preset":"<id>","uniforms":{"<name>":number},"animateInEditor":false} paints the layer with one of the starter shaders, clipped by its corner radius (rect, ellipse, frame, button and progress take one; a stroke or a gradient stop does not). The plain fill shows until it has drawn and again if it fails.
A paint is {"type":"solid","color":...}, or a gradient {"type":"linear","angle":90,"stops":[{"offset":0,"color":"token:color/primary"},{"offset":1,"color":"#ffffff"}]} (radial: "center", "radius"). Stops take tokens too.
At runtime scripts and bindings may hand back token strings as well: ix.node("Card").set("fill.color", "token:color/success") and a binding on fill.color that returns "token:color/error" both draw the token's colour in the theme being shown, by id or by name.
In a project with the starter tokens, a layer made by add_layer without a colour follows them as the editor's would: shapes color/surface-muted, text color/text, buttons color/button with color/on-button, inputs color/background with a color/border outline, links color/link, frames color/background. Give the colour yourself to override it.
Starter token names: ${STARTER_NAMES()}.
A token can hold a number or some words instead of a colour: kind "number" or "text" on the token. Those are never used as colours; expressions read them with token('its/name') and get whatever the theme being shown says, so one project can carry a density (a space/gap number, 24 in Roomy and 8 in Compact, bound to a frame's layout.gap) or a language (a ui/next text token, read in a text layer as {token('ui/next')}). A theme with no entry of its own falls back to the default theme's, the same as a colour.
Text styles (add_text_style) are the same idea for type: a layer with styleRefs: {text: "<style id or name>"} takes the style's font, size, weight, line height, spacing (and colour, when the style has one) and changes with it. A font family is stored with its fallbacks: "Open Sans" becomes "\\"Open Sans\\", system-ui, sans-serif", the way the editor writes it.`;

const RUNTIME_REFERENCE = `# How some runtime behaviour works (answers to questions agents have had)
- Script scope: every script (and every Run script node) runs as its own async function, with ix, event and vars in scope, so a const or function declared in one is not visible in another. globalThis is shared by all the scripts of one player, sandboxed or not: a run_on_start script can put helpers there (globalThis.fmt = (n) => n.toFixed(1)) for the others to use.
- Tokens at runtime: ix.node(x).set("fill.color", "token:...") and bindings returning "token:..." strings are drawn in the theme being shown, by id or by name (see read_reference("colours")).
- ix.drag.reset(layer) puts a draggable back where it was authored (its x and y when the page started) and back into the zone it started in, whatever ix.drag.put or the learner did since; with no layer, every draggable on the page. It updates the zone variables.
- ix.drag.enable(layer, false) switches dragging off for a draggable, or taking things off for a drop zone, for pointer and keyboard alike; a draggable being dragged at that moment goes back. A hidden zone (it, or a group or frame it is in, not visible) takes nothing anyway, by pointer or keyboard, so hiding one is enough.
- Drag events carry names, not ids: event.zone (the zone it landed in) and event.from (the zone it came from) are zone layer names, "" for none; event.target and event.layer are the dragged layer's name, event.tags its tags, event.keyboard whether it was moved by keyboard. Compare with names, or use the zone variables (draggable.zoneVariable, dropZone.contentsVariable).
- To check your work runs, validate catches broken references and bad expressions; the editor's Preview and its console are where runtime errors show. A headless run for agents is planned.`;

/** The starter token names, from the definitions the editor makes them from. */
const STARTER_NAMES = () => {
  const t = newProjectWithThemes('x').themes;
  return (t?.tokens ?? []).map((x) => x.name).join(', ');
};

/** One interaction node's reference entry, in full. */
const nodeReference = (d: (typeof CATALOG)[number]) =>
  `### ${d.kind} — ${d.label} (${d.category})\n${d.description}${d.gives ? `\nGives: ${d.gives.join(', ')}` : ''}${d.outputs.length > 1 || d.outputs[0]?.label ? `\nOutputs: ${d.outputs.map((o) => o.id).join(', ')}` : ''}\n${d.params.map((pd) => `- ${pd.key} (${pd.type}${pd.options ? `: ${pd.options.map((o) => o.value).join('|')}` : ''}${pd.default !== undefined ? `, default ${JSON.stringify(pd.default)}` : ''})${pd.help ? `: ${pd.help}` : ''}`).join('\n')}`;

function reference(topic: string, opts: { node?: string; category?: string } = {}): string {
  if (topic === 'interactions') {
    // The whole catalogue is over 50 KB, more than most agents' tool output takes in one go: an index unless asked for some
    if (opts.node) {
      const want = opts.node.split(',').map((x) => x.trim()).filter(Boolean);
      const hits = CATALOG.filter((d) => want.some((w) => d.kind === w || d.label.toLowerCase() === w.toLowerCase() || d.kind.endsWith(`.${w}`)));
      return hits.length ? hits.map(nodeReference).join('\n\n') : `No node ${opts.node}. read_reference("interactions") lists them.`;
    }
    if (opts.category) {
      const hits = CATALOG.filter((d) => d.category === opts.category);
      return hits.length ? hits.map(nodeReference).join('\n\n') : `No category ${opts.category}: ${[...new Set(CATALOG.map((d) => d.category))].join(', ')}.`;
    }
    {
      const cats = [...new Set(CATALOG.map((d) => d.category))];
      return (
        `Interaction nodes (${CATALOG.length}). For a node's settings, outputs and what it gives, call read_reference("interactions", node: "<kind>") (several: "event.drop, action.setVariable"), or category: "<category>" for a whole group.\n` +
        'Settings that point at a layer, variable, script, timeline, blend, artboard or asset take its id or its exact name; the edit tool stores the id.\n\n' +
        cats.map((cat) => `## ${cat}\n${CATALOG.filter((d) => d.category === cat).map((d) => `- ${d.kind}: ${d.label}. ${d.description.split(/(?<=\.)\s/)[0]}`).join('\n')}`).join('\n\n')
      );
    }
  }
  if (topic === 'interactions-all') return CATALOG.map(nodeReference).join('\n\n');
  if (topic === 'colours' || topic === 'colors') return coloursReference();
  if (topic === 'runtime') return RUNTIME_REFERENCE;
  if (topic === 'properties') return ANIMATABLE_PROPS.map((a) => `- ${a.prop} (${a.kind}): ${a.label}`).join('\n') + '\nOn a progress layer only: ' + layerOwnProps(createNode('progress')).map((a) => `${a.prop} (${a.kind}): ${a.label}`).join('; ') + '\nOn a connector layer only: ' + layerOwnProps(createNode('connector')).map((a) => `${a.prop} (${a.kind}): ${a.label}`).join('; ');
  if (topic === 'layers') {
    const types: NodeType[] = ['rect', 'ellipse', 'polygon', 'star', 'path', 'text', 'image', 'group', 'frame', 'button', 'input', 'link', 'embed', 'video', 'instance', 'draw', 'shader', 'progress', 'chart', 'connector', 'bone'];
    return (
      'Every layer has: id, type, name, x, y (top-left in the parent), width, height, rotation (deg), scaleX, scaleY, originX/originY (0-1), opacity, visible, locked, blendMode, cursor, depth (parallax, percent -100 to 100: while playing the layer shifts against the pointer, more the nearer it is; 0 is still; settings.parallax on the project {range px for depth 100, default 40; tilt true to follow a phone tilt too} sets how far), link {url, target}, shadow, blur, ariaLabel (text alternative), ariaDescription, role (button|checkbox|heading|image|region), headingLevel, ariaChecked, ariaExpanded, ariaPressed (a toggle button: true/false), ariaCurrent (true, or page|step|location|date|time: the current tab, page or step), liveRegion (a text layer read aloud by screen readers when its words change: polite|assertive), decorative (hide from assistive tech), focusable (tab stop override), tabOrder, shortcut (a key that clicks the layer, e.g. "r", "1", "Ctrl+Enter"), className, bindings {prop: expression}, converters {prop: [{type: format|round|invert|range|map|toNumber|toText|toBoolean|duration|expr, ...}]} (applied to the binding value in order), layoutItem, constraints, draggable {tags[], axis both|x|y, bounds none|parent|artboard|<layer id>, onMiss stay|return, hit center|pointer|overlap, grid, glideMs, step, tapToMove, holdToDrag, label, silent, zoneVariable} (let viewers drag the layer; also by keyboard and tap), dropZone {accepts[] (tags, empty = any), capacity (0 = no limit), whenFull reject|swap, snap none|center|topLeft, label, highlight, contentsVariable} (where draggable layers can be dropped; the zone goes behind the layers that go in it). Buttons and inputs take disabled (bindable) and disabledOpacity (0-1, default 0.5, how dimmed they look while disabled). states [{id, name?, when: hover|pressed|focus|disabled|expr, expr? (when expr), props {path: value}}] gives a layer the looks it takes on in a state, instead of a ternary in four or five bindings: props uses the same paths a binding does (fill.color, stroke.paint.color, color, opacity, scaleX, scaleY, cornerRadius), only what is listed changes, later states win over earlier ones, and a state beats a binding on the same property. The pointer states are the layer\'s own and only come on while it runs; an expr state shows on the canvas too. A frame or group can be an accordion: disclosure {open: one|many, variable (a number variable for one, counting from 0 with -1 for none; a list variable for many), toggle? (one only: clicking the open section closes it), panels? (a container inside it whose children are the panels, matched to the frame\'s other children in order, which makes it a set of tabs)}. Each child is a section: its first layer is the header and the rest is the panel, unless panels says otherwise. The clicking, the showing and the aria-expanded on each header are the frame\'s own job, so an accordion needs no interaction nodes. overlay {overlayId, trigger?, side?, offset?, inputs? (values handed to the overlay as it opens from this layer, by variable name, so one overlay can ask a different question from each layer; the page lists what it takes in props)} on a layer shows an overlay page for it: that layer is the target (a tooltip sits beside it), and the trigger is the same layer unless another id is given. The page is an artboard with overlay {kind: tooltip|modal|confirm|input (confirm asks with buttons, input asks for something typed and is what the editor calls a prompt; an old file\'s prompt is read as confirm), side?, offset?, scrim?, openVariable?, and for a tooltip fade? (ms to fade in and out; absent uses settings.hugDuration, 300 by default), tail? (a triangle pointing at the target, on unless false), stay? (stays open while the pointer is on the tooltip itself so links inside can be reached, on unless false)} on it. When the overlay page holds a single frame, that frame is the card: the overlay is drawn at the card\'s own auto-layout size (a tooltip as wide as its words), and the page is only where it is designed, set with set_artboard; an overlay page is never opened on its own, never counts in pageCount and never grows a fitted page. A modal, confirm or input shows while its openVariable is on, and a click on the trigger turns it on, so a Close button inside is a plain Set variable. A frame can be a dialog: dialog {modal (default true), scrim (a solid paint over the artboard behind it, drawn as its own full-page backdrop right under the dialog, so see-through parts of the dialog show the dimmed page), closeOnEscape (default true), closeOnOutsideClick, initialFocus (layer id), returnFocus (default true), openVariable (variable id: the frame shows while it is on, Escape turns it off)}. A dialog opens over the page: it never counts towards a fitted page height, and nor does any layer with hugIgnore true (toasts, tooltips, anything floating). An instance (a component) takes its box from fit: fill stretches the page to the box, contain letterboxes it, cover fills and crops, none draws it at its own size centred, and hug keeps the box width and lets its height follow whatever the page inside needs as it plays, easing the way that page does (the source artboard has to have hugHeight on; the height stored on the instance layer is ignored while it does). A repeater (frame or group with repeat {items, layout, gap, columns}) can carry repeat.select {mode: one|several, variable (variable id: a number from 0, -1 for none, when one; a list of numbers when several), toggle (one only: clicking the picked copy clears it)}: a click, Space or Enter on a copy picks it with no nodes, each copy sees isSelected (and item.selected on record items), copies become radios or checkboxes with aria-checked, arrows move between them. An auto layout also takes minWidth, maxWidth, minHeight and maxHeight (px): limits on the frame\'s own size, however it is decided (hugging, filling, stretched), with a min beating a max. A frame or group can carry keyNav {mode: list|grid|radio, orientation: vertical|horizontal|both, columns (grid on a container; a grid repeater uses its own), wrap, indexVariable (variable id, number from 0; setting it moves focus too when it is inside), countHidden (hidden copies keep their numbers and are stepped over)}: one item is the Tab stop and the arrows, Home and End move between a repeater\'s copies or a container\'s children; radio mode also selects (clicks) the item it lands on.\n' +
      'Text layers can hold rich text: runs: [{text, fontFamily?, fontSize?, fontWeight?, italic?, color?, underline?, strike?, letterSpacing?, link?: {url, target}}]; each run lists only how it differs from the layer\'s own text style. `text` always equals the runs joined (it is rewritten for you when you set runs); setting `text` alone replaces the runs with that plain text, so set `runs` to restyle part of a text.\n' +
      'Text layers can animate per letter/word/line with modifiers: [{unit: letter|word|line, start, end, offset (percent of the text; offset -100..100 slides the range), shape: square|ramp-up|ramp-down|triangle|round|smooth, ease?, randomize?, seed?, strength (0-100), x, y (px), rotation (deg), scale (factor), opacity (factor 0-1), color? (mix to), letterSpacing (px), blur (px)}]. Units inside the range get that fraction of each change. Animate them with timeline tracks on `modifiers.<index>.offset` (also start, end, strength, x, y, rotation, scale, opacity, color, letterSpacing, blur); a typewriter is a letter modifier with start 0, end 100, opacity 0 and an offset track from 0 to 100.\n' +
      'Script layers (type "draw", shown as "Script layer"): a box painted by a script every frame, for generative art, particles, charts and custom visualisations. Fields: code (the script), fps (0 = every frame, else a cap), pixelRatio ("auto" or a number), runInEditor (paint on the editor canvas, one still frame). The code defines function draw(g, t, dt) and optionally function setup(g); g records drawing commands, it is not a canvas. The script runs in the sandbox (projects with settings.scriptSandbox, the default; without the sandbox bundle the layer shows nothing). Errors stop that layer only. Starter scripts to adapt (set as `code`): ' + DRAW_TEMPLATES.map((t) => `"${t.name}"`).join(', ') + '. The g API:\n' + DRAW_API.map(([sig, what]) => `  ${sig}: ${what}`).join('\n') + '\nExample: {"type":"draw","name":"Pulse","width":320,"height":200,"code":"function draw(g, t) {\\n  g.clear(\'#10131a\');\\n  g.fill(\'#6f8cff\');\\n  g.circle(g.width / 2, g.height / 2, 24 + Math.sin(t * 2) * 8);\\n}"}.\n' +
      'Shader layers (type "shader", shown as "Shader layer"): a box painted by a GPU fragment shader (WebGL, GLSL). Fields: code, uniforms, fps (0 = every frame), pixelRatio ("auto" or a number, capped at 3), animateInEditor (run live on the editor canvas; default off, one still frame). The code defines void mainImage(out vec4 fragColor, in vec2 fragCoord): fragCoord is in canvas pixels with the origin bottom-left, fragColor is straight (not premultiplied) alpha. Built in: ' + SHADER_BUILTINS.join(', ') + ' (u_time seconds; u_resolution vec2 canvas pixels; u_mouse vec3 = pointer 0-1 over the layer with y up and z = 1 while the button is down; u_frame; v_uv vec2 0-1 y up). `uniforms` is a list of {name, type: ' + SHADER_UNIFORM_TYPES.join('|') + ', value, min?, max?}: the name is the GLSL identifier and is declared for the shader automatically, so the code just uses it (a color is a vec4; an image is a sampler2D plus name_size, a vec2; its value is an asset id). Values: float a number, vec2/3/4 an array, color a CSS colour, image an asset id. Animate them with timeline tracks on `uniforms.<index>.value` (a float, a colour, or an image asset id as a step), and `uniforms.<index>.value.<k>` (k = 0-3) for the parts of a vector; bindings use the same paths. A compile error stops that layer only: the editor shows the message with line numbers (in the code) and the layer shows a placeholder. All shader layers share one WebGL context, off-screen layers and hidden tabs are paused, and a layer that reads neither u_time nor u_mouse is only redrawn when something changes. Presets to start from (set code and uniforms to the same preset\'s): ' + SHADER_PRESETS.map((p) => `"${p.id}" (${p.name}${p.kind === 'filter' ? ', reads u_image' : ''})`).join(', ') + '. Example: {"type":"shader","name":"Glow","width":400,"height":240,"code":"void mainImage(out vec4 fragColor, in vec2 fragCoord) {\\n  vec2 uv = fragCoord / u_resolution;\\n  fragColor = vec4(uv, 0.5 + 0.5 * sin(u_time * speed), 1.0);\\n}","uniforms":[{"name":"speed","type":"float","value":1}]}.\n' +
      'Progress bars (type "progress"): a track with a bar filling it. Fields: value, max (both take bindings; value is animatable, so a timeline track or Animate property can fill it), fill/stroke (the track, any paints), barFill (the bar\'s paint), cornerRadius, orientation (horizontal | vertical), reverse (grow from the right or the top), semantics (progressbar | meter | none: the role and aria-valuenow/min/max/valuetext it carries; bars made for a screen reader need ariaLabel), valueText (a text template: {value}, {max}, {percent} and variables). Colours may be theme token references.\n' +
      'Pictures (type "image"): assetId, fit (cover | contain | fill) and an optional crop {x, y, zoom} that moves and zooms the picture inside its frame without touching the file: zoom is 1 to 20 (2 shows the middle quarter), x and y are fractions of the frame\'s width and height the picture is moved by (0.1 is a tenth to the right), and the frame clips the rest. Leave crop off for the picture as fit draws it. A new picture wants an ariaLabel saying what it shows (or decorative: true).\n' +
      'Charts (type "chart"): a column | bar | line | pie | donut chart drawn from data, an expression for a list: numbers, objects (label from labelKey, number from valueKey; blank guesses), [label, value] pairs, or one object. Fields: kind, data, labelKey, valueKey, colors (tokens or colours handed out in turn; varyColors for one each on bar, column and line), color (labels and axes), fontFamily, fontSize, min/max (fixed axis ends, null fits the data), gridlines, axisLabels, valueLabels, legend, hole (donut, 0.1-0.95), animate, table (a hidden data table for screen readers), decimals, prefix, suffix ({variable} slots work in both). An object item with hidden: true (or the field hiddenKey names) is a placeholder: a dashed empty mark with a ?, read out as hidden, kept out of the auto axis unless it also has a number. Clicks, presses, hovers and focus on a mark give event.index (the item\'s position) to On pointer and On focus nodes. Give it an ariaLabel.\n' +
      'Connectors (type "connector"): a line or arrow joining two layers that follows them, so you never position it. Fields: from and to, each {layer: layerId | {repeat: templateLayerId, index: "expression"} | "" for a loose point, side?: auto|top|right|bottom|left, offset?: px along the side, x?/y? for a loose point (in the connector\'s parent)}; route: straight | elbow | curved; stroke (the line: {paint, width, dash?, ...}, paints may be tokens); startCap/endCap: none | arrow | dot; capSize (0 = from the stroke width); gap (px short of each layer); cornerRadius (elbow corners and the label chip); label (text, {variable} slots work), labelAt (0-1 along the line), color (label text), fill (label background), fontFamily, fontSize, fontWeight. x, y, width, height and rotation are ignored (the box is worked out from the route; leave them 0). It is hidden while either layer is hidden or missing. To connect repeated layers: the repeater\'s template (its first child) has an id, copy i is id~i; put the connector in a repeater of its own over a list of links and use from.layer {repeat: templateId, index: "item.from"}. Decorative (hidden from screen readers) unless ariaLabel is set, so give the page a text alternative (a nested list) for what it shows. Stroke trimEnd animates a draw-in.\n' +
      'Shader filter: an image layer can also carry shaderFilter: {preset?, code, uniforms, fps?, pixelRatio?, animateInEditor?}. Same code and uniforms as a shader layer, plus u_image (sampler2D, the layer\'s own picture with its fit applied) and u_image_size; its uniforms animate and bind as `shaderFilter.uniforms.<index>.value`. It only works on image layers (not with a 9-slice) and the plain picture shows until the shader has drawn and if it fails. There is no generic filter for other layer types.\n' +
      'Bones (type "bone"): a container whose origin is its base; its width is its length, it points along local +x, and a child bone sits at its parent\'s tip (x = parent width, y = 0). Pose with x, y, rotation, scaleX/Y, width (all animatable). A path is skinned by `skin: {bones: [{bone: boneId, bind: [a,b,c,d,e,f]}], weights: [[{w: [{b: boneIndex, w: weight}]}]]}` (weights[subPath][point], up to 4 influences summing to 1; bind = inverse(boneWorld) * layerWorld at bind time); an image by `mesh: {vertices: [{x,y,u,v}], triangles: [i,j,k...], skin}`. Constraints `ik` (on the end bone: target, bones = chain length, invertBend, strength) and `distance` (target, distance px, mode within|outside|exact) pose bones before skinning.\n' +
      'Paths: paths: [{closed, points: [{x, y, in?: {x,y}, out?: {x,y}}]}] in the layer\'s own box. Paint: {type:"solid", color} | {type:"linear", angle, stops:[{offset, color}], from?: {x,y}, to?: {x,y}} | {type:"radial", stops, center?: {x,y}, radius?} | {type:"image", assetId, fit}. With from/to (or center/radius) a gradient sits exactly there, in px from the layer\'s top-left, instead of running corner to corner along the angle; they can be animated as `fill.from.x`, `fill.to.y`, `fill.center.x`, `fill.radius` (also `stroke.paint.…`, `fills.0.…`). Stroke: {paint, width, dash?, trimStart?, trimEnd?, trimOffset?, cap?, join?, align?: "center"|"inside"|"outside"}. Several fills and strokes: fill/stroke is the first (bottom) one and fills: Paint[] / strokes: Stroke[] hold the ones painted on top, bottom to top. All fills are under all strokes unless paintOrder says otherwise: paintOrder: ("fill"|"stroke")[], one entry per paint from the bottom up, e.g. ["stroke","fill"] draws the stroke under the fill (left out = plain order). Any paint or stroke may also have opacity (0-1), blend, visible (false hides it), feather (soft blur, px) and offsetX/offsetY, so a drop shadow is an extra fill that is dark, see-through, feathered and offset. Paths for set_props and tracks: "fills.0.color", "fills.0.opacity", "strokes.0.width", "strokes.0.paint.color".\n\nDefaults per type (what add_layer fills in):\n' +
      types.map((t) => `- ${t}: ${JSON.stringify(Object.fromEntries(Object.entries(createNode(t)).filter(([k]) => !['id', 'name', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'originX', 'originY', 'opacity', 'visible'].includes(k))))}`).join('\n')
    );
  }
  const t = TOPICS.find((x) => x.id === topic);
  if (t) return `# ${t.title}\n${t.summary}\n\n${topicBody(t)}`;
  return `Topics: interactions (index; node or category for detail), interactions-all (the whole catalogue, over 50 KB), properties, layers, colours, runtime, and the help pages: ${TOPICS.map((x) => x.id).join(', ')}`;
}

// ---------------------------------------------------------------- tools

const S = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required });
const str = (description: string) => ({ type: 'string', description });

/** The notes tools are conveniences over the edit tool, so they take the same path: one batch, live to everyone. */
const runEdit = (a: Record<string, unknown>, changes: Change[], explain: string): Promise<string> => {
  const edit = TOOLS.find((t) => t.name === 'edit')!;
  // (an undefined value would be sent as nothing at all by JSON, but applyChanges reads them as given, so leave them out)
  const clean = changes.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as Change);
  return edit.run({ project_id: a.project_id, changes: clean, explain });
};

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
    name: 'list_starters',
    description: 'What create_project can start from: the built-in starters, the branded starter packs (each in a colourway), and the saved templates this session can see.',
    inputSchema: S({}),
    run: async () => {
      const saved = await api<{ id: string; name: string; description?: string }[]>('templates').catch(() => []);
      return [
        '## Built-in starters (from: {starter: key})',
        ...STARTERS.map((s) => `- ${s.key}: ${s.name}. ${s.description}`),
        '',
        // The branded packs lay their pages out with the player's runtime, which needs a browser: make those in the editor
        `The branded starter packs can only be made in the editor (Templates on the home page). For their look in a blank project, add_colourway (${ALL_COLOURWAYS.map((w) => w.id).join(', ')}).`,
        '',
        '## Saved templates (from: {template_id})',
        ...(saved.length ? saved.map((t) => `- ${t.id}: ${t.name}${t.description ? `. ${t.description}` : ''}`) : ['None this session can see.']),
      ].join('\n');
    },
  },
  {
    name: 'create_project',
    description:
      'Make a new project and join its live session. from: "blank" (the default: the Light, Dark and High contrast themes with the starter tokens, Open Sans, one artboard), {starter: key} (a built-in starter, see list_starters) or {template_id} (a saved template). For a branded look, make it blank and add_colourway. Returns the id and the overview.',
    inputSchema: S({ name: str('Name of the new project'), folder: str('Optional: the folder to put it in on the home page'), from: { description: '"blank", {starter} or {template_id}' } }, ['name']),
    run: async (a) => {
      const name = String(a.name ?? '').trim().slice(0, 200) || 'Untitled project';
      const from = (a.from ?? 'blank') as string | { starter?: string; template_id?: string };
      let id: string;
      if (typeof from === 'object' && from?.template_id) {
        id = (await api<{ id: string }>(`templates/${encodeURIComponent(from.template_id)}/use`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: a.folder || null }) })).id;
      } else {
        let p: Project;
        if (typeof from === 'object' && from?.starter) {
          const builtin = starterByKey(from.starter);
          if (!builtin) throw new Error(`No starter ${from.starter}. list_starters has them (the branded packs can only be made in the editor)`);
          p = projectFromStarter(builtin, name);
        } else if (from === 'blank' || from === undefined) p = newProjectWithThemes(name);
        else throw new Error('from is "blank", {starter, colourway?} or {template_id}');
        // Every new project starts in the suite's font, as the editor's do
        if (!p.fonts.some((f) => f.family === 'Open Sans')) p.fonts.push({ family: 'Open Sans', source: 'google', weights: [400, 600, 700] });
        await api(`projects/${encodeURIComponent(p.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: p, rev: 0 }) });
        if (a.folder) await api(`projects/${encodeURIComponent(p.id)}/meta`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: String(a.folder) }) }).catch(() => undefined);
        id = p.id;
      }
      const s = join(id);
      await s.ready;
      const p = await loadProject(id);
      return `Made "${p.name}" [${p.id}] and joined it. Open it in the editor at ${ctx().base}/#/p/${p.id}\n\n${overview(p, {})}`;
    },
  },
  {
    name: 'upload_asset',
    description: 'Add a file to a project (a picture, a sound, a data file...) from base64 or plain text. Returns the asset id, for an image layer\'s assetId, a data source\'s asset_id, a fill {type:"image", assetId}, and so on.',
    inputSchema: S({ project_id: str('Project id'), name: str('File name, like "map.png"'), mime: str('Its type, like image/png (guessed from the name when left out)'), base64: str('The bytes, base64'), text: str('Or the contents as text') }, ['project_id', 'name']),
    run: async (a) => {
      const name = String(a.name ?? 'file');
      const mime = String(a.mime || guessMime(name));
      let bytes: Uint8Array;
      if (typeof a.base64 === 'string') bytes = Uint8Array.from(Buffer.from(a.base64.replace(/^data:[^,]*,/, ''), 'base64'));
      else if (typeof a.text === 'string') bytes = new TextEncoder().encode(a.text);
      else throw new Error('Give base64 or text');
      if (!bytes.length) throw new Error('The file is empty');
      const id = uid('as');
      const size = await putAsset(String(a.project_id), id, bytes, mime);
      await runEdit(a, [{ op: 'add_asset', id, name, mime, size }], `Add ${name}`);
      return `Uploaded ${name} (${size} bytes) as asset ${id}.`;
    },
  },
  {
    name: 'export_project',
    description: 'The project document as JSON (no file bytes: assets are records), or one part of it: settings, themes, styles, variables, scripts, dataSources, assets, fonts, artboards. For what the outline tools leave out.',
    inputSchema: S({ project_id: str('Project id'), part: str('Optional: one top-level part') }, ['project_id']),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      if (a.part) {
        const part = String(a.part);
        if (!(part in p)) return `The project has no ${part}. Parts: ${Object.keys(p).join(', ')}`;
        return JSON.stringify((p as unknown as Record<string, unknown>)[part], null, 1);
      }
      return JSON.stringify(p);
    },
  },
  {
    name: 'get_variables',
    description: 'Variables in full (the overview cuts long values short): id, type, starting value and settings. Give names for some of them.',
    inputSchema: S({ project_id: str('Project id'), names: { type: 'array', items: { type: 'string' }, description: 'Optional: names or ids' } }, ['project_id']),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      const want = Array.isArray(a.names) ? (a.names as string[]) : null;
      const list = want ? p.variables.filter((v) => want.includes(v.name) || want.includes(v.id)) : p.variables;
      return list.length ? JSON.stringify(list, null, 1) : 'No such variables.';
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
      'set_props {id or ids: [...], props: {path: value}} (paths like "fill.color", "stroke.width", "bindings.width"; ids sets the same props on several layers); ' +
      'add_layer {artboard_id, type, props?, children?: [{type, props?, children?, ref?}], parent_id?, index?, ref?} (a whole tree in one op; with no colour given a layer follows the starter tokens, as in the editor); ' +
      'duplicate {id, count?, dx?, dy?, columns?, name? ("Card {n}": the original is 1), ref?} (copies with everything inside, each dx/dy on from the last; with columns they wrap into a grid; refs are ref1, ref2...); delete {id}; move {id, parent_id?, artboard_id?, index?}; ' +
      'add_artboard {name, width, height, ref?}; delete_artboard {id, force?} (refuses while another page uses it as a page master or a component unless force is true; the start page moves to the first one left); set_artboard {id, props} (props include master (id or name of a page master artboard), masterHide [layer names], masterSlots {slot: text}, masterOver [layer ids, on the master], isMaster, and hugHeight true to fit the page height to its content as it plays (hugPadding px under the lowest layer, hugAnimate to ease the change, hugDuration ms or the project settings.hugDuration, default 300). A fitted page leaves out hidden layers, masks, dialog frames and any layer with hugIgnore true, so a dialog, toast or tooltip opens over the page instead of growing it. props [{variable (id), label?, help?}] says what the page takes when it is used as a component: each one is a field on every instance, set through InstanceNode.inputs by the variable\'s name, and the variable\'s own type and options decide the field. Declare them rather than describing them in a note); ' +
      'add_variable {name, type: number|string|boolean|color|enum|list, initial (for a list: JSON text, an array of objects), options? (enum), shared?, formula? (an expression worked out at the start), live? (needs a formula: keep it up to date as what it reads changes; read only, nothing can set it), user_data? (save for the learner, loaded before the start), persist?, ref?}; set_variable {id or name, props (formula, live, userData, persist...)}; rename_variable {id or name, name, scripts? (default true; false leaves scripts and code snippets alone)}: renames it and everything that names it, keeping saved learner values (never rename with set_variable); ' +
      'add_timeline {artboard_id, name, duration, loop: once|loop|pingpong, autoplay, tracks: [{node_id, prop, dip?, keys: [{t, value, ease}]}], ref?} (text, label and true/false keys hold until the next key and never ease; to soften a text change key opacity and/or blur dipping to 0 / 8 either side of it on separate tracks marked dip: true, which reduced motion leaves out); ' +
      'add_interactions {artboard_id, nodes: [{ref, kind, params, note?}], edges: [{from, to, from_port?}]} (from/to are refs or ids; params that point at a layer, variable, script, timeline, blend, artboard or asset take its id, its exact name or a $ref); remove_interactions {artboard_id, ids}; ' +
      'set_interaction {artboard_id, id, params? (merged in, null removes one), note?, x?, y?} (change a node in place, its connections kept); connect {artboard_id, from, to, from_port?}; disconnect {artboard_id, id} or {artboard_id, from, to, from_port?}; ' +
      'add_script {name, code, run_on_start, ref?}; set_script {id or name, code?, name?, run_on_start?}; ' +
      'add_theme {name, copy_from?, mode?: light|dark, high_contrast?, ref?} (the first one also makes Light, Dark, High contrast and the starter tokens); remove_theme {id}; add_colourway {colourway: gold|purple|blue|green|orange|red|high-contrast, default?} (as + Colourway in the Themes tab); ' +
      'add_token {name (like "color/accent"), value? (every theme), values? {theme id or name: colour}, ref?}; set_token {id or name, name?, value?, values?}; remove_token {id or name} (layers keep its colour); set_themes {default? (theme id or name), follow? (switch with dark mode and contrast settings), learner_switcher? (swatches that let learners pick a colourway)}; ' +
      'set_project_settings {props: {path: value}, name?} (paths into the project settings, as export_project shows them); ' +
      'add_data_source {name, kind: json|csv|tsv|text, text? (the file contents: uploaded for you) | url? (fetched when it plays, refresh? seconds) | asset_id?, ref?}; set_data_source {id or name, name?, kind?, url?, asset_id?, refresh?}; remove_data_source {id or name}; ' +
      'add_text_style {name, props: {fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, color?}, ref?}; set_text_style {id or name, props} (a layer follows one with props styleRefs: {text: id or name}); ' +
      'add_graph_note {artboard_id, node_id? (a node or group of its interaction graph to follow), x?, y?, w?, h?, text, colour?, ref?}; ' +
      'add_note {artboard_id? (omit for a note on the canvas), x?, y?, w?, h?, text, colour?: gold|orange|green|sky|purple|rose, layer_id? (follow that layer), ref?}; set_note {id, x?, y?, w?, h?, text?, colour?, layer_id? (null lets go)}; delete_note {id} (sticky notes for the people editing: never shown to players, see list_notes). ' +
      'Give "ref" to name something you create, then use "$ref" in later changes in the same batch (a colour can say "token:$ref"). Colours take "token:<name>" as well as "token:<id>". Read read_reference("layers"), ("interactions"), ("properties") and ("colours") first.',
    inputSchema: S({ project_id: str('Project id'), changes: { type: 'array', items: { type: 'object' } }, explain: str('One line saying what this does (shown in the editor log)') }, ['project_id', 'changes']),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const before = await loadProject(s.projectId);
      const changes = await uploadDataText(s.projectId, (a.changes as Change[]) ?? []);
      const { project, created, touched } = applyChanges(before, changes);
      const ops = diff(before, project);
      if (!ops.length) return 'Nothing changed.';
      await api(`projects/${encodeURIComponent(s.projectId)}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: s.clientId, ops }) });
      // Show people what the agent is working on
      const first = touched.map((id) => locate(project, id)).find(Boolean);
      if (first) await presence(s, { artboardId: first.ab.id, selection: touched.slice(0, 50), cursor: { x: first.ab.canvasX + first.node.x + first.node.width, y: first.ab.canvasY + first.node.y } });
      const problems = validate(project);
      return `Applied ${changes.length} change(s) as ${ops.length} op(s).${Object.keys(created).length ? `\nCreated: ${JSON.stringify(created)}` : ''}${problems.length ? `\n\nProblems now in the project:\n- ${problems.slice(0, 30).join('\n- ')}` : ''}`;
    },
  },
  {
    name: 'list_notes',
    description: 'The sticky notes in a project (or one artboard): id, where, colour, the layer it follows, who wrote it, and its text. Notes are the authors\' own annotations ("swap this photo before release", what a template\'s parts are for); the player, exports and share links never carry them. Read them before changing a project you did not make.',
    inputSchema: S({ project_id: str('Project id'), artboard_id: str('Optional: only the notes on this artboard (id or name)') }, ['project_id']),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      const ab = a.artboard_id ? p.artboards.find((x) => x.id === a.artboard_id || x.name === a.artboard_id) : undefined;
      if (a.artboard_id && !ab) throw new Error(`No artboard ${String(a.artboard_id)}`);
      return notesReport(p, ab?.id);
    },
  },
  {
    name: 'add_note',
    description: 'Leave a sticky note for the people editing this project, on an artboard (x, y in the artboard\'s pixels; the note can sit outside it) or on the canvas (leave artboard_id out). Give layer_id to attach it to a layer so it follows that layer (it is placed beside the layer unless x and y say otherwise). Text takes light markdown: **bold**, *italic*, `code`, "- " bullets, "[ ]" and "[x]" tasks. Players never see notes.',
    inputSchema: S(
      { project_id: str('Project id'), artboard_id: str('Artboard id or name (omit for a note on the canvas)'), x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', description: 'Width in note pixels (default 200)' }, h: { type: 'number', description: 'Height (default 120)' }, text: str('What the note says'), colour: str('gold, orange, green, sky, purple or rose'), layer_id: str('A layer on that artboard for the note to follow') },
      ['project_id', 'text'],
    ),
    run: async (a) => runEdit(a, [{ op: 'add_note', artboard_id: a.artboard_id, x: a.x, y: a.y, w: a.w, h: a.h, text: a.text, colour: a.colour, layer_id: a.layer_id, ref: 'note' }], 'Add a note'),
  },
  {
    name: 'add_graph_note',
    description: 'Leave a sticky note on an artboard\'s interaction graph, for the people reading the flows: what a chain or group does and why, what to change to adapt it, the output that is easy to miss. Give node_id (a node or group id from get_interactions) to attach it so it moves with that node or group; it is placed above it unless x and y (graph coordinates) say otherwise. Keep notes to 1 to 3 lines, with **bold** for the key idea and [ ] for what the author must do. Like every note it never reaches players, exports or share links. Edit or remove it with edit_note and remove_note.',
    inputSchema: S(
      { project_id: str('Project id'), artboard_id: str('Artboard id or name'), node_id: str('Node or group id to follow (optional)'), x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', description: 'Width (default 220)' }, h: { type: 'number', description: 'Height (default 110)' }, text: str('What the note says'), colour: str('gold, orange, green, sky, purple or rose') },
      ['project_id', 'artboard_id', 'text'],
    ),
    run: async (a) => runEdit(a, [{ op: 'add_graph_note', artboard_id: a.artboard_id, node_id: a.node_id, x: a.x, y: a.y, w: a.w, h: a.h, text: a.text, colour: a.colour, ref: 'note' }], 'Add a graph note'),
  },
  {
    name: 'edit_note',
    description: 'Change a note: its text, colour, position or size, or which layer it follows (layer_id null lets go), or for a graph note which node or group it follows (anchor_id, null lets go). Use list_notes for ids.',
    inputSchema: S({ project_id: str('Project id'), id: str('Note id'), text: str('New text'), colour: str('gold, orange, green, sky, purple or rose'), x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' }, anchor_id: { type: ['string', 'null'], description: 'A graph note only: the node or group to follow, or null to let go' }, layer_id: { type: ['string', 'null'], description: 'Layer to follow, or null to let go' } }, ['project_id', 'id']),
    run: async (a) => runEdit(a, [{ op: 'set_note', id: a.id, text: a.text, colour: a.colour, x: a.x, y: a.y, w: a.w, h: a.h, ...('layer_id' in a ? { layer_id: a.layer_id } : {}), ...('anchor_id' in a ? { anchor_id: a.anchor_id } : {}) }], 'Edit a note'),
  },
  {
    name: 'remove_note',
    description: 'Delete a sticky note.',
    inputSchema: S({ project_id: str('Project id'), id: str('Note id') }, ['project_id', 'id']),
    run: async (a) => runEdit(a, [{ op: 'delete_note', id: a.id }], 'Remove a note'),
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
    description: 'Reference for building: "layers" (layer types, fields and defaults), "interactions" (an index of the event/action/logic nodes; give node for one or more in full, or category for a group), "properties" (animatable/bindable property paths), "colours" (colour values, theme tokens by id or name, text styles), "runtime" (script scope, drag behaviour, what drag events carry), or any help page id (e.g. "expressions", "scripts", "auto-layout", "repeaters", "data-sources", "timelines", "themes"). No topic lists them.',
    inputSchema: S({ topic: str('Topic id'), node: str('interactions only: a node kind (or several, comma separated), like "event.drop"'), category: str('interactions only: event, action, logic...') }),
    run: async (a) => reference(String(a.topic ?? ''), { node: typeof a.node === 'string' ? a.node : undefined, category: typeof a.category === 'string' ? a.category : undefined }),
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

// ---------------------------------------------------------------- the Activity Designer's one-shot build

/** What the edit tool's changes can say, for the Activity Designer's "raw" part: its own description, and the interaction node kinds. */
function rawReference(): string {
  const edit = TOOLS.find((t) => t.name === 'edit')!;
  const kinds = CATALOG.map((d) => `${d.kind} (${d.label}): ${d.params.map((pd) => pd.key).join(', ') || 'no settings'}`).join('\n');
  return `${edit.description}\n\nInteraction node kinds for add_interactions (kind: its params):\n${kinds}`;
}

interface BuildOutcome {
  changed: boolean;
  /** What was done, plain words */
  notes: string[];
  warnings: string[];
  /** Problems the build could not solve itself: the new ones only, never ones the project had already */
  problems: string[];
  /** What validate said before this build (hand it back on the next build of the same request, so the same old problems stay old) */
  known: string[];
  created: Record<string, string>;
  ops: number;
}

/**
 * The Activity Designer's one build: a blueprint compiled into ordinary editor content (src/lib/designer-blueprint.ts) and sent
 * to the live room as ONE batch of ops, like the edit tool does, so it shows for everyone and is one step behind the restore point.
 * Only the problems this build caused come back; whatever the project already had wrong is left alone.
 */
async function buildBlueprint(projectId: string, bp: Blueprint, opts: { artboardId?: string; known?: string[] } = {}): Promise<BuildOutcome> {
  const s = join(projectId);
  await s.ready;
  const before = await loadProject(s.projectId);
  const out = compileBlueprint(before, bp, {
    artboardId: opts.artboardId,
    applyRaw: (p, changes) => {
      const r = applyChanges(p, changes as Change[]);
      return { project: r.project, created: r.created };
    },
  });
  const ops = diff(before, out.project);
  if (ops.length) {
    await api(`projects/${encodeURIComponent(s.projectId)}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: s.clientId, ops }) });
    const first = out.touched.map((id) => locate(out.project, id)).find(Boolean);
    if (first) await presence(s, { artboardId: first.ab.id, selection: out.touched.slice(0, 50), cursor: { x: first.ab.canvasX + first.node.x + first.node.width, y: first.ab.canvasY + first.node.y } });
  }
  const known = opts.known ?? validate(before);
  const had = new Set(known);
  const problems = [...out.problems, ...validate(out.project).filter((x) => !had.has(x))];
  return { changed: ops.length > 0, notes: out.notes, warnings: out.warnings, problems, known, created: out.created, ops: ops.length };
}

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
          'Interactives is a 2D interactive builder. Start with list_projects and join_session on the project the person is editing (so your edits show live and you can see their selection), or create_project for a new one (list_starters says what it can start from). Read read_reference("layers"), ("interactions"), ("colours") and ("runtime") before editing, make changes with edit (themes, tokens, data sources and text styles included), upload files with upload_asset, and check them with validate.',
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
export { TOOLS, applyChanges, buildBlueprint, rawReference, closeContext, handle, interactions, locate, notesReport, overview, reference, respond, sessions, setPath, syncRuns, validate };

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
