/** Flip cards and dialog cards: the same six cards as a grid you flip, and as a stack you step through one at a time. */
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, gradient, item, solid, stroke, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import { addVar, announce, bind, click, goNext, goPrevious, graph, join, set } from '../../graph-kit';
import { fill, progressBar, stack } from '../../parts';
import { heroButtons, small } from './helpers';

const CARDS = [
  { front: 'Plagiarism', back: "Presenting someone else's words, ideas or work as your own." },
  { front: 'Paraphrase', back: 'Putting an idea in your own words and structure. You still cite the source.' },
  { front: 'Citation', back: 'A short note in your text that points to the full reference for a source.' },
  { front: 'Reference list', back: 'The list at the end of your work with full details of every source you cited.' },
  { front: 'Collusion', back: 'Working with others on something that must be your own, without permission.' },
  { front: 'Common knowledge', back: 'Facts widely known and easy to check. They usually need no citation. If unsure, cite.' },
];

//A card face: the gradient front, or the grey back, with its words read from the cards list by `expr` (item.front, cards[card - 1].back)
function face(ctx: BrandedCtx, name: string, w: number, h: number, side: 'front' | 'back', expr: string, flipped: string, size: number) {
  const { L } = ctx;
  const front = side === 'front';
  const label = text(ctx, `${name} text`, `{${expr}}`, 24, 12, w - 48, {
    fontSize: size,
    fontWeight: front ? 700 : 400,
    lineHeight: 1.35,
    align: 'center',
    verticalAlign: 'middle',
    autoSize: 'none',
    height: h - 24,
    color: front ? L.onGradient : L.text,
  } as never);
  return createNode('frame', {
    name,
    x: 0,
    y: 0,
    width: w,
    height: h,
    cornerRadius: 18,
    fill: front ? gradient(ctx, 135) : solid(L.surface),
    stroke: front ? null : stroke(L.border, 2),
    clip: false,
    bindings: { visible: front ? `!${flipped}` : flipped },
    children: [label],
  } as never);
}

