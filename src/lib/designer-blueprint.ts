import { CATALOG_BY_KIND, cloneWithNewIds, createArtboard, createNode, defaultAutoLayout, relayoutTree, uid, walk, type Artboard, type ContainerNode, type FrameNode, type LogicNode, type Project, type Question, type QuestionKind, type SceneNode, type Variable } from 'interactives-player';
import { nodeNames, uniqueName } from '../store/doc';
import { describeIt } from './describe-it';
import { friendlyIdentifier } from './friendly-names';
import { RECIPE_BY_ID, applyBehaviour, buildBehaviour, incomplete } from './recipes';
import { addQuestion, setQuestionSettings } from './question-kit';
import { lookDefaults, lookFor } from './themes';

/**
 * The Activity Designer's blueprint: one short JSON plan from the AI (pages, what is on them, what happens when things are
 * clicked, questions) that this file turns into ordinary editor content, using the same code the editor's own tools use:
 * the question kit (Add question) for questions, Describe it and the behaviour recipes for what a button does, and the
 * project's own look (starter tokens, or the look of a page that is already there) for everything else. Nothing is written
 * that the editor couldn't have made by hand, and nothing is hidden: it is all layers, nodes and variables you can open.
 *
 * `compileBlueprint` is pure: it returns a changed copy of the project, what it made, and the problems it could not solve
 * itself (a behaviour it could not read, a page it could not find). The server (mcp/server.ts) sends the difference to the
 * live room as one batch, so it shows for everyone and sits behind the restore point.
 */

/** A thing on a page. Only the fields that fit its type are read; everything is clipped to a sane size. */
export interface BpElement {
  type?: string;
  name?: string;
  ref?: string;
  text?: string;
  label?: string;
  alt?: string;
  items?: unknown[];
  ordered?: boolean;
  level?: number;
  size?: string;
  align?: string;
  shape?: string;
  fill?: string;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  /** What it does when clicked, in plain words ("go to the next page", "add 1 to score"): one sentence, or a list with a step each. Read by Describe it. */
  does?: string | string[];
  /** A question: its kind and everything the kit takes. */
  kind?: string;
  prompt?: string;
  options?: unknown[];
  answer?: boolean;
  blanks?: unknown[];
  pairs?: unknown[];
  extras?: unknown[];
  groups?: unknown[];
  cards?: unknown[];
  hints?: unknown[];
  [key: string]: unknown;
}

export interface BpPage {
  /** An existing page's name (case does not matter) adds to it; a new name makes a new page. */
  name?: string;
  rename?: string;
  /** Page to copy the look from (its master, background, title). Defaults to the page that is open. */
  like?: string;
  /** Put the new page right after this one. */
  after?: string;
  title?: string;
  elements?: BpElement[];
}

export interface BpBehaviour {
  /** The layer, by name (or the ref of one made in this blueprint). */
  on?: string;
  page?: string;
  does?: string | string[];
}

export interface Blueprint {
  summary?: string;
  variables?: { name?: string; type?: string; initial?: unknown }[];
  pages?: BpPage[];
  behaviours?: BpBehaviour[];
  /** The edit tool's changes, for what a blueprint cannot say. Run last, with "$ref" naming layers made above. */
  raw?: Record<string, unknown>[];
}

export interface CompileOptions {
  /** The page the person has open (its look is the default one to copy). */
  artboardId?: string;
  /** The edit tool's own change writer, so raw changes go through exactly the code agents already use. */
  applyRaw?: (p: Project, changes: Record<string, unknown>[]) => { project: Project; created: Record<string, string> };
}

export interface CompileResult {
  project: Project;
  /** ref -> id, for what the blueprint named. */
  created: Record<string, string>;
  /** What was done, in plain words, one line each. */
  notes: string[];
  /** Things that look wrong but are worth a mention, not another round with the AI. */
  warnings: string[];
  /** Things it could not do or that stay broken: worth telling the AI. */
  problems: string[];
  /** Layer ids that are new (for showing people where the work is). */
  touched: string[];
  /** The page to show people first. */
  artboardId: string | null;
}

const MAX_PAGES = 12;
const MAX_ELEMENTS = 40;
const MAX_ITEMS = 30;

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/\s+$/g, '').slice(0, max);
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const list = (v: unknown, max = MAX_ITEMS): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

