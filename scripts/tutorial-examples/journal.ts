//The reflection journal tutorial's finished project: two prompts whose text boxes are Save as user data, word counts, and a
//second page that puts the reflection together and downloads it, built the way the tutorial's steps build it
import { createArtboard, createNode, defaultParams, DEFAULT_TRANSITION_MS, uid, type Artboard, type Project, type SceneNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../src/lib/themes';
import { writeClickFlow } from '../../src/lib/click-flow';
import { blankProject, type TutorialExample } from './kit';

//A layer as the tool bar draws it: the tool's own defaults, then the project's look
function layer(p: Project, ab: Artboard, type: 'text' | 'button' | 'input', props: Record<string, unknown>): SceneNode {
  const n = createNode(type, { ...lookDefaults(p, type), ...props } as never);
  ab.children.push(n);
  return n;
}

const text = (p: Project, ab: Artboard, name: string, words: string, y: number, extra: Record<string, unknown> = {}) =>
  layer(p, ab, 'text', { name, text: words, x: 40, y, width: 720, height: 28, autoSize: 'height', fontSize: 18, ...extra });

function variable(p: Project, name: string, extra: Partial<Variable> = {}): Variable {
  const v: Variable = { id: uid('v'), name, type: 'string', initial: '', ...extra };
  p.variables.push(v);
  return v;
}

//+ When clicked… with a page recipe, as the dialog's Add writes it (recipes.ts pulls in the browser-only asset store, so its
//page action is spelt out here: the usual fade at the usual speed)
const goTo = (ab: Artboard, n: SceneNode, to: Record<string, unknown>) =>
  writeClickFlow(ab, n.id, [{ kind: 'action.artboard', params: { ...to, transition: 'fade', duration: DEFAULT_TRANSITION_MS } }]);

function build(): Project {
  const p = blankProject('My learning journal', 'Write');
  const write = p.artboards[0];
  const whole = createArtboard({ name: 'My reflection', canvasX: write.width + 100, canvasY: 0, background: write.background });
  p.artboards.push(whole);

  //Step 2: the two text variables, ticked Save as user data
  const happened = variable(p, 'happened', { userData: true });
  const learnt = variable(p, 'learnt', { userData: true });
  //Step 4: the word count over both, and step 6: the whole reflection, both worked out and kept up to date
  variable(p, 'totalWords', { type: 'number', initial: 0, formula: 'wordCount(happened) + wordCount(learnt)', live: true });
  variable(p, 'reflection', {
    formula: '"WHAT HAPPENED\\n" + (happened.trim() || "(Not written yet)") + "\\n\\nWHAT I LEARNT\\n" + (learnt.trim() || "(Not written yet)")',
    live: true,
  });

  //Step 3: the Write page
  text(p, write, 'Title', 'My learning journal', 30, { fontSize: 32, fontWeight: 700, height: 40 });
  text(p, write, 'Welcome line', '{userData.restored > 0 ? "Welcome back. Your writing is just as you left it." : "Your writing is saved as you type, so you can come back to it."}', 78);
  const box = (name: string, v: Variable, y: number, placeholder: string) =>
    layer(p, write, 'input', { name, x: 40, y, width: 720, height: 110, inputType: 'textarea', placeholder, ariaLabel: name, bindings: { value: v.name }, bindingModes: { value: 'both' } });
  text(p, write, 'Prompt 1', 'What happened this week?', 124, { fontWeight: 700 });
  box('What happened', happened, 156, 'Describe what happened...');
  text(p, write, 'Count 1', '{wordCount(happened)} words', 272, { fontSize: 15 });
  text(p, write, 'Prompt 2', 'What did you learn from it?', 312, { fontWeight: 700 });
  box('What I learnt', learnt, 344, 'Write what you learnt...');
  text(p, write, 'Count 2', '{wordCount(learnt)} words', 460, { fontSize: 15 });
  text(p, write, 'Total words', '{totalWords} words so far. Aim for about 100.', 534, { width: 440, fontSize: 16 });
  const see = layer(p, write, 'button', { name: 'See my reflection button', label: 'See my reflection', x: 560, y: 524, width: 200, height: 44 });
  goTo(write, see, { to: 'picked', artboard: whole.id });

  //Step 6: the export page
  text(p, whole, 'Title', 'My reflection', 30, { fontSize: 32, fontWeight: 700, height: 40 });
  text(p, whole, 'Whole reflection', '{reflection}', 90, { height: 400, autoSize: 'none', fontSize: 17, lineHeight: 1.4 });
  const back = layer(p, whole, 'button', { name: 'Back button', label: 'Back', x: 40, y: 524, width: 140, height: 44 });
  goTo(whole, back, { to: 'previous' });
  //Step 7: + On click (empty), then Download a file from the Add and connect menu
  const save = layer(p, whole, 'button', { name: 'Download button', label: 'Download as a file', x: 560, y: 524, width: 200, height: 44 });
  writeClickFlow(whole, save.id, [{ kind: 'action.saveFile', params: { ...defaultParams('action.saveFile'), name: '"my-reflection"', text: 'reflection', mime: 'text/plain' } }], 'click');

  //Step 8: complete on reaching the reflection page
  p.settings.reporting = { completion: 'artboard', completionArtboard: whole.id };
  return p;
}

export const example: TutorialExample = {
  key: 'tut-journal',
  topic: 'tutorial-journal',
  title: 'Reflection journal',
  description: 'Two reflection prompts with text boxes and word counts that are still there when the learner comes back, and a page that puts it all together and downloads it: the Reflection journal tutorial\'s project.',
  tags: ['writing', 'reflection', 'user data', 'word count'],
  build,
  notes: [
    { text: '**Nothing saves by hand here.** The two text variables, *happened* and *learnt*, are ticked Save as user data in the Variables tab. They are put back before the page shows and saved as the learner types.' },
    { text: '**The counts are formulas.** Each count line is `{wordCount(happened)} words`, and *totalWords* is a variable worked out from both and kept up to date.', colour: 'sky' },
    { text: '**The whole reflection is one live variable**, *reflection*, worked out from the two answers. The page shows it and Download a file saves it as a .txt.', page: 1, colour: 'gold' },
  ],
};
