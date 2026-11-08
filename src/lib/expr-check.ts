import { FUNCTION_HINTS, PLAYER_SCOPE_HINTS, SAFE_GLOBAL_NAMES, checkExpression, evaluate, exprNames, hasTemplate, template } from 'interactives-player';
import { editDistance, typoBudget } from '../help/search';
import { preview } from './suggest';

/**
 * What a formula field says under itself while somebody types: what it works out to right now, or what is wrong in plain words
 * (with a one-click fix when the cure is a name that is nearly right). Pure: the field gives it the text and what is in scope.
 */

export interface CheckEnv {
  variables: { name: string }[];
  dataNames: string[];
  /** Names this field sees besides the project's (event, value, item, index, self...). */
  locals: string[];
  /** Their values when known; a local without one makes the answer depend on what happens when it runs. */
  localValues?: Record<string, unknown>;
  /** What the canvas preview has in scope, by name. A function because building it works out every formula. */
  scope: () => Record<string, unknown>;
}

export type FormulaStatus =
  | { kind: 'empty' }
  | { kind: 'ok'; text: string }
  | { kind: 'error'; message: string; fix?: { label: string; text: string } };

/** Things that give another answer every time they run: showing them once and calling that "the value" would mislead. */
const VOLATILE = /\bMath\s*\.\s*random\b|\brandInt\b|\bDate\s*\.\s*now\b|\bnew\s+Date\b|\bshuffle\s*\(\s*[^,()]*\)/;

export const isVolatile = (src: string): boolean => VOLATILE.test(src);

/** What the parser said, in words a course designer would use. `raw` is the parser's message with its "(at 12)" removed. */
export function plainParseError(raw: string): string {
  let m: RegExpExecArray | null;
  if (/^Unterminated string/.test(raw)) return 'A quote is not closed. Put the same kind of quote at the end of the text.';
  if (/^Unterminated template/.test(raw)) return 'A back-tick ` is not closed. Put another at the end of the text.';
  if (/^Unterminated regular expression/.test(raw)) return 'A / that starts a pattern is not closed.';
  if ((m = /^Expected "([)\]}])"/.exec(raw))) return `A bracket is not closed. Add a ${m[1]} to match the ${m[1] === ')' ? '(' : m[1] === ']' ? '[' : '{'}.`;
  if (/^Unexpected end of expression/.test(raw)) return 'The formula stops too soon: something is missing after the last symbol.';
  if ((m = /^Unexpected "([)\]}])"/.exec(raw))) return `There is a ${m[1]} with no ${m[1] === ')' ? '(' : m[1] === ']' ? '[' : '{'} before it.`;
  if ((m = /^Unexpected "(.*)"/.exec(raw))) return `There is a “${m[1]}” where the formula does not expect one. Check what comes just before it.`;
  if ((m = /^Unexpected character "(.*)"/.exec(raw))) return `The formula has a character it does not understand: “${m[1]}”.`;
  if (/^Unexpected character after number/.test(raw)) return 'A number runs straight into letters. Is a symbol, like + or *, missing between them?';
  if (/^Assignment is not supported/.test(raw)) return 'A formula cannot set a value with a single =. To compare two values write == (is the same as). To change a variable use a Set variable node.';
  if (/^Increment is not supported/.test(raw)) return 'A formula cannot add one with ++. Write score + 1 to work out the next value.';
  if ((m = /^"(.*)" is not supported in expressions/.exec(raw))) return `“${m[1]}” cannot be used in a formula.`;
  if (/^Expression is too long/.test(raw)) return 'This formula is too long. Break it into smaller ones.';
  if (/^Expression is nested too deeply/.test(raw)) return 'The brackets inside brackets go too deep. Simplify the formula.';
  if (/^Expected a property name/.test(raw)) return 'A . needs a name after it, like quiz.score.';
  if (/^Expected a name after new/.test(raw)) return 'The word new needs a name after it.';
  return raw.replace(/\.?$/, '.');
}

/** The parser's own complaint about `src`, without the "Cannot parse expression" wrapper, or null when it parses. */
function parseProblem(src: string): string | null {
  try {
    checkExpression(src);
    return null;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const m = / - (.*?)(?: \(at \d+\))?$/s.exec(msg);
    return m ? m[1] : msg;
  }
}

/** Names bound by arrow functions in the text (`items.filter(i => i.ok)`): the parser counts them as names read, they are not missing. */
function arrowParams(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) for (const p of m[1].split(',')) if (/^\s*[A-Za-z_$][\w$]*\s*$/.test(p)) out.add(p.trim());
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) out.add(m[1]);
  return out;
}