const QUESTION_KINDS: Record<string, QuestionKind> = {
  single: 'single',
  'multiple-choice': 'single',
  multiplechoice: 'single',
  mcq: 'single',
  choice: 'single',
  multiple: 'multiple',
  'multiple-response': 'multiple',
  multipleresponse: 'multiple',
  truefalse: 'truefalse',
  'true-false': 'truefalse',
  'true/false': 'truefalse',
  blank: 'blank',
  blanks: 'blank',
  'fill-in-the-blanks': 'blank',
  fill: 'blank',
  ordering: 'ordering',
  order: 'ordering',
  sort: 'ordering',
  matching: 'matching',
  match: 'matching',
  'drag-to-match': 'matching',
  categorise: 'categorise',
  categorize: 'categorise',
  group: 'categorise',
  groups: 'categorise',
};

/** How many lines a text takes, near enough: the editor measures the real thing the first time the page is drawn. */
function textHeight(text: string, fontSize: number, width: number, weight = 400, lineHeight = 1.3): number {
  const per = fontSize * (weight >= 600 ? 0.56 : 0.52);
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil((l.length * per) / Math.max(40, width))), 0);
  return Math.max(Math.ceil(fontSize * lineHeight), Math.ceil(lines * fontSize * lineHeight));
}

const FILLS = ['surface', 'muted', 'accent', 'primary'] as const;

interface Run {
  p: Project;
  notes: string[];
  warnings: string[];
  problems: string[];
  created: Record<string, string>;
  touched: string[];
  /** element -> the layer made for it, so a `does` can find it */
  made: Map<BpElement, string>;
  nodesMade: Set<string>;
  firstAb: string | null;
  openId: string | undefined;
}

const pagesOf = (p: Project): Artboard[] => p.artboards.filter((a) => !a.isMaster);
const findPage = (p: Project, name: string | undefined): Artboard | undefined => (name ? pagesOf(p).find((a) => same(a.name, name)) : undefined);

function findLayer(ab: Artboard, f: (n: SceneNode) => boolean): SceneNode | null {
  let hit: SceneNode | null = null;
  walk(ab.children, (n) => void (!hit && f(n) && (hit = n)));
  return hit;
}

/** The look of a page that is already there: its title layer, a button, and the font, so a new page matches it. */
function lookOf(ab: Artboard | undefined) {
  if (!ab) return { title: null as SceneNode | null, button: null as SceneNode | null, fontFamily: undefined as string | undefined };
  const title = ab.children.find((n) => n.type === 'text' && n.name === 'Page title') ?? null;
  const button = findLayer(ab, (n) => n.type === 'button');
  const anyText = findLayer(ab, (n) => n.type === 'text') as { fontFamily?: string } | null;
  return { title, button, fontFamily: (title as { fontFamily?: string } | null)?.fontFamily ?? anyText?.fontFamily };
}

interface Kit {
  fontFamily?: string;
  button: SceneNode | null;
  /** page width, for choosing text sizes */
  pageW: number;
}

const drawn = <T extends SceneNode['type']>(p: Project, type: T, partial: Record<string, unknown>): Extract<SceneNode, { type: T }> => createNode(type, { ...lookDefaults(p, type), ...partial } as never) as Extract<SceneNode, { type: T }>;

const sizeOf = (size: unknown, pageW: number): number => (size === 'small' ? 14 : size === 'large' ? 22 : size === 'normal' ? (pageW >= 900 ? 18 : 16) : pageW >= 900 ? 18 : 16);

function textLayer(run: Run, kit: Kit, el: BpElement, width: number, over: Record<string, unknown> = {}): SceneNode {
  const body = str(el.text, 2000) || ' ';
  const fontSize = (over.fontSize as number | undefined) ?? sizeOf(el.size, kit.pageW);
  const weight = (over.fontWeight as number | undefined) ?? 400;
  return drawn(run.p, 'text', {
    name: str(el.name, 60) || 'Text',
    text: body,
    width,
    height: textHeight(body, fontSize, width, weight),
    autoSize: 'height',
    fontSize,
    ...(kit.fontFamily ? { fontFamily: kit.fontFamily } : {}),
    ...(el.align === 'center' || el.align === 'right' ? { align: el.align } : {}),
    ...over,
  });
}

