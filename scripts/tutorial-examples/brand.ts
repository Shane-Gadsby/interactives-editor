//The brand tutorial's finished project: a welcome page whose every colour is a theme token, with the UniSQ Purple colourway
//added from the Themes tab and made the default, so it also plays in Light, Dark and High contrast
import type { Project } from 'interactives-player';
import { addColourwayTheme } from '../../src/lib/branded/colourway';
import { COLOURWAYS } from '../../src/lib/branded/looks';
import { drawn, token } from './_design-helpers';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Space week');
  const ab = p.artboards[0];
  //+ Colourway… Purple, then its Default box ticked
  const purple = COLOURWAYS.find((c) => c.id === 'purple')!;
  addColourwayTheme(p, purple);
  p.themes!.default = `theme-${purple.id}`;

  const fill = (name: string) => ({ type: 'solid' as const, color: token(p, name) });
  ab.children.push(
    drawn(p, 'rect', { name: 'Header', x: 0, y: 0, width: 800, height: 170, fill: fill('brand/deep') }),
    drawn(p, 'rect', { name: 'Accent bar', x: 0, y: 170, width: 800, height: 8, fill: fill('brand/accent') }),
    drawn(p, 'text', { name: 'Title', text: 'Space week', x: 60, y: 56, width: 680, height: 56, fontSize: 44, fontWeight: 700, color: token(p, 'brand/on-deep') }),
    drawn(p, 'rect', { name: 'Card', x: 60, y: 226, width: 680, height: 230, cornerRadius: 16, fill: fill('color/surface') }),
    drawn(p, 'text', {
      name: 'Welcome',
      text: 'Welcome. This week we tour the planets, from scorching Mercury to icy Neptune. Each day has a short activity and a quiz to finish.',
      x: 92,
      y: 258,
      width: 616,
      height: 96,
      fontSize: 20,
    }),
    drawn(p, 'text', { name: 'Due', text: 'Due Friday, 5 pm', x: 92, y: 384, width: 300, height: 28, fontSize: 18, fontWeight: 700 }),
    drawn(p, 'button', { name: 'Start', label: 'Start', x: 600, y: 500 }),
  );
  return p;
}

export const example: TutorialExample = {
  key: 'tut-brand',
  topic: 'tutorial-brand',
  title: 'Use the UniSQ look and colour themes',
  description: 'A welcome page in the UniSQ Purple colourway where every colour is a theme token, so it also works in Light, Dark and High contrast: the Use the UniSQ look and colour themes tutorial\'s project.',
  tags: ['theme', 'brand', 'colourway', 'tokens', 'high contrast'],
  build,
  notes: [
    { text: '**Every colour here is a token.** Select any layer and its colour shows as a named chip, such as brand/deep. Open the Themes tab to see each token\'s colour in every theme.' },
    { text: '**Purple is the default theme.** It came from + Colourway… in the Themes tab. Switch the theme box in the top bar to Light, Dark or High contrast and the whole page follows.', colour: 'sky' },
  ],
};
