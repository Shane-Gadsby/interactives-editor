import { PAGE_TRANSITIONS, walk, type Artboard, type Project, type SceneNode, type Variable } from 'interactives-player';
import { conditionToExpr, type CondOp, type CondRow } from './condition';
import { NEW_PREFIX, RECIPE_BY_ID, THIS_LAYER, audioAssets, buildBehaviour, counterChoices, defaultAnswers, defaultTriggerAnswers, incomplete, joinSet, layerChoices, otherPages, resettable, switchChoices, triggerIncomplete, triggerLabel, videoChoices, zoneChoices, type Answers, type RecipeCtx, type Step, type Trigger } from './recipes';

/**
 * "Describe it": a plain sentence ("when clicked show the hint", "add 1 to score", "after 5 seconds go to the next page") turned into
 * what the behaviour dialog takes: a recipe, a trigger and the answers they ask for. It is a table of phrasings, not a language model:
 * nothing leaves the editor, and what it cannot read it says so. Layer, page, value, timeline and sound names in the sentence are
 * matched against the open project (any case, a plural, a small typo). Pure: it reads the project it is given and changes nothing.
 */

export interface Described {
  recipe: string;
  answers: Answers;
  trigger: Trigger;
  when: Answers;
  then: Step[];
  /** A yes/no formula, empty when the sentence had no "only if". */
  only: string;
  otherwise: Step | null;
  /** The layer the behaviour is for: the one the sentence names, else the selected one, else '' (nobody to attach it to yet). */
  layerId: string;
  /** What it will do, read back the way the dialog and the Inspector say it. */
  sentence: string;
  /** Names the sentence used that the project has no such thing as ("a page called “results”"): the person chooses these in the dialog. */
  missing: string[];
  /** Parts of the sentence that were not understood. */
  ignored: string[];
}

//---------------------------------------------------------------------------------------------------------------------
//Reading words

const VERBS = '(?:show|hide|go|jump|play|pause|stop|add|subtract|take|set|reset|open|say|tell|announce|change|turn|switch|toggle|flip|start|restart|mute|unmute|zoom|move|increase|decrease|raise|lower|count|make|display|reveal|fade|read|give|award|remove|close|run|clear|lose)';
const END = `(?=\\s*,|\\s+then\\b|\\s+and\\b|\\s+${VERBS}\\b|\\s*$)`;
const EXTRA_VERBS = new Set(['show', 'hide', 'go', 'jump', 'play', 'pause', 'add', 'subtract', 'reset', 'say', 'tell', 'announce', 'change', 'turn', 'toggle', 'flip', 'restart', 'mute', 'zoom', 'move', 'increase', 'decrease', 'count', 'make', 'give', 'run', 'lose', 'then', 'and', 'also', 'if', 'when', 'after']);
const SELF = /^(?:this|it|this one|this layer|this button|that|that one|itself|here|me)$/i;
const GENERIC = new Set(['the', 'a', 'an', 'this', 'that', 'my', 'our', 'their', 'of', 'page', 'screen', 'slide', 'layer', 'button', 'timeline', 'animation']);
const NUMWORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60 };
const NUM = '(?:-?\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|sixty)';
const COLOURS: Record<string, string> = {
  red: '#e53935',
  orange: '#fb8c00',
  yellow: '#fdd835',
  green: '#43a047',
  blue: '#1e88e5',
  purple: '#8e24aa',
  pink: '#ec407a',
  black: '#000000',
  white: '#ffffff',
  grey: '#9e9e9e',
  gray: '#9e9e9e',
  brown: '#6d4c41',
  teal: '#00897b',
  gold: '#e0b200',
  navy: '#1a237e',
};
const COLOUR_RE = `(?:${Object.keys(COLOURS).join('|')}|#[0-9a-f]{6}|#[0-9a-f]{3})`;
const ON_WORDS = /^(?:on|true|yes|enabled)$/i;
const OFF_WORDS = /^(?:off|false|no|disabled)$/i;

const numOf = (s: string | undefined, fallback = 1): number => {
  if (s === undefined || s === '') return fallback;
  const w = NUMWORDS[s.toLowerCase()];
  if (w !== undefined) return w;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
};