function heading(run: Run, kit: Kit, el: BpElement, width: number): SceneNode {
  const level = Math.round(num(el.level, 1, 3, 2));
  const fontSize = level === 1 ? 32 : level === 2 ? 24 : 20;
  return textLayer(run, kit, { ...el, name: str(el.name, 60) || (level === 1 ? 'Heading' : 'Subheading') }, width, { fontSize, fontWeight: 700, role: 'heading', headingLevel: level });
}

/** A button in the look of the one already on the page, or the project's own button look. */
function buttonLayer(run: Run, kit: Kit, el: BpElement): SceneNode {
  const label = str(el.label ?? el.text, 60) || 'Continue';
  const width = Math.round(num(el.w, 60, 600, Math.max(140, label.length * 11 + 56)));
  const base: Record<string, unknown> = {};
  const m = kit.button as unknown as Record<string, unknown> | null;
  if (m) {
    for (const k of ['fill', 'stroke', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'cornerRadius', 'height']) {
      if (m[k] !== undefined) base[k] = structuredClone(m[k]);
    }
  }
  return drawn(run.p, 'button', { height: 46, ...(kit.fontFamily ? { fontFamily: kit.fontFamily } : {}), ...base, name: str(el.name, 60) || `${label} button`, label, width, x: 0, y: 0 });
}

function fillOf(run: Run, name: unknown): unknown {
  const l = lookFor(run.p.themes);
  const key = FILLS.find((f) => f === name) ?? 'muted';
  const color = key === 'surface' ? l.surface : key === 'accent' ? l.button : key === 'primary' ? l.primary : l.surfaceMuted;
  return { type: 'solid', color };
}

function shapeLayer(run: Run, el: BpElement, width: number): SceneNode {
  const w = Math.round(num(el.w, 8, 2000, Math.min(width, 240)));
  const h = Math.round(num(el.h, 8, 2000, 120));
  const type = el.shape === 'ellipse' || el.shape === 'circle' ? 'ellipse' : 'rect';
  return drawn(run.p, type, { name: str(el.name, 60) || (type === 'ellipse' ? 'Ellipse' : 'Box'), width: w, height: h, fill: fillOf(run, el.fill), ...(type === 'rect' ? { cornerRadius: 12 } : {}), decorative: true });
}

/** A grey box that stands in for a picture, with its text alternative already written, ready to swap. */
function pictureLayer(run: Run, el: BpElement, width: number): SceneNode {
  const alt = str(el.alt ?? el.text ?? el.label, 200) || 'Picture';
  const w = Math.round(num(el.w, 40, 2000, Math.min(width, 360)));
  const h = Math.round(num(el.h, 40, 2000, Math.round(w * 0.65)));
  return drawn(run.p, 'rect', { name: str(el.name, 60) || `Picture: ${alt.slice(0, 40)}`, width: w, height: h, cornerRadius: 16, fill: fillOf(run, 'muted'), role: 'image', ariaLabel: alt });
}

function listLayer(run: Run, kit: Kit, el: BpElement, width: number): SceneNode {
  const rows = list(el.items).map((x) => str(typeof x === 'string' ? x : rec(x).text, 300)).filter(Boolean);
  const body = rows.map((r, i) => (el.ordered ? `${i + 1}. ${r}` : `• ${r}`)).join('\n') || ' ';
  return textLayer(run, kit, { ...el, text: body, name: str(el.name, 60) || 'List' }, width);
}

//---------------------------------------------------------------------------------------------------------------------
//Questions

const optionOf = (v: unknown, i: number) => {
  const o = typeof v === 'string' ? { text: v } : rec(v);
  return { id: `o${i + 1}`, text: str(o.text ?? o.label, 300), ...(o.correct === true ? { correct: true } : {}), ...(str(o.feedback, 400) ? { feedback: str(o.feedback, 400) } : {}) };
};

