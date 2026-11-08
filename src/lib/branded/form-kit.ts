/**
 * How a branded starter declares the content an author fills in (the Fill in panel, `Project.contentForm`). A starter's form is a
 * function of `FormKit`, written beside the starter in its set's `forms.ts`, that names things the way the build does (a variable
 * by name, a layer by page and layer name, a question by its layer) and says what each is for. `resolveForm` runs it against the
 * built project and turns every name into an id, so the stored form (plain JSON in the document) survives renaming and travels
 * with Save as template. A form's fields also say which checklist items they are the answer to (`covers`), which links the item
 * to the field and lets a test fail when an item about content has no field.
 */
import { MAX_BLANKS, MAX_OPTIONS, walk, type Artboard, type ContentForm, type FormBind, type FormChoice, type FormColumn, type FormField, type FormRows, type FormSection, type Project, type Question, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { byName } from './kit';

export type Matcher = string | RegExp;

export interface Built {
  field: FormField;
  covers: Matcher[];
}

export interface SectionSpec {
  title: string;
  hint?: string;
  items: Built[];
}

export interface FormSpec {
  sections: SectionSpec[];
  /** Checklist items that are not content to type: the look and layout on the canvas (a picture's place, a spot on a diagram), how a page is wired. Done there or in the advanced panels, so not in the form. */
  elsewhere?: Matcher[];
}

export type FormMaker = (R: FormKit) => FormSpec;

interface Opts {
  id?: string;
  hint?: string;
  covers?: Matcher | Matcher[];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  /** Pictures, or videos or sounds, for an asset field. */
  kind?: 'image' | 'video' | 'audio';
}

interface ListOpts extends Opts {
  noun?: string;
  fixed?: boolean;
  maxRows?: number;
  minRows?: number;
  blank?: Record<string, unknown>;
  scalar?: boolean;
  /** Other list variables to keep one entry per row (name, entry to add). */
  sized?: Record<string, unknown>;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'field';
const list = (m?: Matcher | Matcher[]): Matcher[] => (m === undefined ? [] : Array.isArray(m) ? m : [m]);
const choices = (o: (string | FormChoice)[]): FormChoice[] => o.map((x) => (typeof x === 'string' ? { value: x, label: x } : x));

/** Column builders: `c.text('prompt', 'Question')`. */
export const c = {
  text: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'text', ...extra }),
  long: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'long', ...extra }),
  number: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'number', ...extra }),
  toggle: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'toggle', ...extra }),
  lines: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'lines', ...extra }),
  tags: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'tags', ...extra }),
  numbers: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'numbers', ...extra }),
  asset: (key: string, label: string, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'asset', ...extra }),
  choice: (key: string, label: string, options: (string | FormChoice)[], extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'choice', options: choices(options), ...extra }),
  /** One of the project's pages (`extra` options, such as an ending, can follow), or one of the question's groups. */
  from: (key: string, label: string, from: 'pages' | 'groups', options: (string | FormChoice)[] = [], extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'choice', from, options: choices(options), ...extra }),
  /** The right one of a row's answers: a pick among the lines of column `of`, counting from `base` (1 is the first). */
  pick: (key: string, label: string, of: string, base = 1, extra: Partial<FormColumn> = {}): FormColumn => ({ key, label, type: 'pick', of, base, ...extra }),
};

export class FormKit {
  constructor(readonly project: Project) {}

  // ------------------------------------------------------------ finding things

  /** A page by its name (exactly, else the first that starts with it), by its place counting from 0 among the pages that are not masters, or the first page. */
  page(ref: string | number | Artboard = 0): Artboard {
    if (typeof ref === 'object') return ref;
    const pages = this.project.artboards.filter((a) => !a.isMaster && !this.project.artboards.some((o) => o.master === a.id));
    const hit = typeof ref === 'number' ? pages[ref] : (pages.find((a) => a.name === ref) ?? pages.find((a) => a.name.startsWith(ref)));
    if (!hit) throw new Error(`form: no page ${JSON.stringify(ref)}`);
    return hit;
  }

  /** Every page that is not a master. */
  pages(match?: RegExp): Artboard[] {
    return this.project.artboards.filter((a) => !a.isMaster && !this.project.artboards.some((o) => o.master === a.id) && (!match || match.test(a.name)));
  }

