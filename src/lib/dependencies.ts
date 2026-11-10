/**
 * Dependency analysis: what uses what in a project.
 *
 * `analyzeUsage(project)` is a pure function. For every artboard, asset, variable, data source, script and
 * timeline it lists where the thing is used, and flags the ones nothing uses. It also lists layers that other
 * things point at (interaction targets, constraint targets, timeline tracks) and references that point at
 * nothing any more.
 *
 * References by id (assets, artboards, timelines, scripts, layers) are exact. References by name (variables
 * and data sources inside expressions, templates, scripts and code snippets) come from reading the text, so
 * anything found only inside a script or code snippet is marked `loose`: it might be a false hit, but a miss
 * is unlikely.
 */
import { nodeLabel } from './plain-words';
import { variableLabel, CATALOG, CATALOG_BY_KIND, converterExpressions, isContainer, liveWriters, planLive, type Artboard, type DataSource, type Id, type Paint, type Project, type SceneNode, type Timeline, type Variable } from 'interactives-player';

export type EntityKind = 'artboard' | 'asset' | 'variable' | 'data' | 'script' | 'timeline' | 'layer';

/** Who is doing the using. Enough to select it in the editor. */
export type UsageSource =
  | { type: 'layer'; artboardId: Id; artboardName: string; id: Id; name: string; nodeType: string }
  | { type: 'logic'; artboardId: Id; artboardName: string; id: Id; name: string }
  | { type: 'joystick'; artboardId: Id; artboardName: string; id: Id; name: string }
  | { type: 'blend'; artboardId: Id; artboardName: string; id: Id; name: string }
  | { type: 'timeline'; artboardId: Id; artboardName: string; id: Id; name: string }
  | { type: 'artboard'; id: Id; name: string }
  | { type: 'script'; id: Id; name: string }
  | { type: 'data'; id: Id; name: string }
  | { type: 'font'; id: string; name: string }
  | { type: 'project'; id: string; name: string };

export interface Usage {
  by: UsageSource;
  /** What the use is, e.g. "fill image", "Go to artboard", "text template". */
  how: string;
  /** Found by reading code or text rather than from an id, so it may be a false hit. */
  loose?: boolean;
}

export interface UsageItem {
  kind: EntityKind;
  id: Id;
  name: string;
  /** Timelines and referenced layers: the artboard they belong to. */
  artboardId?: Id;
  artboardName?: string;
  usedBy: Usage[];
  /** Nothing uses it. Never set for layers. */
  unused: boolean;
}

/** A reference to something that does not exist (a deleted asset, layer, timeline ...). */
export interface MissingRef {
  by: UsageSource;
  what: EntityKind;
  ref: string;
  how: string;
  /** Set when it is not a missing thing but another problem, said in words after the name ("writes x, a live variable..."). */
  problem?: string;
}

export interface UsageReport {
  artboards: UsageItem[];
  assets: UsageItem[];
  variables: UsageItem[];
  dataSources: UsageItem[];
  scripts: UsageItem[];
  timelines: UsageItem[];
  /** Only layers that something else refers to. */
  layers: UsageItem[];
  missing: MissingRef[];
  unusedCount: number;
}

// ---------------------------------------------------------------- reading text

const IDENT = /[A-Za-z_$][\w$]*/g;
const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
const STRING_BODY = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/** Identifiers of an expression: string literals dropped, property names (after a dot) dropped. */
function exprIdents(src: string): Set<string> {
  const out = new Set<string>();
  const clean = src.replace(STRING, '""');
  for (const m of clean.matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)) out.add(m[0]);
  // `data.products` reaches the data source "products"
  for (const m of clean.matchAll(/(?<![\w$.])data\s*\.\s*([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  return out;
}

/** Everything that looks like a name in a script: every identifier anywhere, and the text of every string. */
function codeNames(src: string): { idents: Set<string>; strings: Set<string> } {
  const idents = new Set<string>();
  const strings = new Set<string>();
  for (const m of src.matchAll(IDENT)) idents.add(m[0]);
  for (const m of src.matchAll(STRING_BODY)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (s) strings.add(s);
  }
  return { idents, strings };
}

/** The expressions inside `{...}` slots of a template string (`{{` and `}}` are literal braces). */
function templateSlots(text: string): string[] {
  if (!text || !text.includes('{')) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{|\}\}|\{([^{}]+)\}/g)) if (m[1]) out.push(m[1]);
  return out;
}

