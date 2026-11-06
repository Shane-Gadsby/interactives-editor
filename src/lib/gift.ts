//A GIFT reader for the question kit. GIFT is the plain text quiz format Moodle imports and the suite's GIFT converter writes.
//This file is only the reading: text in, kit-shaped questions out, plus a list of what could not come across and why. No DOM,
//no project, nothing from the editor, so it is tested on its own (gift-import.ts puts the result into a project).
import { MAX_OPTIONS, MAX_PAIRS } from 'interactives-player';

export type GiftKind = 'single' | 'multiple' | 'truefalse' | 'blank' | 'matching';

export interface GiftOption {
  text: string;
  correct: boolean;
  /** Said when the learner has this one picked (the text after a # on the answer). */
  feedback?: string;
}

export interface GiftQuestion {
  /** The line the question starts on, 1 based, for the report. */
  line: number;
  /** The ::title:: if it had one. */
  title: string;
  kind: GiftKind;
  prompt: string;
  /** Choices (single, multiple, truefalse). */
  options: GiftOption[];
  /** Fill in the blank: every accepted answer, and how far off a number may be. */
  answers: string[];
  tolerance?: number;
  /** Matching. */
  pairs: { term: string; match: string }[];
  /** The #### text: said once the question is finished. */
  generalFeedback: string;
  /** Things that came across changed (part marks dropped, a distractor left out...). Shown in the report. */
  notes: string[];
}

export interface GiftSkip {
  line: number;
  title: string;
  /** The question's start, so a question without a title can still be found in the file. */
  excerpt: string;
  reason: string;
}

export interface GiftParse {
  questions: GiftQuestion[];
  skipped: GiftSkip[];
  /** File level remarks ($CATEGORY lines...). */
  notes: string[];
}

//---------------------------------------------------------------------------------------------------------------------
//Escapes. A backslash makes the next character plain text (\~ \= \# \{ \} \: \\), and \n is a line break.

/** Index of the first `needle` at or after `from` that is not escaped, or -1. */
function indexOfPlain(s: string, needle: string, from = 0): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s.startsWith(needle, i)) return i;
  }
  return -1;
}

/** Split on every unescaped `sep`. */
function splitPlain(s: string, sep: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const i = indexOfPlain(s, sep, at);
    if (i < 0) break;
    out.push(s.slice(at, i));
    at = i + sep.length;
  }
  out.push(s.slice(at));
  return out;
}

export function unescapeGift(s: string): string {
  return s.replace(/\\([\s\S])/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

//Open braces minus closing ones that are not escaped, for knowing whether a block is still open.
function braceDepth(line: string): number {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') i++;
    else if (c === '{') n++;
    else if (c === '}') n--;
  }
  return n;
}

//---------------------------------------------------------------------------------------------------------------------
//Text. The kit's text layers are plain text, so [html] questions lose their tags (and say so).

interface TextCtx {
  html: boolean;
  /** What got dropped on the way, for the question's notes. */
  dropped: Set<string>;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function stripHtml(s: string, ctx: TextCtx): string {
  if (!/<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(s)) return s;
  if (/<img\b/i.test(s)) ctx.dropped.add('pictures');
  if (/<(?:b|i|u|em|strong|sub|sup|span|a|table|ul|ol|li|pre|code|h\d)\b/i.test(s)) ctx.dropped.add('formatting');
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\n{3,}/g, '\n\n');
}

//An escaped piece of GIFT text as the plain text it stands for.
function text(raw: string, ctx: TextCtx): string {
  const t = unescapeGift(raw);
  return (ctx.html ? stripHtml(t, ctx) : t).trim();
}

//---------------------------------------------------------------------------------------------------------------------
//Blocks. Questions are separated by blank lines; // lines are comments; $CATEGORY lines are not questions.

interface Block {
  line: number;
  text: string;
}

function blocksOf(src: string, notes: string[]): Block[] {
  const lines = src.replace(/^﻿/, '').split(/\r\n?|\n/);
  const out: Block[] = [];
  let cur: string[] = [];
  let start = 0;
  let depth = 0;
  let categories = 0;
  const flush = () => {
    if (cur.length) out.push({ line: start, text: cur.join('\n') });
    cur = [];
    depth = 0;
  };
  //The next line that is neither blank nor a comment, to tell whether a block that never closed is swallowing the next question
  const nextReal = (from: number) => {
    for (let j = from; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t && !t.startsWith('//')) return t;
    }
    return '';
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith('//')) continue;
    if (!t) {
      if (depth > 0 && !/^(::|\$CATEGORY)/i.test(nextReal(i + 1)) && nextReal(i + 1)) {
        cur.push('');
        continue;
      }
      flush();
      continue;
    }
    if (!cur.length && /^\$CATEGORY\s*:/i.test(t)) {
      categories++;
      continue;
    }
    if (!cur.length) start = i + 1;
    cur.push(line);
    depth += braceDepth(line);
  }
  flush();
  if (categories) notes.push(`${categories} category line${categories === 1 ? '' : 's'} ignored. The Question kit has no categories, so every question is just added.`);
  return out;
}