/** Every name a formula can read here, project names first (they are the likelier ones to be meant). */
export function knownNames(env: CheckEnv): string[] {
  const out = new Set<string>();
  for (const v of env.variables) out.add(v.name);
  for (const d of env.dataNames) out.add(d);
  for (const l of env.locals) out.add(l);
  for (const n of Object.keys(PLAYER_SCOPE_HINTS)) out.add(n);
  for (const n of Object.keys(FUNCTION_HINTS)) out.add(n);
  for (const n of SAFE_GLOBAL_NAMES) out.add(n);
  out.add('undefined');
  for (const n of Object.keys(env.scope())) out.add(n);
  return [...out];
}

/** The name nearest to a mistyped one, or null when nothing is close enough to suggest. */
export function didYouMean(typed: string, candidates: string[]): string | null {
  const lower = typed.toLowerCase();
  const same = candidates.find((c) => c.toLowerCase() === lower);
  if (same) return same;
  if (typed.length < 3) return null;
  const budget = typoBudget(typed.length);
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (c.length < 2) continue;
    let d = budget ? editDistance(lower, c.toLowerCase(), budget) : Infinity;
    // what has been typed so far is the start of a longer name
    if (c.length > typed.length && c.toLowerCase().startsWith(lower)) d = Math.min(d, 1);
    if (d <= Math.max(budget, 1) && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** `src` with every use of the name `from` (outside quotes, and not a part after a dot) written as `to`. */
export function replaceName(src: string, from: string, to: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = '';
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(c) && !/[\w$]/.test(src[i - 1] ?? '')) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const afterDot = /\.\s*$/.test(src.slice(0, i)) && !/\.\.\.\s*$/.test(src.slice(0, i));
      out += word === from && !afterDot ? to : word;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** What a value reads as, after "currently". */
export function valueWords(v: unknown): string {
  if (v === undefined || v === null) return 'nothing';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v === '' ? 'empty text' : preview(v);
  const p = preview(v);
  return p || (typeof v === 'function' ? 'a function' : 'a value');
}

/** Check one formula. `empty` for no text; otherwise what it works out to, or what is wrong. */
export function checkFormula(src: string, env: CheckEnv): FormulaStatus {
  const text = src.trim();
  if (!text) return { kind: 'empty' };
  const problem = parseProblem(text);
  // x++ parses as x + (+ nothing), which would read as "stops too soon"
  if (problem && /[\w)\]]\s*(?:\+\+|--)\s*$/.test(text)) return { kind: 'error', message: plainParseError('Increment is not supported in expressions') };
  if (problem) return { kind: 'error', message: plainParseError(problem) };

  const bound = arrowParams(text);
  const all = knownNames(env);
  const known = new Set(all);
  for (const name of exprNames(text)) {
    if (known.has(name) || bound.has(name)) continue;
    const guess = didYouMean(name, all);
    if (guess) return { kind: 'error', message: `There is no value called ${name}. Did you mean ${guess}?`, fix: { label: `Use ${guess}`, text: replaceName(text, name, guess) } };
    return { kind: 'error', message: `There is no value called ${name}. Check the spelling, or add a variable with that name.` };
  }

  if (isVolatile(text)) return { kind: 'ok', text: 'changes each time it runs' };
  const names = exprNames(text);
  if (names.some((n) => env.locals.includes(n) && !(env.localValues && n in env.localValues))) return { kind: 'ok', text: 'depends on what happens when it runs' };
  try {
    const v = evaluate(text, { vars: env.scope(), extra: env.localValues });
    return { kind: 'ok', text: `currently ${valueWords(v)}` };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).replace(/^Cannot parse expression:.* - /, '');
    return { kind: 'error', message: `This cannot be worked out with the current values: ${msg.replace(/\.$/, '')}.` };
  }
}

/** Check the `{...}` slots of a text layer's words: the first one that is wrong, or the text as it reads now. */
export function checkTemplate(text: string, env: CheckEnv): FormulaStatus {
  const bare = text.replace(/\{\{|\}\}/g, '  ');
  if (!text.trim() || !hasTemplate(bare)) return { kind: 'empty' };
  for (const m of bare.matchAll(/\{([^{}]+)\}/g)) {
    const r = checkFormula(m[1], env);
    if (r.kind === 'error') {
      const message = `In {${m[1].trim()}}: ${r.message}`;
      return r.fix ? { kind: 'error', message, fix: { label: r.fix.label, text: text.replace(m[0], `{${r.fix.text}}`) } } : { kind: 'error', message };
    }
  }
  if (isVolatile(text)) return { kind: 'ok', text: 'changes each time it runs' };
  if (env.locals.some((n) => new RegExp(`\\b${n}\\b`).test(text) && !(env.localValues && n in env.localValues))) return { kind: 'ok', text: 'depends on what happens when it runs' };
  return { kind: 'ok', text: `reads “${template(text, { vars: env.scope(), extra: env.localValues }).slice(0, 60)}”` };
}