/** Add a question with the editor's own Add question, then fill it in. Says what is wrong when the answers do not add up. */
function questionLayer(run: Run, ab: Artboard, el: BpElement, parent: ContainerNode, label: string): string | null {
  let kind = QUESTION_KINDS[str(el.kind, 40).toLowerCase().replace(/\s+/g, '-')] ?? 'single';
  const patch: Partial<Question> = { prompt: str(el.prompt ?? el.text, 500) || 'Your question goes here' };
  const bad = (m: string) => run.problems.push(`${label}: ${m}`);

  if (kind === 'single' || kind === 'multiple') {
    const options = list(el.options, 12).map(optionOf).filter((o) => o.text);
    if (options.length < 2) bad('a choice question needs at least two options');
    const right = options.filter((o) => o.correct).length;
    if (!right) bad('no option is marked correct');
    if (kind === 'single' && right > 1) {
      kind = 'multiple';
      run.warnings.push(`${label} has more than one right answer, so it asks people to tick every right one`);
    }
    patch.options = options;
  } else if (kind === 'truefalse') {
    const opts = list(el.options, 2).map(optionOf).filter((o) => o.text);
    patch.options = opts.length === 2 && opts.some((o) => o.correct) ? opts : [{ id: 'o1', text: 'True', ...(el.answer !== false ? { correct: true } : {}) }, { id: 'o2', text: 'False', ...(el.answer === false ? { correct: true } : {}) }];
    if (el.answer === undefined && !(opts.length === 2 && opts.some((o) => o.correct))) bad('say whether the statement is true or false (answer: true or false)');
  } else if (kind === 'blank') {
    const blanks = list(el.blanks, 8).map((b, i) => {
      const o = rec(b);
      const answers = list(o.answers ?? o.answer, 10).map((a) => str(a, 120)).filter(Boolean);
      return { id: `b${i + 1}`, label: str(o.label, 200), answers, ...(typeof o.tolerance === 'number' ? { tolerance: o.tolerance } : {}), ...(o.caseSensitive === true ? { caseSensitive: true } : {}), ...(str(o.feedback, 300) ? { feedback: str(o.feedback, 300) } : {}) };
    });
    if (!blanks.length || blanks.some((b) => !b.answers.length)) bad('every blank needs at least one accepted answer');
    patch.blanks = blanks;
    if (el.answerBy === 'drag') patch.answerBy = 'drag';
  } else if (kind === 'ordering') {
    const items = list(el.items ?? el.options, 12).map((x, i) => ({ id: `o${i + 1}`, text: str(typeof x === 'string' ? x : rec(x).text, 300) })).filter((o) => o.text);
    if (items.length < 2) bad('an ordering question needs at least two items, listed in the right order');
    patch.options = items;
    patch.shuffle = true;
  } else if (kind === 'matching') {
    const pairs = list(el.pairs, 8).map((x, i) => ({ id: `p${i + 1}`, term: str(rec(x).term, 200), match: str(rec(x).match ?? rec(x).definition, 200) })).filter((x) => x.term && x.match);
    if (pairs.length < 2) bad('a matching question needs at least two pairs (term and match)');
    patch.pairs = pairs;
    const extras = list(el.extras, 8).map((x, i) => ({ id: `x${i + 1}`, text: str(typeof x === 'string' ? x : rec(x).text, 200) })).filter((x) => x.text);
    if (extras.length) patch.extras = extras;
    patch.shuffle = true;
  } else if (kind === 'categorise') {
    const groups = list(el.groups, 6).map((x, i) => ({ id: `g${i + 1}`, name: str(typeof x === 'string' ? x : rec(x).name, 100) })).filter((g) => g.name);
    const cards = list(el.cards, 24).map((x, i) => {
      const o = rec(x);
      const g = groups.find((gr) => same(gr.name, str(o.group, 100)));
      return { id: `c${i + 1}`, text: str(o.text, 200), group: g?.id ?? '', ...(str(o.feedback, 300) ? { feedback: str(o.feedback, 300) } : {}) };
    });
    if (groups.length < 2) bad('a sorting question needs at least two groups');
    if (!cards.length || cards.some((c) => !c.text || !c.group)) bad('every item to sort needs text and the name of the group it belongs in');
    patch.groups = groups;
    patch.cards = cards.filter((c) => c.text && c.group);
    patch.shuffle = true;
    if (el.dropFeedback === true) patch.dropFeedback = true;
  }

  const hints = list(el.hints, 4).map((h) => str(h, 300)).filter(Boolean);
  if (hints.length) patch.hints = hints;
  for (const k of ['feedbackCorrect', 'feedbackPartial', 'feedbackIncorrect', 'feedbackOutOfTries'] as const) if (str(el[k], 400)) patch[k] = str(el[k], 400);
  if (typeof el.attempts === 'number') patch.attempts = Math.round(num(el.attempts, 0, 10, 0));
  if (typeof el.shuffle === 'boolean') patch.shuffle = el.shuffle;
  if (typeof el.points === 'number') patch.points = num(el.points, 0, 100, 1);
  if (el.report === 'complete' || el.report === 'progress') patch.report = el.report;

  const id = addQuestion(run.p, ab.id, kind, { parentId: parent.id, checkLabel: str(el.checkLabel, 40) || undefined });
  if (!id) {
    bad('the question could not be added');
    return null;
  }
  setQuestionSettings(run.p, ab.id, id, patch);
  const frame = parent.children.find((n) => n.id === id) as FrameNode | undefined;
  if (frame && str(el.name, 60)) frame.name = uniqueName(nodeNames(ab).filter((n) => n !== frame.name), str(el.name, 60));
  return id;
}

