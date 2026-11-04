import { nodeRuns, runsInRange, safeHref, type NodeLink, type RunStyle, type TextNode, type TextRun } from 'interactives-player';
import { effective, toggleRunStyle, type ToggleKind } from './rich-text';

/**
 * The logic behind the floating toolbar over text being edited: what the selection currently looks like
 * (state), what a button or shortcut changes (patch) and which characters it changes (range). All pure,
 * so the component is only buttons. Storage stays as runs; every patch goes to `styleTextRange`.
 */

export type TextAction = 'bold' | 'italic' | 'underline' | 'strike' | 'link' | 'clear';
/** A toggle's state for the selection: all of it, none of it, or some of it. */
export type Tri = 'on' | 'off' | 'mixed';

export interface TextSel {
  start: number;
  end: number;
}

export interface ToolbarState {
  /** The characters a button would change; null when nothing is selected and the caret is not in a word. */
  range: TextSel | null;
  /** Nothing is selected: the range is the word under the caret. */
  caret: boolean;
  bold: Tri;
  italic: Tri;
  underline: Tri;
  strike: Tri;
  color: string | 'mixed';
  fontSize: number | 'mixed';
  fontFamily: string | 'mixed';
  /** The link on all of the range, null for none, 'mixed' when only some has one (or they differ). */
  link: NodeLink | null | 'mixed';
  /** Some of the range has styling of its own that Clear formatting would remove. */
  styled: boolean;
}

const isSpace = (c: string) => /\s/.test(c);

/** The word around a caret (a run of non-space characters, touching the caret on either side). */
export function wordAt(text: string, at: number): TextSel | null {
  let a = Math.max(0, Math.min(at, text.length));
  let b = a;
  while (a > 0 && !isSpace(text[a - 1])) a--;
  while (b < text.length && !isSpace(text[b])) b++;
  return a === b ? null : { start: a, end: b };
}

const sameLink = (x?: NodeLink | null, y?: NodeLink | null) => (x?.url ?? '') === (y?.url ?? '') && (x ? x.target : '') === (y ? y.target : '');

/** The whole stretch of one link around a caret: neighbouring runs with the same address and target. */
export function linkRangeAt(runs: readonly TextRun[], at: number): TextSel | null {
  let pos = 0;
  let hit = -1;
  const starts: number[] = [];
  runs.forEach((r, i) => {
    starts.push(pos);
    const end = pos + r.text.length;
    if (r.link?.url) {
      // inside a link, or on its edge (the one before wins, the way typing there would extend it)
      if (at > pos && at < end) hit = i;
      else if (at === end && hit < 0) hit = i;
      else if (at === pos && hit < 0 && !runs[i - 1]?.link?.url) hit = i;
    }
    pos = end;
  });
  if (hit < 0) return null;
  const link = runs[hit].link!;
  let a = hit;
  let b = hit;
  while (a > 0 && sameLink(runs[a - 1].link, link)) a--;
  while (b < runs.length - 1 && sameLink(runs[b + 1].link, link)) b++;
  return { start: starts[a], end: starts[b] + runs[b].text.length };
}

/**
 * Which characters a toolbar command applies to. A selection is itself. With only a caret the command
 * works on the word it is in (the link, for the link command, when it is inside one); a caret in no word
 * has nothing to style.
 */
export function targetRange(node: TextNode, sel: TextSel | null, action?: TextAction): TextSel | null {
  if (!sel) return null;
  const start = Math.min(sel.start, sel.end);
  const end = Math.max(sel.start, sel.end);
  if (start !== end) return { start, end };
  if (action === 'link') {
    const l = linkRangeAt(nodeRuns(node), start);
    if (l) return l;
  }
  return wordAt(node.text, start);
}

const tri = (runs: readonly TextRun[], f: (r: TextRun) => boolean): Tri => {
  const on = runs.filter(f).length;
  return on === 0 ? 'off' : on === runs.length ? 'on' : 'mixed';
};
const shared = <T>(runs: readonly TextRun[], f: (r: TextRun) => T): T | 'mixed' => {
  const first = f(runs[0]);
  return runs.every((r) => f(r) === first) ? first : 'mixed';
};

/** What the toolbar shows for a selection in a text layer (or the caret's word). */
export function toolbarState(node: TextNode, sel: TextSel | null): ToolbarState {
  const range = targetRange(node, sel);
  const probe = range ?? (sel ? { start: sel.start, end: sel.end } : { start: 0, end: 0 });
  const all = nodeRuns(node);
  // runsInRange reads the run a caret sits in, so a caret outside any word still shows its surroundings
  const covered = all.length ? runsInRange(all, probe.start, probe.end) : [];
  const runs = covered.length ? covered : [{ text: '' } as TextRun];
  const base = node;
  return {
    range,
    caret: !!sel && sel.start === sel.end,
    bold: tri(runs, (r) => effective(r, 'bold', base)),
    italic: tri(runs, (r) => effective(r, 'italic', base)),
    underline: tri(runs, (r) => effective(r, 'underline', base)),
    strike: tri(runs, (r) => effective(r, 'strike', base)),
    color: shared(runs, (r) => r.color ?? node.color),
    fontSize: shared(runs, (r) => r.fontSize ?? node.fontSize),
    fontFamily: shared(runs, (r) => r.fontFamily ?? node.fontFamily),
    link: (() => {
      const first = runs[0].link?.url ? runs[0].link : null;
      return runs.every((r) => sameLink(r.link?.url ? r.link : null, first)) ? first : 'mixed';
    })(),
    styled: runs.some((r) => Object.keys(r).some((k) => k !== 'text' && r[k as keyof TextRun] !== undefined && r[k as keyof TextRun] !== null)),
  };
}

const CLEAR: Partial<RunStyle> = { fontFamily: undefined, fontSize: undefined, fontWeight: undefined, italic: undefined, color: undefined, underline: undefined, strike: undefined, letterSpacing: undefined, link: undefined };

/** The run style patch that turns a button or shortcut into a change for a range. 'link' is set with `linkPatch`. */
export function actionPatch(node: TextNode, range: TextSel, action: Exclude<TextAction, 'link'>): Partial<RunStyle> {
  if (action === 'clear') return { ...CLEAR };
  return toggleRunStyle(nodeRuns(node), range.start, range.end, action as ToggleKind, node);
}

/** A link from what was typed: web addresses, mailto: and tel:, or a relative one; a bare domain gets https://. */
export function linkPatch(raw: string, newTab: boolean): { patch: Partial<RunStyle> } | { error: string } {
  let url = raw.trim();
  if (!url) return { error: 'Type an address' };
  // "example.com/page" is a web address, not a relative path
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[/#?.]/.test(url) && /^[^\s/]+\.[a-z]{2,}(?::\d+)?([/?#].*)?$/i.test(url)) url = `https://${url}`;
  if (!safeHref(url)) return { error: 'That address is not allowed in a link (use http, https, mailto or tel)' };
  return { patch: { link: { url, target: newTab ? '_blank' : '_self' } } };
}

export const unlinkPatch = (): Partial<RunStyle> => ({ link: null });

/** Ctrl/Cmd+B, I, U, K, Shift+X (strikethrough) and Ctrl/Cmd+\ (clear formatting). */
export function shortcutAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): TextAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (e.shiftKey) return k === 'x' ? 'strike' : null;
  switch (k) {
    case 'b':
      return 'bold';
    case 'i':
      return 'italic';
    case 'u':
      return 'underline';
    case 'k':
      return 'link';
    case '\\':
      return 'clear';
    default:
      return null;
  }
}
