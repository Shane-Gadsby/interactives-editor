import { createNode, defaultAutoLayout, type Artboard, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../../question-kit';
import { brandedPage, brandedProject, button, contentBox, item, solid, stroke, text } from '../../kit';
import { stack } from '../../parts';
import type { Colourway } from '../../looks';
import { announce, bind, brandQuestionFrame, click, goNext, graph, heroPage, noteBelow, questionNav, scorePage, variable } from './shared';

//Words with an American spelling to accept and a few without. The words only live in each question's accepted spellings: nothing
//else in the project says them, so the share link (which takes those out and marks on the server) has none of them in the page.
//The audio comes from the Voice section of each question (a synthesised voice, made while authoring, saved as a sound asset).
const WORDS: { accept: string[] }[] = [{ accept: ['colour'] }, { accept: ['organise'] }, { accept: ['neighbour'] }, { accept: ['centre'] }, { accept: ['necessary'] }, { accept: ['separate'] }];

export function buildSpellingTest(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Spelling test');
  const { project, L } = ctx;
  const box = (p: Artboard) => contentBox(p);

  //The pass and fail wording the result page picks from. The score and the pass mark come from the quiz itself (`quiz.score`, `quiz.max`, `quiz.passMark`)
  variable(project, 'passMessage', 'string', 'You passed. Well spelled.');
  variable(project, 'failMessage', 'string', 'Not a pass this time. Listen to the words again and have another go.');

  const { page: hero, start } = heroPage(ctx, 'Spelling test', 'Listen to each word and type it. Every letter counts, and you can play a word as many times as you like.', 'Start the test');
  const pages: Artboard[] = [];
  const frames: FrameNode[] = [];
  const plays: SceneNode[] = [];

  WORDS.forEach((w, i) => {
    const n = i + 1;
    //The footer counts the word pages from the page order
    const page = brandedPage(ctx, `Word ${n}`, { footer: 'Word {pageNumber - 1} of {pageCount - 2}' });
    const at = box(page);
    //The play button sits above the question, so the word is the first thing a learner reaches
    const play = button(ctx, 'Play word button', 'Play the word', 0, 0, 220);
    play.ariaLabel = `Play word ${n}`;
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
      //a block until a spell checker or writing tool is turned off, and no pasting: see Spell checkers and writing tools in the help
      guard: { mode: 'block', spellcheck: true, paste: true },
      //coming back to a word keeps it as it was (the server says where it stands), and a retake starts the next round from the result page
      keep: true,
      hideReset: true,
      report: null,
    });
    const frame = page.children.find((c) => c.id === id) as FrameNode;
    frame.width = at.width;
    frame.name = `Word ${n} question`;
    frame.layout = { ...frame.layout!, padding: { top: 20, right: 24, bottom: 20, left: 24 } };
    brandQuestionFrame(ctx, frame);
    page.children = page.children.filter((c) => c.id !== id);
    page.children.push(stack('Word body', at.x, at.y, at.width, { gap: 16, align: 'start', children: [play, frame] }));
    pages.push(page);
    frames.push(frame);
  });

  const result = brandedPage(ctx, 'Your result', { footer: 'Spelling test' });

  WORDS.forEach((_, i) => {
    const page = pages[i];
    questionNav(ctx, page, `q${i + 1}`);
    //The word: Play sound with no sound picked yet. The question's Voice section fills it (Make the audio with a voice), or the author picks a recording
    const g = graph(page);
    const sound = g.run(click(g, plays[i], 'Say the word'), ['action.sound', { asset: '', volume: 1 }]);
    const q = frames[i].question!;
    frames[i].question = { ...q, voice: { voice: 'bf_emma', speed: 0.9, twice: true, node: sound.id } };
  });

  //Hero: Start goes to word 1
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  //The result page: the score that counts (the quiz's own: the server's record once it has marked), which go it was, the message, how each word went, and Retake
  const goNumber = text(ctx, 'Go number', '{q1_keptMax > 0 ? "Go " + q1_round + (q1_retakesLeft >= 0 ? " of " + (q1_round + q1_retakesLeft) : "") : ""}', 0, 0, 100, { fontSize: 16, color: L.muted });
  const retake = bind(button(ctx, 'Retake button', 'Take the test again', 0, 0, 240), { visible: 'q1_retakesLeft != 0' });
  const chip = createNode('frame', {
    name: 'Word result',
    x: 0,
    y: 0,
    width: 100,
    height: 92,
    cornerRadius: 14,
    fill: solid(L.surface),
    stroke: stroke(L.border, 1.5),
    clip: false,
    role: 'region',
    layoutItem: { width: 'fill' },
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 14, right: 14, bottom: 14, left: 14 }, align: 'stretch', hugHeight: true },
    children: [
      text(ctx, 'Chip title', '{item.page}', 0, 0, 100, { fontSize: 15, fontWeight: 600, color: L.muted }),
      text(ctx, 'Chip result', '{item.score >= item.points ? "Right" : "Not right"}', 0, 0, 100, { fontSize: 20, fontWeight: 700 }),
    ],
  } as never);
  bind(chip, {
    'fill.color': `item.score >= item.points ? "${L.successSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `item.score >= item.points ? "${L.success}" : "${L.error}"`,
    ariaLabel: 'item.page + ": " + (item.score >= item.points ? "right" : "not right")',
  });
  //one tile for each word, from the quiz's own list
  const tiles = createNode('frame', {
    name: 'Word results',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    role: 'list',
    ariaLabel: 'How each word went',
    layout: { ...defaultAutoLayout('row'), gap: 16, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'quiz.questions', layout: 'none', gap: 0, columns: 1 },
    children: [chip],
  } as never);
  const { message } = scorePage(ctx, result, {
    label: 'Your score',
    score: '{Math.round(quiz.score * 10) / 10} / {quiz.max}',
    scoreSize: 72,
    lines: [goNumber],
    message: '{quiz.passed ? passMessage : failMessage}',
    messageColor: `quiz.passed ? "${L.success}" : "${L.error}"`,
    buttons: [retake],
    below: [tiles],
  });
  {
    const g = graph(result);
    //Retake asks the server to start the next round of every word (a page without a server just clears the question), then starts over
    g.run(click(g, retake, 'Retake'), ['action.questionReset', { question: frames[0].id, next: true, retake: true }], ['action.startOver', {}]);
    const arrive = g.event('event.start', {}, 'Result page');
    g.run(arrive, announce('"You scored " + Math.round(quiz.score * 10) / 10 + " out of " + quiz.max + ". " + (quiz.passed ? passMessage : failMessage)'));
  }

  //Results settings: reported from the server's own marking when played from the Link for StudyDesk or an LTI 1.3 link
  project.settings.reporting = { scoreFrom: 'questions', passMark: 80, completion: 'artboard', completionArtboard: result.id };

  noteBelow(pages[0], { text: '**Guard** Each word is set to block until a spell checker or writing tool is turned off, and to refuse pasting. [ ] Read "Spell checkers and writing tools" in the help before you share it.', colour: 'rose' });
  noteBelow(pages[0], { x: 456, text: '[ ] Press Make the audio with a voice in each word\'s Voice section, or pick your own recording. The word must be nowhere else in the page.', colour: 'gold' });
  noteBelow(result, { text: '**Quiz totals** The score is `quiz.score` out of `quiz.max`, which is the server\'s record once it has marked, and the tiles are a repeater over `quiz.questions`. Which go it was comes from the retake variables.', colour: 'sky' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the test title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    ...frames.map((f, i) => item(`Word ${i + 1}: in the Question section, type the accepted spellings of the word, one per line. Then, under Voice for the word, leave Word audio on Made with a voice and press Make the audio with a voice: it speaks the word and puts the sound in the Play sound node of the Play the word button (Interactions tab). Or set Word audio to My own audio and pick a sound from Assets, upload one or record it there: it goes in the same node, and switching back keeps both files. The word must be nowhere else: not in a layer name, the prompt, a label or the name of your audio file`, f, pages[i])),
    item('Make all six at once: under Voice for the word, choose the voice and speed, then Make the audio for all words (words set to My own audio are skipped). Preview a few first. When a word comes out wrong, type how it sounds in Say it like (cull er for colour), which is only used to make the audio and never reaches the page, and make that word again. The server makes the speech once, here: the learner\'s page only has the sound. Listen to every word before you share', frames[0], pages[0]),
    item('Audio made with the voice is a plain wav with no tags, and the share link renames it. For your own audio, use mp3 or wav: the share link cuts out their title and comment tags, but other kinds of audio keep theirs, and the share tells you', plays[0], pages[0]),
    item('American spellings: each word has Also accept American spellings on. The Question section lists the forms it adds, so check them. Turn it off for a test of British or Australian spelling only, or add any form it does not know as its own line', frames[0], pages[0]),
    item('Retakes and score kept: in the Marking part of each word\'s Question section (set them the same on every word). The starter allows 2 retakes and keeps the best round. Choose Unlimited, or Off, and Latest round if the last go should be the mark', frames[0], pages[0]),
    item('To add a word: duplicate a word page and, in its Question section, press Make this one independent. The footer, Back and Next, the total and the result tiles all follow the page order and the questions', undefined, pages[1]),
    item('Spell checkers and writing tools: each word is set to Block until a writing tool is turned off and to refuse paste (the "Spell checkers and writing tools" section of the Question section, set the same on every word). Read the help topic of that name for what it can and cannot see, set an Exemption code for a learner who relies on assistive technology that looks like a writing tool, and tell learners to turn their spell checker off for this site before they start', frames[0], pages[0]),
    item('Reword the pass and fail messages (passMessage and failMessage in the Variables tab), and change the pass mark: Project > Results and progress > Pass mark. The result page and the score sent both read it', message, result),
    item('Share it: Share > Update to the latest version takes the accepted spellings out of the page, and the server marks. Preview and exported files still have them. Use the Link for StudyDesk, or add the project to a course over LTI 1.3 with a grade, to have the score recorded and sent to the gradebook', undefined, result),
    item('A practice version, not a graded test: tick Practice mode under Voice for the word and the learner\'s own device voice reads the word. That puts the word in the page, where anyone can read it, so the question is marked in the page and sends no grade. Do not use it for an assessed test', undefined, hero),
    item('Plan for learners who cannot hear the words: a transcript would give the answers away, so arrange an alternative assessment the way your course normally does', undefined, hero),
  ];
  return { project: ctx.project, checklist };
}
