/**
 * The link values a project reads (`link.program` in a formula, `ix.link.program` in a script), so Preview and Share can offer a
 * field for each without the author listing them first. The names it reads, the sample values in Data > context and the choices
 * listed there all count, in that order of first appearance: samples and choices first, as the author set them up.
 */
import { linkNameOk, type Project } from 'interactives-player';
import { eachText } from './rename-variable';

// `link.program`, `link?.program`, `link['program']`, not `item.link.x`; in scripts `ix.link.program` too. No spaces around the
// dot, so prose that ends a sentence on "link." doesn't count
const NAME_AT = String.raw`(?:\??\.([A-Za-z][\w]*)|(?:\?\.)?\[\s*(['"])([^'"]+)\2\s*\])`;
const EXPR = new RegExp(String.raw`(?<![\w$.])link` + NAME_AT, 'g');
const CODE = new RegExp(String.raw`(?:\bix\.|(?<![\w$.]))link` + NAME_AT, 'g');

/**
 * Code with its comments taken out and its quoted strings emptied, except a string straight after `[` (`link['start-year']`).
 * Backtick strings stay, since `${ix.link.program}` inside one is a read.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|(\[\s*)?(['"])(?:\\.|(?!\2)[^\\\n])*\2/g, (m, bracket?: string) => (m.startsWith('/') ? ' ' : bracket ? m : '""'));
}

/** The names read in one piece of text. Templates are read inside their `{slots}` only. */
export function linkNamesIn(kind: 'expr' | 'template' | 'code', text: string): string[] {
  if (!text || !text.includes('link')) return [];
  const parts = kind === 'template' ? [...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]) : [text];
  const out: string[] = [];
  for (const part of parts)
    for (const m of codeOnly(part).matchAll(kind === 'code' ? CODE : EXPR)) {
      const name = m[1] ?? m[3];
      if (name && linkNameOk(name)) out.push(name);
    }
  return out;
}

/** The names of the link values the project's formulas, templates and scripts read. */
export function linkNamesUsed(project: Project): string[] {
  const found = new Set<string>();
  eachText(project, (kind, get) => {
    for (const n of linkNamesIn(kind, get())) found.add(n);
  });
  return [...found];
}

/** Every link value worth a field: the samples, the ones with choices, then the ones read but not set up. */
export function linkNames(project: Project): string[] {
  return [...new Set([...Object.keys(project.sampleLink ?? {}), ...Object.keys(project.linkChoices ?? {}), ...linkNamesUsed(project)])];
}

/** `url` with the values on the end of its query (`?program=GCSC`, or `&program=GCSC` when it has one). Empty values are left off. */
export function withLinkValues(url: string, values: Record<string, string>): string {
  const pairs = Object.entries(values).filter(([k, v]) => v !== '' && linkNameOk(k));
  if (!pairs.length) return url;
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash);
  const tail = hash < 0 ? '' : url.slice(hash);
  const q = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${q}${tail}`;
}