/** The words of a name: camelCase and underscores split, lower case, a plural's s dropped, and the filler words (the, page, button...) left out. */
function tokens(s: string, strip = true): string[] {
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  const kept = words.filter((w) => !GENERIC.has(w));
  return strip && kept.length ? kept : words;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Does this word of the sentence stand for this word of a name: the same, the start of it, or one letter out (a typo)? */
const sameWord = (w: string, n: string): boolean => w === n || (w.length >= 3 && n.startsWith(w)) || (n.length >= 4 && w.startsWith(n)) || (w.length >= 4 && n.length >= 4 && editDistance(w, n) <= 1);

interface Named {
  id: string;
  name: string;
}

/** How well a phrase from the sentence names an item: 0 for not at all, up to 100 for exactly. */
function nameScore(phrase: string[], name: string): number {
  const cand = tokens(name);
  if (!phrase.length || !cand.length) return 0;
  if (phrase.length === cand.length && phrase.every((w, i) => w === cand[i])) return 100;
  if (cand.every((n) => phrase.includes(n))) {
    //a name inside a longer stretch of words is fine for a word or so ("the hint please"), not for the rest of the sentence
    const extra = phrase.filter((w) => !cand.includes(w));
    return extra.length <= 1 && !extra.some((w) => EXTRA_VERBS.has(w)) ? 80 + cand.length : 0;
  }
  if (phrase.every((w) => cand.includes(w))) return 60 + Math.round((phrase.length / cand.length) * 10);
  if (phrase.every((w) => cand.some((n) => sameWord(w, n)))) return 40 + Math.round((phrase.length / cand.length) * 10);
  return 0;
}

/** The best match for a phrase among named things, or null when nothing is close. */
function matchName<T extends Named>(phrase: string, items: T[]): T | null {
  const p = tokens(phrase);
  let best: T | null = null;
  let top = 0;
  for (const it of items) {
    const s = nameScore(p, it.name);
    if (s > top) (top = s), (best = it);
  }
  return best;
}

/** Every item whose whole name turns up in the text (for "reset score and lives"). */
function findAll<T extends Named>(text: string, items: T[]): T[] {
  const words = tokens(text, false);
  return items.filter((it) => {
    const n = tokens(it.name);
    return n.length > 0 && n.every((w) => words.some((x) => sameWord(x, w)));
  });
}

const plain = (s: string): string => s.trim().replace(/^(?:the|a|an|my)\s+/i, '');
const camel = (s: string): string => {
  const w = s
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((x) => x && !GENERIC.has(x.toLowerCase()));
  return w.map((x, i) => (i === 0 ? x.toLowerCase() : x[0].toUpperCase() + x.slice(1).toLowerCase())).join('');
};

//---------------------------------------------------------------------------------------------------------------------
//What a sentence is read against

interface Ctx {
  project: Project;
  ab: Artboard;
  /** The selected layer ('' when none). */
  layerId: string;
  layers: Named[];
  quotes: string[];
}

interface Hit {
  recipe: string;
  answers: Answers;
  missing: string[];
}

const hit = (recipe: string, answers: Answers = {}, missing: string[] = []): Hit => ({ recipe, answers, missing });
const unq = (s: string, c: Ctx): string => s.replace(/\s*qq(\d+)qq\s*/g, (_, n) => c.quotes[Number(n)] ?? '').trim();

function layerRef(rest: string | undefined, c: Ctx, id = c.layerId): { id?: string; missing?: string } {
  const p = (rest ?? '').trim();
  if (!p || SELF.test(p) || /^(?:this|that) (?:one|layer|button|picture|image|box)$/i.test(p)) return { id: THIS_LAYER };
  const m = matchName(p, c.layers);
  if (m) return { id: m.id === id ? THIS_LAYER : m.id };
  return { missing: `a layer called “${plain(p)}”` };
}

const varNamed = (v: Variable): Named => ({ id: v.id, name: v.name });

function findVar(phrase: string, vars: Variable[]): Variable | null {
  const m = matchName(phrase, vars.map(varNamed));
  return m ? (vars.find((v) => v.id === m.id) ?? null) : null;
}

/** The siblings of a layer, for "show only this one": the other layers in the same group, the same kind first. */
function siblingsOf(ab: Artboard, id: string): SceneNode[] {
  let found: SceneNode[] = [];
  const look = (list: SceneNode[]) => {
    if (list.some((n) => n.id === id)) found = list;
  };
  look(ab.children);
  walk(ab.children, (n) => void ((n as { children?: SceneNode[] }).children && look((n as { children: SceneNode[] }).children)));
  return found.filter((n) => n.id !== id);
}

//---------------------------------------------------------------------------------------------------------------------
//The trigger: what starts it

interface TriggerHit {
  trigger: Trigger;
  when: Answers;
  layerId?: string;
  missing: string[];
  rest: string;
}

const cut = (t: string, m: RegExpExecArray): string => `${t.slice(0, m.index)} , ${t.slice(m.index + m[0].length)}`;
const WHO = '(?:(?:the\\s+)?(?:learners?|students?|users?|person|viewer|someone|i|you|they|we|people)\\s+)';

const KEYS: [RegExp, string][] = [
  [/^(?:enter|return)$/i, 'Enter'],
  [/^(?:space|space ?bar|spacebar)$/i, 'Space'],
  [/^(?:escape|esc)$/i, 'Escape'],
  [/^(?:left|left arrow|arrow left)$/i, 'ArrowLeft'],
  [/^(?:right|right arrow|arrow right)$/i, 'ArrowRight'],
  [/^(?:up|up arrow|arrow up)$/i, 'ArrowUp'],
  [/^(?:down|down arrow|arrow down)$/i, 'ArrowDown'],
];

function keyOf(phrase: string): string | null {
  const p = phrase.replace(/^(?:the\s+)?(?:key\s+)?/i, '').replace(/\s+key$/i, '').trim();
  for (const [re, v] of KEYS) if (re.test(p)) return v;
  if (/^[a-z0-9]$/i.test(p)) return p.toLowerCase();
  return null;
}

function subjectOf(phrase: string | undefined, c: Ctx): { layerId?: string; missing: string[] } {
  const r = layerRef(phrase, c);
  if (r.missing) return { missing: [r.missing] };
  return { layerId: r.id === THIS_LAYER ? undefined : r.id, missing: [] };
}

function takeTrigger(t: string, c: Ctx): TriggerHit {
  let m: RegExpExecArray | null;
  const done = (trigger: Trigger, when: Answers, mm: RegExpExecArray, extra: Partial<TriggerHit> = {}): TriggerHit => ({ trigger, when, missing: [], rest: cut(t, mm), ...extra });

  //after 5 seconds
  m = new RegExp(`\\b(?:after|in|wait)\\s+(?:about\\s+)?(${NUM})\\s*(seconds?|secs?|s|minutes?|mins?)\\b`, 'i').exec(t);
  if (m) {
    const secs = numOf(m[1]) * (/^m/i.test(m[2]) ? 60 : 1);
    return done('timer', { delay: String(secs) }, m);
  }

  //when the page opens
  m = /\b(?:when|whenever|as soon as|once|as)\s+(?:the\s+|this\s+)?(?:page|slide|screen)\s+(?:is\s+|first\s+|gets\s+)?(?:opens?|opened|loads?|loaded|starts?|started|shows?|shown|appears?|visited|entered|begins?)\b/i.exec(t) ?? /\bon\s+(?:page\s+)?(?:load|start|open|entry)\b/i.exec(t);
  if (m) return done('start', {}, m);

  //a key pressed
  m = new RegExp(`\\b(?:when|whenever|once)\\s+${WHO}?(?:press(?:es|ed)?|hit(?:s)?|type(?:s)?)\\s+(?:the\\s+)?(.+?)${END}`, 'i').exec(t) ?? /\b(?:when|whenever)\s+(?:the\s+)?(.+?)\s+key\s+is\s+(?:pressed|hit)\b/i.exec(t) ?? /\b(?:on|upon)\s+(?:a\s+)?(?:press|pressing)\s+of\s+(?:the\s+)?(.+?)\b(?:\s+key)?(?=\s*,|\s+then\b|$)/i.exec(t) ?? /\bpress(?:ing)?\s+(?:the\s+)?(.+?)\s+to\b/i.exec(t);
  if (m) {
    const k = keyOf(m[1]);
    if (k) return done('key', { key: k }, m);
  }

  //a value reaches something
  m = new RegExp(`\\b(?:when|whenever|once|as soon as|every time|each time)\\s+(?:the\\s+)?(.+?)\\s+(reaches|reached|hits|gets to|get to|goes up to|goes down to|drops to|falls to|becomes|equals|is at least|is at most|is more than|is greater than|is less than|is over|is under|is above|is below|is not|isnt|is now|is)\\s+(-?\\d+(?:\\.\\d+)?|true|false|on|off|yes|no|qq\\d+qq|[\\w-]+)${END}`, 'i').exec(t);
  if (m) {
    const v = findVar(m[1], c.project.variables);
    if (v) {
      const w = reach(v, m[2], m[3], c);
      if (w) return done('value', { watch: v.id, ...w }, m);
    }
  }

  //dropped on a drop zone
  m = new RegExp(`\\b(?:when|whenever|once)\\s+(?:(.+?)\\s+)?(?:is\\s+|gets\\s+)?(?:dropped|dragged|placed)\\s+(?:on|onto|in|into|over|to)\\s+(?:the\\s+)?(.+?)${END}`, 'i').exec(t);
  if (m) {
    const zones = zoneChoices(c.ab);
    const z = matchName(m[2], zones);
    const subject = subjectOf(m[1], c);
    return done('drop', z ? { zone: z.id } : {}, m, { layerId: subject.layerId, missing: [...subject.missing, ...(z ? [] : [`a drop zone called “${plain(m[2])}”`])] });
  }

  //a video reaches a time
  m = /\b(?:when|whenever|once)\s+(?:the\s+)?(?:(.+?)\s+)?(?:video|film|movie)\s+(?:reaches|gets to|hits|is at|gets)\s+(?:(\d+):(\d{2})|(\d+(?:\.\d+)?))\s*(?:seconds?|secs?|s)?/i.exec(t);
  if (m) {
    const secs = m[2] !== undefined ? Number(m[2]) * 60 + Number(m[3]) : Number(m[4]);
    const v = m[1] ? matchName(m[1], videoChoices(c.ab)) : null;
    return done('video', { cuetime: String(secs), ...(v ? { video: v.id } : {}) }, m);
  }

  //hovered over
  m = new RegExp(`\\b(?:when|whenever|once|as soon as|every time|each time)\\s+${WHO}?(?:hover|mouse|point|roll)(?:s|ed|ing)?(?:\\s+(?:over|on|onto|at))?(?:\\s+(?!${VERBS}\\b)(?:the\\s+)?(.+?))?${END}`, 'i').exec(t) ?? /\b(?:when|whenever|every time|each time)\s+(?:(.+?)\s+)?(?:is\s+|gets\s+)?(?:hovered(?:\s+over)?|moused over|pointed at)\b/i.exec(t) ?? /\bon\s+(?:hover|mouse ?over)\b/i.exec(t);
  if (m) {
    const s = subjectOf(m[1], c);
    return done('pointerenter', {}, m, { layerId: s.layerId, missing: s.missing });
  }

  //clicked
  m = new RegExp(`\\b(?:when|whenever|once|as soon as|every time|each time)\\s+${WHO}(?:click|tap|press|select)(?:s|ed|ing)?(?:\\s+on)?(?:\\s+(?!${VERBS}\\b)(?:the\\s+)?(.+?))?${END}`, 'i').exec(t) ?? /\b(?:when|whenever|once|as soon as|every time|each time)\s+(?:(.+?)\s+)?(?:is\s+|gets\s+|are\s+)?(?:clicked|tapped|pressed|selected)\b/i.exec(t) ?? /\b(?:on|upon)\s+click\b/i.exec(t) ?? /\b(?:each|every)\s+(?:click|tap)\b/i.exec(t) ?? /^(?:click|tap)(?:ping)?(?:\s+(?:on\s+)?(?:this|it|here))?\s+to\b/i.exec(t) ?? /^(?:click(?:ing)?|tap(?:ping)?)\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:to|should|will)\b/i.exec(t);
  if (m) {
    const s = subjectOf(m[1], c);
    return done('click', {}, m, { layerId: s.layerId, missing: s.missing });
  }

  return { trigger: 'click', when: {}, missing: [], rest: t };
}

