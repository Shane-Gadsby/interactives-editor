import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { announce, bind, click, go, graph, heroPage, panel, setVar, variable } from './shared';

//Words as the author counts them: runs of non-space characters. Blank text is none.
const WORDS = 'essay.trim() == "" ? 0 : essay.trim().split(/\\s+/).length';
//A keyword is a stem matched anywhere in the answer, whatever the case, so "evaporat" catches evaporate, evaporation...
const HAS = (list: string) => `${list}.filter(k => essay.toLowerCase().includes(k.toLowerCase()))`;
const LACKS = (list: string) => `${list}.filter(k => !essay.toLowerCase().includes(k.toLowerCase()))`;
const LENGTH = 'wc < minWords ? "short" : wc > maxWords ? "long" : "ok"';

export function buildEssay(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Essay');
  const { project, L } = ctx;

  variable(project, 'prompt', 'string', 'Explain why studying a little each day works better than cramming the night before. Use your own words.');
  const essay = variable(project, 'essay', 'string', '');
  variable(project, 'required', 'list', ['spac', 'memory', 'forget', 'cram']);
  variable(project, 'optional', 'list', ['test yourself', 'sleep', 'review']);
  variable(project, 'minWords', 'number', 50);
  variable(project, 'maxWords', 'number', 150);
  variable(project, 'modelAnswer', 'string', 'When you study a little each day, you come back to the material just as you are starting to forget it. Each return pulls it out of memory again, which makes the memory stronger and slower to fade. Cramming puts everything in at once, so it feels productive but most of it is gone within days. Spacing the sessions out, testing yourself and getting enough sleep between them all help the material stick, so you remember it for the exam and beyond.');
  const submitted = variable(project, 'submitted', 'boolean', false);
  const wc = variable(project, 'wc', 'number', 0);
  const foundReq = variable(project, 'foundReq', 'list', []);
  const missingReq = variable(project, 'missingReq', 'list', []);
  const foundOpt = variable(project, 'foundOpt', 'list', []);
  const missingOpt = variable(project, 'missingOpt', 'list', []);
  const lengthState = variable(project, 'lengthState', 'string', '');
  const showModel = variable(project, 'showModel', 'boolean', false);

  const { page: hero, start } = heroPage(ctx, 'Write an answer', 'Write a short answer to a prompt, then check it for the key ideas. A self-check to help you learn, not a mark.', 'Start');
  const write = brandedPage(ctx, 'Write your answer', { footer: '{wc == 0 && !submitted ? "Not started" : "Draft"}' });
  const feedbackPage = brandedPage(ctx, 'Your feedback', { footer: 'Formative self-check: it is not marked' });
  const box = contentBox(write);

  //The writing page
  const LEFT = 620;
  const prompt = text(ctx, 'Prompt', '{prompt}', box.x, box.y, box.width, { fontSize: 20, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const input = createNode('input', {
    name: 'Answer box',
    ...lookDefaults(project, 'input'),
    inputType: 'textarea',
    placeholder: 'Type your answer here',
    ariaLabel: 'Your answer',
    variableId: essay.id,
    x: box.x,
    y: box.y + 62,
    width: LEFT,
    height: 300,
    cornerRadius: 12,
    fontSize: 18,
    fontFamily: BRAND_FONT,
    stroke: stroke(L.border, 2),
  });
  bind(input, { ariaDescription: `"Word count " + (${WORDS}) + ". Aim for between " + minWords + " and " + maxWords + " words."` });
  const submit = bind(button(ctx, 'Submit button', 'Submit for feedback', box.x, box.y + 380, 230), { disabled: `(${WORDS}) == 0`, opacity: `(${WORDS}) == 0 ? 0.5 : 1` });

  const sideX = box.x + LEFT + 28;
  const sideW = box.width - LEFT - 28;
  const countCard = card(ctx, 'Word count card', sideX, box.y + 62, sideW, 120);
  const countLabel = text(ctx, 'Word count label', 'Word count', sideX + 20, box.y + 78, sideW - 40, { fontSize: 15, fontWeight: 600, color: L.muted });
  const countText = text(ctx, 'Word count', `{${WORDS}}`, sideX + 20, box.y + 100, sideW - 40, { fontSize: 44, fontWeight: 700, lineHeight: 1.1 });
  bind(countText, { color: `(${WORDS}) > maxWords ? "${L.error}" : "${L.text}"` });
  const aim = text(ctx, 'Aim', 'Aim for {minWords} to {maxWords} words.', sideX, box.y + 196, sideW, { fontSize: 16, fontWeight: 600 });
  const how = text(ctx, 'How it works', 'This is a self-check, not marking. Submit looks for the key ideas your teacher listed and tells you which are in your answer and which are missing. Then you can compare your answer with a model one.', sideX, box.y + 232, sideW, { fontSize: 15, lineHeight: 1.4, color: L.muted });
  write.children.push(prompt, input, submit, countCard, countLabel, countText, aim, how);

  //The feedback page: what was found, what is missing, how the length went, and the model answer on request
  const fb = contentBox(feedbackPage);
  const summaryText = text(ctx, 'Length feedback', '{lengthState == "ok" ? "✓ Length: " + wc + " words, within " + minWords + " to " + maxWords + "." : lengthState == "short" ? "✗ Length: " + wc + " words, which is under " + minWords + ". Say a bit more." : "✗ Length: " + wc + " words, which is over " + maxWords + ". Try to be briefer."}', fb.x, fb.y, fb.width, { fontSize: 19, fontWeight: 700, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  bind(summaryText, { color: `lengthState == "ok" ? "${L.success}" : "${L.error}"` });
  const colW = (fb.width - 24) / 2;
  const reqRows = createNode('text', {
    name: 'Required found',
    text: '{foundReq.length == 0 ? "✗ None of the key ideas yet." : "✓ Key ideas you covered: " + foundReq.join(", ")}',
    x: 20,
    y: 56,
    width: colW - 40,
    fontSize: 17,
    lineHeight: 1.35,
    color: L.text,
    fontFamily: BRAND_FONT,
  } as never);
  const reqMissing = bind(text(ctx, 'Required missing', '{"✗ Key ideas not found yet: " + missingReq.join(", ")}', 20, 112, colW - 40, { fontSize: 17, lineHeight: 1.35, fontWeight: 600, color: L.error }), { visible: 'missingReq.length > 0' });
  const reqAll = bind(text(ctx, 'Required all found', '✓ Every key idea is in your answer.', 20, 112, colW - 40, { fontSize: 17, lineHeight: 1.35, fontWeight: 600, color: L.success }), { visible: 'missingReq.length == 0' });
  const reqPanel = panel(ctx, 'Required panel', fb.x, fb.y + 52, colW, 214, [heading(ctx, 'Required heading', 'Key ideas', 20, 16, colW - 40, { fontSize: 18 }), reqRows, reqMissing, reqAll], { role: 'region', ariaLabel: 'Key ideas' });
  const optFound = text(ctx, 'Optional found', '{foundOpt.length == 0 ? "None of the extras yet." : "✓ Extras you mentioned: " + foundOpt.join(", ")}', 20, 56, colW - 40, { fontSize: 17, lineHeight: 1.35 });
  const optMissing = bind(text(ctx, 'Optional missing', '{"You could also have mentioned: " + missingOpt.join(", ")}', 20, 112, colW - 40, { fontSize: 17, lineHeight: 1.35, color: L.muted }), { visible: 'missingOpt.length > 0' });
  const optPanel = panel(ctx, 'Optional panel', fb.x + colW + 24, fb.y + 52, colW, 214, [heading(ctx, 'Optional heading', 'Extras that would strengthen it', 20, 16, colW - 40, { fontSize: 18 }), optFound, optMissing], { role: 'region', ariaLabel: 'Extras' });

  const modelCard = bind(panel(ctx, 'Model answer panel', fb.x, fb.y + 280, fb.width, 112, [text(ctx, 'Model answer', '{modelAnswer}', 20, 16, fb.width - 40, { fontSize: 14, lineHeight: 1.4 })], { role: 'region', ariaLabel: 'Model answer' }), { visible: 'showModel' });
  const reveal = bind(button(ctx, 'Show model answer button', 'Show a model answer', fb.x, fb.y + 280, 230), { visible: '!showModel' });
  const edit = button(ctx, 'Edit button', 'Edit my answer', fb.x + (fb.width - 170 - 190 - 12), fb.y + 404, 170, false);
  const again = button(ctx, 'Start again button', 'Start again', fb.x + fb.width - 190, fb.y + 404, 190, false);
  feedbackPage.children.push(summaryText, reqPanel, optPanel, reveal, modelCard, edit, again);

  {
    const g = graph(write);
    const onSubmit = click(g, submit, 'Submit');
    g.run(
      onSubmit,
      setVar(wc, WORDS),
      setVar(foundReq, HAS('required')),
      setVar(missingReq, LACKS('required')),
      setVar(foundOpt, HAS('optional')),
      setVar(missingOpt, LACKS('optional')),
      setVar(lengthState, LENGTH),
      setVar(submitted, 'true'),
      announce('"Feedback ready. " + wc + " words. " + foundReq.length + " of " + required.length + " key ideas found."'),
      go(feedbackPage),
    );
  }
  {
    const g = graph(feedbackPage);
    g.run(click(g, reveal, 'Show model answer'), setVar(showModel, 'true'), announce('"Model answer: " + modelAnswer'));
    g.run(click(g, edit, 'Edit my answer'), setVar(showModel, 'false'), go(write));
    g.run(click(g, again, 'Start again'), ['action.startOver', {}]);
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(write));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your prompt: the "prompt" variable (Variables tab)', prompt, write),
    item('List the key ideas a good answer must have: the "required" variable (Variables tab) is a list of words or word stems, one per idea. A stem like "evaporat" matches evaporate, evaporation and evaporating. Matching ignores capital letters, and it looks for the text anywhere in the answer', input, write),
    item('List the extras that would make an answer stronger but are not needed: the "optional" variable (same format)', input, write),
    item('Set the length: the "minWords" and "maxWords" variables (Variables tab)', byName(write, 'Aim'), write),
    item('Write your model answer: the "modelAnswer" variable (Variables tab). Keep it near the length of the box on the feedback page, or make that box taller', byName(feedbackPage, 'Model answer panel'), feedbackPage),
    item('Check what the learner is told: this is automatic feedback from keywords, so it cannot judge meaning. Say so to your learners, and keep the "not marked" wording on both pages', byName(write, 'How it works'), write),
    item('Try it with the keyboard: Tab into the answer box, type, Tab to Submit and press Enter', undefined, write),
  ];
  return { project, checklist };
}