  /** A layer by its name (the first with it, or the `nth` when several share the name, counting from 0). */
  node(page: string | number | Artboard, layer: string, nth = 0): { ab: Artboard; node: SceneNode } {
    const ab = typeof page === 'object' ? page : this.page(page);
    let node: SceneNode | undefined;
    if (nth === 0) node = byName(ab, layer);
    else {
      const all: SceneNode[] = [];
      walk(ab.children, (n) => void (n.name === layer && all.push(n)));
      node = all[nth];
    }
    if (!node) throw new Error(`form: no layer ${JSON.stringify(layer)}${nth ? ` number ${nth + 1}` : ''} on ${JSON.stringify(ab.name)}`);
    return { ab, node };
  }

  variable(name: string) {
    const v = this.project.variables.find((x) => x.name === name);
    if (!v) throw new Error(`form: no variable ${name}`);
    if (v.formula) throw new Error(`form: variable ${name} is worked out by a formula`);
    return v;
  }

  /** A layer's property as a binding. */
  layer(page: string | number | Artboard, layer: string, prop = 'text', nth = 0): FormBind {
    const { ab, node } = this.node(page, layer, nth);
    return { k: 'layer', a: ab.id, n: node.id, prop };
  }

  /** The graph node of a page with this label (or this kind), its parameter as a binding. */
  param(page: string | number | Artboard, find: (n: Artboard['logic']['nodes'][number]) => boolean, param: string): FormBind {
    const ab = this.page(page);
    const n = ab.logic.nodes.find(find);
    if (!n) throw new Error(`form: no matching graph node on ${ab.name}`);
    return { k: 'param', a: ab.id, n: n.id, param };
  }

  /** A path inside a question layer's settings as a binding (`['blanks', 0, 'answers']`). */
  q(page: string | number | Artboard, layer: string, path: (string | number)[]): FormBind {
    const { ab, node } = this.question(page, layer);
    return { k: 'q', a: ab.id, n: node.id, path };
  }

  /** One value inside a list variable: `R.item('stages', 0, 'title')`. */
  item(varName: string, index: number, key?: string): FormBind {
    return { k: 'var', v: this.variable(varName).id, path: key === undefined ? [index] : [index, key] };
  }

  /** The project's pass mark, as a percentage. */
  passMark(label = 'Pass mark', o: Opts = {}): Built {
    return this.make(label, 'number', { id: 'pass-mark', unit: '%', min: 0, max: 100, step: 5, ...o }, { bind: { k: 'project', path: ['settings', 'reporting', 'passMark'] } });
  }

  question(page: string | number | Artboard, layer: string): { ab: Artboard; node: SceneNode & { question: Question } } {
    const { ab, node } = this.node(page, layer);
    if (node.type !== 'frame' || !node.question) throw new Error(`form: ${layer} is not a question`);
    return { ab, node: node as SceneNode & { question: Question } };
  }

  // ------------------------------------------------------------ single fields

  private make(label: string, type: FormField['type'], o: Opts, extra: Partial<FormField>): Built {
    const field: FormField = { id: o.id ?? slug(label), label, type, ...(o.hint ? { hint: o.hint } : {}), ...(o.unit ? { unit: o.unit } : {}), ...(o.min !== undefined ? { min: o.min } : {}), ...(o.max !== undefined ? { max: o.max } : {}), ...(o.step !== undefined ? { step: o.step } : {}), ...(o.kind ? { kind: o.kind } : {}), ...extra };
    return { field, covers: list(o.covers) };
  }

  text(varName: string, label: string, o: Opts = {}): Built {
    return this.make(label, 'text', { id: varName, ...o }, { bind: { k: 'var', v: this.variable(varName).id } });
  }
  long(varName: string, label: string, o: Opts = {}): Built {
    return this.make(label, 'long', { id: varName, ...o }, { bind: { k: 'var', v: this.variable(varName).id } });
  }
  number(varName: string, label: string, o: Opts = {}): Built {
    return this.make(label, 'number', { id: varName, ...o }, { bind: { k: 'var', v: this.variable(varName).id } });
  }
  toggle(varName: string, label: string, o: Opts = {}): Built {
    return this.make(label, 'toggle', { id: varName, ...o }, { bind: { k: 'var', v: this.variable(varName).id } });
  }
  choice(varName: string, label: string, options: (string | FormChoice)[], o: Opts = {}): Built {
    return this.make(label, 'choice', { id: varName, ...o }, { options: choices(options), bind: { k: 'var', v: this.variable(varName).id } });
  }
  /** A list of numbers (a place in a list, counting from 0), typed with commas, bound to a list variable. */
  numbers(varName: string, label: string, o: Opts = {}): Built {
    return this.make(label, 'numbers', { id: varName, ...o }, { bind: { k: 'var', v: this.variable(varName).id } });
  }
  /** A list of plain values (one per line) bound to a list variable. */
  lines(varName: string, label: string, o: Opts = {}): Built {
    return this.make(label, 'lines', { id: varName, ...o }, { bind: { k: 'var', v: this.variable(varName).id } });
  }