/** "reaches 10", "is on", "is more than 3": the comparison and the value for a watched variable, or null when it does not fit its type. */
function reach(v: Variable, how: string, raw: string, c: Ctx): { reachop: CondOp; reachto?: string } | null {
  const h = how.toLowerCase();
  const val = raw.trim();
  if (v.type === 'boolean') {
    const not = /not|isnt/.test(h);
    const on = ON_WORDS.test(val);
    if (!on && !OFF_WORDS.test(val)) return null;
    return { reachop: on !== not ? 'true' : 'false' };
  }
  if (v.type === 'number') {
    if (!Number.isFinite(Number(val))) return null;
    const op: CondOp = /at most|drops|falls|goes down/.test(h) ? 'atmost' : /more|greater|over|above/.test(h) ? 'more' : /less|under|below/.test(h) ? 'less' : /equals|is now|becomes|^is$/.test(h) ? 'is' : /not|isnt/.test(h) ? 'isnot' : 'atleast';
    return { reachop: op, reachto: val };
  }
  const text = /^qq\d+qq$/.test(val) ? unq(val, c) : val;
  return { reachop: /not|isnt/.test(h) ? 'isnot' : 'is', reachto: text };
}

//---------------------------------------------------------------------------------------------------------------------
//Only if / otherwise

interface CondHit {
  rest: string;
  only: string;
  otherwise: string | null;
  ignored: string[];
}

function parseCondition(text: string, c: Ctx): { expr: string } | null {
  const one = (s: string): CondRow | null => {
    const sym = /^(.+?)\s*(>=|<=|!=|==|>|<|=)\s*(-?\d+(?:\.\d+)?)$/.exec(s);
    if (sym) {
      const v = findVar(sym[1], c.project.variables);
      const op: CondOp = ({ '>=': 'atleast', '<=': 'atmost', '!=': 'isnot', '==': 'is', '=': 'is', '>': 'more', '<': 'less' } as const)[sym[2] as '>=' | '<=' | '!=' | '==' | '=' | '>' | '<'];
      return v ? { left: v.name, op, right: { t: 'num', value: Number(sym[3]) } } : null;
    }
    const flag = /^(?:the\s+)?(.+?)\s+(?:is|are)\s+(not\s+)?(on|off|true|false|yes|no|set|empty|full|filled in|filled)$/i.exec(s);
    if (flag) {
      const v = findVar(flag[1], c.project.variables);
      if (v) {
        const not = !!flag[2];
        const w = flag[3].toLowerCase();
        if (v.type === 'boolean') return { left: v.name, op: (ON_WORDS.test(w) || w === 'set') !== not ? 'true' : 'false' };
        if (w === 'empty') return { left: v.name, op: not ? 'notempty' : 'empty' };
        if (w === 'set' || w === 'full' || w === 'filled' || w === 'filled in') return { left: v.name, op: not ? 'empty' : 'notempty' };
      }
    }
    const m = /^(?:the\s+)?(.+?)\s+(is at least|is at most|is more than|is greater than|is less than|is over|is under|is above|is below|is not|isnt|is|are|equals|reaches|has reached|hits|has|have)\s+(-?\d+(?:\.\d+)?|qq\d+qq|[\w-]+)$/i.exec(s);
    if (!m) return null;
    const v = findVar(m[1], c.project.variables);
    if (!v) return null;
    const w = reach(v, m[2].replace(/^(?:has|have)$/i, 'is at least').replace(/^has reached$/i, 'reaches'), m[3], c);
    if (!w) return null;
    if (w.reachop === 'true' || w.reachop === 'false') return { left: v.name, op: w.reachop };
    if (v.type === 'number') return { left: v.name, op: w.reachop, right: { t: 'num', value: Number(w.reachto) } };
    return { left: v.name, op: w.reachop, right: { t: 'str', value: w.reachto ?? '' } };
  };
  const joinOr = /\s+or\s+/i.test(text) && !/\s+and\s+/i.test(text);
  const parts = text.split(joinOr ? /\s+or\s+/i : /\s+and\s+/i);
  const rows = parts.map(one);
  if (!rows.length || rows.some((r) => !r)) {
    const whole = one(text);
    return whole ? { expr: conditionToExpr({ join: 'and', rows: [whole] }) } : null;
  }
  return { expr: conditionToExpr({ join: joinOr ? 'or' : 'and', rows: rows as CondRow[] }) };
}