//---------------------------------------------------------------------------------------------------------------------
//Pages

function newPage(run: Run, spec: BpPage, name: string, like: Artboard | undefined): Artboard {
  const p = run.p;
  const right = Math.max(0, ...p.artboards.map((a) => a.canvasX + a.width));
  const ab = createArtboard({
    name,
    width: like?.width ?? 1024,
    height: like?.height ?? 640,
    canvasX: right + 100,
    canvasY: 0,
    ...(like ? { background: structuredClone(like.background) } : {}),
    ...(like?.master ? { master: like.master } : {}),
  });
  if (like?.masterHide?.length) ab.masterHide = [...like.masterHide];
  const after = findPage(p, spec.after);
  const at = after ? p.artboards.indexOf(after) + 1 : (() => {
    const firstMaster = p.artboards.findIndex((a) => a.isMaster);
    return firstMaster < 0 ? p.artboards.length : firstMaster;
  })();
  p.artboards.splice(at, 0, ab);
  return ab;
}

/** Where a page's content starts and how wide it is: under the page's own title when it has one. */
function boxOf(ab: Artboard, title: SceneNode | null): { x: number; y: number; w: number; bottom: number } {
  const x = title ? Math.round(title.x) : ab.width >= 600 ? 48 : 24;
  const y = title ? Math.round(title.y + title.height + 28) : 40;
  //a master carries a logo and footer along the bottom edge
  const bottom = ab.height - (ab.master ? 90 : 40);
  return { x, y, w: ab.width - x * 2, bottom };
}