  /** The text of a layer (a button's label with `prop: 'label'`). */
  layerText(page: string | number | Artboard, layer: string, label: string, o: Opts & { long?: boolean; prop?: string; nth?: number } = {}): Built {
    const { ab, node } = this.node(page, layer, o.nth ?? 0);
    return this.make(label, o.long || o.rows ? 'long' : 'text', { id: o.id ?? `${slug(ab.name)}-${slug(layer)}${o.nth ? `-${o.nth + 1}` : ''}`, ...o }, { bind: { k: 'layer', a: ab.id, n: node.id, prop: o.prop ?? 'text' }, show: { a: ab.id, n: node.id } });
  }

  /** A picture slot: a placeholder shape or an image layer the author's picture goes into. */
  picture(page: string | number | Artboard, layer: string, label: string, o: Opts & { hint?: string | string[] } = {}): Built {
    return this.make(label, 'asset', { id: o.id ?? `${slug(this.page(page).name)}-${slug(layer)}`, ...o }, { bind: this.slot(page, layer, o.hint) });
  }

  /** A picture slot as a binding; `hint` names the "Replace with your picture" text layers to hide once there is one. */
  slot(page: string | number | Artboard, layer: string, hint?: string | string[]): FormBind {
    const { ab, node } = this.node(page, layer);
    const fill = (node as unknown as { fill?: unknown }).fill;
    const hide = (Array.isArray(hint) ? hint : hint ? [hint] : []).map((h) => this.node(ab, h).node.id);
    return { k: 'slot', a: ab.id, n: node.id, ...(fill ? { restore: JSON.parse(JSON.stringify(fill)) } : {}), ...(hide.length ? { hide } : {}) };
  }

  /** A value of a graph node (a delay in milliseconds). */
  nodeParam(bind: FormBind, label: string, type: Exclude<FormField['type'], 'list'>, o: Opts = {}): Built {
    return this.make(label, type, o, { bind });
  }

  // ------------------------------------------------------------ lists

  private build(label: string, o: ListOpts, columns: FormColumn[], rows: FormRows): Built {
    return this.make(label, 'list', o, { rows, columns, ...(o.noun ? { noun: o.noun } : {}), ...(o.fixed ? { fixed: true } : {}), ...(o.maxRows !== undefined ? { maxRows: o.maxRows } : {}), ...(o.minRows !== undefined ? { minRows: o.minRows } : {}), ...(o.blank ? { blank: o.blank } : {}) });
  }

  /** The rows of a list variable (objects with the columns' keys; `scalar` for a list of plain values, with one column keyed ''). */
  list(varName: string, label: string, columns: FormColumn[], o: ListOpts = {}): Built {
    const v = this.variable(varName);
    return this.build(label, { id: varName, ...o }, columns, { source: 'var', v: v.id, ...(o.scalar ? { scalar: true } : {}), ...(o.sized ? { sized: Object.entries(o.sized).map(([name, fill]) => ({ v: this.variable(name).id, fill })) } : {}) });
  }

  /** A fixed set of rows, each cell a binding of its own. */
  fixed(label: string, rows: { label: string; cells: Record<string, FormBind> }[], columns: FormColumn[], o: Opts = {}): Built {
    return this.build(label, { fixed: true, ...o }, columns, { source: 'fixed', rows });
  }