//---------------------------------------------------------------------------------------------------------------------
//Answers

interface Seg {
  marker: '=' | '~';
  /** Weight in percent if the answer says one (%50%). */
  weight: number | null;
  /** The answer, still escaped. */
  raw: string;
  /** The text after a # (the answer's own feedback), still escaped. */
  feedback: string;
}

const FULL = 99.99;

//Cut an answer block into its = and ~ answers. Returns what came before the first marker too.
function segmentsOf(a: string): { lead: string; segs: Seg[] } {
  const segs: Seg[] = [];
  let lead = '';
  let at = 0;
  let marker: '=' | '~' | null = null;
  const close = (end: number) => {
    const chunk = a.slice(at, end);
    if (!marker) {
      lead = chunk;
      return;
    }
    const hash = indexOfPlain(chunk, '#');
    let body = hash < 0 ? chunk : chunk.slice(0, hash);
    const feedback = hash < 0 ? '' : chunk.slice(hash + 1);
    let weight: number | null = null;
    const w = /^\s*%(-?\d+(?:\.\d+)?)%/.exec(body);
    if (w) {
      weight = Number(w[1]);
      body = body.slice(w[0].length);
    }
    segs.push({ marker, weight, raw: body, feedback });
  };
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '=' || c === '~') {
      close(i);
      marker = c;
      at = i + 1;
    }
  }
  close(a.length);
  return { lead, segs };
}

const isFull = (s: Seg) => (s.weight === null ? s.marker === '=' : s.weight >= FULL);

//A number as typed: "1,000" and " 4.5 " are fine, anything else is not a number.
function num(s: string): number | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number) => Number(n.toPrecision(12));

//A short answer as the kit takes it: plain text, or a /pattern/ when it has a * wildcard (or is itself shaped like a pattern).
function blankAnswer(raw: string, ctx: TextCtx): string {
  //Only the ends are trimmed, so a space either side of a * stays in the pattern
  const pieces = splitPlain(raw.trim(), '*').map((p) => (ctx.html ? stripHtml(unescapeGift(p), ctx) : unescapeGift(p)));
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  if (pieces.length > 1) return `/^${pieces.map(escapeRe).join('.*')}$/i`;
  const only = pieces[0];
  return /^\/.+\/[a-z]*$/.test(only) ? `/^${escapeRe(only)}$/i` : only;
}

//---------------------------------------------------------------------------------------------------------------------
//One question

class Skip extends Error {}
const skip = (reason: string): never => {
  throw new Skip(reason);
};

const EXCERPT = 60;

