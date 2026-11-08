/** Before and after: two pictures stacked, a divider you drag (or move with the arrow keys) that reveals one over the other. */
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { addVar, click, graph, join, set } from '../../graph-kit';
import { stack } from '../../parts';
import { group, heroButtons, small } from './helpers';

const W = 928;
const H = 404;
const STEP = 46;

export const beforeAndAfter: BrandedStarter = {
  key: 'explore/before-and-after',
  set: 'explore',
  name: 'Before and after',
  description: 'Two pictures stacked with a divider handle you drag, or move with the left and right arrow keys, to reveal one over the other. Labelled "Before" and "After", with buttons to jump to either side for people who cannot drag.',
  tags: ['compare', 'pictures', 'drag', 'keyboard friendly'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Before and after');
    const { L } = ctx;
    const hero = brandedPage(ctx, 'Before and after', { kind: 'hero', subtitle: 'Move the divider to compare the two pictures.' });
    const page = brandedPage(ctx, 'Compare the pictures', { footer: 'Before and after  ·  Page {pageNumber} of {pageCount}' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: 'next' }]);

    //Where the divider is, in px from the left edge of the pictures (0 shows only After, the full width only Before)
    const pos = addVar(ctx.project, 'dividerAt', 'number', W / 2);
    const box = contentBox(page);

    const label = (name: string, words: string, x: number) =>
      createNode('frame', {
        name,
        x,
        y: 16,
        width: 112,
        height: 36,
        cornerRadius: 18,
        fill: solid(L.deep),
        stroke: null,
        clip: false,
        children: [text(ctx, `${name} text`, words, 0, 7, 112, { fontSize: 16, fontWeight: 600, align: 'center', color: L.onDeep })],
      } as never);

    //After sits underneath, whole. Before sits on top in a clipping frame that is as wide as the divider is far along
    const afterPic = picture(ctx, 'After picture', 0, 0, W, H);
    Object.assign(afterPic, { ariaLabel: 'After picture: replace with your own image', fill: solid(L.surfaceMuted) });
    const afterHint = text(ctx, 'After picture hint', 'Replace with your After picture', W / 2 + 24, H / 2 - 24, W / 2 - 48, { align: 'center', color: L.muted, fontSize: 18, decorative: true });
    const afterLabel = label('After label', 'After', W - 16 - 112);
    const beforePic = picture(ctx, 'Before picture', 0, 0, W, H);
    Object.assign(beforePic, { ariaLabel: 'Before picture: replace with your own image', fill: solid(L.surface) });
    const beforeHint = text(ctx, 'Before picture hint', 'Replace with your Before picture', 24, H / 2 - 24, W / 2 - 48, { align: 'center', color: L.text, fontSize: 18, decorative: true });
    const beforeLabel = label('Before label', 'Before', 16);
    const before = createNode('frame', {
      name: 'Before reveal',
      x: 0,
      y: 0,
      width: W / 2,
      height: H,
      fill: null,
      stroke: null,
      clip: true,
      cornerRadii: [16, 0, 0, 16],
      bindings: { width: pos.name },
      children: [beforePic, beforeHint, beforeLabel],
    } as never);
    const line = createNode('rect', { name: 'Divider line', x: W / 2 - 2, y: 0, width: 4, height: H, fill: solid(L.background), stroke: null, decorative: true, bindings: { x: `${pos.name} - 2` } } as never);
    const handle = createNode('frame', {
      name: 'Divider handle',
      x: W / 2 - 24,
      y: H / 2 - 24,
      width: 48,
      height: 48,
      cornerRadius: 24,
      fill: solid(L.primary),
      stroke: stroke(L.background, 4),
      clip: false,
      role: 'button',
      cursor: 'ew-resize',
      ariaLabel: 'Divider',
      ariaDescription: 'Use the left and right arrow keys to move it, Home to show only the After picture and End to show only the Before picture',
      bindings: { x: `${pos.name} - 24`, ariaLabel: `"Divider, showing " + Math.round(${pos.name} / ${W} * 100) + " percent Before"` },
      children: [text(ctx, 'Divider arrows', '‹ ›', 0, 10, 48, { fontSize: 22, fontWeight: 700, align: 'center', color: L.onPrimary, decorative: true })],
    } as never);
    const comparison = group('Comparison', box.x, box.y, W, H, { cornerRadius: 16, children: [afterPic, afterHint, afterLabel, before, line, handle] });
    page.children.push(comparison);

    const help = text(ctx, 'Instructions', 'Drag the divider, or select it and use the left and right arrow keys.', 0, 0, 100, { fontSize: 16, color: L.muted });
    const showBefore = small(button(ctx, 'Show Before', 'Show Before', 0, 0, 160, false));
    const showAfter = small(button(ctx, 'Show After', 'Show After', 0, 0, 160, false));
    const jump = stack('Jump buttons', box.x + W - 336, box.y + H + 14, 336, { direction: 'row', gap: 16, children: [showBefore, showAfter] });
    help.x = box.x;
    help.y = box.y + H + 22;
    help.width = 560;
    page.children.push(help, jump);

    //Dragging anywhere on the pictures moves the divider to the pointer. One key flow moves it from the handle, and one flow serves both jump buttons
    {
      const g = graph(page);
      const clamp = (e: string) => `clamp(${e}, 0, ${W})`;
      const move = g.then(g.event('event.pointer', { target: comparison.id, type: 'pointerdown' }, 'Divider'), 'action.setVariable', { variable: pos.id, op: 'set', value: clamp(`event.x - ${box.x}`) });
      join(page, g.event('event.pointer', { target: comparison.id, type: 'drag' }, 'Divider'), move);
      const keys = g.event('event.key', { key: '', type: 'keydown', target: handle.id }, 'Divider keys');
      keys.params.onlyIf = '["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)';
      g.run(keys, set(pos, clamp(`event.key == "Home" ? 0 : event.key == "End" ? ${W} : ${pos.name} + (event.key == "ArrowRight" ? ${STEP} : -${STEP})`)));
      const jumps = click(g, jump, 'Jump');
      jumps.params.childrenOnly = true;
      g.run(jumps, set(pos, `event.childIndex == 0 ? ${W} : 0`));
    }

    const below = (x: number) => ({ x, y: page.height + 14, w: 300, h: 100 });
    addNote(page, { ...below(0), colour: 'sky', text: '**Divider** `dividerAt` is the divider\'s distance from the left of the pictures. The Before layer is clipped to that width, so the pictures need no masking.' });
    addNote(page, { ...below(316), colour: 'sky', text: '**One flow each** One key node serves the four keys (its Only if holds the list), and Show Before and Show After share one click flow, told apart by `event.childIndex`.' });
    addNote(page, { ...below(632), colour: 'gold', text: '[ ] Put your own pictures over the grey ones, both the same size, and describe each in its text alternative.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Replace the grey "Before" picture with your own, the same size as the After one so they line up', beforePic, page),
      item('Replace the grey "After" picture with your own, and update the text alternative of both so they say what each shows', afterPic, page),
      item('Change the labels if "Before" and "After" are not the words you want (for example "2015" and "Today")', afterLabel, page),
      item('Change the instruction line under the pictures', help, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
