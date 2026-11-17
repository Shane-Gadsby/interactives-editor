import type { Artboard, DataSource, LogicNode, Project, Question, SceneNode, Variable, VariableType } from 'interactives-player';
import type { EditorState } from '../store/store';
import type { TourId } from './tour-targets';

/**
 * Guided tutorials: a tutorial's step can say how to tell it is done (a check, a pure question about the open project and the
 * editor) and what to point at (Show me). The tutorial's own module holds the `Guide`, keyed by the step's number. This file is
 * only types and small questions, no DOM and nothing from the player's runtime, because the help topics are loaded by the MCP
 * server too.
 */

/** Things that happened while the tutorial was open in the help, that the project cannot tell afterwards (it was played, previewed). */
export interface GuideSeen {
  /** The timeline's Play preview was pressed. */
  played: boolean;
  /** Record was switched on. */
  recorded: boolean;
  /** Preview was opened. */
  previewed: boolean;
}

export interface GuideCtx {
  project: Project;
  state: Pick<EditorState, 'activeArtboardId' | 'selection' | 'tool' | 'bottomTab' | 'recording'>;
  seen: GuideSeen;
}

export type Check = (c: GuideCtx) => boolean;

export interface GuideStep {
  /** True when the step has been done. Never throws (see runCheck). */
  check?: Check;
  /** What Show me points at: the first of these that is on screen. */
  show?: TourId | TourId[];
}

/** A tutorial's checks and targets by step number (the "3." of "## 3. Draw the box"). */
export type Guide = Record<number, GuideStep>;

/** A check that throws (an odd project, a half-built layer) just says no. */
export function runCheck(check: Check | undefined, ctx: GuideCtx): boolean {
  if (!check) return false;
  try {
    return check(ctx) === true;
  } catch {
    return false;
  }
}

/** The steps (by number) of a guide whose check passes now. */
export function passing(guide: Guide, ctx: GuideCtx): number[] {
  return Object.keys(guide)
    .map(Number)
    .filter((n) => guide[n]?.check && runCheck(guide[n].check, ctx))
    .sort((a, b) => a - b);
}

export const targetsOf = (s: GuideStep | undefined): TourId[] => (!s?.show ? [] : Array.isArray(s.show) ? s.show : [s.show]);

// ---------------------------------------------------------------- reading the project

/** Every layer on every page, containers' children included. */
export function allNodes(p: Project): SceneNode[] {
  return (p.artboards ?? []).flatMap(artboardNodes);
}

/** Every layer on one page, containers' children included. */
export function artboardNodes(ab: Artboard): SceneNode[] {
  const out: SceneNode[] = [];
  const go = (list: SceneNode[] | undefined) => {
    for (const n of list ?? []) {
      out.push(n);
      go((n as { children?: SceneNode[] }).children);
    }
  };
  go(ab.children);
  return out;
}

const byId = (p: Project): Map<string, SceneNode> => new Map(allNodes(p).map((n) => [n.id, n]));

const variableRef = (p: Project, ref: unknown): Variable | undefined => (typeof ref === 'string' ? p.variables?.find((v) => v.id === ref || v.name === ref) : undefined);

/** Does this node, or anything joined after it by an arrow, pass `then`? (The click that goes on to play an animation.) */
function reaches(ab: Artboard, from: LogicNode, then: (n: LogicNode) => boolean): boolean {
  const seen = new Set<string>([from.id]);
  const todo = [from.id];
  const nodes = new Map(ab.logic.nodes.map((n) => [n.id, n]));
  while (todo.length) {
    const id = todo.pop()!;
    for (const e of ab.logic.edges) {
      if (e.from !== id || seen.has(e.to)) continue;
      seen.add(e.to);
      const n = nodes.get(e.to);
      if (n && then(n)) return true;
      todo.push(e.to);
    }
  }
  return false;
}

// ---------------------------------------------------------------- the questions

/** The project has been named something other than the starting name. */
export const renamed: Check = (c) => {
  const n = c.project.name.trim();
  return n !== '' && n !== 'Untitled project';
};

/** At least `min` layers of this type (`rect`, `ellipse`, `text`, `button`, `frame`...), on any page. */
export const layers =
  (type: SceneNode['type'], min = 1): Check =>
  (c) =>
    allNodes(c.project).filter((n) => n.type === type).length >= min;

/** A layer of this type whose name matches. */
export const layerNamed =
  (type: SceneNode['type'], name: RegExp): Check =>
  (c) =>
    allNodes(c.project).some((n) => n.type === type && name.test(n.name));

/** At least `min` layers of any type whose name matches. */
export const named =
  (name: RegExp, min = 1): Check =>
  (c) =>
    allNodes(c.project).filter((n) => name.test(n.name)).length >= min;

/** A text layer that says this (a variable in braces, say). */
export const textHas =
  (part: string): Check =>
  (c) =>
    allNodes(c.project).some((n) => n.type === 'text' && n.text.includes(part));

/** A layer of this type with a binding on a property that starts with this (`fill`, `width`, `opacity`), reading `includes` when given. */
export const bound =
  (type: SceneNode['type'], prop: string, includes?: string): Check =>
  (c) =>
    allNodes(c.project).some((n) => n.type === type && Object.entries(n.bindings ?? {}).some(([k, f]) => (k === prop || k.startsWith(`${prop}.`)) && (!includes || String(f).includes(includes))));

/** A layer of this type that passes your own question (its shortcut, its repeat). */
export const layerWhere =
  <T extends SceneNode['type']>(type: T, ok: (n: Extract<SceneNode, { type: T }>) => boolean): Check =>
  (c) =>
    allNodes(c.project).some((n) => n.type === type && ok(n as Extract<SceneNode, { type: T }>));