export const flipAndDialogCards: BrandedStarter = {
  key: 'explore/flip-and-dialog-cards',
  set: 'explore',
  name: 'Flip and dialog cards',
  description: 'Six cards in a grid that flip on a click or Enter (a term on the front, its meaning on the back), plus a dialog-card page that steps through the same cards one at a time with Turn, Previous, Next (and the arrow keys) and a progress line. Write the cards once, in the "cards" list variable.',
  tags: ['cards', 'terms', 'keyboard friendly', 'self-check'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Flip and dialog cards');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'Key integrity terms', { kind: 'hero', subtitle: 'Turn the cards to check what each term means, or step through them one at a time.' });
    const grid = brandedPage(ctx, 'Flip the cards', { footer: 'Academic integrity  ·  Page {pageNumber} of {pageCount}' });
    const dialog = brandedPage(ctx, 'Dialog cards', { footer: 'Academic integrity  ·  Page {pageNumber} of {pageCount}' });
    heroButtons(ctx, hero, [
      { name: 'Flip cards', label: 'Flip cards', to: 'next', width: 180 },
      { name: 'Dialog cards', label: 'Dialog cards', to: dialog, width: 180 },
    ]);

    addVar(project, 'cards', 'list', CARDS);
    //One flag a card, in the order of the list: the grid flips them, Turn all back puts them to their starting value
    const flipped = addVar(project, 'flipped', 'list', CARDS.map(() => false));
    const cardNo = addVar(project, 'card', 'number', 1);
    const turned = addVar(project, 'turned', 'boolean', false);

    // ---------------------------------------------------------------- the grid
    const box = contentBox(grid);
    const GAP = 20;
    const W = (box.width - GAP * 2) / 3;
    const H = 176;
    //One card, repeated for every entry of "cards". event.index says which one was pressed
    const tile = createNode('frame', {
      name: 'Card',
      x: 0,
      y: 0,
      width: W,
      height: H,
      fill: null,
      stroke: null,
      clip: false,
      role: 'button',
      ariaDescription: 'Press Enter or Space to turn the card over',
      bindings: { ariaPressed: 'flipped[index]' },
      children: [face(ctx, 'Card front', W, H, 'front', 'item.front', 'flipped[index]', 28), face(ctx, 'Card back', W, H, 'back', 'item.back', 'flipped[index]', 18)],
    } as never);
    const cardGrid = createNode('frame', {
      name: 'Cards',
      x: box.x,
      y: box.y,
      width: box.width,
      height: H * 2 + GAP,
      fill: null,
      stroke: null,
      clip: false,
      role: 'region',
      ariaLabel: 'Cards',
      repeat: { items: 'cards', layout: 'grid', gap: GAP, columns: 3 },
      children: [tile],
    } as never);
    const reset = small(button(ctx, 'Turn all back', 'Turn all cards back', 0, 0, 220, false));
    const hint = text(ctx, 'Flip hint', 'Select a card, or press Enter on it, to turn it over.', 0, 0, 100, { fontSize: 14, color: L.muted, align: 'center' });
    const toDialog = small(button(ctx, 'To dialog cards', 'Try dialog cards', 0, 0, 220, true));
    const bar = stack('Card buttons', box.x, box.y + H * 2 + GAP + 16, box.width, { direction: 'row', gap: 16, align: 'center', children: [reset, fill(hint), toDialog] });
    grid.children.push(cardGrid, bar);
    {
      const g = graph(grid);
      g.run(click(g, tile, 'Flip a card'), ['action.setVariable', { variable: flipped.id, op: 'setItem', value: '!flipped[event.index]' }]);
      g.run(click(g, reset, 'Turn all back'), ['action.resetVariables', { variables: [flipped.id] }]);
      g.run(click(g, toDialog, 'Pages'), goNext());
    }

    // ---------------------------------------------------------------- dialog cards
    const dbox = contentBox(dialog);
    const DW = 600;
    const DH = 280;
    const dx = (dialog.width - DW) / 2;
    const dcard = createNode('frame', {
      name: 'Dialog card',
      x: dx,
      y: dbox.y + 4,
      width: DW,
      height: DH,
      fill: null,
      stroke: null,
      clip: false,
      role: 'button',
      ariaDescription: 'Press Enter or Space to turn the card over',
      bindings: { ariaPressed: 'turned' },
      children: [face(ctx, 'Dialog card front', DW, DH, 'front', 'cards[card - 1].front', 'turned', 38), face(ctx, 'Dialog card back', DW, DH, 'back', 'cards[card - 1].back', 'turned', 26)],
    } as never);
    const progress = text(ctx, 'Progress', 'Card {card} of {cards.length}', dx, dbox.y + DH + 20, DW, { fontSize: 16, fontWeight: 600, align: 'center', color: L.muted });
    const line = progressBar(ctx, 'Cards progress', dx, dbox.y + DH + 52, DW, { value: 'card', max: 'cards.length', decorative: true, height: 8 });
    const by = dbox.y + DH + 76;
    const prev = bind(button(ctx, 'Previous', 'Previous', dx, by, 160, false), { disabled: 'card <= 1' });
    const turn = button(ctx, 'Turn', 'Turn the card', dx + (DW - 200) / 2, by, 200, true);
    const next = bind(button(ctx, 'Next', 'Next', dx + DW - 160, by, 160, false), { disabled: 'card >= cards.length' });
    //The arrow keys press Previous and Next from anywhere on the page, and a disabled one ignores its key
    Object.assign(prev, { shortcut: 'ArrowLeft' });
    Object.assign(next, { shortcut: 'ArrowRight' });
    const back = small(button(ctx, 'To flip cards', 'Back to flip cards', dialog.width - 48 - 220, 36, 220, false));
    dialog.children.push(dcard, progress, line, prev, turn, next, back);

    {
      const g = graph(dialog);
      g.run(g.event('event.start', {}), ['action.resetVariables', { variables: [cardNo.id, turned.id] }]);
      const flip = g.then(click(g, dcard, 'Turn'), 'action.setVariable', { variable: turned.id, op: 'toggle' });
      join(dialog, click(g, turn, 'Turn'), flip);
      g.run(click(g, next, 'Step'), set(cardNo, 'Math.min(card + 1, cards.length)'), set(turned, 'false'));
      g.run(click(g, prev, 'Step'), set(cardNo, 'Math.max(card - 1, 1)'), set(turned, 'false'));
      //Said once, whichever button or key moved the card or turned it
      g.run(g.event('event.variable', { variable: cardNo.id }, 'Say the card'), announce('"Card " + card + " of " + cards.length'));
      const said = g.event('event.variable', { variable: turned.id }, 'Say the other side');
      said.params.onlyIf = 'turned';
      g.run(said, announce('cards[card - 1].back'));
      g.run(click(g, back, 'Pages'), goPrevious());
    }

    const below = (page: typeof grid, x: number) => ({ x, y: page.height + 14, w: 300, h: 100 });
    addNote(grid, { ...below(grid, 0), colour: 'sky', text: '**One card, repeated** All six cards are the same layers over the `cards` list. One flow flips the one pressed (`event.index`) and `flipped` holds a true or false for each.' });
    addNote(grid, { ...below(grid, 316), colour: 'sky', text: '**Reset variables** Turn all back puts `flipped` to its starting value in one step. The card says it is a toggle with `ariaPressed`.' });
    addNote(dialog, { ...below(dialog, 0), colour: 'sky', text: '**Arrow keys** Previous and Next carry the shortcuts ArrowLeft and ArrowRight, so there is no key flow. A disabled button ignores its shortcut at the ends.' });
    addNote(dialog, { ...below(dialog, 316), colour: 'gold', text: '[ ] Write your cards once, in `cards`. Both pages read it. For a picture on a front, lay one over the front face and clear its text.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write your cards in the "cards" list variable (Variables panel): a front and a back for each. The grid and the dialog cards both follow it, and "flipped" needs a false for each card', tile, grid),
      item('If a front should be a picture, put a picture over the front face of the card and clear the text on it', byName(grid, 'Card front'), grid),
      item('To add a card: add an entry to "cards" and a false to "flipped". The grid makes the card, so there is nothing to copy; for more than six, make the Cards frame taller and mind the buttons below it', cardGrid, grid),
      item('Change the footer lines on both pages', byName(grid, 'Footer text'), grid),
      item('Check the dialog page: Turn, Previous and Next, and the left and right arrow keys', dcard, dialog),
    ];
    return { project: ctx.project, checklist };
  },
};
