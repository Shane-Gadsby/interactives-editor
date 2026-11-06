/** Flip cards and dialog cards: the same six cards as a grid you flip, and as a stack you step through one at a time. */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, gradient, item, solid, stroke, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import { Flow, announce, goTo, heroButtons, ifNode, n as node, onClick, onKey, setVar, small, toggleVar, variable } from './helpers';

const CARDS = [
  { front: 'Plagiarism', back: "Presenting someone else's words, ideas or work as your own." },
  { front: 'Paraphrase', back: 'Putting an idea in your own words and structure. You still cite the source.' },
  { front: 'Citation', back: 'A short note in your text that points to the full reference for a source.' },
  { front: 'Reference list', back: 'The list at the end of your work with full details of every source you cited.' },
  { front: 'Collusion', back: 'Working with others on something that must be your own, without permission.' },
  { front: 'Common knowledge', back: 'Facts widely known and easy to check. They usually need no citation. If unsure, cite.' },
];

//A card face: the gradient front, or the grey back, with its text bound to the shared list of cards
function face(ctx: BrandedCtx, name: string, w: number, h: number, side: 'front' | 'back', expr: string, flipped: string, size: number) {
  const { L } = ctx;
  const front = side === 'front';
  const label = text(ctx, `${name} text`, front ? CARDS[0].front : CARDS[0].back, 24, 12, w - 48, {
    fontSize: size,
    fontWeight: front ? 700 : 400,
    lineHeight: 1.35,
    align: 'center',
    verticalAlign: 'middle',
    autoSize: 'none',
    height: h - 24,
    color: front ? L.onGradient : L.text,
    bindings: { text: expr },
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
  description: 'Six cards in a grid that flip on a click or Enter (a term on the front, its meaning on the back), plus a dialog-card page that steps through the same cards one at a time with Turn, Previous, Next and a progress line. Write the cards once, in the "cards" list variable.',
  tags: ['cards', 'terms', 'keyboard friendly', 'self-check'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Flip and dialog cards');
    const { L } = ctx;
    const hero = brandedPage(ctx, 'Key integrity terms', { kind: 'hero', subtitle: 'Turn the cards to check what each term means, or step through them one at a time.' });
    const grid = brandedPage(ctx, 'Flip the cards', { footer: 'Academic integrity' });
    const dialog = brandedPage(ctx, 'Dialog cards', { footer: 'Academic integrity' });
    heroButtons(ctx, hero, [
      { name: 'Flip cards', label: 'Flip cards', to: grid, width: 180 },
      { name: 'Dialog cards', label: 'Dialog cards', to: dialog, width: 180 },
    ]);

    variable(ctx, 'cards', 'list', JSON.stringify(CARDS, null, 1));
    const flips = CARDS.map((_, i) => variable(ctx, `flipped${i + 1}`, 'boolean', false));
    const cardNo = variable(ctx, 'card', 'number', 1);
    const turned = variable(ctx, 'turned', 'boolean', false);

    // ---------------------------------------------------------------- the grid
    const box = contentBox(grid);
    const W = 288;
    const H = 190;
    const gapX = (box.width - W * 3) / 2;
    const tiles: SceneNode[] = [];
    CARDS.forEach((_, i) => {
      const f = flips[i].name;
      const tile = createNode('frame', {
        name: `Card ${i + 1}`,
        x: box.x + (i % 3) * (W + gapX),
        y: box.y + Math.floor(i / 3) * (H + 24),
        width: W,
        height: H,
        fill: null,
        stroke: null,
        clip: false,
        role: 'button',
        ariaDescription: 'Press Enter or Space to turn the card over',
        children: [face(ctx, `Card ${i + 1} front`, W, H, 'front', `cards[${i}].front`, f, 28), face(ctx, `Card ${i + 1} back`, W, H, 'back', `cards[${i}].back`, f, 18)],
      } as never);
      tiles.push(tile);
      grid.children.push(tile);
    });
    const reset = small(button(ctx, 'Turn all back', 'Turn all cards back', box.x, box.y + 2 * H + 24 + 28, 220, false));
    const hint = text(ctx, 'Flip hint', 'Select a card, or press Enter on it, to turn it over.', box.x + 240, box.y + 2 * H + 24 + 40, 440, { fontSize: 14, color: L.muted });
    const toDialog = button(ctx, 'To dialog cards', 'Try dialog cards', box.x + box.width - 220, box.y + 2 * H + 24 + 28, 220, true);
    small(toDialog);
    grid.children.push(reset, hint, toDialog);
    const gf = new Flow(grid);
    tiles.forEach((t, i) => gf.chain(onClick(t, 'Flip cards'), toggleVar(flips[i])));
    gf.chain(onClick(reset, 'Turn all back'), ...flips.map((v) => setVar(v, 'false')));
    gf.chain(onClick(toDialog, 'Pages'), goTo(dialog));

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
      children: [face(ctx, 'Dialog card front', DW, DH, 'front', 'cards[card - 1].front', 'turned', 38), face(ctx, 'Dialog card back', DW, DH, 'back', 'cards[card - 1].back', 'turned', 26)],
    } as never);
    const progress = text(ctx, 'Progress', 'Card {card} of {cards.length}', dx, dbox.y + DH + 22, DW, { fontSize: 16, fontWeight: 600, align: 'center', color: L.muted });
    const by = dbox.y + DH + 62;
    const prev = button(ctx, 'Previous', 'Previous', dx, by, 160, false);
    const turn = button(ctx, 'Turn', 'Turn the card', dx + (DW - 200) / 2, by, 200, true);
    const next = button(ctx, 'Next', 'Next', dx + DW - 160, by, 160, false);
    Object.assign(prev, { bindings: { disabled: 'card <= 1' } });
    Object.assign(next, { bindings: { disabled: 'card >= cards.length' } });
    const back = small(button(ctx, 'To flip cards', 'Back to flip cards', dialog.width - 48 - 220, 36, 220, false));
    dialog.children.push(dcard, progress, prev, turn, next, back);

    const df = new Flow(dialog);
    df.chain(node('event.start'), setVar(cardNo, '1'), setVar(turned, 'false'));
    df.join([onClick(dcard, 'Turn'), onClick(turn, 'Turn')], [toggleVar(turned), announce('turned ? cards[card - 1].back : cards[card - 1].front')]);
    df.gate([onClick(next, 'Step'), onKey('ArrowRight', undefined, 'Step')], ifNode('card < cards.length'), [setVar(cardNo, 'card + 1'), setVar(turned, 'false'), announce('"Card " + card + " of " + cards.length')]);
    df.gate([onClick(prev, 'Step'), onKey('ArrowLeft', undefined, 'Step')], ifNode('card > 1'), [setVar(cardNo, 'card - 1'), setVar(turned, 'false'), announce('"Card " + card + " of " + cards.length')]);
    df.chain(onClick(back, 'Pages'), goTo(grid));

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write your cards in the "cards" list variable (Variables panel): a front and a back for each. The grid and the dialog cards both follow it', tiles[0], grid),
      item('If a front should be a picture, put a picture over the front face of the card and clear its text binding (Bindings, Text)', byName(grid, 'Card 1 front'), grid),
      item('To add a card: add an entry to the list, duplicate a card in the grid, point its two texts at the new entry and copy its click flow (Interactions tab)', undefined, grid),
      item('Change the footer lines on both pages', byName(grid, 'Footer text'), grid),
      item('Check the dialog page: Turn, Previous and Next, and the left and right arrow keys', dcard, dialog),
    ];
    return { project: ctx.project, checklist };
  },
};