/** At least `min` layers of this type that pass your own question. */
export const layersWhere =
  <T extends SceneNode['type']>(type: T, ok: (n: Extract<SceneNode, { type: T }>) => boolean, min: number): Check =>
  (c) =>
    allNodes(c.project).filter((n) => n.type === type && ok(n as Extract<SceneNode, { type: T }>)).length >= min;

/** A data source (a file, a link, shared responses) that passes your own question. */
export const dataSourceWhere =
  (ok: (d: DataSource) => boolean): Check =>
  (c) =>
    !!c.project.dataSources?.some(ok);

/** A group or frame that repeats over a list, named by what it repeats (`slides`, `cards`). */
export const repeats =
  (items?: string): Check =>
  (c) =>
    allNodes(c.project).some((n) => {
      const r = (n as { repeat?: { items?: string } | null }).repeat;
      return !!r && (!items || (r.items ?? '').includes(items));
    });

/** At least `min` timelines on any page. */
export const timelines =
  (min = 1): Check =>
  (c) =>
    c.project.artboards.reduce((n, ab) => n + ab.timelines.length, 0) >= min;

/** At least `min` timelines (on any page) that pass your own question (its name, its length, what it animates). */
export const timelineWhere =
  (ok: (t: Artboard['timelines'][number]) => boolean, min = 1): Check =>
  (c) =>
    c.project.artboards.reduce((n, ab) => n + ab.timelines.filter(ok).length, 0) >= min;

/** There is a timeline and none of them starts by itself. */
export const noAutoplay: Check = (c) => {
  const all = c.project.artboards.flatMap((ab) => ab.timelines);
  return all.length > 0 && all.every((t) => !t.autoplay);
};

/** Some layer's property has a track with at least `min` keys in it. */
export const keys =
  (min = 2): Check =>
  (c) =>
    c.project.artboards.some((ab) => ab.timelines.some((t) => t.tracks.some((tr) => tr.keys.length >= min)));

/** A variable with this name (and type, when given). */
export const variable =
  (name: string, type?: VariableType): Check =>
  (c) =>
    !!c.project.variables?.some((v) => v.name === name && (!type || v.type === type));

/** A variable with this name that passes your own question (it is worked out by a formula, say). */
export const variableWhere =
  (name: string, ok: (v: Variable) => boolean): Check =>
  (c) =>
    !!c.project.variables?.some((v) => v.name === name && ok(v));

/** Several variables, by name and type. */
export const variables =
  (...list: [string, VariableType?][]): Check =>
  (c) =>
    list.every(([name, type]) => variable(name, type)(c));

/** At least `min` pages. */
export const pages =
  (min: number): Check =>
  (c) =>
    c.project.artboards.length >= min;

/** A page with this name. */
export const pageNamed =
  (name: RegExp): Check =>
  (c) =>
    c.project.artboards.some((a) => name.test(a.name));

/** At least `min` logic nodes of this kind, on any page. */
export const nodesOfKind =
  (kind: string, min = 1): Check =>
  (c) =>
    c.project.artboards.reduce((n, ab) => n + ab.logic.nodes.filter((x) => x.kind === kind).length, 0) >= min;

/**
 * A "When clicked" (an On pointer event on a layer of this type, any type when none is given) with an arrow on to a node of the
 * kind asked for, and `min` of them in all. `ok` narrows the end node's settings (a variable's name, a page).
 */
export const clickThen =
  (layerType: SceneNode['type'] | null, kind: string, ok?: (n: LogicNode, p: Project) => boolean, min = 1): Check =>
  (c) => {
    const layers = byId(c.project);
    let found = 0;
    for (const ab of c.project.artboards) {
      for (const ev of ab.logic.nodes) {
        if (ev.kind !== 'event.pointer') continue;
        const target = layers.get(String(ev.params.target ?? ''));
        if (!target || (layerType && target.type !== layerType)) continue;
        if (reaches(ab, ev, (n) => n.kind === kind && (!ok || ok(n, c.project)))) found++;
      }
    }
    return found >= min;
  };

/** Is this the action that sets the variable with this name? (For clickThen's `ok`.) */
export const setsVariable =
  (name: string) =>
  (n: LogicNode, p: Project): boolean =>
    variableRef(p, n.params.variable)?.name === name;

/** A page uses another as its master. */
export const hasMaster: Check = (c) => c.project.artboards.some((a) => !!a.master);

/**
 * A question made by Add question (of this kind, any when none is given) that passes your own question. The sample text it starts
 * with is what tells an edited question from a new one.
 */
export const question =
  (kind?: Question['kind'], ok?: (q: Question) => boolean): Check =>
  (c) =>
    allNodes(c.project).some((n) => n.type === 'frame' && !!n.question && (!kind || n.question.kind === kind) && (!ok || ok(n.question)));

/** The score is worked out from the project's questions. */
export const scoredFromQuestions: Check = (c) => c.project.settings?.reporting?.scoreFrom === 'questions';

/** One of the things the editor saw while the tutorial was open. */
export const saw =
  (what: keyof GuideSeen): Check =>
  (c) =>
    c.seen[what];

/** A page-wide setting on the project, such as its title. */
export const titled: Check = (c) => (c.project.settings?.title ?? '').trim() !== '';

/** Pages came from a file (an import). */
export const imported: Check = (c) => c.project.artboards.some((a) => !!a.source);

/** Every check must pass. */
export const all =
  (...list: Check[]): Check =>
  (c) =>
    list.every((f) => f(c));

/** Any one check passing is enough. */
export const either =
  (...list: Check[]): Check =>
  (c) =>
    list.some((f) => f(c));
