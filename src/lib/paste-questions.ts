//Reads questions pasted from Word, a spreadsheet or a plain text list into the same GiftParse the GIFT reader makes, so the
//preview, the report and the import (gift-import.ts) are shared. Text in, questions out, plus what could not be understood and why.
//No DOM and nothing from the editor: tested on its own. The layouts it reads are written out in docs (help topic "paste-questions")
//and in the downloadable templates (shared/question-template.mjs), which the tests read back through this file.
import { MAX_OPTIONS, MAX_PAIRS } from 'interactives-player';
import type { GiftKind, GiftOption, GiftParse, GiftQuestion, GiftSkip } from './gift';

const EXCERPT = 60;
const excerptOf = (s: string) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}...` : flat;
};

/** What a layout gives before the type is settled and the answers are checked. */
interface Draft {
  line: number;
  title: string;
  type: string;
  prompt: string;
  options: GiftOption[];
  /** The "Answer:" line or the Correct column, as typed. */
  answer: string;
  feedback: string;
}

export const TYPE_WORDS: Record<string, GiftKind | 'multiple'> = {
  single: 'single',
  'single answer': 'single',
  'multiple choice': 'single',
  'multi choice': 'single',
  mc: 'single',
  mcq: 'single',
  choice: 'single',
  'multiple answer': 'multiple',
  'multiple answers': 'multiple',
  'multiple response': 'multiple',
  'select all': 'multiple',
  'select all that apply': 'multiple',
  multi: 'multiple',
  'true/false': 'truefalse',
  'true false': 'truefalse',
  'true or false': 'truefalse',
  'true-false': 'truefalse',
  tf: 'truefalse',
  't/f': 'truefalse',
  blank: 'blank',
  'fill in the blank': 'blank',
  'fill in the blanks': 'blank',
  'fill-in': 'blank',
  fill: 'blank',
  'short answer': 'blank',
  gap: 'blank',
  cloze: 'blank',
  matching: 'matching',
  match: 'matching',
  pairs: 'matching',
};

const MARK = /^(\*|\[\s*[xX✓✔]\s*\]|\(\s*[xX✓✔]\s*\)|[✓✔])\s*/;
const EMPTY_BOX = /^(\[\s*\]|\(\s*\))\s*/;
const TRAILING = /\s*(\*|✓|✔|\(correct\)|\[correct\])\s*$/i;
const LABEL = /^(?:[-•–·]|\(?[A-Za-z]\)|\(?\d{1,2}\)|[A-Za-z][.:]|\d{1,2}[.:])\s+/;

/** A choice as written: with or without a marker saying it is right. Cells use it as they are, lines strip a label first. */
function mark(raw: string, labelled: boolean): GiftOption {
  let t = raw.trim();
  let correct = false;
  const lead = () => {
    const m = MARK.exec(t);
    if (m) {
      correct = true;
      t = t.slice(m[0].length);
    } else {
      const e = EMPTY_BOX.exec(t);
      if (e) t = t.slice(e[0].length);
    }
  };
  lead();
  if (labelled) {
    const l = LABEL.exec(t);
    if (l) t = t.slice(l[0].length);
    lead();
  }
  const tr = TRAILING.exec(t);
  if (tr && tr.index > 0) {
    correct = true;
    t = t.slice(0, tr.index);
  }
  return { text: t.trim(), correct };
}

const TF = /^(t|f|true|false)$/i;
const isTrue = (s: string) => /^(t|true)$/i.test(s.trim());
const PAIR = /\s*(?:->|=>|→|\t|=)\s*/;

class Skip extends Error {}
const skip = (reason: string): never => {
  throw new Skip(reason);
};

/** Which options an Answer line or Correct cell names: letters (B, A and C), positions (2, 1;3) or the option's own text. */
function namedOptions(answer: string, options: GiftOption[]): number[] {
  const whole = options.findIndex((o) => o.text.toLowerCase() === answer.trim().toLowerCase());
  if (whole >= 0) return [whole];
  const out: number[] = [];
  for (const tok of answer.split(/\s*(?:[,;/&]|\band\b)\s*/i).map((t) => t.trim()).filter(Boolean)) {
    let at = -1;
    if (/^[A-Za-z]$/.test(tok)) at = tok.toUpperCase().charCodeAt(0) - 65;
    else if (/^\d{1,2}$/.test(tok)) at = Number(tok) - 1;
    else at = options.findIndex((o) => o.text.toLowerCase() === tok.toLowerCase());
    if (at < 0 || at >= options.length) skip(`The answer "${tok}" is not one of its choices.`);
    out.push(at);
  }
  return out;
}

function finish(d: Draft): GiftQuestion {
  const notes: string[] = [];
  const base = { line: d.line, title: d.title, generalFeedback: d.feedback, notes };
  if (!d.prompt) skip('It has no question text.');
  const typeKey = d.type.trim().toLowerCase().replace(/\s+/g, ' ');
  let kind: GiftKind | 'multiple' | null = null;
  if (typeKey) {
    kind = TYPE_WORDS[typeKey] ?? null;
    if (!kind) skip(`The type "${d.type.trim()}" is not one it knows. Use Multiple choice, Multiple answer, True/False, Fill in the blank or Matching.`);
  }
  const opts = d.options.filter((o) => o.text);
  const pairy = opts.length >= 2 && opts.every((o) => PAIR.test(o.text));
  if (!kind) {
    if (!opts.length && TF.test(d.answer.trim())) kind = 'truefalse';
    else if (opts.length === 2 && opts.every((o) => TF.test(o.text)) && new Set(opts.map((o) => o.text.toLowerCase().charAt(0))).size === 2) kind = 'truefalse';
    else if (pairy) kind = 'matching';
    else if (!opts.length && d.answer.trim()) kind = 'blank';
    else kind = 'single';
  }

  if (kind === 'truefalse') {
    let truth: boolean | null = null;
    if (TF.test(d.answer.trim())) truth = isTrue(d.answer);
    else {
      const marked = opts.filter((o) => o.correct && TF.test(o.text));
      if (marked.length === 1) truth = isTrue(marked[0].text);
    }
    if (truth === null) return skip('It is true/false but does not say which. Put True or False in the Answer.');
    return { ...base, kind: 'truefalse', prompt: d.prompt, options: [{ text: 'True', correct: truth }, { text: 'False', correct: !truth }], answers: [], pairs: [] };
  }

  if (kind === 'blank') {
    const fromOpts = opts.map((o) => o.text);
    const fromAnswer = d.answer.split(/\s*[|;]\s*/).map((a) => a.trim()).filter(Boolean);
    const answers = [...new Set([...fromOpts, ...fromAnswer])];
    if (!answers.length) skip('It is fill in the blank but has no accepted answer. Put the answer (or answers, split with |) in the Answer.');
    return { ...base, kind: 'blank', prompt: d.prompt, options: [], answers, pairs: [] };
  }

  if (kind === 'matching') {
    let pairs = opts.map((o) => {
      const [term, ...rest] = o.text.split(PAIR);
      return { term: term.trim(), match: rest.join(' ').trim() };
    });
    if (pairs.some((p) => !p.term || !p.match)) skip('A matching line is missing one side. Write each as term = match.');
    if (pairs.length < 2) skip('Matching needs at least two pairs, written as term = match.');
    if (pairs.length > MAX_PAIRS) {
      notes.push(`Only the first ${MAX_PAIRS} pairs were kept (a matching question has room for ${MAX_PAIRS}).`);
      pairs = pairs.slice(0, MAX_PAIRS);
    }
    return { ...base, kind: 'matching', prompt: d.prompt, options: [], answers: [], pairs };
  }

  //Multiple choice, one or several right
  if (opts.length < 2) skip('A multiple choice question needs at least two choices.');
  if (opts.length > MAX_OPTIONS) skip(`It has more than ${MAX_OPTIONS} choices, which is the most a question can hold.`);
  let right = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  if (d.answer.trim()) right = namedOptions(d.answer, opts);
  if (!right.length) skip('No choice is marked as right. Put a * after it, or give the letter in the Answer.');
  let chosen: GiftKind = right.length > 1 ? 'multiple' : kind === 'multiple' ? 'multiple' : 'single';
  if (kind === 'single' && right.length > 1) notes.push('Several choices were marked right, so it was made a Multiple answer question.');
  if (chosen === 'multiple' && right.length === 1 && kind !== 'multiple') chosen = 'single';
  return { ...base, kind: chosen, prompt: d.prompt, options: opts.map((o, i) => ({ text: o.text, correct: right.includes(i) })), answers: [], pairs: [] };
}

function run(drafts: Draft[]): GiftParse {
  const out: GiftParse = { questions: [], skipped: [], notes: [] };
  for (const d of drafts) {
    try {
      out.questions.push(finish(d));
    } catch (e) {
      if (!(e instanceof Skip)) throw e;
      const skipped: GiftSkip = { line: d.line, title: d.title, excerpt: excerptOf(d.prompt || d.options.map((o) => o.text).join(' ') || '(empty)'), reason: e.message };
      out.skipped.push(skipped);
    }
  }
  return out;
}

//---------------------------------------------------------------------------------------------------------------------
//Layout 1: lines. One question per block, blocks split by a blank line. First line the question, then a choice per line.

const META = /^\s*(type|title|feedback|explanation|answers?|correct|key)\s*[:：]\s*(.*)$/i;
const QPREFIX = /^\s*(?:(?:question|q)\s*\d*\s*[:.)]\s*|\d{1,3}\s*[.)]\s+)/i;

function blockDraft(lines: { text: string; no: number }[]): Draft | null {
  const d: Draft = { line: lines[0].no, title: '', type: '', prompt: '', options: [], answer: '', feedback: '' };
  for (const { text } of lines) {
    const meta = META.exec(text);
    if (meta) {
      const key = meta[1].toLowerCase();
      const v = meta[2].trim();
      if (key === 'type') d.type = v;
      else if (key === 'title') d.title = v;
      else if (key === 'feedback' || key === 'explanation') d.feedback = v;
      else d.answer = d.answer ? `${d.answer}, ${v}` : v;
      continue;
    }
    if (!d.prompt) {
      d.prompt = text.replace(QPREFIX, '').trim();
      continue;
    }
    d.options.push(mark(text, true));
  }
  return d.prompt || d.options.length ? d : null;
}

function fromLines(src: string): GiftParse {
  const blocks: { text: string; no: number }[][] = [];
  let cur: { text: string; no: number }[] = [];
  src.split('\n').forEach((raw, i) => {
    const text = raw.replace(/\s+$/, '');
    if (!text.trim()) {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push({ text: text.trim(), no: i + 1 });
  });
  if (cur.length) blocks.push(cur);
  return run(blocks.map(blockDraft).filter((d): d is Draft => !!d));
}

//---------------------------------------------------------------------------------------------------------------------
//Layout 2: rows. A header row naming the columns (Type, Question, Option 1..., Correct, Feedback), then a question per row.
//Pasted from a spreadsheet or a Word table it is tab separated; a saved .csv has commas (or semicolons).

/** Split CSV text into rows of cells: quotes hold commas and line breaks, a doubled quote is one. */
export function csvRows(src: string, delim = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = src.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && !cell.length) quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type Col = 'type' | 'question' | 'option' | 'correct' | 'feedback' | 'title';
const HEADER: [RegExp, Col][] = [
  [/^(type|kind|question type)$/, 'type'],
  [/^(question|prompt|question text|text|stem)$/, 'question'],
  [/^(option|choice|alternative|answer option|response)\s*[a-z0-9]*$/, 'option'],
  [/^(correct|correct answers?|answers?|key|right answers?)$/, 'correct'],
  [/^(feedback|explanation|rationale|general feedback)$/, 'feedback'],
  [/^(title|name)$/, 'title'],
];
const colOf = (h: string): Col | null => {
  const k = h.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [re, col] of HEADER) if (re.test(k)) return col;
  return null;
};

/** The columns a row names, if it reads as a header: at least two cells name a column, one of them the question. Other cells are null. */
function headerCols(row: string[]): (Col | null)[] | null {
  const cols = row.map((c) => colOf(c));
  return cols.filter(Boolean).length >= 2 && cols.includes('question') ? cols : null;
}

function fromRows(rows: string[][], firstLine = 1): GiftParse {
  const live = rows.map((cells, i) => ({ cells, no: firstLine + i })).filter((r) => r.cells.some((c) => c.trim()));
  if (!live.length) return { questions: [], skipped: [], notes: [] };
  const head = headerCols(live[0].cells);
  const body = head ? live.slice(1) : live;
  const drafts = body.map(({ cells, no }): Draft => {
    const d: Draft = { line: no, title: '', type: '', prompt: '', options: [], answer: '', feedback: '' };
    cells.forEach((raw, i) => {
      const cell = raw.replace(/\r?\n/g, ' ').trim();
      //With no header: the first cell is the question and the rest are choices
      const col: Col | null = head ? (head[i] ?? null) : i === 0 ? 'question' : 'option';
      if (!cell || !col) return;
      if (col === 'type') d.type = cell;
      else if (col === 'question') d.prompt = cell.replace(QPREFIX, '').trim();
      else if (col === 'correct') d.answer = cell;
      else if (col === 'feedback') d.feedback = cell;
      else if (col === 'title') d.title = cell;
      else d.options.push(mark(cell, false));
    });
    return d;
  });
  return run(drafts);
}

//---------------------------------------------------------------------------------------------------------------------

/**
 * Which layout a pasted text is in: tabs between cells (a header row, or at least three cells a line: a question and two choices,
 * so matching lines split by a tab stay lines), a header row with commas, or lines.
 */
export function pasteLayout(src: string): 'tabs' | 'csv' | 'lines' {
  const lines = src.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return 'lines';
  const tabbed = lines.filter((l) => l.includes('\t'));
  if (tabbed.length >= Math.max(1, lines.length * 0.6) && (headerCols(lines[0].split('\t')) || tabbed.every((l) => l.split('\t').filter((c) => c.trim()).length >= 3))) return 'tabs';
  for (const d of [',', ';']) {
    const first = csvRows(lines[0], d)[0] ?? [];
    if (first.length >= 3 && headerCols(first)) return 'csv';
  }
  return 'lines';
}

/**
 * Read questions from pasted text in whichever layout it is in.
 * Anything that is not a question comes back in `skipped` with the reason; nothing throws.
 */
export function parsePastedQuestions(text: string): GiftParse {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const layout = pasteLayout(src);
  if (layout === 'tabs') return fromRows(src.split('\n').map((l) => l.split('\t').map((c) => c.replace(/^"(.*)"$/s, '$1'))));
  if (layout === 'csv') {
    const first = src.split('\n').find((l) => l.trim()) ?? '';
    return fromRows(csvRows(src, csvRows(first, ',')[0]?.length >= 3 && headerCols(csvRows(first, ',')[0]) ? ',' : ';'));
  }
  return fromLines(src);
}