const FIRST_VERB = new RegExp(`\\s+(?=${VERBS}\\b)`, 'i');

function takeCondition(t: string, c: Ctx): CondHit {
  const at = /\b(?:only\s+)?if\b/i.exec(t);
  if (!at) return { rest: t, only: '', otherwise: null, ignored: [] };
  const before = t.slice(0, at.index).replace(/[\s,]*\b(?:but|and|only)\s*$/i, '').trim();
  const after = t.slice(at.index + at[0].length).trim();
  const [head, other] = after.split(/\s*,?\s*\b(?:otherwise|or else|else|if not)\b\s*/i);
  const otherwise = other?.trim() ? other.trim() : null;
  let condText = head.trim();
  let rest = before;
  if (!tokens(before, false).length) {
    //if score is at least 3, show the hint
    const sep = /\s*,\s*|\s+then\s+/i.exec(condText);
    if (sep) {
      rest = condText.slice(sep.index + sep[0].length);
      condText = condText.slice(0, sep.index);
    } else {
      const v = FIRST_VERB.exec(condText);
      if (v) {
        rest = condText.slice(v.index).trim();
        condText = condText.slice(0, v.index);
      }
    }
  }
  const cond = parseCondition(condText.replace(/[\s,]+$/, ''), c);
  if (!cond) return { rest, only: '', otherwise, ignored: [`the condition “${unq(condText, c)}”`] };
  return { rest, only: cond.expr, otherwise, ignored: [] };
}

//---------------------------------------------------------------------------------------------------------------------
//The actions: what happens

/** Words on the front of a clause that say nothing ("make this", "i want it to", "then"). */
function tidy(clause: string): string {
  let s = clause.trim().replace(/^[\s,]+|[\s,]+$/g, '');
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/^(?:please|just|also|then|and|so|so that|it should|this should|should|will|to|let it|let this|i want (?:it |this )?to|i would like (?:it |this )?to|get (?:this|it) to|have (?:this|it)(?: to)?)\s+/i, '')
      .replace(new RegExp(`^make\\s+(?:this|it|that)(?:\\s+button)?(?:\\s+to)?\\s+(?!say\\b|read\\b)(?=${VERBS}\\b)`, 'i'), '')
      .replace(/\s+(?:please|again|now)$/i, '')
      .replace(/^(adds|shows|hides|plays|goes|takes|gives|resets|says|opens|toggles|increases|decreases|stops|starts|jumps|moves|turns|sets|changes|makes|fades|zooms|reveals)\b/i, (v) => (/^goes$/i.test(v) ? 'go' : v.slice(0, -1)));
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

/** "with a fade transition": the page recipes' look. Taken out of the clause so the rest reads plainly. */
function takeTransition(clause: string): { rest: string; transition?: string } {
  const m = /\s*\b(?:with|using)\s+(?:a\s+|an\s+|the\s+)?(fade|slide|wipe|push|zoom|iris|instant)\s*(?:transition|effect)?\s*$/i.exec(clause) ?? /\s*\b(?:with|using)\s+(?:a\s+|an\s+|the\s+)?(fade|slide|wipe|push|zoom|iris|instant)\s+(?:transition|effect)\b/i.exec(clause);
  if (!m) return { rest: clause };
  const w = m[1].toLowerCase();
  const pick = w === 'instant' ? 'none' : w === 'fade' || w === 'zoom' || w === 'iris' ? w : `${w}Left`;
  return PAGE_TRANSITIONS.some((x) => x.value === pick) ? { rest: clause.replace(m[0], ''), transition: pick } : { rest: clause };
}

function numberVarFor(noun: string, c: Ctx): Variable | null {
  return findVar(noun, counterChoices(c.project));
}

function counterAnswer(v: Variable | null, phrase: string, fallback: string): string {
  if (v) return v.id;
  const name = camel(phrase);
  return NEW_PREFIX + (name || fallback);
}

const POINTS = '(?:points?|marks?|pts?)';

