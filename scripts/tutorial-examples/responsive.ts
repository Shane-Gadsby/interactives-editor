//The responsive tutorial's finished project: one page laid out by auto layout (a column, with a grid of three cards in it),
//and a narrow variant where the grid has one column, set to swap at 600 px
import type { AutoLayout, FrameNode, Project } from 'interactives-player';
import { addVariant, byName, drawn, relayout, token } from './_design-helpers';
import { blankProject, type TutorialExample } from './kit';

const PLANETS = [
  ['Mercury', 'Mercury\nThe smallest planet, and the closest to the Sun.'],
  ['Venus', 'Venus\nThe hottest planet, under thick clouds.'],
  ['Mars', 'Mars\nThe red planet, with the tallest volcano we know of.'],
];

const column = (gap: number, pad: number): AutoLayout => ({
  direction: 'column',
  gap,
  padding: { top: pad, right: pad, bottom: pad, left: pad },
  justify: 'start',
  align: 'start',
  wrap: false,
  hugWidth: false,
  hugHeight: true,
});

function build(): Project {
  const p = blankProject('Rocky planets');
  const ab = p.artboards[0];

  const content = drawn(p, 'frame', { name: 'Content', x: 0, y: 0, width: 800, height: 600, layout: column(16, 32) });
  const title = drawn(p, 'text', { name: 'Title', text: 'The rocky planets', fontSize: 32, fontWeight: 700, width: 300, height: 40, layoutItem: { width: 'fill' } });

  const cards = drawn(p, 'frame', {
    name: 'Cards',
    width: 736,
    height: 200,
    layout: { ...column(16, 0), grid: { columns: [{ type: 'fr', value: 1 }, { type: 'fr', value: 1 }, { type: 'fr', value: 1 }], rows: [] }, crossGap: 16 },
    layoutItem: { width: 'fill', height: 'hug' },
  }) as FrameNode;
  for (const [name, words] of PLANETS) {
    const card = drawn(p, 'frame', {
      name,
      width: 200,
      height: 120,
      cornerRadius: 12,
      fill: { type: 'solid', color: token(p, 'color/surface') },
      layout: column(8, 16),
      layoutItem: { width: 'fill', height: 'hug' },
    }) as FrameNode;
    card.children.push(drawn(p, 'text', { name: `${name} text`, text: words, fontSize: 16, width: 160, height: 48, layoutItem: { width: 'fill' } }));
    cards.children.push(card);
  }

  const next = drawn(p, 'button', { name: 'Next', label: 'Next' });
  content.children.push(title, cards, next);
  ab.children.push(content);
  relayout(p);

  //Add narrow variant, then the breakpoint set to 600 and the narrow page rearranged: Content as wide as the page, one column of cards
  const narrow = addVariant(p, ab, 'narrower');
  ab.minWidth = 600;
  const c2 = byName(narrow, 'Content') as FrameNode;
  c2.width = narrow.width;
  c2.layout = { ...c2.layout!, padding: { top: 20, right: 20, bottom: 20, left: 20 } };
  (byName(narrow, 'Title') as { fontSize: number }).fontSize = 26;
  const g2 = byName(narrow, 'Cards') as FrameNode;
  g2.layout = { ...g2.layout!, grid: { ...g2.layout!.grid!, columns: [{ type: 'fr', value: 1 }] } };
  relayout(p);
  narrow.height = Math.max(narrow.height, Math.ceil(c2.height));
  return p;
}

export const example: TutorialExample = {
  key: 'tut-responsive',
  topic: 'tutorial-responsive',
  title: 'Make it work on a phone',
  description: 'A page of three cards in a grid, with a narrow variant that stacks them for a phone and swaps in at 600 px: the Make it work on a phone tutorial\'s project.',
  tags: ['responsive', 'layout', 'phone', 'grid'],
  build,
  notes: [
    { text: '**Nothing here is placed by hand.** *Content* is a column, *Cards* is a grid of three 1fr columns, and each card is a column that hugs its text. Select a frame and look at its Auto layout section.' },
    { text: '**Home narrow is a variant of Home.** It is shown below 600 px. The only real change is the Cards grid: one 1fr column instead of three. Drag the Page width slider in Preview across 600 to watch it swap.', colour: 'sky', page: 1 },
  ],
};
