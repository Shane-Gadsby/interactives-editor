import { CONTEXT_FIELDS, LOCAL_SCOPE_HINTS, variableLabel, variableLabelAndName } from 'interactives-player';
import { braceSpan, preview, typeOf, type SuggestEnv } from './suggest';

/** One thing the Insert value menu offers: what to call it, what it puts in the text and what it is right now. */
export interface InsertChoice {
  group: string;
  label: string;
  /** The formula that goes between the braces. */
  expr: string;
  /** The kind of value and what it is now, "number · 7". */
  hint: string;
}

const ident = /^[A-Za-z_$][\w$]*$/;
const MAX_FIELDS = 30;

//The names a learner would want a greeting or a heading to use first
const CONTEXT_FIRST = ['firstName', 'displayName', 'courseName', 'courseCode', 'term', 'year'];

const hint = (v: unknown): string => {
  const type = typeOf(v);
  const now = preview(v);
  return now ? `${type} · ${now}` : type;
};

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The readable top level fields of an object, in the order it has them. */
function fieldsOf(o: Record<string, unknown>): [string, unknown][] {
  return Object.entries(o)
    .filter(([k, v]) => ident.test(k) && typeof v !== 'function')
    .slice(0, MAX_FIELDS);
}

/**
 * What can go in a text's `{braces}` here: the repeated item's fields, the project's variables, data, the learner and the course,
 * the page and (with questions) the quiz score. Values come from the same scope the canvas preview uses, so each choice says what
 * it is right now. A repeater's item and index come in through `env.localValues` (the first item stands for them all).
 */
export function insertChoices(env: SuggestEnv): InsertChoice[] {
  const out: InsertChoice[] = [];
  const scope = env.scope();
  const locals = env.locals ?? [];
  const here = env.localValues ?? {};

  if (locals.includes('item')) {
    const group = 'This item of the repeat';
    const item = here.item;
    if (isRecord(item)) for (const [k, v] of fieldsOf(item)) out.push({ group, label: k, expr: `item.${k}`, hint: hint(v) });
    else out.push({ group, label: 'The item', expr: 'item', hint: hint(item) });
    if (locals.includes('index')) out.push({ group, label: 'Its number (from 1)', expr: 'index + 1', hint: 'number · 1' });
  }

  //Names a field has of its own: a spoken value's value, max and percent
  for (const name of locals) {
    if (['item', 'index', 'self', 'event', 'ix', 'pointer'].includes(name)) continue;
    const h = LOCAL_SCOPE_HINTS[name];
    out.push({ group: 'Here', label: name, expr: name, hint: h ? `${h.type} · ${h.hint}` : hint(here[name]) });
  }

  for (const v of env.project.variables) {
    if (!ident.test(v.name)) continue;
    const now = scope[v.name];
    if (v.type === 'list') out.push({ group: 'Your variables', label: `How many in ${variableLabel(v)}`, expr: `${v.name}.length`, hint: `number · ${Array.isArray(now) ? now.length : 0}` });
    else out.push({ group: 'Your variables', label: variableLabelAndName(v), expr: v.name, hint: hint(now) });
  }

  for (const d of env.project.dataSources) {
    if (!ident.test(d.name)) continue;
    const now = scope[d.name];
    if (Array.isArray(now)) {
      out.push({ group: 'Data', label: `How many in ${d.name}`, expr: `${d.name}.length`, hint: `number · ${now.length}` });
      if (isRecord(now[0])) for (const [k, v] of fieldsOf(now[0])) out.push({ group: 'Data', label: `${d.name}, first row: ${k}`, expr: `${d.name}[0].${k}`, hint: hint(v) });
    } else if (isRecord(now)) for (const [k, v] of fieldsOf(now)) out.push({ group: 'Data', label: `${d.name}: ${k}`, expr: `${d.name}.${k}`, hint: hint(v) });
    else out.push({ group: 'Data', label: d.name, expr: d.name, hint: hint(now) });
  }

  const ctx = isRecord(scope.context) ? scope.context : {};
  const fields = CONTEXT_FIELDS.filter((f) => f.kind === 'text').sort((a, b) => {
    const rank = (n: string) => (CONTEXT_FIRST.includes(n) ? CONTEXT_FIRST.indexOf(n) : CONTEXT_FIRST.length);
    return rank(a.name) - rank(b.name);
  });
  for (const f of fields) out.push({ group: 'The learner and course', label: f.label, expr: `context.${f.name}`, hint: hint(ctx[f.name]) });

  out.push({ group: 'The page', label: 'Page number', expr: 'pageNumber', hint: hint(scope.pageNumber) });
  out.push({ group: 'The page', label: 'How many pages', expr: 'pageCount', hint: hint(scope.pageCount) });

  const quiz = scope.quiz;
  if (isRecord(quiz) && Number(quiz.count) > 0) {
    out.push({ group: 'Questions', label: 'Quiz score', expr: 'quiz.score', hint: hint(quiz.score) });
    out.push({ group: 'Questions', label: 'Quiz total', expr: 'quiz.max', hint: hint(quiz.max) });
    out.push({ group: 'Questions', label: 'Quiz percent', expr: 'quiz.percent', hint: hint(quiz.percent) });
  }
  return out;
}

/**
 * `{expr}` put into the text over the selection, the way a learner reads it. With the caret already inside an open `{...}` the
 * formula goes in bare, so it never nests braces. Gives the new text and where the caret goes.
 */
export function insertAt(text: string, start: number, end: number, expr: string): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const inside = braceSpan(text, from) !== null && !text.slice(from, to).includes('}');
  //an open { with nothing closing it after the caret gets its } here
  const rest = text.slice(to);
  const close = rest.indexOf('}');
  const open = rest.indexOf('{');
  const closed = close >= 0 && (open < 0 || close < open);
  const piece = inside ? (closed ? expr : `${expr}}`) : `{${expr}}`;
  return { text: text.slice(0, from) + piece + text.slice(to), caret: from + piece.length };
}