function parseAction(raw: string, c: Ctx): Hit | null {
  const text = tidy(raw);
  if (!text) return null;
  const tr = takeTransition(text);
  const t = tr.rest.trim();
  let m: RegExpExecArray | null;
  const vars = c.project.variables;

  //---- starting over (before any "go back")
  if (/^(?:start over|start again|restart|begin again|reset everything|start from the beginning)$/i.test(t)) return hit('start-over');

  //---- sound on and off, and music
  if (/^(?:mute|unmute|mute (?:the )?(?:sound|audio)|toggle (?:the )?(?:sound|audio|volume)|(?:turn|switch) (?:the )?(?:sound|audio|volume) (?:on|off)|(?:turn|switch) (?:on|off) (?:the )?(?:sound|audio|volume)|(?:sound|audio) (?:on|off))$/i.test(t)) {
    //a project with its own sound on/off switch means that one
    if (!/^(?:turn|switch|toggle|sound|audio)/i.test(t) || !findVar('sound', switchChoices(c.project))) return hit('sound-toggle');
  }
  if (/^(?:stop|silence|end|turn off|fade out)\s+(?:the\s+)?(?:background\s+)?(?:music|soundtrack|sounds?|audio|song)$/i.test(t)) return hit('soundtrack-stop');
  m = /^(?:play|start|put on)\s+(?:some\s+|the\s+|a\s+)?(?:background\s+)?(?:music|soundtrack|song|tune)(?:\s+(?:called\s+|named\s+)?(.+))?$/i.exec(t);
  if (m) {
    const a = m[1] ? matchName(m[1], audioAssets(c.project)) : null;
    return hit('soundtrack', a ? { sound: a.id } : {}, m[1] && !a ? [`a sound called “${plain(m[1])}”`] : []);
  }

  //---- video
  if (/^(?:jump|skip|go|seek|move|rewind|fast forward)\b(?=.*\b(?:video|film|movie)\b)/i.test(t)) {
    const tm = /(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?)/.exec(t.replace(/\b(?:video|film|movie)\b/gi, ' '));
    if (tm) {
      const secs = tm[1] !== undefined ? Number(tm[1]) * 60 + Number(tm[2]) : Number(tm[3]);
      const v = matchName(t.replace(/\b(?:jump|skip|go|seek|move|rewind|fast forward|to|the|in|into|of|on|seconds?|secs?)\b|\d+(?::\d+)?/gi, ' '), videoChoices(c.ab));
      return hit('video-seek', { seconds: String(secs), ...(v ? { video: v.id } : {}) });
    }
  }
  m = /^(?:(?:play|pause|stop|resume|start)(?:\s+or\s+(?:play|pause))?|play or pause|pause or play)\s+(?:the\s+)?(?:(.+?)\s+)?(?:video|film|movie|clip)$/i.exec(t) ?? /^(?:play or pause|pause or play|pause|resume)\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const name = m[1];
    const v = name ? matchName(name, videoChoices(c.ab)) : null;
    if (!name || v || /video|film|movie|clip/i.test(t)) return hit('video-toggle', v ? { video: v.id } : {}, name && !v && !/^(?:this|the|it)$/i.test(name) ? [`a video called “${plain(name)}”`] : []);
  }

  //---- an animation or a sound: play the ...
  m = /^(?:play|run|start|trigger|do)\s+(?:the\s+|an?\s+)?(?:animation|timeline)\s*(?:called\s+|named\s+)?(.*)$/i.exec(t) ?? /^(?:play|run|start|trigger)\s+(?:the\s+|an?\s+)?(.+?)\s+(?:animation|timeline)$/i.exec(t) ?? /^animate(?:\s+(.+))?$/i.exec(t);
  if (m) {
    const name = (m[1] ?? '').trim();
    const tl = name ? matchName(name, c.ab.timelines) : null;
    return hit('animation', tl ? { timeline: tl.id } : {}, name && !tl ? [`an animation called “${plain(name)}”`] : []);
  }
  m = /^(?:play|ring|trigger|make|give)\s+(?:the\s+|an?\s+|some\s+)?(?:(.+?)\s+)?(?:sound|noise|audio|beep|ding|chime|clip|sound effect)(?:\s+(?:called|named)\s+(.+))?$/i.exec(t) ?? /^(?:play|ring)\s+(?:the\s+|an?\s+)?(beep|ding|chime|click|bell)$/i.exec(t);
  if (m) {
    const name = (m[1] ?? '') + ' ' + (m[2] ?? '');
    const generic = !name.trim() || /^(?:a|an|the|some|short|little|nice|funny|sound)$/i.test(name.trim());
    const a = generic ? null : matchName(name, audioAssets(c.project));
    return hit('sound', a ? { sound: a.id } : {}, !generic && !a && !/^(?:beep|ding|chime|click|bell)$/i.test(name.trim()) ? [`a sound called “${plain(name)}”`] : []);
  }
  m = /^play\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const tl = matchName(m[1], c.ab.timelines);
    const snd = matchName(m[1], audioAssets(c.project));
    const vid = matchName(m[1], videoChoices(c.ab));
    if (tl) return hit('animation', { timeline: tl.id });
    if (snd) return hit('sound', { sound: snd.id });
    if (vid) return hit('video-toggle', { video: vid.id });
  }

  //---- changing a value: set X to Y, and the switch on/off forms
  m = /^(?:set|change|make|put)\s+(?:the\s+)?(.+?)\s+(?:to|as|equal to|=)\s+(.+)$/i.exec(t);
  if (m) {
    const v = findVar(m[1], vars.filter((x) => !x.live && !x.formula));
    const val = unq(m[2], c);
    if (v?.type === 'number' && Number.isFinite(Number(val))) return hit('counter', { counter: v.id, numhow: 'set', amount: val });
    if (v?.type === 'boolean' && (ON_WORDS.test(val) || OFF_WORDS.test(val))) return hit('switch', { switch: v.id, how: ON_WORDS.test(val) ? 'on' : 'off' });
    if (v && (v.type === 'string' || v.type === 'enum')) return hit('text-set', { textvar: v.id, textvalue: val });
    if (!v && /^(?:on|off|true|false)$/i.test(val) && !/\b(?:colou?r|text|label|opacity|width|height|size)\b/i.test(m[1])) return hit('switch', { switch: NEW_PREFIX + (camel(m[1]) || 'isOn'), how: ON_WORDS.test(val) ? 'on' : 'off' });
  }
  m = /^(?:turn|switch|set)\s+(?:the\s+)?(.+?)\s+(on|off)$/i.exec(t) ?? /^(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const [phrase, how] = /^(?:on|off)$/i.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const v = findVar(phrase, switchChoices(c.project));
    return hit('switch', { switch: v ? v.id : NEW_PREFIX + (camel(phrase) || 'isOn'), how: how.toLowerCase() });
  }
  m = /^(?:toggle|flip|switch)\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const v = findVar(m[1], switchChoices(c.project));
    const l = matchName(m[1], c.layers);
    if (v && (!l || nameScore(tokens(m[1]), v.name) >= nameScore(tokens(m[1]), l.name))) return hit('switch', { switch: v.id, how: 'flip' });
  }

  //---- numbers
  m = new RegExp(`^(?:add|give|award|plus|put)\\s+(${NUM})?\\s*(?:more\\s+|extra\\s+)?${POINTS}?\\s*(?:to|onto|on|for)\\s+(?:the\\s+|their\\s+|my\\s+|a\\s+)?(.+)$`, 'i').exec(t);
  if (m) {
    const v = numberVarFor(m[2], c);
    return hit('counter', { counter: counterAnswer(v, m[2], 'score'), numhow: 'add', amount: String(numOf(m[1])) });
  }
  m = new RegExp(`^(?:add|give|award|get|earn|score)\\s+(${NUM})\\s*(?:more\\s+)?${POINTS}$`, 'i').exec(t);
  if (m) return hit('counter', { counter: counterAnswer(findVar('score', counterChoices(c.project)) ?? null, 'score', 'score'), numhow: 'add', amount: String(numOf(m[1])) });
  m = new RegExp(`^(?:subtract|take away|take off|take|remove|deduct|minus)\\s+(${NUM})\\s*${POINTS}?\\s*(?:from|off|of)\\s+(?:the\\s+|their\\s+|my\\s+)?(.+)$`, 'i').exec(t);
  if (m) return hit('counter', { counter: counterAnswer(numberVarFor(m[2], c), m[2], 'score'), numhow: 'subtract', amount: String(numOf(m[1])) });
  m = new RegExp(`^(?:lose|deduct|subtract|minus)\\s+(${NUM})\\s*(${POINTS}|[a-z]+)$`, 'i').exec(t);
  if (m) {
    const v = /^(?:points?|marks?|pts?)$/i.test(m[2]) ? findVar('score', counterChoices(c.project)) : numberVarFor(m[2], c);
    return hit('counter', { counter: counterAnswer(v, /^(?:points?|marks?|pts?)$/i.test(m[2]) ? 'score' : m[2], 'score'), numhow: 'subtract', amount: String(numOf(m[1])) });
  }
  m = new RegExp(`^(?:increase|raise|bump up|bump|increment|count up|step up|go up)\\s+(?:the\\s+)?(.+?)(?:\\s+by\\s+(${NUM}))?$`, 'i').exec(t);
  if (m) return hit('counter', { counter: counterAnswer(numberVarFor(m[1], c), m[1], 'count'), numhow: 'add', amount: String(numOf(m[2])) });
  m = new RegExp(`^(?:decrease|reduce|lower|decrement|count down|step down)\\s+(?:the\\s+)?(.+?)(?:\\s+by\\s+(${NUM}))?$`, 'i').exec(t);
  if (m) return hit('counter', { counter: counterAnswer(numberVarFor(m[1], c), m[1], 'count'), numhow: 'subtract', amount: String(numOf(m[2])) });
  m = /^count\s+(?:the\s+)?(?:number of\s+)?(clicks?|taps?|times?|goes|tries|attempts|visits|presses)$/i.exec(t);
  if (m) return hit('counter', { counter: counterAnswer(numberVarFor(m[1], c), m[1], 'count'), numhow: 'add', amount: '1' });

  //---- going round a set of items (the page ones come next)
  m = /^(?:go|move|jump|skip|advance|show)?\s*(?:on\s+)?(?:to\s+)?(?:the\s+)?(next|previous)\s+(item|card|picture|image|photo|step|slide|question)$/i.exec(t);
  if (m) {
    const v = numberVarFor(m[2], c);
    const item = /^(?:item|card|picture|image|photo)$/i.test(m[2]) || !!v;
    if (item) return hit(m[1].toLowerCase() === 'next' ? 'item-next' : 'item-previous', { counter: v ? v.id : NEW_PREFIX + (/^(?:picture|image|photo)$/i.test(m[2]) ? 'picture' : m[2].toLowerCase() === 'card' ? 'card' : m[2].toLowerCase() === 'item' ? 'item' : 'slide') });
  }

  //---- pages
  m = /^(?:go|move|jump|skip|continue|carry on|advance|head|proceed|turn|take (?:me|them|the (?:learner|student)s?|people|learners|users?)|send (?:me|them|the (?:learner|student)s?|people|learners|users?)|navigate)\b\s*(.*)$/i.exec(t);
  if (m || /^(?:next|next page|next slide|next screen|continue|go on|back|previous|previous page|previous slide|previous screen)$/i.test(t)) {
    const tail = (m ? m[1] : t).replace(/^(?:on\s+)?/i, '').trim();
    const transition: Answers = tr.transition ? { transition: tr.transition } : {};
    if (/^(?:to\s+|onto\s+)?(?:the\s+)?(?:next|following)(?:\s+(?:page|slide|screen))?$/i.test(tail) || /^(?:next|next page|next slide|next screen|continue|on|go on|carry on)$/i.test(tail) || (m && /^(?:continue|carry on|advance|proceed)$/i.test(m[0].trim()))) return hit('page-next', transition);
    if (/^(?:back|(?:back )?(?:to\s+)?(?:the\s+)?(?:previous|page before)(?:\s+(?:page|slide|screen))?|back (?:a|one) (?:page|slide|screen)|previous|previous page|previous slide|previous screen)$/i.test(tail)) return hit('page-previous', transition);
    const to = /^(?:back\s+)?(?:to|onto)\s+(?:the\s+)?(.+)$/i.exec(tail);
    if (to) return pageHit(to[1], c, transition);
  }
  m = /^(?:open|show|display|visit|switch to)\s+(?:the\s+)?(.+?\s+(?:page|slide|screen))$/i.exec(t);
  if (m && matchName(m[1], c.project.artboards)) return pageHit(m[1], c, tr.transition ? { transition: tr.transition } : {});

  //---- showing only one
  m = /^(?:show only|only show)\s+(?:the\s+)?(.+)$/i.exec(t) ?? /^show\s+(?:the\s+)?(.+?)\s+and\s+hide\s+(?:all\s+)?(?:the\s+)?(?:others?|rest|everything else|other ones)$/i.exec(t);
  if (m) return onlyOne(m[1], c);

  //---- a layer's look
  m = /^(?:change|set|update|replace)\s+(?:the\s+)?(?:text|label|words|caption)\s+(?:of\s+|on\s+|in\s+)?(.*?)\s*(?:to say|to read|to be|to|as)\s+(.+)$/i.exec(t) ?? /^(?:change|set|update|replace)\s+(?:the\s+)?(.*?)\s*(?:text|label|words|caption)\s*(?:to say|to read|to be|to|as)\s+(.+)$/i.exec(t) ?? /^(?:make|have)\s+(.+?)\s+(?:say|read)\s+(.+)$/i.exec(t) ?? /^(?:change|set|update)\s+(?:the\s+)?(.+?)\s+(?:to say|to read)\s+(.+)$/i.exec(t);
  if (m) {
    const r = layerRef(m[1].replace(/^(?:of|on|in)\s+/i, ''), c);
    return hit('look', { what: 'text', words: unq(m[2], c), ...(r.id ? { layer: r.id } : {}) }, r.missing ? [r.missing] : []);
  }
  m = new RegExp(`^(?:change|set)\\s+(?:the\\s+)?(?:colou?r|fill|background)(?:\\s+of\\s+(.+?))?\\s+to\\s+(${COLOUR_RE})$`, 'i').exec(t) ?? new RegExp(`^(?:make|turn|change|set|colou?r|paint|fill)\\s+(.*?)\\s*(?:to\\s+)?(?:the\\s+)?(${COLOUR_RE})$`, 'i').exec(t);
  if (m) {
    const who = (m[1] ?? '').replace(/\b(?:the|its|colou?r|fill|background|of|to)\b/gi, ' ').trim();
    const r = layerRef(who, c);
    const col = m[2].toLowerCase();
    return hit('look', { what: 'colour', colour: COLOURS[col] ?? col, ...(r.id ? { layer: r.id } : {}) }, r.missing ? [r.missing] : []);
  }
  m = /^(?:set|change)\s+(?:the\s+)?(?:opacity|transparency)(?:\s+of\s+(.+?))?\s+to\s+(\d{1,3})\s*(?:%|percent)?$/i.exec(t) ?? /^(?:fade|make|set|change)\s+(.*?)\s*(?:to\s+|at\s+)?(\d{1,3})\s*(?:%|percent)\s*(?:see[- ]through|transparent|opaque|visible|opacity)?$/i.exec(t);
  if (m && Number(m[2]) <= 100) {
    const r = layerRef((m[1] ?? '').replace(/\b(?:the|its|opacity|of|to)\b/gi, ' '), c);
    return hit('look', { what: 'opacity', percent: m[2], ...(r.id ? { layer: r.id } : {}) }, r.missing ? [r.missing] : []);
  }
  m = /^(?:fade|fade out|fade away)(?:\s+(?:the\s+)?(.+?))?(?:\s+(?:out|away))?$/i.exec(t) ?? /^make\s+(.+?)\s+(?:transparent|see[- ]through|invisible)$/i.exec(t);
  if (m) {
    const r = layerRef((m[1] ?? '').replace(/\b(?:the|out|away)\b/gi, ' '), c);
    return hit('look', { what: 'opacity', percent: '0', ...(r.id ? { layer: r.id } : {}) }, r.missing ? [r.missing] : []);
  }
  m = /^(?:make|set|resize|change)\s+(.*?)\s*(\d+)\s*(?:px|pixels?)?\s+(wide|tall|high)(?:\s+and\s+(\d+)\s*(?:px|pixels?)?\s+(wide|tall|high))?$/i.exec(t);
  if (m) {
    const r = layerRef(m[1].replace(/\b(?:the|its|to|be)\b/gi, ' '), c);
    const a: Answers = { what: 'size', [/wide/i.test(m[3]) ? 'width' : 'height']: m[2] };
    if (m[4]) a[/wide/i.test(m[5]) ? 'width' : 'height'] = m[4];
    return hit('look', { ...a, ...(r.id ? { layer: r.id } : {}) }, r.missing ? [r.missing] : []);
  }
  m = /^(?:set|change)\s+(?:the\s+)?(width|height)(?:\s+of\s+(.+?))?\s+to\s+(\d+)\s*(?:px|pixels?)?$/i.exec(t);
  if (m) {
    const r = layerRef(m[2], c);
    return hit('look', { what: 'size', [m[1].toLowerCase()]: m[3], ...(r.id ? { layer: r.id } : {}) }, r.missing ? [r.missing] : []);
  }

  //---- zooming the view
  if (/^(?:zoom out|show the whole page(?: again)?|show everything|zoom to (?:fit|the whole page))$/i.test(t)) return hit('view-page');
  m = /^(?:zoom|move the view|pan|scroll|focus)(?:\s+in)?(?:\s+(?:on|to|onto))?\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const r = layerRef(m[1], c);
    return hit('view-layer', r.id ? { layer: r.id } : {}, r.missing ? [r.missing] : []);
  }

  //---- resetting values
  m = /^(?:reset|clear|zero|put back|restore)\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const all = resettable(c.project);
    if (/^(?:everything|all|all values|all the values|the values|all numbers|all of them|all scores|values)$/i.test(m[1].trim())) return hit('reset', { vars: joinSet(all.map((v) => v.id)) });
    const found = findAll(m[1], all);
    if (found.length) return hit('reset', { vars: joinSet(found.map((v) => v.id)) });
    if (/^(?:reset|zero|put back|restore)/i.test(t)) return hit('reset', {}, [`a value called “${plain(m[1])}”`]);
  }

  //---- words for a screen reader, and links, scripts
  m = /^(?:say|announce|tell\s+(?:the\s+)?(?:users?|learners?|students?|them|people|everyone)(?:\s+that)?|tell screen ?readers?(?:\s+to say|\s+that)?|tell the screen reader(?:\s+to say|\s+that)?|read out|read aloud|speak|let screen ?readers know)\s+(.+)$/i.exec(t);
  if (m) return hit('announce', { words: unq(m[1], c) });
  m = /^open\s+(?:the\s+|a\s+)?(?:link\s+|website\s+|web ?site\s+|web ?page\s+|url\s+)?(?:at\s+|to\s+)?((?:https?:\/\/|www\.)\S+|\S+\.(?:com|org|edu|net|au|gov|io)\S*)$/i.exec(t);
  if (m) return hit('link', { link: /^https?:\/\//i.test(m[1]) ? m[1] : `https://${m[1]}` });
  if (/^open\s+(?:a\s+|the\s+)?(?:link|website|web ?site|web ?page|url)$/i.test(t)) return hit('link', {}, ['the web address']);
  m = /^run\s+(?:the\s+|a\s+)?(?:script\s+)?(?:(.+?)\s+)?script$/i.exec(t) ?? /^run\s+(?:the\s+)?script\s+(.+)$/i.exec(t);
  if (m) {
    const s = m[1] ? matchName(m[1], c.project.scripts) : null;
    return hit('script', s ? { script: s.id } : {}, m[1] && !s ? [`a script called “${plain(m[1])}”`] : []);
  }

  //---- showing, hiding and toggling a layer (last: the plainest verbs)
  m = /^(?:toggle|flip|show or hide|hide or show|show\/hide)\s+(?:the\s+)?(.+)$/i.exec(t);
  if (m) {
    const r = layerRef(m[1], c);
    return hit('toggle', r.id ? { layer: r.id } : {}, r.missing ? [r.missing] : []);
  }
  m = /^(?:show|reveal|display|unhide|bring up|pop up|uncover|open|make visible)(?:\s+up)?(?:\s+(?:the\s+|a\s+)?(.+))?$/i.exec(t) ?? /^make\s+(.+?)\s+(?:visible|appear|show up)$/i.exec(t);
  if (m) return showHide('show', m[1], c);
  m = /^(?:hide|remove|get rid of|dismiss|close|take away|clear|make invisible)(?:\s+(?:the\s+|a\s+)?(.+))?$/i.exec(t) ?? /^make\s+(.+?)\s+(?:disappear|vanish|go away)$/i.exec(t);
  if (m) return showHide('hide', m[1], c);

  return null;
}

/** Show or hide a layer, or open a page when what was named is a page and not a layer ("show the results page"). */
function showHide(op: 'show' | 'hide', phrase: string | undefined, c: Ctx): Hit {
  const p = (phrase ?? '').replace(/\s+(?:again|up)$/i, '').trim();
  if (op === 'show' && p) {
    const l = matchName(p, c.layers);
    const pg = matchName(p, c.project.artboards);
    if (pg && (!l || /\b(?:page|screen|slide)\b/i.test(p))) return pageHit(p, c, {});
  }
  const r = layerRef(p, c);
  return hit(op, r.id ? { layer: r.id } : {}, r.missing ? [r.missing] : []);
}

/** Go to a named page: its name, a number ("page 3"), or the first and last. */
function pageHit(phrase: string, c: Ctx, extra: Answers): Hit {
  const p = phrase.trim();
  const others = otherPages({ project: c.project, ab: c.ab, layerId: c.layerId });
  let target: Named | null = null;
  const num = /^(?:page|slide|screen)\s+(\d+)$/i.exec(p);
  if (num) target = c.project.artboards[Number(num[1]) - 1] ?? null;
  else if (/^(?:the\s+)?(?:start|beginning|first(?:\s+(?:page|slide|screen))?|home(?:\s+page)?|title(?:\s+page)?)$/i.test(p)) target = c.project.artboards.find((a) => a.id === c.project.settings.startArtboardId) ?? c.project.artboards[0] ?? null;
  else if (/^(?:the\s+)?(?:end|last(?:\s+(?:page|slide|screen))?|final(?:\s+(?:page|slide|screen))?)$/i.test(p)) target = c.project.artboards[c.project.artboards.length - 1] ?? null;
  else target = matchName(p, c.project.artboards);
  if (target && !others.some((a) => a.id === target!.id)) target = null;
  return hit('page-pick', { ...extra, ...(target ? { page: target.id } : {}) }, target ? [] : [`a page called “${plain(p)}”`]);
}

function onlyOne(phrase: string, c: Ctx): Hit {
  const r = layerRef(phrase, c);
  const id = r.id === THIS_LAYER || !r.id ? c.layerId : r.id;
  const mine = findNode(c.ab, id);
  const sibs = siblingsOf(c.ab, id);
  const same = sibs.filter((n) => n.type === mine?.type);
  const hide = (same.length ? same : sibs).map((n) => n.id);
  return hit('only-one', { ...(r.id ? { layer: r.id } : {}), set: joinSet(hide) }, r.missing ? [r.missing] : []);
}

function findNode(ab: Artboard, id: string): SceneNode | undefined {
  let found: SceneNode | undefined;
  walk(ab.children, (n) => void (n.id === id && (found = n)));
  return found;
}

//---------------------------------------------------------------------------------------------------------------------
//The whole sentence

const SEP = /(\s*,\s*|\s+and then\s+|\s+then\s+|\s+and also\s+|\s+also\s+|\s+after that\s+|\s+and\s+)/i;

/** Read a run of clauses: each one is the longest stretch of the sentence that is one thing to do. */
function readClauses(text: string, c: Ctx): { hits: Hit[]; ignored: string[] } {
  const parts = text.split(SEP);
  //parts alternate piece, separator, piece...
  const pieces: string[] = [];
  const seps: string[] = [];
  parts.forEach((p, i) => (i % 2 ? seps.push(p) : pieces.push(p)));
  const hits: Hit[] = [];
  const ignored: string[] = [];
  let i = 0;
  while (i < pieces.length) {
    //the longest stretch that reads as one thing and names only things the project has; failing that, the longest that reads at all
    let found: Hit | null = null;
    let j = i - 1;
    let loose: { hit: Hit; at: number } | null = null;
    for (let e = pieces.length - 1; e >= i; e--) {
      let s = pieces[i];
      for (let k = i + 1; k <= e; k++) s += seps[k - 1] + pieces[k];
      const h = parseAction(s, c);
      if (!h) continue;
      if (!h.missing.length) {
        found = h;
        j = e;
        break;
      }
      loose ??= { hit: h, at: e };
    }
    if (!found && loose) (found = loose.hit), (j = loose.at);
    if (found) {
      hits.push(found);
      i = j + 1;
    } else {
      if (pieces[i].trim()) ignored.push(unq(pieces[i], c));
      i++;
    }
  }
  return { hits, ignored };
}

function prep(text: string): { t: string; quotes: string[] } {
  const quotes: string[] = [];
  const t = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/"([^"]*)"/g, (_, q: string) => ` qq${quotes.push(q) - 1}qq `)
    .replace(/[?!]+/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^please\s+/i, '')
    .replace(/\s+please$/i, '');
  return { t, quotes };
}

