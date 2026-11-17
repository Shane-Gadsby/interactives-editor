import { createNode, nodeRuns, replaceRunRange, type SceneNode, type TextNode } from 'interactives-player';
import { store } from '../store/store';
import { getArtboard, hitTest, locate } from '../store/doc';
import { applyRuns } from './rich-text';
import { fontStack } from './font-catalog';
import { lookDefaults } from './themes';
import { prefs } from './prefs';

/**
 * Dragging a value onto the page. A variable (Variables tab) or a data field (Data panel) is dragged onto the canvas: dropped on a
 * text layer it is put at the end of that text as `{name}`, dropped anywhere else on a page it becomes a new text layer that shows
 * it. The same `{braces}` Insert value writes, so nothing here is new to the document. The button beside each draggable thing does
 * the same without a mouse: it adds to the selected text layer, or makes a new one on the open page.
 */
export const VALUE_DRAG = 'application/x-interactives-value';

export interface DraggedValue {
  /** The formula that goes between the braces: `quizScore`, `people[0].name`. */
  expr: string;
  /** What to call it where it is shown ("Quiz score"). */
  label: string;
}

//The drag only exposes its type until the drop, so the canvas learns what is being dragged from here
let dragged: DraggedValue | null = null;
export const getDraggedValue = (): DraggedValue | null => dragged;

const usable = (expr: string): boolean => !!expr.trim() && expr.length <= 200 && !/[{}\n\r]/.test(expr);

/** Start a drag from an element's dragstart. */
export function startValueDrag(e: { dataTransfer: DataTransfer }, v: DraggedValue): void {
  if (!usable(v.expr)) return;
  dragged = v;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(VALUE_DRAG, JSON.stringify(v));
  e.dataTransfer.setData('text/plain', `{${v.expr}}`);
}

export const endValueDrag = (): void => void (dragged = null);

/** The value in a drop, if the drop carries one. */
export function readValueDrag(dt: DataTransfer): DraggedValue | null {
  const raw = dt.getData(VALUE_DRAG);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DraggedValue>;
    return typeof v.expr === 'string' && usable(v.expr) ? { expr: v.expr, label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 80) : v.expr } : null;
  } catch {
    return null;
  }
}

/** The text layer under a point of a page (local to the page), if the top thing there is one. */
export function textLayerAt(abId: string, at: { x: number; y: number }): TextNode | null {
  const ab = getArtboard(store().get().project, abId);
  if (!ab) return null;
  const top = hitTest(ab, at.x, at.y).at(-1);
  return top && top.type === 'text' && !top.locked ? top : null;
}

/** `{expr}` at the end of a text, with a space between when the text does not already end in one. */
export function withValue(text: string, expr: string): string {
  return `${text}${text && !/\s$/.test(text) ? ' ' : ''}{${expr}}`;
}

export type Placed = { kind: 'added'; id: string; name: string } | { kind: 'made'; id: string } | null;

/**
 * Put a value on a page. On a text layer it is added to the end of its text (keeping its styling); anywhere else a new text layer
 * showing it is made where it was dropped. One undo step. `extra` is the look a new text layer gets (the person's default font and
 * theme). Answers what happened, or null when the page can't take it.
 */
export function placeValue(abId: string, at: { x: number; y: number }, v: DraggedValue, extra: Partial<TextNode> = newTextLook()): Placed {
  const s = store();
  const ab = getArtboard(s.get().project, abId);
  if (!ab) return null;
  if (ab.library) {
    s.toast('This page belongs to a library, so it can’t be changed here.', 'error');
    return null;
  }
  const target = textLayerAt(abId, at);
  if (target) {
    s.set({ activeArtboardId: abId });
    s.select([target.id], { artboardId: abId });
    return addToText(abId, target, v);
  }
  const mark = s.historyMark();
  const node = createNode('text', { name: v.label, x: Math.round(at.x), y: Math.round(at.y), text: `{${v.expr}}`, autoSize: 'width', ...extra } as Partial<SceneNode>);
  s.set({ activeArtboardId: abId });
  s.addNodes([node], { artboardId: abId });
  s.toastUndo(`Made a text that shows ${v.label}.`, mark);
  return { kind: 'made', id: node.id };
}

/** The button route: add to the selected text layer, or make a new one near the top left of the open page. */
export function placeValueHere(v: DraggedValue, extra: Partial<TextNode> = newTextLook()): Placed {
  const st = store().get();
  const ab = getArtboard(st.project, st.activeArtboardId);
  if (!ab) {
    store().toast('Open a page first.', 'error');
    return null;
  }
  const one = st.selection.length === 1 ? locate(ab, st.selection[0])?.node : null;
  if (one && one.type === 'text' && !one.locked) return addToText(ab.id, one, v);
  return placeValue(ab.id, { x: 40, y: 40 + (ab.children.length % 8) * 36 }, v, extra);
}

function addToText(abId: string, target: TextNode, v: DraggedValue): Placed {
  const s = store();
  const mark = s.historyMark();
  s.update((d) => {
    const dab = getArtboard(d, abId);
    const n = dab && locate(dab, target.id)?.node;
    if (!n || n.type !== 'text') return;
    const end = n.text.length;
    applyRuns(n, replaceRunRange(nodeRuns(n), end, end, withValue(n.text, v.expr).slice(end)));
  });
  s.toastUndo(`Added ${v.label} to “${target.name}”.`, mark);
  return { kind: 'added', id: target.id, name: target.name };
}

/** The look a new text layer gets: the person's default font and the project's theme, the same as one drawn with the Text tool. */
export function newTextLook(): Partial<TextNode> {
  const f = prefs().defaultFont.trim();
  return { ...(f ? { fontFamily: fontStack(f) } : {}), ...lookDefaults(store().get().project, 'text') } as Partial<TextNode>;
}