  /** One fixed row per page whose name matches, the cells the text of a layer on that page (`{ text: 'Slide text' }`). Pages without the layer are left out. */
  pageRows(match: RegExp | string[], cells: Record<string, string | { layer: string; prop?: string }>, columns: FormColumn[], label: string, o: Opts & { rowLabel?: (ab: Artboard, i: number) => string } = {}): Built {
    const pages = Array.isArray(match) ? match.map((n) => this.page(n)) : this.pages(match);
    const rows = pages
      .filter((ab) => Object.values(cells).every((l) => byName(ab, typeof l === 'string' ? l : l.layer)))
      .map((ab, i) => ({ label: o.rowLabel ? o.rowLabel(ab, i) : ab.name, cells: Object.fromEntries(Object.entries(cells).map(([k, l]) => [k, this.layer(ab, typeof l === 'string' ? l : l.layer, typeof l === 'string' ? 'text' : (l.prop ?? 'text'))])) }));
    if (!rows.length) throw new Error(`form: no pages for ${label}`);
    return this.fixed(label, rows, columns, o);
  }

  /** The entries of a JSON list held in a graph node's parameter (a page's choices): see `param`. */
  jsonList(bind: FormBind, label: string, columns: FormColumn[], o: ListOpts = {}): Built {
    return this.build(label, o, columns, { source: 'bind', bind });
  }

  // ------------------------------------------------------------ shared sections

  /** A page's own words: its title and footer line (the ones that are there). */
  pageTexts(page: string | number | Artboard, o: { title?: string; covers?: Matcher | Matcher[]; footerCovers?: Matcher | Matcher[]; heading?: string } = {}): SectionSpec {
    const ab = this.page(page);
    const items: Built[] = [];
    if (byName(ab, 'Page title')) items.push(this.layerText(ab, 'Page title', 'Page title', { covers: o.covers, id: `${slug(ab.name)}-title` }));
    if (byName(ab, 'Footer text')) items.push(this.layerText(ab, 'Footer text', 'Footer line', { covers: o.footerCovers, id: `${slug(ab.name)}-footer` }));
    return { title: o.heading ?? ab.name, items };
  }

  /** The title and the line under it on the first page. */
  titles(o: { page?: string | number; title?: string; subtitle?: string | false; extra?: Built[]; label?: string } = {}): SectionSpec {
    const ab = this.page(o.page ?? 0);
    const items: Built[] = [this.layerText(ab, o.title ?? 'Page title', o.label ?? 'Title', { id: 'title', covers: /^(Change|Write) the (test |quiz |presentation |book |survey )?title\b/i })];
    if (o.subtitle !== false) items.push(this.layerText(ab, o.subtitle ?? 'Subtitle', 'Line under the title', { id: 'subtitle', long: true }));
    return { title: 'Title page', items: [...items, ...(o.extra ?? [])] };
  }

  /** The footer line of every page that has one (a text layer named Footer text). */
  footers(o: { pages?: (string | number)[]; covers?: Matcher | Matcher[] } = {}): SectionSpec {
    const pages = o.pages ? o.pages.map((p) => this.page(p)) : this.pages().filter((ab) => byName(ab, 'Footer text'));
    return { title: 'Footer lines', hint: 'The small line at the foot of the page.', items: pages.map((ab, i) => this.layerText(ab, 'Footer text', pages.length > 1 ? `Footer, ${ab.name}` : 'Footer line', { id: `footer-${i + 1}`, covers: i === 0 ? (o.covers ?? [/\bfooter\b/i]) : [] })) };
  }

