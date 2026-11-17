//Course presentation: eight slides like the PowerPoint template, with a slide bar (Back, Next, slide n of N, arrow keys) built once on each page master.
import type { Artboard, SceneNode, TemplateChecklistItem } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, card, contentBox, heading, item, picture, text, todo, type BrandedCtx, type BrandedStarter } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { Graph, goNext, goPrevious, graphNote } from './common';
import { extrasChecklist, extrasShort, questionExtras } from '\.\./\.\./parts';

type Tone = 'light' | 'gradient' | 'deep';

const BAR_Y = 592;

/**
 * Back, "Slide n of N" and Next along the bottom of a slide, built once on the slide's page master (every slide of that look draws it,
 * over its own layers, so they are the last stops in the tab order). They go to the previous and next page in the project's order, with
 * the left and right arrow keys as shortcuts on the buttons, so a slide can be added or moved with no rewiring. The title slide's master
 * has Start and no Back, and the end slide's has Back and Start again.
 */
function slideBar(ctx: BrandedCtx, master: Artboard, role: 'first' | 'middle' | 'last', tone: Tone): SceneNode[] {
  const { L } = ctx;
  const made: SceneNode[] = [];
  const style = (b: ReturnType<typeof button>, primary: boolean) => {
    b.height = 38;
    b.cornerRadius = 19;
    b.fontSize = 15;
    if (tone !== 'light') {
      b.fill = { type: 'solid', color: primary ? L.button : tone === 'deep' ? L.deep : L.gradientStart };
      b.color = primary ? L.onButton : tone === 'deep' ? L.onDeep : L.onGradient;
      b.stroke = { paint: { type: 'solid', color: tone === 'deep' ? L.onDeep : L.onGradient }, width: 2 };
    }
    return b;
  };
  const g = new Graph(master);
  if (role !== 'first') {
    const back = style(button(ctx, 'Back', 'Back', 330, BAR_Y, 110, false), false);
    back.ariaLabel = 'Previous slide';
    back.shortcut = 'Left';
    made.push(back);
    g.run(g.click(back, 'Slide bar'), goPrevious('slideRight'));
  }
  const counter = text(ctx, 'Slide counter', 'Slide {pageNumber} of {pageCount}', 450, BAR_Y + 10, 124, { fontSize: 14, align: 'center', color: tone === 'light' ? L.muted : tone === 'deep' ? L.onDeep : L.onGradient });
  made.push(counter);
  if (role !== 'last') {
    const next = style(button(ctx, 'Next', role === 'first' ? 'Start' : 'Next', 584, BAR_Y, 110, true), true);
    next.ariaLabel = role === 'first' ? 'Start the presentation' : 'Next slide';
    next.shortcut = 'Right';
    made.push(next);
    g.run(g.click(next, 'Slide bar'), goNext('slideLeft'));
  } else {
    const again = style(button(ctx, 'Start again', 'Start again', 584, BAR_Y, 130, true), true);
    made.push(again);
    g.run(g.click(again, 'Slide bar'), ['action.startOver']);
  }
  master.children.push(...made);
  master.masterOver = [...(master.masterOver ?? []), ...made.map((n) => n.id)];
  return made;
}

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Course presentation');
  const { project, L } = ctx;
  const footer = 'Course presentation';

  const pages = [
    brandedPage(ctx, 'Welcome to online study', { kind: 'hero', name: 'Slide 1: Title', subtitle: 'A short course presentation. Edit each slide, swap the pictures and keep the slide bar.' }),
    brandedPage(ctx, 'Acknowledgement of Country', { name: 'Slide 2: Acknowledgement of Country' }),
    brandedPage(ctx, 'Part one: getting started', { kind: 'section', name: 'Slide 3: Section' }),
    brandedPage(ctx, 'Set up your study space', { name: 'Slide 4: Content', footer }),
    brandedPage(ctx, 'Plan your week', { name: 'Slide 5: Content', footer }),
    brandedPage(ctx, 'Check your understanding', { name: 'Slide 6: Question', footer }),
    brandedPage(ctx, 'Key points to remember', { name: 'Slide 7: Summary', footer }),
    brandedPage(ctx, 'Thank you', { kind: 'end', name: 'Slide 8: End' }),
  ];
  const [title, ack, section, slideA, slideB, quiz, summary, end] = pages;
  const checklist: TemplateChecklistItem[] = [];

  //1 Title slide: the bar's Start button is the only control on it
  checklist.push(item('Write the presentation title and the line under it', title.children.find((n) => n.name === 'Subtitle'), title));

  //2 Acknowledgement of Country
  {
    const box = contentBox(ack);
    const panel = card(ctx, 'Acknowledgement panel', box.x, box.y, box.width, 300);
    const words = text(ctx, 'Acknowledgement text', 'We acknowledge the Traditional Custodians of the lands on which we live, learn and work, and we pay our respects to Elders past, present and emerging.\n\nEdit this slide to the wording your campus uses and name the Traditional Custodians of the land you are on.', box.x + 36, box.y + 36, box.width - 72, { fontSize: 22, lineHeight: 1.5 });
    ack.children.push(panel, words);
    checklist.push(todo('Replace the Acknowledgement of Country with your own', 'Replace the Acknowledgement of Country with the wording and Country names that apply to where you teach', words, ack));
  }

  //3 Section slide
  checklist.push(todo('Rename the section slide and add others between topics', 'Rename the section slide, and add more section slides between topics by duplicating a slide', section.children.find((n) => n.name === 'Page title'), section));

  //4 and 5 Content slides: text and a picture
  const contentSlide = (page: Artboard, lines: string[]) => {
    const box = contentBox(page);
    const body = text(ctx, 'Slide text', lines.join('\n'), box.x, box.y, 500, { fontSize: 22, lineHeight: 1.4, paragraphSpacing: 22 });
    const pic = picture(ctx, 'Picture', box.x + 548, box.y, box.width - 548, 340);
    page.children.push(body, pic);
    return { body, pic };
  };
  const a = contentSlide(slideA, ['Pick one place you can use every week.', 'Keep your readings, notes and deadlines within reach.', 'Tell the people you live with when you are studying.']);
  const b = contentSlide(slideB, ['Block out study time in your calendar.', 'Start with the task that is due first.', 'Leave a gap each week for catching up.']);
  checklist.push(
    item('Write your own points on each content slide', a.body, slideA),
    todo('Replace the grey picture boxes with your own', 'Replace the grey picture boxes with your own pictures (a picture layer, or a fill on the box)', a.pic, slideA),
    item('Change the picture on the second content slide too', b.pic, slideB),
  );

  //6 A question from the question kit, embedded in the slide
  let questionLayer: SceneNode;
  {
    const box = contentBox(quiz);
    const id = addQuestion(project, quiz.id, 'single', { at: { x: box.x, y: box.y }, ...questionExtras(project, { hint: true, tryAgain: true }) })!;
    setQuestionSettings(project, quiz.id, id, {
      prompt: 'What is the best first step when an assignment is released?',
      options: [
        { id: 'o1', text: 'Read the task sheet and the marking criteria', correct: true },
        { id: 'o2', text: 'Start writing the introduction' },
        { id: 'o3', text: 'Wait until the week before it is due' },
      ],
      hints: ['What tells you what the markers will look for?'],
      feedbackCorrect: 'Yes. The task sheet and criteria tell you what to do and how it will be marked.',
      feedbackIncorrect: 'Not quite. Have another look at the choices.',
    });
    questionLayer = quiz.children.find((n) => n.id === id)!;
    const tip = card(ctx, 'Tip panel', box.x + 688, box.y, box.width - 688, 190);
    const tipHead = heading(ctx, 'Tip heading', 'Take your time', box.x + 712, box.y + 20, box.width - 736, { fontSize: 20 });
    const tipText = text(ctx, 'Tip text', 'Use the hint if you are stuck. You can try again, and then move on with Next.', box.x + 712, box.y + 60, box.width - 736, { fontSize: 16, lineHeight: 1.4, color: L.muted });
    quiz.children.push(tip, tipHead, tipText);
    checklist.push(todo('Write your own question and answers', 'Write your own question and answers in the Question section of the inspector, or change its type (multiple choice, true or false, matching...)', questionLayer, quiz));
  }

  //7 Summary
  const sum = contentSlide(summary, ['Set up a space and a routine.', 'Plan the week before it starts.', 'Read the task and the criteria first.']);
  checklist.push(item('Write the closing points on the summary slide', sum.body, summary));

  //8 End
  checklist.push(item('Change the closing message on the end slide', end.children.find((n) => n.name === 'Page title'), end));

  //The slide bar, once on each master (the title slide, the end slide and the section slide have a master of their own; the rest share one)
  const masterOf = (page: Artboard) => project.artboards.find((m) => m.id === page.master)!;
  const bars = new Map<string, SceneNode[]>();
  pages.forEach((page, i) => {
    const m = masterOf(page);
    if (bars.has(m.id)) return;
    const tone: Tone = page === title || page === end ? 'gradient' : page === section ? 'deep' : 'light';
    bars.set(m.id, slideBar(ctx, m, i === 0 ? 'first' : i === pages.length - 1 ? 'last' : 'middle', tone));
  });
  //One note on the slide bar, on the master the middle slides share
  const middle = masterOf(slideA);
  const middleNext = bars.get(middle.id)!.find((n) => n.name === 'Next')!;
  const onNext = middle.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === middleNext.id);
  if (onNext) graphNote(middle, { anchor: onNext, colour: 'sky', text: '**Back and Next are wired once, here on the master**, and follow the page order, with the arrow keys as their shortcuts. `pageNumber` and `pageCount` fill the counter. A new slide needs no rewiring. The first and last slides have a master of their own with Start and Start again.' });
  //The kit wired the question, so this slide's graph is its flows plus the slide bar
  const kitStart = quiz.logic.nodes.find((n) => n.kit);
  if (kitStart) graphNote(quiz, { anchor: kitStart, colour: 'sky', text: '**The question kit made every flow here**: choose, check, hint and Try again, and the extras ticked in its settings. Edit the question in the inspector\'s Question section, not in this graph.' });
  checklist.push(todo('To add a slide, copy one and drag it into place', 'To add a slide, duplicate one from the middle of the deck and drag it into place in the page list. Back, Next and "Slide n of N" follow the page order, so nothing needs rewiring. Only the first and last slides are different: Start on the first and Start again on the last', bars.get(masterOf(title).id)!.find((n) => n.name === 'Next'), masterOf(title)));

  //Notes for whoever edits the template, below the slides
  const below = (p: Artboard, x: number, w: number) => ({ x, y: p.height + 14, w, h: 84 });
  addNote(slideA, { ...below(slideA, 0, 440), text: '**Page navigation** Back and Next live once on the slide master (select it from the Page master section): they are Go to artboard (previous and next), and **Slide {pageNumber} of {pageCount}** counts the pages. The arrow keys are the shortcuts Left and Right on the two buttons.', colour: 'sky' });
  addNote(slideA, { ...below(slideA, 456, 440), text: '[ ] Write your own points, and swap the grey picture box for yours.', colour: 'gold' });
  addNote(quiz, { ...below(quiz, 0, 440), text: '**Question kit** The question is the kit\'s own frame, so its prompt, options, hint and feedback are all in the Question section of the inspector. Next is always there, so a learner can move on.', colour: 'sky' });

  checklist.push(todo(extrasShort({ hint: true, tryAgain: true }), extrasChecklist({ hint: true, tryAgain: true })));
  return { project, checklist };
}

export const presentation: BrandedStarter = {
  key: 'story/course-presentation',
  set: 'story',
  name: 'Course presentation',
  description: 'Eight slides like the PowerPoint template: a title, Acknowledgement of Country, a section, content slides with a picture, a check your understanding question, and an end slide. A slide bar with Back, Next, slide n of 8 and the arrow keys.',
  tags: ['slides', 'question kit', 'navigation'],
  build,
};
