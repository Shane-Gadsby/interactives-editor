//The Accordion tutorial's finished project: one section repeated over a list in an auto layout column, one open at a time
import { createNode, defaultAutoLayout, type Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { C, bind, change, clickFlow, solid, text, variable } from './_content-helpers';

const SECTIONS = [
  { title: 'Plan your week', body: 'Put classes, work and study in one calendar at the start of the week, so a crowded day is no surprise.' },
  { title: 'Study in short blocks', body: 'Forty-five minutes of focused work, then a real break, suits most people better than one long sitting.' },
  { title: 'Test yourself', body: 'Close the book and try to recall the main points. Remembering an idea strengthens it more than reading it again.' },
  { title: 'Ask for help early', body: 'If something does not make sense, ask your teaching team sooner rather than later.' },
];

const W = 720;
const isOpen = 'open.includes(index)';

function build(): Project {
  const p = blankProject('Study habits');
  const ab = p.artboards[0];
  ab.children.push(text('Title', 'Four study habits', 40, 28, 520, { fontSize: 28, fontWeight: 700 }));

  variable(p, 'sections', 'list', SECTIONS);
  const open = variable(p, 'open', 'list', [0]);

  const header = bind(
    text('Section header', '{open.includes(index) ? "-" : "+"}  {item.title}', 0, 0, W - 32, { fontSize: 20, fontWeight: 600, role: 'button' } as never),
    { ariaLabel: 'item.title', ariaExpanded: isOpen },
  );
  const body = bind(text('Section text', '{item.body}', 0, 0, W - 32, { fontSize: 16, lineHeight: 1.45 }), { visible: isOpen });
  const auto = (gap: number, pad: number) => ({ ...defaultAutoLayout('column'), gap, padding: { top: pad, right: pad, bottom: pad, left: pad }, align: 'stretch' as const });
  const section = createNode('frame', {
    name: 'Section',
    x: 0,
    y: 0,
    width: W,
    height: 60,
    cornerRadius: 12,
    fill: solid(C.panel),
    layout: { ...auto(8, 16), hugHeight: true },
    children: [header, body],
  } as never);
  const accordion = createNode('frame', {
    name: 'Accordion',
    x: 40,
    y: 100,
    width: W,
    height: 440,
    fill: null,
    layout: { ...auto(10, 0), hugHeight: false },
    repeat: { items: 'sections', layout: 'vertical', gap: 10, columns: 1 },
    children: [section],
  } as never);
  ab.children.push(accordion);

  clickFlow(ab, header, [change(open, 'open.includes(event.index) ? [] : [event.index]')]);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-accordion',
  topic: 'tutorial-accordion',
  title: 'Accordion from data',
  description: 'Four sections drawn by one repeated section over a list, each opening while the rest move down, one open at a time: the Accordion tutorial\'s project.',
  tags: ['accordion', 'repeater', 'auto layout', 'keyboard friendly'],
  build,
  notes: [
    { text: '**One section, repeated, in an auto layout column.** A closed section\'s text is hidden, and a hidden layer takes no room, so the section shrinks and the ones below move up.' },
    { text: '**open is a list of the open places.** The header\'s click sets it to just that section, or to nothing if it was open. Its Expanded binding tells a screen reader which.', colour: 'sky' },
  ],
};
