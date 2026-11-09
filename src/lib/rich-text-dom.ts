import type { TextRun, TextStyle } from 'interactives-player';

/**
 * DOM side of the in-place rich text editor: a contenteditable holding one span per run,
 * read back into runs after each edit. The editor never repaints while you type (that would
 * lose the caret); it repaints only when the document changed some other way (a shortcut,
 * the inspector, undo).
 */

/** Inline CSS for one run, at the canvas zoom. The layer's own style comes from the editor box, so only overrides appear, plus the decoration (resolved per run, because a child can't switch off its parent's). */
export function runEditCss(node: TextStyle, run: TextRun, zoom: number): Record<string, string> {
  const css: Record<string, string> = {};
  if (run.fontFamily) css['font-family'] = run.fontFamily;
  if (run.fontSize) css['font-size'] = `${run.fontSize * zoom}px`;
  if (run.fontWeight) css['font-weight'] = String(run.fontWeight);
  if (run.italic !== undefined) css['font-style'] = run.italic ? 'italic' : 'normal';
  if (run.color) css.color = run.color;
  if (run.letterSpacing !== undefined) css['letter-spacing'] = `${run.letterSpacing * zoom}px`;
  //a link has no look of its own in the player, but the editor has to show where it is
  if (run.link?.url) css['box-shadow'] = 'inset 0 -2px 0 var(--primary-bg, #ffb448), inset 0 -3px 0 var(--focus-edge, #1e1e1e)';
  const underline = run.underline ?? node.textDecoration === 'underline';
  const strike = run.strike ?? node.textDecoration === 'line-through';
  css['text-decoration'] = underline || strike ? [underline ? 'underline' : '', strike ? 'line-through' : ''].filter(Boolean).join(' ') : 'none';
  return css;
}

/** Rebuild the editor's content: one span per run. */
export function paintRuns(el: HTMLElement, runs: readonly TextRun[], node: TextStyle, zoom: number): void {
  el.textContent = '';
  runs.forEach((r, i) => {
    const span = document.createElement('span');
    span.dataset.run = String(i);
    span.textContent = r.text;
    for (const [k, v] of Object.entries(runEditCss(node, r, zoom))) span.style.setProperty(k, v);
    el.appendChild(span);
  });
}

/**
 * Read the editor back into runs. `painted` is what paintRuns last drew: a span keeps the style of the run
 * it was drawn from, text that landed outside any span takes the style of the span before it.
 */
export function readRuns(el: HTMLElement, painted: readonly TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  let style: Omit<TextRun, 'text'> = {};
  const walk = (parent: Node) => {
    parent.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) {
        if (c.textContent) out.push({ ...style, text: c.textContent });
      } else if (c instanceof HTMLElement) {
        if (c.tagName === 'BR') {
          out.push({ ...style, text: '\n' });
          return;
        }
        const run = c.dataset.run === undefined ? undefined : painted[Number(c.dataset.run)];
        if (run) {
          const { text: _text, ...rest } = run;
          void _text;
          style = rest;
        }
        // an element without a run (a wrapper the browser made) keeps the style in force
        walk(c);
      }
    });
  };
  walk(el);
  return out;
}

/** Selection offsets inside the editor, as positions in its text. Null when the selection is elsewhere. */
export function selectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = el.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  return { start, end: start + r.toString().length };
}

/** A range over text offsets inside the editor (without touching the page's selection, so it can't move the focus). */
export function rangeAtOffsets(el: HTMLElement, start: number, end: number): Range {
  const doc = el.ownerDocument;
  const find = (offset: number): { node: Node; offset: number } => {
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = offset;
    let last: Text | null = null;
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      last = t;
      if (left <= t.length) return { node: t, offset: left };
      left -= t.length;
    }
    return last ? { node: last, offset: last.length } : { node: el, offset: 0 };
  };
  const a = find(start);
  const b = find(end);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** Put the selection back at text offsets. In some browsers this also focuses the editor, so only call it when that is wanted. */
export function setSelectionOffsets(el: HTMLElement, start: number, end: number): void {
  const range = rangeAtOffsets(el, start, end);
  const sel = el.ownerDocument.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