  /** A question layer's content: the prompt, then what its kind has (options with the right ones ticked, blanks and their accepted answers, pairs), hints and the feedback lines. */
  questionFields(page: string | number | Artboard, layer: string, o: { id?: string; label?: string; covers?: Matcher | Matcher[]; parts?: ('prompt' | 'options' | 'blanks' | 'pairs' | 'extras' | 'groups' | 'cards' | 'hints' | 'feedback' | 'feedbackAll' | 'tries' | 'points' | 'bank')[]; prefix?: boolean; optionLabel?: string; covers2?: Record<string, Matcher | Matcher[]> } = {}): Built[] {
    const { ab, node } = this.question(page, layer);
    const q = node.question;
    const base = o.id ?? `${slug(ab.name)}`;
    const name = o.label ?? ab.name;
    const at = (path: (string | number)[]): FormBind => ({ k: 'q', a: ab.id, n: node.id, path });
    const parts = o.parts ?? ['prompt', q.kind === 'blank' ? 'blanks' : q.kind === 'matching' ? 'pairs' : 'options', 'hints', 'feedback'];
    const out: Built[] = [];
    const cov = (k: string) => o.covers2?.[k];
    const prefix = o.prefix ? `${name}: ` : '';
    const withCover = (b: Built, k: string) => ((b.covers = [...b.covers, ...list(cov(k))]), b);
    if (parts.includes('prompt')) out.push(withCover(this.make(`${prefix}Question`, 'long', { id: `${base}-prompt` }, { bind: at(['prompt']), show: { a: ab.id, n: node.id } }), 'prompt'));
    if (parts.includes('options')) {
      const choiceKind = q.kind === 'single' || q.kind === 'multiple' || q.kind === 'truefalse';
      const cols: FormColumn[] = [c.text('text', q.kind === 'ordering' ? 'Item (in the right order)' : q.kind === 'hotspot' ? 'Area name' : (o.optionLabel ?? 'Answer'))];
      if (choiceKind) cols.push(c.toggle('correct', 'Right', { exclusive: q.kind !== 'multiple' }));
      if (q.kind === 'hotspot') cols.push(c.toggle('correct', 'Right'), c.text('feedback', 'Feedback when picked'));
      out.push(
        withCover(
          this.make(`${prefix}${q.kind === 'ordering' ? 'Items' : q.kind === 'hotspot' ? 'Areas' : 'Answers'}`, 'list', { id: `${base}-options` }, {
            rows: { source: 'q', a: ab.id, n: node.id, key: 'options' },
            columns: cols,
            noun: q.kind === 'ordering' ? 'item' : q.kind === 'hotspot' ? 'area' : 'answer',
            ...(q.kind === 'truefalse' || q.kind === 'hotspot' ? { fixed: true } : {}),
            minRows: 2,
            maxRows: MAX_OPTIONS,
          }),
          'options',
        ),
      );
    }
    if (parts.includes('blanks'))
      out.push(
        withCover(
          this.make(`${prefix}Blanks`, 'list', { id: `${base}-blanks` }, {
            rows: { source: 'q', a: ab.id, n: node.id, key: 'blanks' },
            columns: [c.text('label', 'Label'), c.lines('answers', 'Accepted answers (one per line)')],
            noun: 'blank',
            minRows: 1,
            maxRows: MAX_BLANKS,
            blank: { answers: [''] },
          }),
          'blanks',
        ),
      );
    if (parts.includes('pairs'))
      out.push(
        withCover(
          this.make(`${prefix}Pairs`, 'list', { id: `${base}-pairs` }, {
            rows: { source: 'q', a: ab.id, n: node.id, key: 'pairs' },
            columns: [c.text('term', 'Term'), c.text('match', 'Goes with')],
            noun: 'pair',
            minRows: 2,
          }),
          'pairs',
        ),
      );
    if (parts.includes('extras'))
      out.push(
        withCover(
          this.make(`${prefix}Wrong choices`, 'list', { id: `${base}-extras`, hint: 'Choices that belong nowhere, mixed in on purpose.' }, {
            rows: { source: 'q', a: ab.id, n: node.id, key: 'extras' },
            columns: [c.text('text', 'Text')],
            noun: 'wrong choice',
          }),
          'extras',
        ),
      );
    if (parts.includes('groups'))
      out.push(withCover(this.make(`${prefix}Groups`, 'list', { id: `${base}-groups` }, { rows: { source: 'q', a: ab.id, n: node.id, key: 'groups' }, columns: [c.text('name', 'Name')], noun: 'group', minRows: 2 }), 'groups'));
    if (parts.includes('cards'))
      out.push(withCover(this.make(`${prefix}Cards`, 'list', { id: `${base}-cards` }, { rows: { source: 'q', a: ab.id, n: node.id, key: 'cards' }, columns: [c.text('text', 'Card'), c.from('group', 'Belongs in', 'groups'), c.text('feedback', 'Said when dropped in the wrong group')], noun: 'card', minRows: 2 }), 'cards'));
    if (parts.includes('hints')) out.push(withCover(this.make(`${prefix}Hints`, 'lines', { id: `${base}-hints`, hint: 'One hint per line. A hint shows when the learner asks for one.' }, { bind: at(['hints']) }), 'hints'));
    if (parts.includes('feedback'))
      out.push(
        withCover(this.make(`${prefix}Feedback when right`, 'text', { id: `${base}-feedback-right` }, { bind: at(['feedbackCorrect']) }), 'feedback'),
        this.make(`${prefix}Feedback when wrong`, 'text', { id: `${base}-feedback-wrong` }, { bind: at(['feedbackIncorrect']) }),
      );
    if (parts.includes('feedbackAll'))
      out.push(
        withCover(this.make(`${prefix}Feedback when right`, 'text', { id: `${base}-feedback-right` }, { bind: at(['feedbackCorrect']) }), 'feedback'),
        this.make(`${prefix}Feedback when part right`, 'text', { id: `${base}-feedback-partial` }, { bind: at(['feedbackPartial']) }),
        this.make(`${prefix}Feedback when wrong`, 'text', { id: `${base}-feedback-wrong` }, { bind: at(['feedbackIncorrect']) }),
        this.make(`${prefix}Feedback when out of tries`, 'text', { id: `${base}-feedback-out` }, { bind: at(['feedbackOutOfTries']) }),
      );
    if (parts.includes('points')) out.push(withCover(this.make(`${prefix}Points`, 'number', { id: `${base}-points`, min: 0, max: 100, hint: 'What the question is worth. The results page says "of" the total, so change it there too.' }, { bind: at(['points']) }), 'points'));
    if (parts.includes('tries')) out.push(withCover(this.make(`${prefix}Tries allowed`, 'number', { id: `${base}-tries`, min: 0, max: 20, hint: '0 means as many as the learner likes.' }, { bind: at(['attempts']) }), 'tries'));
    if (parts.includes('bank') && q.bank) {
      out.push(
        withCover(this.make(`${prefix}How many to ask`, 'number', { id: `${base}-bank-count`, min: 0, max: 200, hint: '0 asks them all.' }, { bind: at(['bank', 'count']) }), 'bank'),
        this.make(`${prefix}Order`, 'choice', { id: `${base}-bank-order` }, { bind: at(['bank', 'order']), options: [{ value: 'sequence', label: 'In the order written' }, { value: 'random', label: 'In a random order' }] }),
      );
    }
    if (out.length) out[0].covers.push(...list(o.covers));
    return out;
  }
}