/** Add the blueprint's elements to a page, as one column that hugs what is in it (below anything already there). */
function fillPage(run: Run, ab: Artboard, spec: BpPage, isNew: boolean, like: Artboard | undefined) {
  const look = lookOf(isNew ? like : ab);
  const kit: Kit = { fontFamily: look.fontFamily, button: look.button, pageW: ab.width };
  let title: SceneNode | null = isNew ? null : (ab.children.find((n) => n.type === 'text' && n.name === 'Page title') ?? null);
  const titleText = str(spec.title, 120);
  const elements = list(spec.elements, MAX_ELEMENTS) as BpElement[];

  if (isNew && look.title) {
    //a page with a master gets the same title layer as its neighbours, with the new words in it
    const copy = cloneWithNewIds(structuredClone(look.title) as SceneNode, new Map());
    (copy as { text: string }).text = titleText || pageName(spec);
    delete (copy as { runs?: unknown }).runs;
    ab.children.push(copy);
    title = copy;
    run.touched.push(copy.id);
  }
  const box = boxOf(ab, title);

  //down the page from the first free spot
  let top = box.y;
  if (!isNew) {
    const lowest = Math.max(0, ...ab.children.filter((n) => n !== title && n.y + n.height <= box.bottom + 4).map((n) => n.y + n.height));
    if (lowest) top = Math.max(top, Math.round(lowest + 28));
  }

  const stack = createNode('frame', {
    name: uniqueName(nodeNames(ab), isNew ? 'Content' : 'Added content'),
    x: box.x,
    y: top,
    width: box.w,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 20, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'start', hugHeight: true },
  }) as FrameNode;

  ab.children.push(stack);
  const free: SceneNode[] = [];
  const place = (el: BpElement, node: SceneNode, into: ContainerNode) => {
    run.made.set(el, node.id);
    run.nodesMade.add(node.id);
    if (str(el.ref, 40)) run.created[str(el.ref, 40)] = node.id;
    //a layer with its own x and y is placed on the page, not in the column
    if (typeof el.x === 'number' && typeof el.y === 'number') {
      node.x = Math.round(el.x);
      node.y = Math.round(el.y);
      free.push(node);
    } else into.children.push(node);
  };

  const build = (el: BpElement, into: ContainerNode, width: number) => {
    const type = str(el.type, 20).toLowerCase();
    switch (type) {
      case 'heading':
        return place(el, heading(run, kit, el, width), into);
      case 'text':
        return place(el, textLayer(run, kit, el, width), into);
      case 'list':
        return place(el, listLayer(run, kit, el, width), into);
      case 'image':
      case 'picture':
        return place(el, pictureLayer(run, el, width), into);
      case 'button':
        return place(el, buttonLayer(run, kit, el), into);
      case 'shape':
        return place(el, shapeLayer(run, el, width), into);
      case 'question': {
        if (into !== stack) {
          run.problems.push(`${ab.name}: a question has to sit on its own in the page, not inside a row`);
          return;
        }
        const id = questionLayer(run, ab, el, into, `${ab.name}: the question "${str(el.prompt ?? el.text, 30)}"`);
        if (id) {
          const f = stack.children.find((n) => n.id === id);
          if (f && f.width > width) f.width = width;
          run.made.set(el, id);
          if (str(el.ref, 40)) run.created[str(el.ref, 40)] = id;
        }
        return;
      }
      case 'row': {
        const items = list(el.items, 6) as BpElement[];
        const row = createNode('frame', {
          name: uniqueName(nodeNames(ab), str(el.name, 60) || 'Row'),
          width,
          height: 60,
          fill: null,
          stroke: null,
          clip: false,
          layout: { ...defaultAutoLayout('row'), gap: 16, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'start', hugHeight: true },
        }) as FrameNode;
        const each = Math.floor((width - 16 * Math.max(0, items.length - 1)) / Math.max(1, items.length));
        for (const it of items) build(it, row, each);
        if (row.children.length) place(el, row, into);
        return;
      }
      default:
        run.problems.push(`${ab.name}: "${type || 'an element with no type'}" is not something a blueprint can make (heading, text, list, image, button, shape, question, row)`);
    }
  };

  if (titleText && !title) build({ type: 'heading', level: 1, text: titleText, name: 'Page title' }, stack, box.w);
  for (const el of elements) build(rec(el) as BpElement, stack, box.w);

  if (stack.children.length) {
    run.touched.push(stack.id);
    run.nodesMade.add(stack.id);
  } else ab.children.splice(ab.children.indexOf(stack), 1);
  for (const n of free) {
    ab.children.push(n);
    run.touched.push(n.id);
  }
  relayoutTree(ab.children);
  if (stack.children.length && stack.y + stack.height > box.bottom + 8) {
    run.warnings.push(`What was added to ${ab.name} runs past the bottom of the page, so it needs moving or a taller page`);
  }
  const made = stack.children.length + free.length;
  run.notes.push(`${isNew ? 'Added the page' : 'Added to the page'} ${ab.name}${made ? ` (${made} ${made === 1 ? 'layer' : 'layers'})` : ''}`);
  run.firstAb ??= ab.id;
}

const pageName = (spec: BpPage) => str(spec.name, 80) || 'New page';

//---------------------------------------------------------------------------------------------------------------------
//What things do

/** What a `does` says, as the list of sentences it is: one string, or an array with a step each. */
const sentencesOf = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map((x) => str(x, 300).trim()).filter(Boolean).slice(0, 8);

/**
 * The steps of what a layer does, put through Describe it, then written with the same recipe code the Behaviours dialog uses.
 * The first sentence carries the trigger ("when clicked, ..."; clicked when it says nothing), each one after it is another
 * step in the same flow, so "add 1 to score" and "show Hint" never get read as one run-on sentence.
 */
