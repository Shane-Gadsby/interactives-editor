/**
 * Rename a variable and everything that names it.
 *
 * Things that hold a variable by id (graph node choices, blends, captions, the public interface list) need nothing. Everything
 * that names it in text does: bindings, converters, repeaters, `{templates}`, formulas, joystick and graph expressions, instance
 * inputs, scripts and code snippets. Expressions are rewritten by token: a name after a dot (`item.score`) or inside a string
 * stays. Scripts are the guesswork part (a local variable can share the name), so the plan lists their matching lines and the
 * rename only touches them when asked.
 *
 * The places walked here are the by-name ones `analyzeUsage` reads (lib/dependencies.ts). The tests rename a project that uses
 * a variable in every one of them and check the usage report finds the same number of places under the new name, with nothing
 * missing, so the two can't drift apart quietly.
 */
import { CATALOG_BY_KIND, isContainer, type Project, type SceneNode, type Variable } from 'interactives-player';

export const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const esc = (s: string) => s.replace(/[$]/g, '\\$');

/** Split text into string literals and the code between them, so a rename can leave the strings alone (or look only at them). */
function pieces(src: string, quotes: string): { text: string; quoted: boolean }[] {
  const out: { text: string; quoted: boolean }[] = [];
  let i = 0;
  let start = 0;
  while (i < src.length) {
    const c = src[i];
    if (quotes.includes(c)) {
      if (i > start) out.push({ text: src.slice(start, i), quoted: false });
      let j = i + 1;
      while (j < src.length && src[j] !== c && !(c !== '`' && src[j] === '\n')) j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, src.length);
      out.push({ text: src.slice(i, j), quoted: true });
      i = start = j;
    } else i++;
  }
  if (start < src.length) out.push({ text: src.slice(start), quoted: false });
  return out;
}

/** An expression with `from` renamed: whole names only, not after a dot, not inside a string. */
export function renameInExpr(src: string, from: string, to: string): string {
  if (!src || !src.includes(from)) return src;
  const re = new RegExp(`(?<![\\w$.])${esc(from)}(?![\\w$])`, 'g');
  return pieces(src, `"'\``)
    .map((p) => (p.quoted ? p.text : p.text.replace(re, to)))
    .join('');
}

/** A `{slot}` template with `from` renamed inside its slots (`{{` and `}}` are literal braces, left alone). */
export function renameInTemplate(text: string, from: string, to: string): string {
  if (!text || !text.includes('{') || !text.includes(from)) return text;
  return text.replace(/\{\{|\}\}|\{([^{}]+)\}/g, (m, e: string | undefined) => (e ? `{${renameInExpr(e, from, to)}}` : m));
}

/** Script or code snippet: the bare name, `vars.name`, and a string that is exactly the name (`ix.get('name')`). */
export function renameInCode(code: string, from: string, to: string): string {
  if (!code || !code.includes(from)) return code;
  return pieces(code, `"'\``)
    .map((p) => {
      if (!p.quoted) return renameCodeText(p.text, from, to);
      const q = p.text[0];
      return p.text === `${q}${from}${q}` ? `${q}${to}${q}` : p.text;
    })
    .join('');
}

function renameCodeText(text: string, from: string, to: string): string {
  //A name after a dot is some other object's property, except vars.name, which is the variable
  const re = new RegExp(`((?<![\\w$.])vars\\s*\\.\\s*)?(\\.\\s*)?(?<![\\w$])${esc(from)}(?![\\w$])`, 'g');
  return text.replace(re, (m, viaVars: string | undefined, dot: string | undefined) => (viaVars ? `${viaVars}${to}` : dot ? m : to));
}

/** The lines of some code that a rename would change, for the dialog. */
export function changedLines(code: string, from: string, to: string): string[] {
  const after = renameInCode(code, from, to).split('\n');
  return code.split('\n').filter((l, i) => l !== after[i]).map((l) => l.trim());
}

