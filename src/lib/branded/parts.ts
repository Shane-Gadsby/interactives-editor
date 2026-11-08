/**
 * Pieces the starters share that are native features of the player now, built the documented way so a starter doesn't each
 * rebuild them out of rectangles and Set variable chains:
 *
 *   progressBar   a Progress bar layer (track, bar, value and max bound, read out to screen readers), not two rects and a width formula
 *   pageNav       Back and Next buttons that follow the project's page order (Go to artboard next/previous) with a "Page 2 of 5"
 *                 counter from `pageNumber`/`pageCount`, not a hard wired neighbour and a typed count
 *   dialogPanel   a frame that is a dialog (focus kept inside, Escape closes, scrim, focus returns), opened by a variable
 *   keyNavList    a repeater whose copies are one tab stop with the arrow keys moving between them
 *   questionExtras  the template's switches for a question's optional buttons (Hint, Try again), and the pill the Hint is
 *   pillButton    a small secondary button (Show transcript, Skip, Hint) that sits to the side of a heading, not in a row of full size ones
 *
 * Colours come from the colourway's tokens like everything in the kit. Each takes the page (or the group) it builds for and
 * adds its layers and wires, and returns what the starter needs to refer to afterwards.
 */
import { createNode, defaultAutoLayout, type AutoLayout, type Artboard, type ButtonNode, type FrameNode, type KeyNav, type LogicNode, type ProgressNode, type SceneNode, type TextNode, type Project, type Variable } from 'interactives-player';
import { addNote, button, contentBox, heading, navBarY, solid, stroke, text, type BrandedCtx } from './kit';
import { addVar, bind, click, goNext, goPrevious, graph, set } from './graph-kit';
import type { KitOptions } from '../question-kit';

export { addNote };

// ------------------------------------------------------------------ auto layout

/**
 * An auto layout frame (a column or a row that places its visible children one after another, so text that wraps or a layer
 * that is hidden moves what follows instead of landing on it). It hugs its height, takes `width` and is transparent unless
 * `box` is given (a card: `{ fill: solid(L.surface), cornerRadius: 16 }`), with `padding` as one number or per side. A child
 * that should share out the free width of a row, or stretch across a column, is `fill(child)`.
 *
 *   stack('Body', box.x, box.y, box.width, { gap: 16, children: [prompt, fill(row), submit] })
 */
export function stack(name: string, x: number, y: number, width: number, opts: { direction?: AutoLayout['direction']; gap?: number; padding?: number | { top: number; right: number; bottom: number; left: number }; align?: AutoLayout['align']; justify?: AutoLayout['justify']; height?: number; box?: Record<string, unknown>; children: SceneNode[]; extra?: Record<string, unknown> }): FrameNode {
  const p = opts.padding ?? 0;
  const layout: AutoLayout = {
    ...defaultAutoLayout(opts.direction ?? 'column'),
    gap: opts.gap ?? 12,
    padding: typeof p === 'number' ? { top: p, right: p, bottom: p, left: p } : p,
    align: opts.align ?? 'stretch',
    ...(opts.justify ? { justify: opts.justify } : {}),
    hugHeight: opts.height === undefined,
  };
  return createNode('frame', { name, x, y, width, height: opts.height ?? 100, fill: null, stroke: null, clip: false, ...(opts.box ?? {}), layout, children: opts.children, ...(opts.extra ?? {}) } as never) as FrameNode;
}

/** Make a child of an auto layout frame take the free room along the frame's direction (the width of a row, the height of a column), shared with its other `fill` siblings. */
export function fill<T extends SceneNode>(n: T, axis: 'width' | 'height' = 'width'): T {
  n.layoutItem = { ...(n.layoutItem ?? {}), [axis]: 'fill' };
  return n;
}

// ------------------------------------------------------------------ progress bar