const paintAsset = (p: Paint | null | undefined): string | null => (p && p.type === 'image' && p.assetId ? p.assetId : null);

// ---------------------------------------------------------------- the analysis

export function analyzeUsage(project: Project): UsageReport {
  const items = new Map<string, UsageItem>();
  const key = (kind: EntityKind, id: string) => `${kind}:${id}`;
  const missing: MissingRef[] = [];
  const seen = new Set<string>();

  const add = (kind: EntityKind, id: Id, name: string, extra: Partial<UsageItem> = {}): UsageItem => {
    const item: UsageItem = { kind, id, name, usedBy: [], unused: false, ...extra };
    items.set(key(kind, id), item);
    return item;
  };

  const sourceKey = (s: UsageSource) => `${s.type}:${s.id}`;
  /** Record a use. Same source doing the same thing twice is one entry. */
  const use = (kind: EntityKind, id: string, by: UsageSource, how: string, loose = false): boolean => {
    const item = items.get(key(kind, id));
    if (!item) return false;
    const k = `${key(kind, id)}|${sourceKey(by)}|${how}`;
    if (seen.has(k)) return true;
    seen.add(k);
    item.usedBy.push(loose ? { by, how, loose } : { by, how });
    return true;
  };
  /** Same, but an id that does not exist is reported as a broken reference. */
  const useId = (kind: EntityKind, id: unknown, by: UsageSource, how: string) => {
    if (typeof id !== 'string' || !id) return;
    if (!use(kind, id, by, how)) missing.push({ by, what: kind, ref: id, how });
  };

  // Entities
  for (const ab of project.artboards) add('artboard', ab.id, ab.name);
  for (const a of project.assets) add('asset', a.id, a.name);
  for (const v of project.variables) add('variable', v.id, variableLabel(v));
  for (const d of project.dataSources) add('data', d.id, d.name);
  for (const s of project.scripts) add('script', s.id, s.name);
  for (const ab of project.artboards) for (const t of ab.timelines) add('timeline', t.id, t.name, { artboardId: ab.id, artboardName: ab.name });

  const varByName = new Map<string, Variable>(project.variables.map((v) => [v.name, v]));
  const dataByName = new Map<string, DataSource>(project.dataSources.map((d) => [d.name, d]));
  const abByName = new Map<string, Artboard>(project.artboards.map((a) => [a.name, a]));
  const timelinesByName = new Map<string, Timeline[]>();
  for (const ab of project.artboards) for (const t of ab.timelines) timelinesByName.set(t.name, [...(timelinesByName.get(t.name) ?? []), t]);

  /** Variables and data sources named by an expression. */
  const useExpr = (expr: string, by: UsageSource, how: string, loose = false) => {
    if (!expr || !expr.trim()) return;
    for (const name of exprIdents(expr)) {
      const v = varByName.get(name);
      if (v) use('variable', v.id, by, how, loose);
      const d = dataByName.get(name);
      if (d) use('data', d.id, by, how, loose);
    }
  };

  /** What a script or code snippet seems to refer to. */
  const useCode = (code: string, by: UsageSource, how: string) => {
    if (!code || !code.trim()) return;
    const { idents, strings } = codeNames(code);
    for (const name of idents) {
      const v = varByName.get(name);
      if (v) use('variable', v.id, by, how, true);
      const d = dataByName.get(name);
      if (d) use('data', d.id, by, how, true);
    }
    for (const s of strings) {
      for (const t of timelinesByName.get(s) ?? []) use('timeline', t.id, by, how, true);
      use('timeline', s, by, how, true);
      const ab = abByName.get(s);
      if (ab) use('artboard', ab.id, by, how, true);
      use('artboard', s, by, how, true);
      use('asset', s, by, how, true);
      // names inside strings too, e.g. ix.get("score")
      const v = varByName.get(s);
      if (v) use('variable', v.id, by, how, true);
      const d = dataByName.get(s);
      if (d) use('data', d.id, by, how, true);
    }
  };

  // Settings, fonts, data sources
  const projectSrc: UsageSource = { type: 'project', id: 'settings', name: 'Project settings' };
  if (project.settings.startArtboardId) use('artboard', project.settings.startArtboardId, projectSrc, 'start artboard');
  useId('variable', project.settings.captions?.textVar, projectSrc, 'caption text');
  for (const f of project.fonts) {
    if (f.assetId) useId('asset', f.assetId, { type: 'font', id: f.family, name: f.family }, 'font file');
  }
  for (const v of project.variables) if (v.formula) useExpr(v.formula, { type: 'project', id: v.id, name: `Variable ${variableLabel(v)}` }, 'formula');
  for (const d of project.dataSources) {
    const by: UsageSource = { type: 'data', id: d.id, name: d.name };
    if (d.source === 'asset' && d.assetId) useId('asset', d.assetId, by, 'data file');
  }
  for (const s of project.scripts) {
    const by: UsageSource = { type: 'script', id: s.id, name: s.name };
    if (s.runOnStart) use('script', s.id, by, 'runs on start');
    useCode(s.code, by, 'script code');
  }

  // Artboards
  for (const ab of project.artboards) {
    const abSrc: UsageSource = { type: 'artboard', id: ab.id, name: ab.name };
    if (ab.master) useId('artboard', ab.master, abSrc, 'page master');
    const nodeById = new Map<string, SceneNode>();
    const walkAll = (list: SceneNode[]) => {
      for (const n of list) {
        nodeById.set(n.id, n);
        if (isContainer(n)) walkAll(n.children);
      }
    };
    walkAll(ab.children);

    const layerSrc = (n: SceneNode): UsageSource => ({ type: 'layer', artboardId: ab.id, artboardName: ab.name, id: n.id, name: n.name, nodeType: n.type });
    /** A layer being pointed at by something. Items for layers are created on demand. */
    const useLayer = (id: unknown, by: UsageSource, how: string) => {
      if (typeof id !== 'string' || !id) return;
      const n = nodeById.get(id);
      if (!n) {
        missing.push({ by, what: 'layer', ref: id, how });
        return;
      }
      if (!items.has(key('layer', id))) add('layer', id, n.name, { artboardId: ab.id, artboardName: ab.name });
      use('layer', id, by, how);
    };

    const bg = paintAsset(ab.background);
    if (bg) useId('asset', bg, abSrc, 'background image');

    const visit = (list: SceneNode[]) => {
      for (const n of list) {
        const by = layerSrc(n);
        const any = n as unknown as Record<string, unknown> & { fill?: Paint | null; stroke?: { paint?: Paint | null } | null; fills?: Paint[]; strokes?: { paint?: Paint | null }[] };

        useId('asset', n.cursorImage, by, 'cursor image');
        for (const f of [any.fill, ...(Array.isArray(any.fills) ? any.fills : [])]) {
          const fill = paintAsset(f);
          if (fill) useId('asset', fill, by, 'fill image');
        }
        for (const s of [any.stroke, ...(Array.isArray(any.strokes) ? any.strokes : [])]) {
          const stroke = paintAsset(s?.paint);
          if (stroke) useId('asset', stroke, by, 'stroke image');
        }

        if (n.type === 'image') useId('asset', n.assetId, by, 'image');
        if (n.type === 'video') useId('asset', n.assetId, by, 'video');
        if (n.type === 'draw') useCode(n.code, by, 'script layer code');
        // Pictures a shader reads (image uniforms of a shader layer or an image layer's shader filter)
        for (const u of (n.type === 'shader' ? n.uniforms : n.type === 'image' ? n.shaderFilter?.uniforms : undefined) ?? []) if (u.type === 'image' && typeof u.value === 'string' && u.value) useId('asset', u.value, by, 'shader image');
        if (n.type === 'chart' && n.data.trim()) useExpr(n.data, by, 'chart data');
        if (n.type === 'chart') for (const t of [n.prefix, n.suffix]) if (t) for (const e of templateSlots(t)) useExpr(e, by, 'chart prefix or suffix');
        if (n.type === 'connector') {
          //Each end names a layer (the template of a repeated one), and a copy-picking end holds an expression; the label holds slots
          for (const e of [n.from, n.to]) {
            const l = e?.layer;
            if (typeof l === 'string') useLayer(l, by, 'connector end');
            else if (l && typeof l.repeat === 'string') {
              useLayer(l.repeat, by, 'connector end');
              if (l.index?.trim()) useExpr(l.index, by, 'connector copy');
            }
          }
          if (n.label) for (const e of templateSlots(n.label)) useExpr(e, by, 'connector label');
        }
        if (n.type === 'progress' && n.valueText) for (const e of templateSlots(n.valueText)) useExpr(e, by, 'spoken value template');
        //the binding itself counts as the use; an input's out and both-ways value has to name a variable that is there
        const tied = n.type === 'input' && (n.bindingModes?.value === 'out' || n.bindingModes?.value === 'both') ? n.bindings?.value?.trim() : '';
        if (tied && !varByName.has(tied)) missing.push({ by, what: 'variable', ref: tied, how: 'input bound to variable' });
        if (n.type === 'instance') {
          useId('artboard', n.artboardId, by, 'instance of artboard');
          for (const name of Object.keys(n.inputs ?? {})) {
            const v = varByName.get(name);
            if (v) use('variable', v.id, by, 'instance input');
          }
        }

        for (const [prop, expr] of Object.entries(n.bindings ?? {})) useExpr(expr, by, `binding on ${prop}`);
        for (const [prop, list] of Object.entries(n.converters ?? {})) for (const expr of converterExpressions(list)) useExpr(expr, by, `converter on ${prop}`);
        if (isContainer(n) && n.repeat?.items) useExpr(n.repeat.items, by, 'repeater items');
        if (n.type === 'text' || n.type === 'link') for (const e of templateSlots(n.text)) useExpr(e, by, 'text template');
        if (n.type === 'text') for (const r of n.runs ?? []) if (r.link?.url) for (const e of templateSlots(r.link.url)) useExpr(e, by, 'link template');
        if (n.type === 'button') for (const e of templateSlots(n.label)) useExpr(e, by, 'label template');
        if (n.type === 'link') for (const e of templateSlots(n.href)) useExpr(e, by, 'link template');
        if (n.link?.url) for (const e of templateSlots(n.link.url)) useExpr(e, by, 'link template');

        for (const c of n.constraints ?? []) useLayer(c.target, by, `${c.type} constraint target`);
        for (const b of (n.type === 'path' ? n.skin : n.type === 'image' ? n.mesh?.skin : null)?.bones ?? []) useLayer(b.bone, by, 'skin bone');

        if (isContainer(n)) visit(n.children);
      }
    };
    visit(ab.children);

    // Timelines: their own autoplay, and the layers their tracks drive
    for (const t of ab.timelines) {
      const by: UsageSource = { type: 'timeline', artboardId: ab.id, artboardName: ab.name, id: t.id, name: t.name };
      if (t.autoplay) use('timeline', t.id, by, 'autoplays');
      for (const tr of t.tracks) useLayer(tr.nodeId, by, `track ${tr.prop}`);
      for (const a of t.audio ?? []) useId('asset', a.assetId, by, 'sound on a timeline');
    }

    // Blends: the timelines they mix and the variables that weight them
    for (const b of ab.blends ?? []) {
      const by: UsageSource = { type: 'blend', artboardId: ab.id, artboardName: ab.name, id: b.id, name: b.name || 'Blend' };
      if (b.mode === '1d') useId('variable', b.variable, by, 'blend input');
      for (const e of b.entries) {
        useId('timeline', e.timeline, by, 'blend entry');
        if (b.mode !== '1d') useId('variable', e.weightVariable, by, 'blend weight');
      }
    }

    // Joysticks
    for (const j of ab.joysticks ?? []) {
      const by: UsageSource = { type: 'joystick', artboardId: ab.id, artboardName: ab.name, id: j.id, name: j.name || 'Joystick' };
      useId('timeline', j.xTimeline, by, 'joystick x');
      useId('timeline', j.yTimeline, by, 'joystick y');
      useLayer(j.handle, by, 'joystick handle');
      useExpr(j.x, by, 'joystick x expression');
      if (j.y) useExpr(j.y, by, 'joystick y expression');
    }

    // Interaction graph
    for (const ln of ab.logic.nodes) {
      const def = CATALOG_BY_KIND[ln.kind];
      const by: UsageSource = { type: 'logic', artboardId: ab.id, artboardName: ab.name, id: ln.id, name: def ? nodeLabel(def) : ln.kind };
      for (const p of def?.params ?? []) {
        const value = ln.params[p.key];
        if (value === undefined || value === null || value === '') continue;
        const how = nodeLabel(def!);
        switch (p.type) {
          case 'node':
            useLayer(value, by, how);
            break;
          case 'timeline':
            useId('timeline', value, by, how);
            break;
          case 'variable':
            useId('variable', value, by, how);
            break;
          case 'variables':
            for (const id of Array.isArray(value) ? value : []) useId('variable', id, by, how);
            break;
          case 'script':
            useId('script', value, by, how);
            break;
          case 'asset':
            useId('asset', value, by, how);
            break;
          case 'artboard': {
            // the player accepts an id or a name
            const s = String(value);
            const target = items.has(key('artboard', s)) ? s : abByName.get(s)?.id;
            if (target) use('artboard', target, by, how);
            else missing.push({ by, what: 'artboard', ref: s, how });
            break;
          }
          case 'data': {
            const s = String(value);
            const target = items.has(key('data', s)) ? s : dataByName.get(s)?.id;
            if (target) use('data', target, by, how);
            else missing.push({ by, what: 'data', ref: s, how });
            break;
          }
          case 'expr':
            useExpr(String(value), by, how);
            break;
          default:
            // inline code snippets are plain "text" params
            if (ln.kind === 'action.code' && p.key === 'code') useCode(String(value), by, 'inline code');
        }
      }
    }
  }

  // An asset nothing explicit points at might still be named somewhere odd (a keyframed value, an embed's HTML):
  // look through the document text before calling it unused, since this is what gets offered for deletion.
  const unusedAssets = [...items.values()].filter((i) => i.kind === 'asset' && !i.usedBy.length);
  if (unusedAssets.length) {
    const raw = JSON.stringify({ artboards: project.artboards, scripts: project.scripts, variables: project.variables, dataSources: project.dataSources, fonts: project.fonts, settings: project.settings });
    for (const a of unusedAssets) {
      if (raw.includes(a.id)) use('asset', a.id, projectSrc, 'mentioned in the document', true);
    }
  }

  // Live variables: nodes that try to write one, and ones that read each other in a circle
  for (const w of liveWriters(project)) {
    // (the player names the node by its file name: say it the way the editor does)
    const said = CATALOG.find((d) => d.label === w.label);
    const shown = said ? nodeLabel(said) : w.label;
    missing.push({ by: { type: 'logic', artboardId: w.artboardId, artboardName: w.artboardName, id: w.nodeId, name: shown }, what: 'variable', ref: w.variable.name, how: shown, problem: `writes ${w.variable.name}, a live variable that is worked out from its formula, so it does nothing` });
  }
  for (const v of planLive(project).cyclic) {
    missing.push({ by: { type: 'project', id: v.id, name: `Variable ${variableLabel(v)}` }, what: 'variable', ref: v.name, how: 'live formula', problem: `${v.name} reads itself, or live variables that read it, so it stays at its starting value` });
  }

  const list = (kind: EntityKind) => [...items.values()].filter((i) => i.kind === kind);
  const mark = (arr: UsageItem[]) => {
    for (const i of arr) i.unused = i.usedBy.length === 0;
    return arr;
  };
  const report: UsageReport = {
    artboards: mark(list('artboard')),
    assets: mark(list('asset')),
    variables: mark(list('variable')),
    dataSources: mark(list('data')),
    scripts: mark(list('script')),
    timelines: mark(list('timeline')),
    layers: list('layer'),
    missing,
    unusedCount: 0,
  };
  report.unusedCount = [report.artboards, report.assets, report.variables, report.dataSources, report.scripts, report.timelines].reduce((n, a) => n + a.filter((i) => i.unused).length, 0);
  return report;
}

/** Ids of the assets nothing uses, the only kind the Usage view offers to remove. */
export function unusedAssetIds(report: UsageReport): string[] {
  return report.assets.filter((a) => a.unused).map((a) => a.id);
}