function behave(run: Run, ab: Artboard, layer: SceneNode, says: string[]): boolean {
  if (!says.length) return true;
  const said = says.join(', ');
  const lost = (why: string) => {
    run.problems.push(`${ab.name}: could not set up "${said}" on ${layer.name} (${why})`);
    return false;
  };
  const read = (s: string) => {
    const d = describeIt(s, run.p, ab, layer.id);
    if (!d) return { err: `"${s}" was not understood; use phrases like "go to the next page", "go to the page called X", "show X", "hide X", "add 1 to score", "say ..."` };
    if (d.missing.length) return { err: `not found in the project: ${d.missing.join(', ')}` };
    if (d.ignored.length) return { err: `these parts were not understood: ${d.ignored.join(', ')}` };
    const gap = incomplete(RECIPE_BY_ID[d.recipe], d.answers, run.p, ab);
    return gap ? { err: gap } : { d };
  };
  const first = read(says[0]);
  if (!first.d) return lost(first.err!);
  const main = first.d;
  const then = [...main.then];
  for (const s of says.slice(1)) {
    const more = read(s);
    if (!more.d) return lost(more.err!);
    then.push({ recipe: more.d.recipe, answers: more.d.answers }, ...more.d.then);
  }
  try {
    const b = buildBehaviour({ project: run.p, ab, layerId: main.layerId || layer.id }, main.recipe, main.trigger, main.answers, undefined, { when: main.when, then, only: main.only, otherwise: main.otherwise });
    const w = applyBehaviour((r) => r(run.p), ab.id, b);
    for (const id of w.nodeIds) run.nodesMade.add(id);
    run.notes.push(`${layer.name}: ${b.sentence}`);
    return true;
  } catch (e) {
    return lost((e as Error).message);
  }
}

/** Every element, with the ones inside a row after it. */
const flat = (els: BpElement[]): BpElement[] => els.flatMap((e) => [rec(e) as BpElement, ...(str(rec(e).type).toLowerCase() === 'row' ? flat(list(rec(e).items, 6) as BpElement[]) : [])]);

const abOf = (p: Project, id: string): Artboard | undefined => p.artboards.find((a) => a.id === id);

//---------------------------------------------------------------------------------------------------------------------
//Tidying what was just built, without asking anyone

/**
 * Take out nodes this build wrote that point at something that is not there, and events that start nothing. A person would
 * delete these by hand; doing it here saves a round with the AI.
 */
function tidyNodes(run: Run) {
  const p = run.p;
  const varIds = new Set(p.variables.map((v) => v.id));
  for (const ab of p.artboards) {
    const ids = new Set<string>();
    walk(ab.children, (n) => ids.add(n.id));
    const tl = new Set(ab.timelines.map((t) => t.id));
    const gone = new Set<string>();
    for (const n of ab.logic.nodes as LogicNode[]) {
      if (!run.nodesMade.has(n.id)) continue;
      const def = CATALOG_BY_KIND[n.kind];
      if (!def) continue;
      for (const pd of def.params) {
        const v = n.params[pd.key];
        if (v === undefined || v === '') continue;
        if ((pd.type === 'node' && !ids.has(String(v))) || (pd.type === 'timeline' && !tl.has(String(v))) || (pd.type === 'variable' && !varIds.has(String(v)))) gone.add(n.id);
      }
    }
    for (const n of ab.logic.nodes as LogicNode[]) {
      if (!run.nodesMade.has(n.id) || gone.has(n.id)) continue;
      if (CATALOG_BY_KIND[n.kind]?.category === 'event' && !ab.logic.edges.some((e) => e.from === n.id)) gone.add(n.id);
    }
    if (!gone.size) continue;
    ab.logic.nodes = ab.logic.nodes.filter((n) => !gone.has(n.id));
    ab.logic.edges = ab.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
    run.warnings.push(`${gone.size} unfinished step${gone.size === 1 ? ' was' : 's were'} left out of ${ab.name}`);
  }
}

//---------------------------------------------------------------------------------------------------------------------
//The whole blueprint

/** Is this the one fenced block the agent sent, as an object? */
export function readBlueprint(raw: unknown): Blueprint | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Blueprint) : null;
}