/**
 * A native Progress bar: the track on the warm grey, the bar in the primary colour. `value` and `max` are expressions (bound, so the
 * bar follows the variables) or plain numbers. `label` is what a screen reader calls it ("Quiz progress"), `valueText` how it reads
 * the number (`Question {step} of {total}`, blank says the percentage). Pass `decorative` for a bar that only repeats something already said.
 *
 *   page.children.push(progressBar(ctx, 'Quiz progress', 48, 100, 400, { value: 'step', max: 5, label: 'Quiz progress', valueText: 'Question {step} of 5' }));
 */
export function progressBar(ctx: BrandedCtx, name: string, x: number, y: number, width: number, opts: { value: string | number; max: string | number; label?: string; valueText?: string; height?: number; decorative?: boolean }): ProgressNode {
  const height = opts.height ?? 10;
  const bindings: Record<string, string> = {};
  if (typeof opts.value === 'string') bindings.value = opts.value;
  if (typeof opts.max === 'string') bindings.max = opts.max;
  return createNode('progress', {
    name,
    x,
    y,
    width,
    height,
    value: typeof opts.value === 'number' ? opts.value : 0,
    max: typeof opts.max === 'number' ? opts.max : 100,
    fill: solid(ctx.L.surfaceMuted),
    barFill: solid(ctx.L.primary),
    cornerRadius: height / 2,
    stroke: null,
    ...(opts.decorative ? { decorative: true, semantics: 'none' } : { semantics: 'progressbar', ariaLabel: opts.label ?? name, ...(opts.valueText ? { valueText: opts.valueText } : {}) }),
    ...(Object.keys(bindings).length ? { bindings } : {}),
  } as Partial<ProgressNode>);
}

// ------------------------------------------------------------------ page navigation

export interface PageNav {
  prev: ButtonNode;
  next: ButtonNode;
  counter: TextNode;
  /** The two click events (Back, Next), for a starter that wants to hang more off them. */
  events: { prev: LogicNode; next: LogicNode };
}

/**
 * Back and Next buttons with a "Page n of N" counter, along the bottom of the content box (or at `y`). Next goes to the next page in
 * the project's order (Go to artboard, Next) and Back to the previous one, so adding, removing or moving a page needs no rewiring.
 * Back is hidden on the first page and Next on the last (`pageNumber`, `pageCount`). Pass `counter: false` for no count, `of` to
 * change the wording (`Question {n} of {total}`: `{n}` and `{total}` are replaced by the two page numbers).
 *
 *   const nav = pageNav(ctx, page);   // layers are on the page, wired, and you can still hang a Set variable off nav.events.next
 */
export function pageNav(ctx: BrandedCtx, page: Artboard, opts: { y?: number; prevLabel?: string; nextLabel?: string; counter?: boolean; of?: string; width?: number } = {}): PageNav {
  const box = contentBox(page);
  const w = opts.width ?? 150;
  const y = opts.y ?? navBarY(page);
  const prev = bind(button(ctx, 'Back button', opts.prevLabel ?? 'Back', box.x, y, w, false), { visible: 'pageNumber > 1' });
  const next = bind(button(ctx, 'Next button', opts.nextLabel ?? 'Next', box.x + box.width - w, y, w), { visible: 'pageNumber < pageCount' });
  const of = (opts.of ?? 'Page {n} of {total}').replace('{n}', '{pageNumber}').replace('{total}', '{pageCount}');
  const counter = text(ctx, 'Page counter', of, box.x + w + 16, y + 11, box.width - 2 * (w + 16), { fontSize: 15, color: ctx.L.muted, align: 'center' });
  page.children.push(prev, next);
  if (opts.counter !== false) page.children.push(counter);
  const g = graph(page);
  const eNext = click(g, next, 'Next page');
  g.run(eNext, goNext());
  const ePrev = click(g, prev, 'Previous page');
  g.run(ePrev, goPrevious());
  return { prev, next, counter, events: { prev: ePrev, next: eNext } };
}

