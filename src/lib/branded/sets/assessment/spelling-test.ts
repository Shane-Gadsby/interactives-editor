import { createNode, type Artboard, type FrameNode, type LogicNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, card, contentBox, edge, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { after, announce, bind, brandQuestionFrame, click, go, graph, heroPage, variable } from './shared';

//Words with an American spelling to accept and a few without. The words only live in each question's accepted spellings: nothing
//else in the project says them, so the share link (which takes those out and marks on the server) has none of them in the page.
//The audio comes from the Voice section of each question (a synthesised voice, made while authoring, saved as a sound asset).
const WORDS: { accept: string[] }[] = [{ accept: ['colour'] }, { accept: ['organise'] }, { accept: ['neighbour'] }, { accept: ['centre'] }, { accept: ['necessary'] }, { accept: ['separate'] }];
const OUT_OF = WORDS.length;

export function buildSpellingTest(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Spelling test');
  const { project, L } = ctx;
  const box = (p: Artboard) => contentBox(p);

  //What this go scored, and what the pass message says
  const total = variable(project, 'total', 'number', 0);
  variable(project, 'outOf', 'number', OUT_OF);
  variable(project, 'passPercent', 'number', 80);
  variable(project, 'passMessage', 'string', 'You passed. Well spelled.');
  variable(project, 'failMessage', 'string', 'Not a pass this time. Listen to the words again and have another go.');

  const { page: hero, start } = heroPage(ctx, 'Spelling test', 'Listen to each word and type it. Every letter counts, and you can play a word as many times as you like.', 'Start the test');
  const pages: Artboard[] = [];
  const frames: FrameNode[] = [];
  const plays: SceneNode[] = [];

  WORDS.forEach((w, i) => {
    const n = i + 1;
    const page = brandedPage(ctx, `Word ${n}`, { footer: `Word ${n} of ${OUT_OF}` });
    const at = box(page);
    //The play button sits above the question, so the word is the first thing a learner reaches
    const play = button(ctx, 'Play word button', 'Play the word', at.x, at.y, 220);
    play.ariaLabel = `Play word ${n}`;
    page.children.push(play);
    plays.push(play);
    const id = addQuestion(project, page.id, 'blank', { at: { x: at.x, y: at.y + 70 } })!;
    setQuestionSettings(project, page.id, id, {
      prompt: 'Listen to the word, then type it.',
      points: 1,
      attempts: 1,
      partial: false,
      reveal: true,
      hints: [],
      feedbackCorrect: 'Correct.',
      feedbackIncorrect: 'Not correct.',
      feedbackOutOfTries: 'Not correct.',
      blanks: [{ id: 'b1', label: 'Your spelling', answers: w.accept, spelling: true, usSpelling: true }],
      serverMarked: true,
      retake: { limit: 2, keep: 'best' },
      report: null,
    });
    const frame = page.children.find((c) => c.id === id) as FrameNode;
    frame.width = at.width;
    frame.name = `Word ${n} question`;
    frame.layout = { ...frame.layout!, padding: { top: 20, right: 24, bottom: 20, left: 24 } };
    //One try at a word, and no Try again: a retake starts the whole test again from the last page
    const reset = partsOf(frame).reset?.[0];
    const row = partsOf(frame).buttons?.[0] as FrameNode | undefined;
    if (reset && row) row.children = row.children.filter((x) => x.id !== reset.id);
    syncQuestion(project, page.id, id);
    brandQuestionFrame(ctx, frame);
    pages.push(page);
    frames.push(frame);
  });

  const result = brandedPage(ctx, 'Your result', { footer: 'Spelling test' });

  WORDS.forEach((_, i) => {
    const page = pages[i];
    const prefix = `q${i + 1}`;
    const nextButton = button(ctx, 'Next button', i === OUT_OF - 1 ? 'See my score' : 'Next', page.width - 48 - 170, 30, 170);
    const backButton = button(ctx, 'Back button', 'Back', page.width - 48 - 170 - 12 - 110, 30, 110, false);
    bind(nextButton, { disabled: `!${prefix}_locked`, opacity: `${prefix}_locked ? 1 : 0.5` });
    page.children.push(backButton, nextButton);
    const g = graph(page);
    const toNext = click(g, nextButton, 'Navigation');
    g.run(toNext, go(i === OUT_OF - 1 ? result : pages[i + 1]));
    const toBack = click(g, backButton, 'Navigation');
    g.run(toBack, go(i === 0 ? hero : pages[i - 1]));
    //The word: Play sound with no sound picked yet. The question's Voice section fills it (Make the audio with a voice), or the author picks a recording
    const toPlay = click(g, plays[i], 'Say the word');
    const sound = g.run(toPlay, ['action.sound', { asset: '', volume: 1 }]);
    const q = frames[i].question!;
    frames[i].question = { ...q, voice: { voice: 'bf_emma', speed: 0.9, twice: true, node: sound.id } };

    //Add this word's score to this go's total once it is finished
    const check = page.logic.nodes.find((x) => x.kit?.slot === 'check:action') as LogicNode;
    after(page, check, 'action.setVariable', { variable: total.id, op: 'add', value: `${prefix}_score` }, 'finished');

    //Coming back to a finished word keeps it as it was; an unfinished one starts fresh (and the server says where it stands)
    const begin = page.logic.nodes.find((x) => x.kit?.slot === 'start:event') as LogicNode;
    const deal = page.logic.nodes.find((x) => x.kit?.slot === 'start:action') as LogicNode;
    page.logic.edges = page.logic.edges.filter((e) => !(e.from === begin.id && e.to === deal.id));
    const guard = after(page, begin, 'logic.if', { condition: `!${prefix}_locked` });
    guard.x = begin.x + 160;
    guard.y = begin.y + 55;
    page.logic.edges.push(edge(guard, deal, 'true'));
    guard.note = 'Only deal the word again when it is not finished';
  });

  //Hero: Start goes to word 1
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(pages[0]));
  }

  //The result page: this go, what is on record (once the server has marked), the message, how each word went, and Retake
  const body = box(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 380, 250);
  const scoreLabel = text(ctx, 'Score label', 'This go', body.x + 28, body.y + 26, 320, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{Math.round(total * 10) / 10} / {outOf}', body.x + 28, body.y + 62, 330, { fontSize: 72, fontWeight: 700, lineHeight: 1.1 });
  const onRecord = text(ctx, 'On record', '{q1_keptMax > 0 ? "On record: " + q1_kept + " out of " + q1_keptMax : ""}', body.x + 28, body.y + 168, 330, { fontSize: 20, fontWeight: 600, color: L.muted });
  const goNumber = text(ctx, 'Go number', '{q1_keptMax > 0 ? "Go " + q1_round + (q1_retakesLeft >= 0 ? " of " + (q1_round + q1_retakesLeft) : "") : ""}', body.x + 28, body.y + 204, 330, { fontSize: 16, color: L.muted });
  const percent = '(q1_keptMax > 0 ? q1_kept / q1_keptMax : total / outOf) * 100';
  const passing = `${percent} >= passPercent`;
  const message = bind(text(ctx, 'Result message', `{${passing} ? passMessage : failMessage}`, body.x + 420, body.y + 24, body.width - 420, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 }), {
    color: `${passing} ? "${L.success}" : "${L.error}"`,
  });
  const retake = bind(button(ctx, 'Retake button', 'Take the test again', body.x + 420, body.y + 190, 240), { visible: 'q1_retakesLeft != 0' });
  result.children.push(scoreCard, scoreLabel, scoreText, onRecord, goNumber, message, retake);
  const chipW = (body.width - (OUT_OF - 1) * 16) / OUT_OF;
  WORDS.forEach((_, i) => {
    const prefix = `q${i + 1}`;
    const chip = createNode('frame', {
      name: `Word ${i + 1} result`,
      x: body.x + i * (chipW + 16),
      y: body.y + 286,
      width: chipW,
      height: 92,
      cornerRadius: 14,
      fill: solid(L.surface),
      stroke: stroke(L.border, 1.5),
      clip: false,
      role: 'region',
      children: [
        text(ctx, 'Chip title', `Word ${i + 1}`, 14, 14, chipW - 28, { fontSize: 15, fontWeight: 600, color: L.muted }),
        text(ctx, 'Chip result', `{${prefix}_score >= 1 ? "Right" : "Not right"}`, 14, 42, chipW - 28, { fontSize: 20, fontWeight: 700 }),
      ],
    });
    bind(chip, {
      'fill.color': `${prefix}_score >= 1 ? "${L.successSurface}" : "${L.errorSurface}"`,
      'stroke.paint.color': `${prefix}_score >= 1 ? "${L.success}" : "${L.error}"`,
      ariaLabel: `"Word ${i + 1}: " + (${prefix}_score >= 1 ? "right" : "not right")`,
    });
    result.children.push(chip);
  });
  {
    const g = graph(result);
    //Retake asks the server to start the next round of every word (a page without a server just clears the question), then starts over
    g.run(click(g, retake, 'Retake'), ['action.questionReset', { question: frames[0].id, next: true, retake: true }], ['action.startOver', {}]);
    const arrive = g.event('event.start', {}, 'Result page');
    g.run(arrive, announce(`"You scored " + Math.round(total * 10) / 10 + " out of " + outOf + ". " + (${passing} ? passMessage : failMessage)`));
  }

  //Results settings: reported from the server's own marking when played from the Link for StudyDesk or an LTI 1.3 link
  project.settings.reporting = { scoreVariable: total.id, maxScore: OUT_OF, passMark: 80, completion: 'artboard', completionArtboard: result.id };

  const checklist: TemplateChecklistItem[] = [
    item('Change the test title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    ...frames.map((f, i) => item(`Word ${i + 1}: in the Question section, type the accepted spellings of the word, one per line. Then, under Voice for the word, leave Word audio on Made with a voice and press Make the audio with a voice: it speaks the word and puts the sound in the Play sound node of the Play the word button (Interactions tab). Or set Word audio to My own audio and pick a sound from Assets, upload one or record it there: it goes in the same node, and switching back keeps both files. The word must be nowhere else: not in a layer name, the prompt, a label or the name of your audio file`, f, pages[i])),
    item('Make all six at once: under Voice for the word, choose the voice and speed, then Make the audio for all words (words set to My own audio are skipped). Preview a few first. When a word comes out wrong, type how it sounds in Say it like (cull er for colour), which is only used to make the audio and never reaches the page, and make that word again. The server makes the speech once, here: the learner\'s page only has the sound. Listen to every word before you share', frames[0], pages[0]),
    item('Audio made with the voice is a plain wav with no tags, and the share link renames it. For your own audio, use mp3 or wav: the share link cuts out their title and comment tags, but other kinds of audio keep theirs, and the share tells you', plays[0], pages[0]),
    item('American spellings: each word has Also accept American spellings on. The Question section lists the forms it adds, so check them. Turn it off for a test of British or Australian spelling only, or add any form it does not know as its own line', frames[0], pages[0]),
    item('Retakes and score kept: in the Marking part of each word\'s Question section (set them the same on every word). The starter allows 2 retakes and keeps the best round. Choose Unlimited, or Off, and Latest round if the last go should be the mark', frames[0], pages[0]),
    item('To add a word: duplicate a word page and, in its Question section, give it a prefix of its own (q7) and make it independent. Then fix its footer, the Back and Next buttons of the pages either side, the Set variable node that adds its score, a result tile, and change the "outOf" variable and Project > Results and progress > Top score', undefined, pages[1]),
    item('Reword the pass and fail messages (passMessage and failMessage in the Variables tab), and change the pass mark: the passPercent variable and Project > Results and progress > Pass mark (keep them the same)', message, result),
    item('Share it: Share > Update to the latest version takes the accepted spellings out of the page, and the server marks. Preview and exported files still have them. Use the Link for StudyDesk, or add the project to a course over LTI 1.3 with a grade, to have the score recorded and sent to the gradebook', undefined, result),
    item('A practice version, not a graded test: tick Practice mode under Voice for the word and the learner\'s own device voice reads the word. That puts the word in the page, where anyone can read it, so the question is marked in the page and sends no grade. Do not use it for an assessed test', undefined, hero),
    item('Plan for learners who cannot hear the words: a transcript would give the answers away, so arrange an alternative assessment the way your course normally does', undefined, hero),
  ];
  return { project: ctx.project, checklist };
}
