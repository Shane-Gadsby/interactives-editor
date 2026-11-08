//Small pieces the listen, watch, capture and practice starters share, so none of them reaches into another set's files. Variables and the graph
//builders come from graph-kit, the native pieces (stack, progress bar, dialog) from parts. What is here is only what those two do not have: the hero
//and end pages, the one line list steps (toggleItem, setItem), a tick list and a placeholder picture.
import { createNode, uid, type Artboard, type Asset, type FrameNode, type InputNode, type Project, type SceneNode, type TextNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { brandedPage, button, solid, stroke, text, type BrandedCtx } from '../../kit';
import { darkButton, type ActionStep } from '../../graph-kit';

export { Graph, addVar, announce, bind, click, darkButton, go, goNext, goPrevious, graph, lit, set, setVar, toggleVar } from '../../graph-kit';
export type { ActionStep } from '../../graph-kit';

/** The hero page every starter opens with: title, one line and a Start button (wired by the caller). */
export function heroPage(ctx: BrandedCtx, title: string, subtitle: string, label = 'Start', name = 'Start') {
  const page = brandedPage(ctx, title, { kind: 'hero', subtitle });
  const start = darkButton(ctx, name, label, 48, page.height * 0.42 + 190, 200);
  page.children.push(start);
  return { page, start };
}

/** The last page: gradient, a result line under the title and a button to go round again. */
export function endPage(ctx: BrandedCtx, title: string, resultText: string, again: string): { page: Artboard; again: SceneNode; result: TextNode } {
  const page = brandedPage(ctx, title, { kind: 'end', name: 'Results' });
  const result = text(ctx, 'Result text', resultText, 100, page.height / 2 + 80, page.width - 200, { fontSize: 22, fontWeight: 600, align: 'center', color: ctx.L.onGradient });
  const btn = button(ctx, 'Try again button', again, (page.width - 180) / 2, page.height / 2 + 140, 180, false);
  page.children.push(result, btn);
  return { page, again: btn, result };
}

/** Text in a fixed box, centred up and down (labels on cards, numbers on spots). */
export const boxText = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, w: number, h: number, extra: Partial<TextNode> = {}): TextNode =>
  text(ctx, name, value, x, y, w, { height: h, autoSize: 'none', verticalAlign: 'middle', decorative: true, ...extra });

/** Add a value to a list, or take it out when it is already there (a ticked row, a picked chip). */
export const toggleItem = (v: Variable, value: string): ActionStep => ['action.setVariable', { variable: v.id, op: 'toggleItem', value }];

/** Change one item of a list. `index` empty is `event.index`, and `field` changes only that field of an item that is an object. */
export const setItem = (v: Variable, value: string, opts: { index?: string; field?: string } = {}): ActionStep => ['action.setVariable', { variable: v.id, op: 'setItem', value, ...(opts.index ? { index: opts.index } : {}), ...(opts.field ? { field: opts.field } : {}) }];

/** Put these variables back to how they began (one node, in place of a Set variable for each). */
export const resetVars = (...vars: Variable[]): ActionStep => ['action.resetVariables', { variables: vars.map((v) => v.id) }];

/**
 * A list of tick rows, one for each item of `items` (a repeater): a box that fills when the row's index is in `ticked` (a list variable of
 * positions), a tick mark and the item's words. The row is a checkbox (focusable, announced as ticked or not) and the page wires it with
 * `toggleItem(ticked, 'event.index')`, so there is no If, no Append and no Remove. Returns the frame and the row to click.
 */
export function tickList(ctx: BrandedCtx, name: string, rowName: string, x: number, y: number, width: number, opts: { items: string; ticked: Variable; ariaLabel: string; rows: number; fontSize?: number; rowHeight?: number; gap?: number; background?: boolean }): { list: FrameNode; row: FrameNode } {
  const { L } = ctx;
  const rowH = opts.rowHeight ?? 34;
  const gap = opts.gap ?? 4;
  const on = `${opts.ticked.name}.includes(index)`;
  const tick = createNode('rect', { name: 'Tick box', x: 8, y: (rowH - 22) / 2, width: 22, height: 22, cornerRadius: 6, fill: solid(L.background), stroke: stroke(L.border, 2), decorative: true });
  tick.bindings = { 'fill.color': `${on} ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `${on} ? "${L.button}" : "${L.border}"` };
  //Dark on the row until it is ticked: it only shows over the button colour, where its own (onButton) colour is the one that reads, and a contrast check that cannot see that is not fooled
  const mark = text(ctx, 'Tick mark', '✓', 12, (rowH - 22) / 2 - 1, 18, { fontSize: 16, fontWeight: 700, color: L.text, decorative: true });
  mark.bindings = { visible: on, color: `"${L.onButton}"` };
  const words = text(ctx, 'Row text', '{item}', 42, (rowH - (opts.fontSize ?? 16) * 1.3) / 2, width - 54, { fontSize: opts.fontSize ?? 16, decorative: true });
  const row = createNode('frame', { name: rowName, x: 0, y: 0, width, height: rowH, cornerRadius: 8, fill: solid(opts.background === false ? L.background : L.surface), stroke: null, clip: false, role: 'checkbox', focusable: true, cursor: 'pointer', children: [tick, mark, words] }) as FrameNode;
  row.bindings = { ariaChecked: on, ariaLabel: 'item' };
  const list = createNode('frame', { name, x, y, width, height: opts.rows * rowH + (opts.rows - 1) * gap, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: opts.ariaLabel, repeat: { items: opts.items, layout: 'vertical', gap, columns: 1 }, children: [row] } as never) as FrameNode;
  return { list, row };
}

/** A plain grey picture saying what it is for, as an image asset: an empty slot, a poster or an example shows something until the author swaps it. */
export function placeholderPicture(project: Pick<Project, 'assets'>, name: string, line1: string, line2: string, size = { width: 640, height: 480 }): string {
  const { width, height } = size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#DDDCD7"/><text x="${width / 2}" y="${height / 2 - 10}" text-anchor="middle" font-family="Open Sans, Arial, sans-serif" font-size="30" font-weight="600" fill="#6E6964">${line1}</text><text x="${width / 2}" y="${height / 2 + 32}" text-anchor="middle" font-family="Open Sans, Arial, sans-serif" font-size="22" fill="#6E6964">${line2}</text></svg>`;
  const asset: Asset = { id: uid('as'), name, mime: 'image/svg+xml', size: svg.length, src: `data:image/svg+xml;base64,${btoa(svg)}` };
  project.assets.push(asset);
  return asset.id;
}

/** A multi line answer box on a variable, in the brand look. */
export function textBox(ctx: BrandedCtx, name: string, v: Variable, x: number, y: number, width: number, height: number, placeholder: string, label: string): InputNode {
  return createNode('input', {
    name,
    x,
    y,
    width,
    height,
    inputType: 'textarea',
    variableId: v.id,
    placeholder,
    ariaLabel: label,
    ...lookDefaults(ctx.project, 'input'),
    stroke: stroke(ctx.L.border, 2),
    cornerRadius: 10,
    fontSize: 17,
    fontFamily: BRAND_FONT,
  } as Partial<InputNode>);
}
