//Branching scenario: a study situation, three choices, consequences that offer more choices, and three endings picked by the score.
import { createNode, type Artboard, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, contentBox, heading, item, picture, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, bind, darkButton, goNext, set } from './common';

interface Choice {
  label: string;
  points: number;
  /** What the "path so far" line adds. */
  path: string;
  /** The name of a page, or 'ending' to be sent to whichever ending the score earns. */
  to: string;
}

const MAX_SCORE = 6;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Branching scenario');
  const { project, L } = ctx;
  //What the reader has chosen so far (each entry is one choice: its path wording and points), and what is worked out from it
  const taken = addVar(project, 'taken', 'list', []);
  addVar(project, 'score', 'number', 0, { formula: 'taken.reduce((a, t) => a + t.points, 0)', live: true });
  addVar(project, 'path', 'string', '', { formula: 'taken.map(t => t.path).join(" > ")', live: true });
  //The ending the score has earned (a page name) and its rating: both live, so every last choice goes to the same expression
  addVar(project, 'ending', 'string', '', { formula: 'score >= 5 ? "Ending: strong" : score >= 3 ? "Ending: mixed" : "Ending: learning moment"', live: true });
  addVar(project, 'rating', 'string', '', { formula: 'band(score, [5, 3], ["Excellent", "Reasonable", "Room to grow"])', live: true });
  //The choices on the page being read: each scene page sets them when it opens
  const options = addVar(project, 'options', 'list', []);

  const hero = brandedPage(ctx, 'The group assignment', { kind: 'hero', subtitle: 'A branching scenario. Make a decision, see what happens, and find out how it went.' });
  const situation = brandedPage(ctx, 'Tuesday: a quiet group', { footer: 'Branching scenario' });
  const asked = brandedPage(ctx, 'Sam replies', { footer: 'Branching scenario' });
  const alone = brandedPage(ctx, 'Wednesday night', { footer: 'Branching scenario' });
  const statement = brandedPage(ctx, 'Thursday: the contribution statement', { footer: 'Branching scenario' });
  const lecturer = brandedPage(ctx, 'The lecturer replies', { footer: 'Branching scenario' });
  const strong = brandedPage(ctx, 'A strong outcome', { kind: 'end', name: 'Ending: strong' });
  const mixed = brandedPage(ctx, 'A mixed outcome', { kind: 'end', name: 'Ending: mixed' });
  const learning = brandedPage(ctx, 'A learning moment', { kind: 'end', name: 'Ending: learning moment' });

  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const intro = hero.children.find((n) => n.name === 'Subtitle')!;
  const start = darkButton(ctx, 'Start', 'Start', 48, 450, 180);
  hero.children.push(start);
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), goNext());
  checklist.push(item('Write the title and the one-line introduction on the first page', intro, hero));

  //A page of narrative with choices. The choices are one repeater over "options", which the page sets when it opens, and one flow serves every button.
  const scene = (page: Artboard, body: string, prompt: string, choices: Choice[]): SceneNode => {
    const box = contentBox(page);
    const narrative = text(ctx, 'Situation', body, box.x, box.y, 560, { fontSize: 19, lineHeight: 1.45 });
    const pic = picture(ctx, 'Picture', box.x + 600, box.y, box.width - 600, 200);
    const ask = heading(ctx, 'Prompt', prompt, box.x, box.y + 196, 560, { fontSize: 20 });
    const trail = text(ctx, 'Path so far', 'Path so far: {path ? path : "just starting"}', box.x, box.y + box.height - 24, box.width, { fontSize: 14, color: L.muted });
    const choice = bind(button(ctx, 'Choice', 'Choice', 0, 0, 600, true), { label: 'item.label', ariaLabel: 'item.label' });
    const list = createNode('frame', { name: 'Choices', x: box.x, y: box.y + 236, width: 600, height: choices.length * 60 - 14, fill: null, stroke: null, clip: false, role: 'group', ariaLabel: 'Your choices', repeat: { items: 'options', layout: 'vertical', gap: 14, columns: 1 }, children: [choice] } as never);
    page.children.push(narrative, pic, ask, list, trail);
    const g = new Graph(page);
    g.run(g.start('The choices on this page'), set(options, JSON.stringify(choices)));
    //Add the choice to the path (the score and the path are live from it), then go where it says: a page name, or the ending the score has earned
    const onChoice = g.click(choice, 'A choice');
    g.run(onChoice, ['action.setVariable', { variable: taken.id, op: 'push', value: 'options[event.index]' }], ['action.artboard', { to: 'expression', expr: 'options[event.index].to == "ending" ? ending : options[event.index].to', transition: 'fade', duration: 250 }]);
    return choice;
  };

  const c1 = scene(situation, 'Your group assignment is due on Friday. The four of you agreed to write one section each, but Sam, who has the data analysis, has not posted anything in the group chat for a week. The group read-through is tomorrow.', 'What do you do?', [
    { label: 'Message Sam and ask how the section is going', points: 3, path: 'Asked Sam', to: asked.name },
    { label: 'Quietly write Sam\'s section yourself', points: 0, path: 'Wrote it yourself', to: alone.name },
    { label: 'Email the lecturer and ask them to step in', points: 2, path: 'Emailed the lecturer', to: lecturer.name },
  ]);
  checklist.push(item('Write your own situation and the first set of choices: each page sets its choices (label, points, path wording and the page it goes to) in the On start flow in the Interactions tab', c1, situation));

  const c2 = scene(asked, 'Sam answers within the hour. They have been unwell and fell behind, and have not started the analysis. They say they can finish most of it by Thursday morning, but they are worried about the quality.', 'How do you respond?', [
    { label: 'Agree a checkpoint: a draft to the group by Wednesday night', points: 3, path: 'Set a checkpoint', to: 'ending' },
    { label: 'Offer to take half the section, and say so in the group chat', points: 2, path: 'Shared the work', to: 'ending' },
  ]);
  const c3 = scene(alone, 'You finish Sam\'s section at midnight. It is good, but you have lost sleep and your own section is rushed. On Wednesday Sam finally appears in the chat: "Sorry, nearly done with mine!" You have no idea what they have written.', 'What now?', [
    { label: 'Tell the group what happened and agree how to merge', points: 3, path: 'Told the group', to: 'ending' },
    { label: 'Say nothing and submit both versions', points: 0, path: 'Said nothing', to: statement.name },
  ]);
  scene(statement, 'The assignment needs each member to sign a statement of who wrote what. Two sections now have two authors, and Sam has not mentioned it. Submission closes tomorrow.', 'What do you put in the statement?', [
    { label: 'Describe who wrote what, honestly', points: 2, path: 'Wrote it honestly', to: 'ending' },
    { label: 'Leave the statement vague', points: 0, path: 'Left it vague', to: 'ending' },
  ]);
  const c5 = scene(lecturer, 'The lecturer thanks you for raising it and suggests you talk to Sam and the group first. They also point you to the unit\'s group work guide, which explains what to do when a member is not contributing.', 'What next?', [
    { label: 'Message the group, using the guide to set out next steps', points: 3, path: 'Followed the guide', to: 'ending' },
    { label: 'Wait for the lecturer to contact Sam', points: 0, path: 'Waited', to: 'ending' },
  ]);
  checklist.push(
    item('Write what happens after each choice, and the choices that follow. A choice goes to the page named in its "to" (keep it the same as the page\'s name in the page list), or "ending" for whichever ending the score earns', c2, asked),
    item('Check the points: the best route should score the most. The "score", "path", "ending" and "rating" variables are live, worked out from the choices taken, and the three endings read them (the maximum is ' + MAX_SCORE + ')', c3, alone),
    item('Rewrite the lecturer pages and the statement page, or delete them and point the choices that lead to them somewhere else', c5, lecturer),
  );

  //Endings
  const ending = (page: Artboard, body: string) => {
    const msg = text(ctx, 'Outcome', body, 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 18, lineHeight: 1.4 });
    const result = text(ctx, 'Result', `Rating: {rating}   Score: {score} out of ${MAX_SCORE}`, 112, 478, 800, { align: 'center', color: L.onGradient, fontSize: 18, fontWeight: 700 });
    const trail = text(ctx, 'Your path', 'Your path: {path}', 112, 512, 800, { align: 'center', color: L.onGradient, fontSize: 15 });
    const again = darkButton(ctx, 'Start again', 'Start again', 422, 556, 180);
    page.children.push(msg, result, trail, again);
    const g = new Graph(page);
    g.run(g.click(again, 'Start again'), ['action.startOver']);
    return msg;
  };
  const e1 = ending(strong, 'You raised it early, kept everyone talking and the work stayed fair. This is what the unit\'s group work guide hopes for.');
  ending(mixed, 'The assignment got done, but some of it was harder than it needed to be. Talking sooner would have saved time and stress.');
  ending(learning, 'It did not go the way you wanted. Staying quiet or waiting made the problem bigger. Try again and take a different path.');
  checklist.push(item('Write what each of the three endings says about how it went', e1, strong));

  //Notes for whoever edits the template, below the pages
  const below = (p: Artboard, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(situation, { ...below(situation, 0, 440), text: '**One flow for every choice.** The buttons are a repeater over `options`, which this page sets when it opens. A click adds the choice to `taken` and goes to its page, so there is a flow per page, not per button.', colour: 'sky' });
  addNote(situation, { ...below(situation, 456, 440), text: '[ ] Edit the choices in the On start flow: label, points, path wording, and `to` (a page name, or **ending**). Keep `to` the same as the page\'s name in the page list.', colour: 'gold' });
  addNote(asked, { ...below(asked, 0, 440), text: '**Expression go-to** A choice marked **ending** goes to the live variable `ending`, a page name picked by the score. Change the score bands in its formula.', colour: 'sky' });
  addNote(strong, { ...below(strong, 0, 440), text: '**Live variables** `score`, `path` and `rating` are worked out from `taken`, so Start again only has to start over.', colour: 'sky' });

  return { project, checklist };
}

export const branching: BrandedStarter = {
  key: 'story/branching-scenario',
  set: 'story',
  name: 'Branching scenario',
  description: 'A study scenario with a hero page, a situation with three choices and consequence pages that offer more choices. Three endings say how it went from a score, with a path so far line and Start again.',
  tags: ['scenario', 'choices', 'score'],
  build,
};
