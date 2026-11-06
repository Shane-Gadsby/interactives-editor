//Branching scenario: a study situation, three choices, consequences that offer more choices, and three endings picked by the score.
import type { Artboard, SceneNode, TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, heading, item, picture, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, darkButton, go, lit, set, spreadPages } from './common';

interface Choice {
  label: string;
  points: number;
  /** What the "path so far" line adds. */
  path: string;
  /** A page, or 'ending' to be sent to whichever ending the score earns. */
  to: Artboard | 'ending';
}

const MAX_SCORE = 6;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Branching scenario');
  const { project, L } = ctx;
  const score = addVar(project, 'score', 'number', 0);
  const path = addVar(project, 'path', 'string', '');

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
  const rating = `(score >= 5 ? "Excellent" : score >= 3 ? "Reasonable" : "Room to grow")`;

  //Hero
  const intro = hero.children.find((n) => n.name === 'Subtitle')!;
  const start = darkButton(ctx, 'Start', 'Start', 48, 450, 180);
  hero.children.push(start);
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), go(situation));
  checklist.push(item('Write the title and the one-line introduction on the first page', intro, hero));

  //A page of narrative with choices. Returns the first choice button so the checklist can point at it.
  const scene = (page: Artboard, body: string, prompt: string, choices: Choice[]): SceneNode => {
    const box = contentBox(page);
    const narrative = text(ctx, 'Situation', body, box.x, box.y, 560, { fontSize: 19, lineHeight: 1.45 });
    const pic = picture(ctx, 'Picture', box.x + 600, box.y, box.width - 600, 200);
    const ask = heading(ctx, 'Prompt', prompt, box.x, box.y + 196, 560, { fontSize: 20 });
    const trail = text(ctx, 'Path so far', 'Path so far: {path ? path : "just starting"}', box.x, box.y + box.height - 24, box.width, { fontSize: 14, color: L.muted });
    page.children.push(narrative, pic, ask, trail);
    const g = new Graph(page);
    const buttons = choices.map((c, i) => {
      const b = button(ctx, `Choice ${i + 1}`, c.label, box.x, box.y + 236 + i * 60, 600, i === 0);
      b.ariaLabel = c.label;
      page.children.push(b);
      const steps: [string, Record<string, unknown>?][] = [
        ['action.setVariable', { variable: score.id, op: 'add', value: String(c.points) }],
        set(path, `path ? path + " > " + ${lit(c.path)} : ${lit(c.path)}`),
      ];
      const last = g.run(g.click(b, `Choice ${i + 1}`), ...steps);
      if (c.to === 'ending') {
        const high = g.add('logic.if', { condition: 'score >= 5' }, last);
        g.add('action.artboard', go(strong)[1], high, 'true');
        const mid = g.add('logic.if', { condition: 'score >= 3' }, high, 'false', { dy: 70 });
        g.add('action.artboard', go(mixed)[1], mid, 'true');
        g.add('action.artboard', go(learning)[1], mid, 'false', { dy: 70 });
        g.gap(100);
      } else g.add(...go(c.to), last);
      return b;
    });
    return buttons[0];
  };

  const c1 = scene(situation, 'Your group assignment is due on Friday. The four of you agreed to write one section each, but Sam, who has the data analysis, has not posted anything in the group chat for a week. The group read-through is tomorrow.', 'What do you do?', [
    { label: 'Message Sam and ask how the section is going', points: 3, path: 'Asked Sam', to: asked },
    { label: 'Quietly write Sam\'s section yourself', points: 0, path: 'Wrote it yourself', to: alone },
    { label: 'Email the lecturer and ask them to step in', points: 2, path: 'Emailed the lecturer', to: lecturer },
  ]);
  checklist.push(item('Write your own situation and the first set of choices (each choice is a button with its own points and path wording in the Interactions tab)', c1, situation));

  const c2 = scene(asked, 'Sam answers within the hour. They have been unwell and fell behind, and have not started the analysis. They say they can finish most of it by Thursday morning, but they are worried about the quality.', 'How do you respond?', [
    { label: 'Agree a checkpoint: a draft to the group by Wednesday night', points: 3, path: 'Set a checkpoint', to: 'ending' },
    { label: 'Offer to take half the section, and say so in the group chat', points: 2, path: 'Shared the work', to: 'ending' },
  ]);
  const c3 = scene(alone, 'You finish Sam\'s section at midnight. It is good, but you have lost sleep and your own section is rushed. On Wednesday Sam finally appears in the chat: "Sorry, nearly done with mine!" You have no idea what they have written.', 'What now?', [
    { label: 'Tell the group what happened and agree how to merge', points: 3, path: 'Told the group', to: 'ending' },
    { label: 'Say nothing and submit both versions', points: 0, path: 'Said nothing', to: statement },
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
    item('Write what happens after each choice, and the choices that follow', c2, asked),
    item('Check the points: the best route should score the most (the ratings and the three endings read the score; the maximum is ' + MAX_SCORE + ')', c3, alone),
    item('Rewrite the lecturer pages and the statement page, or delete them and their buttons', c5, lecturer),
  );

  //Endings
  const ending = (page: Artboard, body: string) => {
    const msg = text(ctx, 'Outcome', body, 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 18, lineHeight: 1.4 });
    const result = text(ctx, 'Result', `Rating: {${rating}}   Score: {score} out of ${MAX_SCORE}`, 112, 478, 800, { align: 'center', color: L.onGradient, fontSize: 18, fontWeight: 700 });
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

  spreadPages(project);
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
