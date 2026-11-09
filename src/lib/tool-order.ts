import type { KeyboardEvent, PointerEvent as ReactPointer } from 'react';
import type { MenuItem } from '../components/ContextMenu';
import { announce } from './announce';
import { getOrder, mergeOrder, moved, resetToolOrder, setOrder } from './reorder';
import { armReorderDrag } from './reorder-drag';

/**
 * The tool rail in the order a person set: its groups (Shapes, Draw, ...) and the tools inside each group. The Toolbar draws
 * the groups and tools already arranged (lib/reorder.ts `arrange`), each with a `data-reorder-key`, so the order on screen is the
 * order in the page. This file is the moving: dragging a group by its heading or a tool by its button, Alt+arrows on either, and
 * the right-click menu.
 */

const GROUPS = 'groups';

const groupEls = (nav: HTMLElement): HTMLElement[] => [...nav.querySelectorAll<HTMLElement>(':scope > .tool-group[data-reorder-key]')];
const toolEls = (group: HTMLElement): HTMLElement[] => [...group.querySelectorAll<HTMLElement>(':scope > .tool-grid > [data-reorder-key]')];
const keyOf = (el: HTMLElement) => el.dataset.reorderKey!;
const groupLabel = (g: HTMLElement) => g.querySelector('.tool-group-head')?.textContent?.trim() || keyOf(g);
// a tool's title reads "Rectangle (R)" or "Add question: multiple choice, ...", so its name is what comes first
const toolLabel = (t: HTMLElement) => (t.getAttribute('aria-label') || t.title || keyOf(t)).split(/ \(|: /)[0];

/** What a press, key or right-click landed on: a group (by its heading) or one tool inside a group. */
export type ToolTarget = { kind: 'group'; el: HTMLElement } | { kind: 'tool'; el: HTMLElement; group: HTMLElement };

export function toolTarget(t: EventTarget | null): ToolTarget | null {
  const node = t instanceof Element ? t : null;
  const group = node?.closest<HTMLElement>('.tool-group[data-reorder-key]');
  if (!node || !group) return null;
  if (node.closest('.tool-group-head') && !node.closest('.tool-grid')) return { kind: 'group', el: group };
  const tool = node.closest<HTMLElement>('[data-reorder-key]:not(.tool-group)');
  return tool && tool.parentElement?.parentElement === group ? { kind: 'tool', el: tool, group } : null;
}

function save(nav: HTMLElement, tg: ToolTarget, to: number): void {
  if (tg.kind === 'group') {
    const els = groupEls(nav);
    const keys = els.map(keyOf);
    const next = moved(keys, els.indexOf(tg.el), to);
    setOrder('toolOrder', GROUPS, mergeOrder(getOrder('toolOrder', GROUPS), next));
    announce(`${groupLabel(tg.el)} group moved to position ${to + 1} of ${keys.length}`);
  } else {
    const els = toolEls(tg.group);
    const keys = els.map(keyOf);
    const id = keyOf(tg.group);
    setOrder('toolOrder', id, mergeOrder(getOrder('toolOrder', id), moved(keys, els.indexOf(tg.el), to)));
    announce(`${toolLabel(tg.el)} moved to position ${to + 1} of ${keys.length} in ${groupLabel(tg.group)}`);
  }
}

/** The element is replaced in a different place in the page, which drops its focus: put it back once the rail has drawn. */
function refocus(nav: HTMLElement, tg: ToolTarget): void {
  const sel = tg.kind === 'group' ? `.tool-group[data-reorder-key="${keyOf(tg.el)}"] > .tool-group-head` : `.tool-group[data-reorder-key="${keyOf(tg.group)}"] [data-reorder-key="${keyOf(tg.el)}"]`;
  requestAnimationFrame(() => nav.querySelector<HTMLElement>(sel)?.focus());
}

/** Move by one place. Returns false at the end of the list. */
export function moveTool(nav: HTMLElement, tg: ToolTarget, by: number): boolean {
  const els = tg.kind === 'group' ? groupEls(nav) : toolEls(tg.group);
  const from = els.indexOf(tg.el);
  const to = from + by;
  const name = tg.kind === 'group' ? `${groupLabel(tg.el)} group` : toolLabel(tg.el);
  if (from < 0 || to < 0 || to >= els.length) {
    announce(`${name} is already ${by < 0 ? 'first' : 'last'}`);
    return false;
  }
  save(nav, tg, to);
  refocus(nav, tg);
  return true;
}

/** Alt+arrows on a group's heading or a tool: up and left go earlier, down and right go later. */
export function toolKeyMove(e: KeyboardEvent, nav: HTMLElement | null): void {
  if (!nav || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const by = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
  const tg = by ? toolTarget(e.target) : null;
  if (!tg) return;
  e.preventDefault();
  e.stopPropagation();
  moveTool(nav, tg, by);
}

/** A press on a group's heading or a tool: if it becomes a drag, the group or tool lands in its new place. */
export function toolDragStart(e: ReactPointer, nav: HTMLElement | null, horizontal: boolean): void {
  const tg = nav ? toolTarget(e.target) : null;
  if (!nav || !tg) return;
  const list = () => (tg.kind === 'group' ? groupEls(nav) : toolEls(tg.group));
  if (list().length < 2) return;
  armReorderDrag({
    event: e,
    el: tg.el,
    label: tg.kind === 'group' ? groupLabel(tg.el) : toolLabel(tg.el),
    items: list,
    layout: tg.kind === 'tool' ? 'grid' : horizontal ? 'row' : 'column',
    onMove: (to) => save(nav, tg, to),
  });
}

/** The move items for the rail's right-click menu, for whatever was right-clicked (a group heading or a tool), then the reset. */
export function toolOrderMenu(nav: HTMLElement | null, target: EventTarget | null, horizontal: boolean): MenuItem[] {
  const tg = nav ? toolTarget(target) : null;
  const items: MenuItem[] = [];
  if (nav && tg) {
    const els = tg.kind === 'group' ? groupEls(nav) : toolEls(tg.group);
    const at = els.indexOf(tg.el);
    const what = tg.kind === 'group' ? `the ${groupLabel(tg.el)} group` : `${toolLabel(tg.el)}`;
    const [back, forward] = horizontal || tg.kind === 'tool' ? ['earlier', 'later'] : ['up', 'down'];
    items.push(
      { label: `Move ${what} ${back}`, hint: 'Alt+arrow', disabled: at <= 0, onClick: () => void moveTool(nav, tg, -1) },
      { label: `Move ${what} ${forward}`, hint: 'Alt+arrow', disabled: at < 0 || at >= els.length - 1, onClick: () => void moveTool(nav, tg, 1) },
    );
  }
  items.push({ label: 'Reset tool order', title: 'Put the tool groups, and the tools in them, back where the editor puts them', onClick: resetToolOrder });
  return items;
}

export { GROUPS as TOOL_GROUPS_KEY };