/**
 * Turn a sentence into a behaviour for the dialog. `selectedLayerId` is the layer the person has selected ("this"). Null when no
 * recipe could be read out of it.
 */
export function describeIt(sentence: string, project: Project, ab: Artboard, selectedLayerId = ''): Described | null {
  const { t, quotes } = prep(sentence);
  if (!t) return null;
  const layers = layerChoices(ab).map((l) => ({ id: l.id, name: l.name }));
  const c: Ctx = { project, ab, layerId: selectedLayerId, layers, quotes };

  const tr = takeTrigger(t, c);
  //a "when ..." it did not recognise ("when the quiz is done") is left out and said so, not read into the action
  const stray = /\s*\b(?:when|whenever|every time|each time|as soon as|once)\b(.+)$/i.exec(tr.rest);
  const cond = takeCondition(stray ? tr.rest.slice(0, stray.index) : tr.rest, c);
  if (stray) cond.ignored.push(unq(stray[0].trim(), c));
  const { hits, ignored } = readClauses(cond.rest, c);
  if (!hits.length) return null;

  const layerId = tr.layerId ?? selectedLayerId ?? '';
  const ctx: RecipeCtx = { project, ab, layerId };
  const withDefaults = (h: Hit): Step => ({ recipe: h.recipe, answers: { ...defaultAnswers(RECIPE_BY_ID[h.recipe], ctx), ...h.answers } });
  const main = withDefaults(hits[0]);
  const then = hits.slice(1).filter((h) => h.recipe !== 'count-done').map(withDefaults);
  let otherwise: Step | null = null;
  const missing = [...tr.missing, ...hits.flatMap((h) => h.missing)];
  const lost = [...ignored, ...cond.ignored];
  if (cond.only && cond.otherwise) {
    const o = readClauses(cond.otherwise, c);
    if (o.hits[0]) {
      otherwise = withDefaults(o.hits[0]);
      missing.push(...o.hits[0].missing);
    }
    lost.push(...o.ignored);
  }
  const when = { ...defaultTriggerAnswers(tr.trigger, ctx), ...tr.when };
  const only = cond.only;

  const gap = incomplete(RECIPE_BY_ID[main.recipe], main.answers, project, ab) ?? triggerIncomplete(tr.trigger, when, project, ab);
  const who = layers.find((l) => l.id === layerId)?.name ?? 'this layer';
  let said = `When ${triggerLabel(tr.trigger, who)}: ${RECIPE_BY_ID[main.recipe].label.replace(/…$/, '')}`;
  if (layerId && !gap) {
    try {
      said = buildBehaviour(ctx, main.recipe, tr.trigger, main.answers, undefined, { when, then, only, otherwise }).sentence;
    } catch {
      /* the plain wording above stands */
    }
  }
  return { recipe: main.recipe, answers: main.answers, trigger: tr.trigger, when, then, only, otherwise, layerId, sentence: said, missing: [...new Set(missing)], ignored: lost };
}

/** Does the sentence read as a sentence worth trying (three or more words)? The palette keeps its single-word searches for commands. */
export const looksLikeSentence = (q: string): boolean => q.trim().split(/\s+/).filter(Boolean).length >= 3;