/** Every place a variable is named in text, as a function that rewrites it. Scripts and code snippets are `code`. */
export function eachText(p: Project, visit: (kind: 'expr' | 'template' | 'code', get: () => string, set: (s: string) => void, where: string) => void): void {
  const field = <T extends object>(o: T, k: keyof T, kind: 'expr' | 'template' | 'code', where: string) => {
    const v = o[k];
    if (typeof v === 'string' && v) visit(kind, () => o[k] as unknown as string, (s) => ((o as Record<string, unknown>)[k as string] = s), where);
  };
  for (const v of p.variables) field(v, 'formula', 'expr', `Variable ${v.name}`);
  for (const s of p.scripts) field(s, 'code', 'code', `Script ${s.name}`);
  for (const ab of p.artboards) {
    const walk = (list: SceneNode[]) => {
      for (const n of list) {
        const where = `${n.name} on ${ab.name}`;
        const any = n as unknown as Record<string, unknown>;
        if (n.type === 'draw') field(n, 'code', 'code', where);
        if (n.type === 'chart') {
          field(n, 'data', 'expr', where);
          field(n, 'prefix', 'template', where);
          field(n, 'suffix', 'template', where);
        }
        if (n.type === 'connector') {
          for (const e of [n.from, n.to]) if (e && typeof e.layer === 'object' && e.layer) field(e.layer, 'index', 'expr', where);
          field(n, 'label', 'template', where);
        }
        if (n.type === 'progress') field(n, 'valueText', 'template', where);
        if (n.bindings) for (const k of Object.keys(n.bindings)) field(n.bindings, k, 'expr', where);
        if (n.converters) for (const list of Object.values(n.converters)) for (const c of list ?? []) if (c.type === 'expr') field(c, 'expr', 'expr', where);
        if (isContainer(n) && n.repeat) field(n.repeat, 'items', 'expr', where);
        if (n.type === 'text' || n.type === 'link') field(n, 'text', 'template', where);
        if (n.type === 'text') for (const r of n.runs ?? []) {
          field(r, 'text', 'template', where);
          if (r.link) field(r.link, 'url', 'template', where);
        }
        if (n.type === 'button') field(n, 'label', 'template', where);
        if (n.type === 'link') field(n, 'href', 'template', where);
        if (any.link && typeof any.link === 'object') field(any.link as { url?: string }, 'url', 'template', where);
        if (isContainer(n)) walk(n.children);
      }
    };
    walk(ab.children);
    for (const j of ab.joysticks ?? []) {
      field(j, 'x', 'expr', `Joystick ${j.name || ''} on ${ab.name}`);
      field(j, 'y', 'expr', `Joystick ${j.name || ''} on ${ab.name}`);
    }
    for (const ln of ab.logic.nodes) {
      const def = CATALOG_BY_KIND[ln.kind];
      for (const prm of def?.params ?? []) {
        if (prm.type === 'expr') field(ln.params, prm.key, 'expr', `${def!.label} on ${ab.name}`);
        if (ln.kind === 'action.code' && prm.key === 'code') field(ln.params, prm.key, 'code', `Code snippet on ${ab.name}`);
      }
    }
  }
}

/** Instance inputs are keyed by the variable's name. */
function eachInstanceInputs(p: Project, visit: (inputs: Record<string, unknown>) => void): void {
  const walk = (list: SceneNode[]) => {
    for (const n of list) {
      if (n.type === 'instance' && n.inputs) visit(n.inputs as Record<string, unknown>);
      if (isContainer(n)) walk(n.children);
    }
  };
  for (const ab of p.artboards) walk(ab.children);
}

/**
 * Rename it in a project draft (inside store.update). `scripts: false` leaves scripts and code snippets as they are. A variable
 * with saved values keeps its old name in `formerNames`, so learners' saved values still come back.
 */
export function renameVariable(d: Project, id: string, to: string, opts: { scripts?: boolean } = {}): number {
  const v = d.variables.find((x: Variable) => x.id === id);
  if (!v || v.name === to) return 0;
  const from = v.name;
  let changed = 0;
  eachText(d, (kind, get, set) => {
    if (kind === 'code' && opts.scripts === false) return;
    const was = get();
    const now = kind === 'expr' ? renameInExpr(was, from, to) : kind === 'template' ? renameInTemplate(was, from, to) : renameInCode(was, from, to);
    if (now !== was) {
      set(now);
      changed++;
    }
  });
  eachInstanceInputs(d, (inputs) => {
    if (Object.prototype.hasOwnProperty.call(inputs, from) && !Object.prototype.hasOwnProperty.call(inputs, to)) {
      inputs[to] = inputs[from];
      delete inputs[from];
      changed++;
    }
  });
  if (v.persist || v.userData) v.formerNames = [from, ...(v.formerNames ?? []).filter((n) => n !== from && n !== to)].slice(0, 5);
  else if (v.formerNames) v.formerNames = v.formerNames.filter((n) => n !== to);
  if (v.formerNames && !v.formerNames.length) delete v.formerNames;
  v.name = to;
  return changed;
}
