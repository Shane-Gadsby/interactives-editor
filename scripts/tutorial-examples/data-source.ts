//The data file tutorial's finished project: one page whose every word comes from tips.json (a data source called tips). The
//heading, the intro and the footer are text bound to it, and the cards are one Card group repeated over tips.cards, its
//background colour bound to each card's colour
import { createNode, uid, type Asset, type Project, type SceneNode } from 'interactives-player';
import { lookDefaults } from '../../src/lib/themes';
import { blankProject, type TutorialExample } from './kit';
import { textLayer, writeExampleAssets } from './_data-helpers';

/** The file the tutorial has you write and upload, word for word. */
export const TIPS = {
  title: 'Five study tips',
  intro: 'Small habits that make studying easier. Pick one to try this week.',
  cards: [
    { title: 'Plan your week', text: 'Block out classes, study and rest before the week begins.', colour: '#FFF4D6' },
    { title: 'Skim first', text: 'Read the headings and summary before the whole text.', colour: '#E3F1FB' },
    { title: 'Use your own words', text: 'Notes in your own words show what you understand.', colour: '#E6F4EA' },
    { title: 'Take breaks', text: 'A short break every hour keeps your focus.', colour: '#F6E7F3' },
  ],
  footer: 'Study skills, week 1',
};

const CARD_W = 352;
const CARD_H = 150;
const GAP = 16;

function build(): Project {
  const p = blankProject('Study tips');
  const ab = p.artboards[0];

  //+ From file: the file becomes an asset, and the source is named after it
  const json = JSON.stringify(TIPS, null, 2);
  const file: Asset = { id: uid('as'), name: 'tips.json', mime: 'application/json', size: json.length, src: `data:application/json;base64,${Buffer.from(json, 'utf8').toString('base64')}` };
  p.assets.push(file);
  writeExampleAssets('tut-data-source', p);
  p.dataSources.push({ id: uid('ds'), name: 'tips', kind: 'json', source: 'asset', assetId: file.id });

  const title = textLayer(p, 'Heading', '{tips.title}', 40, 36, 720, 32, 700);
  const intro = textLayer(p, 'Intro', '{tips.intro}', 40, 92, 720, 18);

  //The card: a rectangle and two text layers drawn inside the Cards frame, then grouped (Ctrl+G)
  const background = createNode('rect', { ...lookDefaults(p, 'rect'), name: 'Card background', x: 0, y: 0, width: CARD_W, height: CARD_H, cornerRadius: 12, bindings: { 'fill.color': 'item.colour' } } as never);
  const cardTitle = textLayer(p, 'Card title', '{item.title}', 16, 16, CARD_W - 32, 20, 700);
  const cardText = textLayer(p, 'Card text', '{item.text}', 16, 56, CARD_W - 32, 16);
  const card = createNode('group', { name: 'Card', x: 0, y: 0, width: CARD_W, height: CARD_H, children: [background, cardTitle, cardText] } as never) as SceneNode;
  const cards = createNode('frame', {
    ...lookDefaults(p, 'frame'),
    name: 'Cards',
    x: 40,
    y: 150,
    width: CARD_W * 2 + GAP,
    height: CARD_H * 2 + GAP,
    repeat: { items: 'tips.cards', layout: 'grid', gap: GAP, columns: 2 },
    children: [card],
  } as never) as SceneNode;

  const footer = textLayer(p, 'Footer', '{tips.footer}', 40, 548, 720, 14);
  ab.children.push(title, intro, cards, footer);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-data-source',
  topic: 'tutorial-data-source',
  title: 'Content from a data file',
  description: 'A page of study tips where every word, and each card\'s colour, comes from one JSON file, so rewriting it is a file swap: the Data file tutorial\'s project.',
  tags: ['data', 'json', 'repeater', 'bindings'],
  build,
  notes: [
    { text: '**Every word is in tips.json.** Open the Data tab and pick tips: the Form view shows the title, the intro, the four cards and the footer. Change one and the page follows.' },
    { text: '**One card, repeated.** The Cards frame repeats its first child, the Card group, once for each item in tips.cards. Inside it, {item.title} and {item.text} are that card\'s words.', colour: 'sky' },
    { text: '**Swap the whole file.** In the Assets panel, the arrow on tips.json replaces it with a new version. Keep the same field names and the page shows the new words.', colour: 'gold' },
  ],
};