// ------------------------------------------------------------------ dialog

export interface DialogPanel {
  frame: FrameNode;
  /** The title (a level 2 heading) and the close button, for a starter that wants to move or restyle them. */
  title: TextNode;
  close: ButtonNode;
  /** The wires that open and close it: `open` is a Set variable node to hang off whatever opens it (see `openDialog`). */
  closeEvent: LogicNode;
}

/**
 * A dialog: a frame that is announced as one, keeps Tab inside it, closes on Escape, dims the page behind it with a scrim and
 * hands focus back to what opened it. It shows while the variable `open` is true (the Set variable that opens it is
 * `set(open, 'true')`, and `openDialog(open)` is the same as a step), and its Close button sets it false. `children` are the
 * layers of the dialog, placed inside it from `y` 64 down (below the title); the panel is `height` tall in all.
 *
 *   const open = addVar(project, 'helpOpen', 'boolean', false);
 *   const help = dialogPanel(ctx, page, 'Help dialog', open, { x: 212, y: 150, width: 600, height: 300, title: 'How this works', children: [text(ctx, 'Help text', '...', 24, 64, 552)] });
 */
export function dialogPanel(ctx: BrandedCtx, page: Artboard, name: string, open: Variable, opts: { x: number; y: number; width: number; height: number; title: string; closeLabel?: string; children?: SceneNode[] }): DialogPanel {
  const { L } = ctx;
  const title = heading(ctx, `${name} title`, opts.title, 24, 20, opts.width - 48, { fontSize: 22 });
  const close = button(ctx, `${name} close button`, opts.closeLabel ?? 'Close', opts.width - 24 - 140, opts.height - 24 - 46, 140, false);
  const frame = createNode('frame', {
    name,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    cornerRadius: 16,
    fill: solid(L.background),
    stroke: stroke(L.border, 2),
    clip: false,
    ariaLabel: opts.title,
    dialog: { modal: true, scrim: { type: 'solid', color: L.text, opacity: 0.55 }, closeOnEscape: true, initialFocus: close.id, returnFocus: true, openVariable: open.id },
    children: [title, ...(opts.children ?? []), close],
  }) as FrameNode;
  page.children.push(frame);
  const g = graph(page);
  const closeEvent = click(g, close, `Close ${name}`);
  g.run(closeEvent, set(open, 'false'));
  return { frame, title, close, closeEvent };
}

/** The step that opens a dialog panel (a Set variable on its open variable), for a flow's `run(...)`. */
export const openDialog = (open: Variable): [string, Record<string, unknown>] => set(open, 'true');

// ------------------------------------------------------------------ keyNav list

/**
 * A repeater with arrow key navigation: `row` is the one layer that is copied once for each item of `items` (an expression for a
 * list: a variable, `options.filter(...)`), `item` and `index` are in scope inside it. The copies are a single Tab stop and the
 * arrow keys move between them (`mode: 'list'` one way, `'grid'` both with `columns`, `'radio'` where moving also picks). Without
 * `columns` the copies stack in a column, and a `horizontal` list lays them out in a row.
 *
 *   keyNavList(ctx, 'Options', 48, 140, 400, 280, { items: 'options', row: optionRow, indexVariable: focused });
 */