function excerptOf(s: string): string {
  const flat = unescapeGift(s).replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}...` : flat;
}

function parseBlock(block: Block): GiftQuestion | GiftSkip {
  let rest = block.text;
  let title = '';
  const lead = rest.replace(/^\s+/, '');
  if (lead.startsWith('::')) {
    const end = indexOfPlain(lead, '::', 2);
    if (end >= 0) {
      title = unescapeGift(lead.slice(2, end)).trim();
      rest = lead.slice(end + 2);
    }
  }
  const failed = (reason: string): GiftSkip => {
    const open = indexOfPlain(rest, '{');
    return { line: block.line, title, excerpt: excerptOf((open < 0 ? rest : rest.slice(0, open)).replace(/^\s*\[\w+\]/, '') || rest), reason };
  };
  try {
    const open = indexOfPlain(rest, '{');
    if (open < 0) return failed('This is plain text with no answers, which GIFT uses for a description. Nothing to ask, so it was left out.');
    const close = indexOfPlain(rest, '}', open + 1);
    if (close < 0) return failed('The answers are never closed: there is a { with no } after it.');
    let head = rest.slice(0, open);
    const body = rest.slice(open + 1, close);
    const tail = rest.slice(close + 1);
    if (indexOfPlain(tail, '{') >= 0) return failed('It has more than one set of answers in braces. The Question kit asks one thing per question.');

    const ctx: TextCtx = { html: false, dropped: new Set() };
    const fmt = /^\s*\[(html|markdown|plain|moodle)\]/i.exec(head);
    if (fmt) {
      head = head.slice(fmt[0].length);
      ctx.html = fmt[1].toLowerCase() === 'html';
    }
    //Text with the answer slot in it (a missing word question) gets a visible gap where the answers were
    const stem = (gap: boolean) => {
      const full = gap && tail.trim() ? `${head}_____${tail}` : tail.trim() ? `${head} ${tail}` : head;
      return text(full, ctx);
    };

    //Everything after #### is the general feedback; the answers are what is before it
    const gen = indexOfPlain(body, '####');
    const answers = (gen < 0 ? body : body.slice(0, gen)).trim();
    const generalFeedback = gen < 0 ? '' : text(body.slice(gen + 4), ctx);
    const notes: string[] = [];
    const make = (kind: GiftKind, prompt: string, extra: Partial<GiftQuestion>): GiftQuestion => {
      if (!prompt) skip('It has no question text.');
      if (ctx.dropped.has('pictures')) notes.push('A picture in the text was left out, since the kit shows text only here.');
      if (ctx.dropped.has('formatting')) notes.push('HTML formatting (bold, lists, links...) was removed. The text is plain.');
      if (/\$\$|\\\(|\\\[/.test(unescapeGift(body + head + tail))) notes.push('It has maths markup that shows as the raw text.');
      return { line: block.line, title, kind, prompt, options: [], answers: [], pairs: [], generalFeedback, notes, ...extra };
    };

    if (!answers) return failed('Essay question: it has no answers because a person marks it. The Question kit only checks answers itself.');

    //Numerical: {#42}, {#3.14:0.01}, {#1..5}, {#=42:1 =%50%43:2}
    if (answers.startsWith('#')) {
      const inner = answers.slice(1);
      const { segs } = segmentsOf(/^\s*=/.test(inner) ? inner : `=${inner}`);
      const found: { value: string; tol: number; full: boolean; fb: string }[] = [];
      for (const s of segs) {
        const t = unescapeGift(s.raw).trim();
        const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(t);
        let value: string;
        let tol = 0;
        const rangeNums = range ? [num(range[1]), num(range[2])] : null;
        if (rangeNums && rangeNums[0] !== null && rangeNums[1] !== null) {
          const [lo, hi] = [Math.min(rangeNums[0], rangeNums[1]), Math.max(rangeNums[0], rangeNums[1])];
          value = String(round((lo + hi) / 2));
          tol = round((hi - lo) / 2);
        } else {
          const [v, tl] = t.split(':').map((x) => x.trim());
          const n = num(v ?? '');
          const tn = tl === undefined ? 0 : num(tl);
          if (n === null || tn === null) return failed(`The numerical answer "${t}" is not a number (or number:margin, or low..high) the kit can read.`);
          value = String(n);
          tol = Math.abs(tn);
        }
        found.push({ value, tol, full: isFull(s), fb: s.feedback.trim() });
      }
      const right = found.filter((f) => f.full);
      if (!right.length) return failed('None of its numerical answers is worth full marks, so there is no right answer to check.');
      const same = right.filter((f) => f.tol === right[0].tol);
      if (found.length > same.length) notes.push(`${found.length - same.length} numerical answer${found.length - same.length === 1 ? '' : 's'} left out: the kit takes one margin of error per blank, and part marks are not kept.`);
      if (found.some((f) => f.fb)) notes.push('Feedback on individual answers was dropped. A blank has one set of feedback messages.');
      return make('blank', stem(true), { answers: same.map((f) => f.value), ...(right[0].tol > 0 ? { tolerance: right[0].tol } : {}) });
    }

    //True or false: {T}, {FALSE#wrong feedback#right feedback}
    const tfParts = splitPlain(answers, '#');
    if (/^(t|f|true|false)$/i.test(tfParts[0].trim())) {
      const isTrue = /^t/i.test(tfParts[0].trim());
      const wrong = text(tfParts[1] ?? '', ctx);
      const right = text(tfParts.slice(2).join('#'), ctx);
      const opt = (label: string, correct: boolean): GiftOption => {
        const feedback = correct ? right : wrong;
        return { text: label, correct, ...(feedback ? { feedback } : {}) };
      };
      return make('truefalse', stem(false), { options: [opt('True', isTrue), opt('False', !isTrue)] });
    }

    const { lead: before, segs } = segmentsOf(answers);
    if (before.trim()) return failed('Some text in the answers is not marked with = (right) or ~ (wrong).');
    if (!segs.length) return failed('The answers have no = or ~ marks.');

    //Matching: {=term -> match =term -> match}
    if (segs.some((s) => indexOfPlain(s.raw, '->') >= 0)) {
      if (segs.some((s) => s.marker !== '=' || indexOfPlain(s.raw, '->') < 0)) return failed('A matching question needs every line to be =term -> match.');
      const pairs: { term: string; match: string }[] = [];
      let distractors = 0;
      for (const s of segs) {
        const cut = indexOfPlain(s.raw, '->');
        const term = text(s.raw.slice(0, cut), ctx);
        const match = text(s.raw.slice(cut + 2), ctx);
        if (!term || !match) distractors++;
        else pairs.push({ term, match });
      }
      if (distractors) notes.push(`${distractors} extra wrong match${distractors === 1 ? '' : 'es'} (a line with nothing on one side) left out. The kit has a slot for every term.`);
      if (segs.some((s) => s.feedback.trim())) notes.push('Feedback on individual pairs was dropped.');
      if (pairs.length < 2) return failed('A matching question needs at least two pairs.');
      if (pairs.length > MAX_PAIRS) return failed(`It has ${pairs.length} pairs and the kit's matching holds ${MAX_PAIRS}.`);
      return make('matching', stem(false), { pairs });
    }

    //Choices: any ~ makes it multiple choice (or multiple response)
    if (segs.some((s) => s.marker === '~')) {
      if (segs.length < 2) return failed('It has only one choice.');
      if (segs.length > MAX_OPTIONS) return failed(`It has ${segs.length} choices and the kit holds ${MAX_OPTIONS}.`);
      const weighted = segs.some((s) => s.weight !== null);
      let right: boolean[];
      if (!weighted) right = segs.map((s) => s.marker === '=');
      else {
        const total = segs.reduce((n, s) => n + Math.max(0, s.weight ?? 0), 0);
        //Weights adding up to more than 100 are single choice with part marks for the near misses: only the full one is right
        if (total > 100.01 && segs.some((s) => (s.weight ?? 0) >= FULL)) {
          right = segs.map((s) => (s.weight ?? (s.marker === '=' ? 100 : 0)) >= FULL);
          notes.push('Some wrong answers were worth part marks. The kit marks them wrong.');
        } else {
          right = segs.map((s) => (s.weight === null ? s.marker === '=' : s.weight > 0));
          const rw = segs.filter((_, i) => right[i]).map((s) => s.weight ?? 0);
          if (rw.some((w) => Math.abs(w - rw[0]) > 0.01)) notes.push('The right answers carried different part marks. The kit gives part marks by the share of right choices instead.');
        }
      }
      const count = right.filter(Boolean).length;
      if (!count) return failed('None of its choices is marked right.');
      const options: GiftOption[] = segs.map((s, i) => {
        const feedback = text(s.feedback, ctx);
        return { text: text(s.raw, ctx), correct: right[i], ...(feedback ? { feedback } : {}) };
      });
      if (options.some((o) => !o.text)) return failed('One of the answers is empty.');
      return make(count > 1 ? 'multiple' : 'single', stem(true), { options });
    }

    //Short answer: {=Paris =paris, France}
    const accepted = segs.filter(isFull);
    if (segs.length > accepted.length) notes.push(`${segs.length - accepted.length} answer${segs.length - accepted.length === 1 ? '' : 's'} worth part marks left out. A blank accepts an answer or it does not.`);
    if (!accepted.length) return failed('None of its answers is worth full marks.');
    if (segs.some((s) => s.feedback.trim())) notes.push('Feedback on individual answers was dropped. A blank has one set of feedback messages.');
    const list = accepted.map((s) => blankAnswer(s.raw, ctx));
    if (list.some((a) => !a)) return failed('One of the accepted answers is empty.');
    return make('blank', stem(true), { answers: [...new Set(list)] });
  } catch (e) {
    if (e instanceof Skip) return failed(e.message);
    throw e;
  }
}

/** Read a GIFT file. Every question that makes sense comes back as a GiftQuestion, and everything else comes back in `skipped` with the reason. */
export function parseGift(src: string): GiftParse {
  const notes: string[] = [];
  const out: GiftParse = { questions: [], skipped: [], notes };
  for (const block of blocksOf(String(src ?? ''), notes)) {
    const r = parseBlock(block);
    if ('kind' in r) out.questions.push(r);
    else out.skipped.push(r);
  }
  return out;
}

const label = (line: number, title: string, excerpt = '') => `Line ${line}${title ? ` (${title})` : excerpt ? ` ("${excerpt}")` : ''}`;

/** The lines of the report shown after an import: what was left out and why, then what came across changed. */
export function giftReportLines(parse: GiftParse): string[] {
  return [
    ...parse.skipped.map((s) => `${label(s.line, s.title, s.excerpt)} was left out. ${s.reason}`),
    ...parse.questions.flatMap((q) => q.notes.map((n) => `${label(q.line, q.title, q.prompt.slice(0, EXCERPT))}: ${n}`)),
    ...parse.notes,
  ];
}