export function compileBlueprint(p0: Project, bp: Blueprint, opts: CompileOptions = {}): CompileResult {
  const run: Run = { p: structuredClone(p0), notes: [], warnings: [], problems: [], created: {}, touched: [], made: new Map(), nodesMade: new Set(), firstAb: null, openId: opts.artboardId };
  const p = run.p;

  //variables first, so a sentence can use them
  for (const v of list(bp.variables, 20)) {
    const o = rec(v);
    const raw = str(o.name, 60);
    const name = friendlyIdentifier(raw);
    if (!name) {
      if (raw) run.problems.push(`"${raw}" can't be a variable name`);
      continue;
    }
    if (p.variables.some((x) => x.name === name)) continue;
    const type = o.type === 'string' || o.type === 'boolean' ? o.type : 'number';
    const initial = type === 'number' ? (typeof o.initial === 'number' ? o.initial : 0) : type === 'boolean' ? o.initial === true : str(o.initial, 200);
    const made: Variable = { id: uid('v'), name, type, initial } as Variable;
    p.variables.push(made);
    run.notes.push(`Added the ${type === 'number' ? 'number' : type === 'boolean' ? 'switch' : 'text value'} ${name}`);
  }

  const pages = list(bp.pages, MAX_PAGES) as BpPage[];

  //renames, then every page that has to exist, before anything is wired between them
  for (const spec0 of pages) {
    const spec = rec(spec0) as BpPage;
    const have = findPage(p, spec.name);
    if (have && str(spec.rename, 80)) {
      const to = str(spec.rename, 80);
      run.notes.push(`Renamed the page ${have.name} to ${to}`);
      have.name = to;
      spec.name = to;
    }
  }
  const plan: { spec: BpPage; ab: Artboard; isNew: boolean; like: Artboard | undefined }[] = [];
  for (const spec0 of pages) {
    const spec = rec(spec0) as BpPage;
    const nm = pageName(spec);
    const have = findPage(p, spec.name);
    const open = opts.artboardId ? abOf(p, opts.artboardId) : undefined;
    const like = findPage(p, spec.like) ?? (open && !open.isMaster ? open : undefined) ?? pagesOf(p).at(-1);
    if (have) plan.push({ spec, ab: have, isNew: false, like: undefined });
    else plan.push({ spec, ab: newPage(run, spec, nm, like), isNew: true, like });
  }
  //page by page, in the order written
  for (const { spec, ab, isNew, like } of plan) fillPage(run, ab, spec, isNew, like);

  //what things do (every page exists by now, so "the Quiz page" can be found)
  for (const { spec, ab } of plan) {
    for (const el of flat(list(spec.elements, MAX_ELEMENTS) as BpElement[])) {
      const says = sentencesOf(rec(el).does);
      const id = run.made.get(el);
      if (!says.length || !id) continue;
      const layer = findLayer(ab, (n) => n.id === id);
      if (layer) behave(run, ab, layer, says);
    }
  }
  for (const b0 of list(bp.behaviours, 30)) {
    const b = rec(b0) as BpBehaviour;
    const on = str(b.on, 80);
    const only = findPage(p, b.page);
    let ab: Artboard | undefined;
    let layer: SceneNode | null = null;
    const refId = run.created[on];
    for (const a of only ? [only] : pagesOf(p)) {
      layer = findLayer(a, (n) => (refId ? n.id === refId : same(n.name, on)));
      if (layer) {
        ab = a;
        break;
      }
    }
    if (!layer || !ab) run.problems.push(`${b.page ? `${b.page}: ` : ''}there is no layer called "${on}" to attach "${sentencesOf(b.does).join(', ').slice(0, 120)}" to`);
    else behave(run, ab, layer, sentencesOf(b.does));
  }

  //anything the blueprint could not say, through the edit tool's own writer
  const raw = list(bp.raw, 60).map((c) => rec(c));
  if (raw.length && opts.applyRaw) {
    const sub = (v: unknown): unknown => (typeof v === 'string' && v.startsWith('$') && run.created[v.slice(1)] ? run.created[v.slice(1)] : Array.isArray(v) ? v.map(sub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)])) : v);
    try {
      const out = opts.applyRaw(p, raw.map((c) => sub(c) as Record<string, unknown>));
      run.p = out.project;
      Object.assign(run.created, out.created);
      run.notes.push(`Made ${raw.length} other change${raw.length === 1 ? '' : 's'} by hand`);
    } catch (e) {
      run.problems.push(`The extra changes could not be made: ${(e as Error).message}`);
    }
  }

  tidyNodes(run);
  for (const ab of run.p.artboards) relayoutTree(ab.children);

  return { project: run.p, created: run.created, notes: run.notes, warnings: run.warnings, problems: run.problems, touched: [...new Set(run.touched)], artboardId: run.firstAb };
}