/** Sections from a title and fields (a field may also be a list of them, as `questionFields` gives). */
export const sect = (title: string, hint: string | undefined, ...items: (Built | Built[])[]): SectionSpec => ({ title, ...(hint ? { hint } : {}), items: items.flat() });

const matches = (m: Matcher, text: string) => (typeof m === 'string' ? text.startsWith(m) : m.test(text));

/** The form a spec makes for a built project, and the checklist items linked to its fields (an item's `field`). */
export function resolveForm(project: Project, make: FormMaker, checklist: TemplateChecklistItem[] = []): { form: ContentForm; spec: FormSpec } {
  const spec = make(new FormKit(project));
  const used = new Set<string>();
  const sections: FormSection[] = spec.sections
    .filter((s) => s.items.length)
    .map((s, i) => ({
      id: slug(s.title) + (spec.sections.slice(0, i).some((o) => slug(o.title) === slug(s.title)) ? `-${i + 1}` : ''),
      title: s.title,
      ...(s.hint ? { hint: s.hint } : {}),
      fields: s.items.map((b) => {
        let id = b.field.id;
        for (let n = 2; used.has(id); n++) id = `${b.field.id}-${n}`;
        used.add(id);
        b.field.id = id;
        return b.field;
      }),
    }));
  const form: ContentForm = { version: 1, sections };
  const all = spec.sections.flatMap((s) => s.items);
  for (const item of checklist) {
    const hit = all.find((b) => b.covers.some((m) => matches(m, item.text)));
    if (hit) item.field = hit.field.id;
  }
  return { form, spec };
}

/** Checklist items that are a thing to look at or try, not content to enter. */
export const REVIEW_ITEM = /^(Try|Check|Preview|Test|Listen|Review|Share|Plan|Do not|Only use|Pick a colourway|Choose a colourway|Keep|Look|Read|Make sure|Update the (share )?link|Set up (the )?sharing)\b/i;

/** The items of a checklist that are about content, have no field and are not listed as done on the canvas. */
export function uncoveredItems(checklist: TemplateChecklistItem[], spec: FormSpec | null | undefined): string[] {
  const elsewhere = spec?.elsewhere ?? [];
  return checklist.filter((i) => !i.field && !REVIEW_ITEM.test(i.text) && !elsewhere.some((m) => matches(m, i.text))).map((i) => i.text);
}