export function keyNavList(name: string, x: number, y: number, width: number, height: number, opts: { items: string; row: SceneNode; mode?: KeyNav['mode']; orientation?: KeyNav['orientation']; columns?: number; gap?: number; wrap?: boolean; countHidden?: boolean; indexVariable?: Variable; ariaLabel?: string }): FrameNode {
  const mode = opts.mode ?? 'list';
  const horizontal = opts.orientation === 'horizontal';
  const grid = mode === 'grid' || (opts.columns ?? 0) > 1;
  return createNode('frame', {
    name,
    x,
    y,
    width,
    height,
    fill: null,
    stroke: null,
    clip: false,
    ...(mode === 'radio' ? { role: 'radiogroup' } : {}),
    ...(opts.ariaLabel ? { ariaLabel: opts.ariaLabel } : {}),
    repeat: { items: opts.items, layout: grid ? 'grid' : horizontal ? 'horizontal' : 'vertical', gap: opts.gap ?? 12, columns: opts.columns ?? 1 },
    keyNav: { mode, ...(opts.orientation ? { orientation: opts.orientation } : {}), ...(grid && opts.columns ? { columns: opts.columns } : {}), ...(opts.wrap ? { wrap: true } : {}), ...(opts.countHidden ? { countHidden: true } : {}), ...(opts.indexVariable ? { indexVariable: opts.indexVariable.id } : {}) },
    children: [opts.row],
  } as never) as FrameNode;
}

// ------------------------------------------------------------------ optional extras

/**
 * The template-level switches for what a question page offers beyond answering it: a Hint (a small pill at the top right of the card, so
 * the one full size button is the primary one) and Try again. Each is one boolean project variable (`offerHint`, `allowTryAgain`) the
 * author changes once in the Variables tab for every question, not a button to delete from each page. Makes the variables when the
 * project lacks them (`hintOn` and `tryAgainOn` are what they start as) and returns the options to spread into `addQuestion`:
 *
 *   addQuestion(project, page.id, 'single', { at, ...questionExtras(project, { hint: true, tryAgain: true }) })
 *
 * Leave a switch out (`hint: false`) for a question that has none: the Hint is then still the pill, shown whenever the question has a hint.
 */
export function questionExtras(project: Project, o: { hint?: boolean; tryAgain?: boolean; hintOn?: boolean; tryAgainOn?: boolean }): KitOptions {
  const make = (name: string, on: boolean) => {
    if (!project.variables.some((v) => v.name === name)) addVar(project, name, 'boolean', on);
    return name;
  };
  return {
    hint: 'pill',
    ...(o.hint ? { hintWhen: make('offerHint', o.hintOn ?? true) } : {}),
    ...(o.tryAgain ? { resetWhen: make('allowTryAgain', o.tryAgainOn ?? true) } : {}),
  };
}

// ------------------------------------------------------------------ pill

/** A small secondary button for the side of a heading or card: 32 high, in the outline look, `width` wide. Not for the one thing a page is for. */
export function pillButton(ctx: BrandedCtx, name: string, label: string, x: number, y: number, width = 130): ButtonNode {
  const b = button(ctx, name, label, x, y, width, false);
  Object.assign(b, { height: 32, cornerRadius: 16, fontSize: 14 });
  return b;
}

/** The short checklist item for the switches `questionExtras` made: one action, with `extrasChecklist` as its detail. */
export function extrasShort(o: { hint?: boolean; tryAgain?: boolean }): string {
  if (o.hint && o.tryAgain) return 'Choose whether questions offer a Hint and Try again';
  return o.hint ? 'Choose whether questions offer a Hint' : 'Choose whether wrong answers can be retried';
}

/**
 * The checklist line for the switches `questionExtras` made, worded for what the starter has (`hint`: it has a Hint switch, `tryAgain`: a
 * Try again one) and what they start as.
 */
export function extrasChecklist(o: { hint?: boolean; tryAgain?: boolean; hintOn?: boolean; tryAgainOn?: boolean }): string {
  const on = (v: boolean | undefined, d: boolean) => (v ?? d ? 'on' : 'off');
  const parts: string[] = [];
  if (o.hint) parts.push(`offerHint (${on(o.hintOn, true)} to start) shows or hides the small Hint pill at the top right of every question, which shows the hints you typed in the Hints part of its Question section`);
  if (o.tryAgain) parts.push(`allowTryAgain (${on(o.tryAgainOn, true)} to start) shows or hides Try again after a wrong answer`);
  return `Optional extras, one switch each for every question, in the Variables tab: ${parts.join('; ')}. Set them once, not question by question`;
}
