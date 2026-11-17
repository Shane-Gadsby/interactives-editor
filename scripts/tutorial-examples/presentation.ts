//The course presentation tutorial's finished project: four slides on one page master, a question slide, and Back and Next added once to the master by Page navigation with a slide transition
import { createNode, type Project } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../src/lib/question-kit';
import { addPageNavigation } from '../../src/lib/page-nav';
import { markMaster, setMaster } from '../../src/lib/page-master';
import { blankProject, type TutorialExample } from './kit';
import { C, page, solid, text } from './_content-helpers';

function build(): Project {
  const p = blankProject('Study week slides', 'Welcome');
  const welcome = p.artboards[0];
  const plan = page(p, 'Plan your week');
  const check = page(p, 'Check your understanding');
  const thanks = page(p, 'Thank you');
  const slides = [welcome, plan, check, thanks];

  //The master: an accent bar, the title slot and the footer. Every slide draws it under its own layers
  const master = page(p, 'Slide master');
  master.children.push(
    createNode('rect', { name: 'Accent bar', x: 0, y: 0, width: 800, height: 12, fill: solid(C.navy) }),
    text('Slide title', '{slideTitle}', 40, 36, 720, { fontSize: 30, fontWeight: 700, role: 'heading', headingLevel: 1 } as never),
    text('Footer', 'Study skills', 40, 574, 300, { fontSize: 13, color: C.muted }),
  );
  markMaster(p, master.id, true);
  const titles = ['Welcome', 'Plan your week', 'Check your understanding', 'Thank you'];
  slides.forEach((s, i) => {
    setMaster(p, s.id, master.id);
    s.masterSlots = { slideTitle: titles[i] };
  });

  welcome.children.push(text('Slide text', 'Four short slides about planning your study week. Press Next, or use the arrow keys, to move on.', 40, 110, 600, { fontSize: 20, lineHeight: 1.45 }));
  plan.children.push(text('Slide text', 'Block out study time in your calendar.\nStart with the task that is due first.\nLeave a gap each week for catching up.', 40, 110, 600, { fontSize: 20, lineHeight: 1.45, paragraphSpacing: 14 } as never));
  thanks.children.push(text('Slide text', 'That is all. Go back with Back, or start your week plan now.', 40, 110, 600, { fontSize: 20, lineHeight: 1.45 }));

  const id = addQuestion(p, check.id, 'single', { at: { x: 40, y: 96 } });
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, check.id, id, {
    prompt: 'What is the best first step when an assignment is released?',
    options: [
      { id: 'o1', text: 'Read the task sheet and the marking criteria', correct: true },
      { id: 'o2', text: 'Start writing the introduction', feedback: 'Writing comes later. First find out what is being asked.' },
      { id: 'o3', text: 'Wait until the week before it is due', feedback: 'That leaves no time to plan or ask questions.' },
    ],
    feedbackCorrect: 'Yes. The task sheet and criteria say what to do and how it will be marked.',
  });

  //Page navigation, Back and Next, Slide left, added once to the master: every slide draws it over its own layers, and the master is not counted as a slide
  addPageNavigation(p, [master.id], 'back-next', 'slideLeft', 300);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-presentation',
  topic: 'tutorial-presentation',
  title: 'Course presentation',
  description: 'Four slides on one page master with a title slot, a check your understanding question, and Back, Next and the page number added once to the master by Page navigation with a slide transition: the presentation tutorial\'s project.',
  tags: ['slides', 'page master', 'navigation', 'question'],
  build,
  notes: [
    { page: 4, text: '**Every slide draws Slide master under its own layers.** Its title is a text slot: each slide types its own in the Page master section. Change the bar or footer once, on the master.' },
    { page: 4, text: '**Back, Next and Page 2 of 4 came from Page navigation,** Add to this master, with Slide left as How the page changes. They sit on the master, so every slide has them and a new slide needs no rewiring.', colour: 'sky' },
  ],
  graphNotes: [
    { page: 2, at: 0, text: '**Add question wired this slide\'s question.** Change the question in its Question section, not here. Back and Next are not on this page: they are wired once, on Slide master.' },
    { page: 4, at: 0, text: '**Back and Next are wired here, once.** Each is a click on a master button that goes to the previous or next page, and it runs on whichever slide is showing.' },
  ],
};
