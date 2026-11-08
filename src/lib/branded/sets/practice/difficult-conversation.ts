//Difficult conversation rehearsal: built on the branching scenario. Each scene shows the other person (a picture, who they are, how they feel), their
//line with its transcript (and an optional audio slot), and asks the learner to say a reply out loud (or type it). Then it shows an expert reply and the
//author's framework as a checklist the learner ticks, and the learner picks the branch that fits how it went: the other person calms or gets tenser.
//Retrying a scene is one button. It is rehearsal, never assessment: nothing is scored, marked or sent anywhere.
//
//OPTIONAL RECORDING (the media bridge): the starter does not declare the microphone, so as shipped it records nothing and the record layers never show. An
//author ticks Microphone in Project > Microphone and camera and every scene page gets a "Recording step" under the typed reply box (Record, then Stop
//recording, then Play mine) and a "Play my recording" button beside the expert reply on the review stage. They show only while the microphone is ready, so
//a learner who says no, has no device or chooses "Do not use my microphone or camera" rehearses as before (say it aloud, or type it). Record is one Start or stop
//node, Play mine says Stop while it plays, and the framework is a tick list with one Toggle in list step. It is off by default
//because a hard conversation is exactly the kind of thing people want to rehearse without being asked for the microphone, and because a course page that
//does not allow it would show a step that cannot work. One recording name ("reply") serves every scene: it is dropped when the next scene or a retry opens.
import { createNode, type Artboard, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, brandedPage, brandedProject, button, byName, card, contentBox, heading, picture, stroke, text, todo, type BrandedStarter, type LayoutState } from '\.\./\.\./kit';
import { BRAND_FONT, type Colourway } from '../../looks';
import { Graph, addVar, announce, bind, darkButton, go, goNext, graphNote, heroPage, resetVars, set, setVar, tickList, toggleItem } from '../media/shared';
import { MIC_READY, dropTakeWhen, labelled, playLabel, playToggle, rec, recordLabel, recordStatus, recordToggle } from './recording';

//The framework the learner ticks against: a simple four point one for the sample, ISBAR (identify, situation, background, assessment, recommendation) fits a handover
const FRAMEWORK = ['Acknowledged how they feel before anything else', 'Checked what is actually going on', 'Said clearly what you can and cannot do', 'Agreed a next step with a date'];

interface SceneCfg {
  /** The other person's name, how they are described and how they feel right now */
  who: string;
  role: string;
  mood: string;
  line: string;
  expert: string;
  /** Where each answer to "how did it land" goes: another scene, or the ending */
  calmTo: Artboard | 'ending';
  tenseTo: Artboard | 'ending';
}

const RIGHT_X = 400;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Difficult conversation rehearsal');
  const { project, L } = ctx;
  const stage = addVar(project, 'stage', 'string', 'reply');
  const typing = addVar(project, 'typing', 'boolean', false);
  const reply = addVar(project, 'reply', 'string', '');
  const ticked = addVar(project, 'ticked', 'list', []);
  addVar(project, 'framework', 'list', FRAMEWORK);
  const calm = addVar(project, 'calm', 'number', 0);
  const tense = addVar(project, 'tense', 'number', 0);
  const tries = addVar(project, 'tries', 'number', 0);
  const path = addVar(project, 'path', 'string', '');
  //Live: how the conversation went, said once for the outcome and the headline on the last page
  addVar(project, 'verdict', 'string', 'mixed', { formula: 'calm > tense ? "settled" : calm == tense ? "mixed" : "tense"', live: true });
  //Set to true once the scenes have audio: it shows the Play their line buttons. Every audio line still needs its transcript
  addVar(project, 'audioLines', 'boolean', false);

  const hero = heroPage(ctx, 'Rehearse a hard conversation', 'Say your reply out loud, compare it with an expert reply, and see where the conversation goes. Practice only: nothing is marked, saved or sent.');
  const first = brandedPage(ctx, 'Alex asks for more time', { footer: 'Rehearsal, not assessed' });
  const calmer = brandedPage(ctx, 'Alex, a little calmer', { footer: 'Rehearsal, not assessed' });
  const tenser = brandedPage(ctx, 'Alex, still frustrated', { footer: 'Rehearsal, not assessed' });
  const ending = brandedPage(ctx, 'How the conversation went', { kind: 'end', name: 'Ending' });
  const checklist: TemplateChecklistItem[] = [];

  const intro = hero.page.children.find((n) => n.name === 'Subtitle')!;
  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(todo('Write the title and say it is practice, not assessed', 'Write the title and the line under it on the first page. Keep it clear that this is practice and not assessed', intro, hero.page));

  /** The reply, review and branch stages on one page. Returns the layers the checklist points at. */
  const scene = (page: Artboard, cfg: SceneCfg) => {
    const box = contentBox(page);
    const rx = box.x + RIGHT_X;
    const rw = box.width - RIGHT_X;

    //Who is speaking
    const pic = picture(ctx, 'Character picture', box.x, box.y, 120, 120);
    const who = heading(ctx, 'Character name', cfg.who, box.x + 136, box.y + 6, 240, { fontSize: 24 });
    const role = text(ctx, 'Character role', cfg.role, box.x + 136, box.y + 40, 240, { fontSize: 15, color: L.muted });
    const mood = text(ctx, 'Character mood', cfg.mood, box.x + 136, box.y + 80, 240, { fontSize: 16, fontWeight: 600 });
    const scenes = text(ctx, 'Scene number', 'Scene {calm + tense + 1}', box.x + 136, box.y + 100, 240, { fontSize: 13, color: L.muted });

    //Their line, always with its transcript. The text IS the transcript, so audio never stands alone
    const bubble = card(ctx, 'Line panel', box.x, box.y + 132, 380, 168);
    const label = text(ctx, 'Transcript label', `${cfg.who} says (transcript):`, box.x + 20, box.y + 144, 340, { fontSize: 13, fontWeight: 700, color: L.muted });
    const line = text(ctx, 'Their line', cfg.line, box.x + 20, box.y + 168, 340, { fontSize: 18, lineHeight: 1.4 });
    //Optional audio slot: the Play sound node in this button's flow has no sound until the author picks one. Hidden until audioLines is true
    const audio = bind(button(ctx, 'Play their line', 'Play their line', box.x, box.y + 312, 200, false), { visible: 'audioLines', disabled: 'soundPlaying()', label: 'soundPlaying() ? "Playing…" : "Play their line"' });
    audio.ariaLabel = `Play ${cfg.who}'s line as audio`;

    //Their reply, shown back in review once the learner has typed one
    const mine = bind(card(ctx, 'Your reply panel', box.x, box.y + 366, 380, 100), { visible: 'stage == "review" && reply.trim() != ""' });
    const mineLabel = bind(text(ctx, 'Your reply label', 'Your reply', box.x + 20, box.y + 376, 340, { fontSize: 13, fontWeight: 700, color: L.muted }), { visible: 'stage == "review" && reply.trim() != ""' });
    const mineText = bind(text(ctx, 'Your reply text', '{reply}', box.x + 20, box.y + 398, 340, { fontSize: 15, lineHeight: 1.3, autoSize: 'none', height: 62, overflow: 'ellipsis' }), { visible: 'stage == "review" && reply.trim() != ""' });

    //Stage 1: say it out loud (or type it)
    const sayHead = heading(ctx, 'Reply heading', 'Say your reply out loud', 0, 0, rw, { fontSize: 24 });
    const sayHelp = text(ctx, 'Reply help', `Say what you would really say to ${cfg.who}, in your own words, out loud. Nobody else hears it.{${MIC_READY} ? " You can record yourself and play it back. The recording stays on this device." : " Nothing is recorded."} Use made-up details, never a real person's name or story.`, 0, 44, rw, { fontSize: 17, lineHeight: 1.4 });
    const typeToggle = bind(button(ctx, 'Type instead', 'Type it instead', 0, 150, 240, false), { label: 'typing ? "Say it aloud instead" : "Type it instead"' });
    typeToggle.ariaLabel = 'Switch between saying your reply aloud and typing it';
    const replyBox = createNode('input', {
      name: 'Reply box',
      ...lookDefaults(project, 'input'),
      inputType: 'textarea',
      placeholder: 'Type your reply here',
      ariaLabel: `Your reply to ${cfg.who}`,
      variableId: reply.id,
      x: 0,
      y: 206,
      width: rw,
      height: 130,
      cornerRadius: 12,
      fontSize: 17,
      fontFamily: BRAND_FONT,
      stroke: stroke(L.border, 2),
    });
    bind(replyBox, { visible: 'typing' });
    //The recording step: optional, there only while the microphone is ready (see the note at the top of this file)
    const record = bind(button(ctx, 'Record my reply', 'Record my reply', 0, 0, 190, false), { label: recordLabel('reply', 'Record my reply') });
    record.ariaDescription = 'Records your voice. Asks you first, the first time. The recording stays on this device.';
    const playMine = bind(button(ctx, 'Play mine', 'Play mine', 200, 0, 140, false), { label: playLabel('reply', 'Play mine'), ariaLabel: `${rec('reply').playing} ? "Stop my recorded reply" : "Play my recorded reply"`, visible: rec('reply').has, disabled: rec('reply').recording });
    const recStatus = text(ctx, 'Record status', `{${recordStatus('reply', 'Optional. Not recorded.')}}`, 352, 2, rw - 352, { fontSize: 13, lineHeight: 1.3, color: L.muted, autoSize: 'none', height: 44 });
    const slot = bind(createNode('frame', { name: 'Recording step', x: 0, y: 350, width: rw, height: 48, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Record your reply', children: [record, playMine, recStatus] }) as FrameNode, { visible: MIC_READY });
    //On the review stage the take plays again beside the expert reply, under their line
    const playReview = bind(button(ctx, 'Play my recording', 'Play my recording', box.x + 210, box.y + 312, 170, false), { label: playLabel('reply', 'Play my recording'), visible: `stage == "review" && ${MIC_READY} && ${rec('reply').has}` });
    const compare = button(ctx, 'Compare with the expert', 'Compare with the expert reply', 0, 408, 330, true);
    const replyStage = createNode('frame', { name: 'Reply stage', x: rx, y: box.y, width: rw, height: box.height, fill: null, stroke: null, clip: false, children: [sayHead, sayHelp, typeToggle, replyBox, slot, compare] }) as FrameNode;
    bind(replyStage, { visible: 'stage == "reply"' });

    //Stage 2: the expert reply, the framework to tick, and how it landed
    const expHead = heading(ctx, 'Expert heading', 'An expert might say', 0, 0, rw, { fontSize: 20 });
    const expCard = card(ctx, 'Expert panel', 0, 28, rw, 108);
    const expert = text(ctx, 'Expert reply', cfg.expert, 16, 38, rw - 32, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: 92 });
    const frameHead = heading(ctx, 'Framework heading', 'What a good reply includes. Tick what you covered.', 0, 146, rw, { fontSize: 17 });
    const { list: rows, row } = tickList(ctx, 'Framework', 'Framework row', 0, 172, rw, { items: 'framework', ticked, ariaLabel: 'What a good reply includes', rows: 5, background: false });
    const status = text(ctx, 'Ticked count', 'You ticked {ticked.length} of {framework.length}. Now say how it landed.', 0, 370, rw - 196, { fontSize: 15, color: L.muted });
    const retry = button(ctx, 'Try this scene again', 'Try again', rw - 180, 362, 180, false);
    retry.ariaLabel = 'Try this scene again with a different reply';
    const calmBtn = button(ctx, 'It calms them', 'It calms them down', 0, 412, (rw - 10) / 2, true);
    const tenseBtn = button(ctx, 'It makes it tenser', 'It makes it tenser', (rw - 10) / 2 + 10, 412, (rw - 10) / 2, false);
    const reviewStage = createNode('frame', { name: 'Review stage', x: rx, y: box.y, width: rw, height: box.height, fill: null, stroke: null, clip: false, children: [expHead, expCard, expert, frameHead, rows, status, retry, calmBtn, tenseBtn] }) as FrameNode;
    bind(reviewStage, { visible: 'stage == "review"' });

    page.children.push(pic, who, role, mood, scenes, bubble, label, line, audio, playReview, mine, mineLabel, mineText, replyStage, reviewStage);

    const g = new Graph(page);
    const fresh = (): [string, Record<string, unknown>][] => [resetVars(stage, typing, reply, ticked)];
    g.run(g.start('A fresh scene'), ...fresh());

    //Audio slot: pick the sound for this line in the node below. Nothing plays until one is chosen.
    g.run(g.click(audio, 'Play their line (pick the sound in the next node)'), ['action.sound', { asset: '', volume: 1 }]);

    //The optional recording: Record or Stop, Play mine in the reply stage, and the same take again on the review stage. A fresh scene or a retry drops it
    recordToggle(g, record, 'reply', 'Record my reply, or stop');
    playToggle(g, playMine, 'reply', 'Play or stop mine');
    playToggle(g, playReview, 'reply', 'Play or stop my recording');
    dropTakeWhen(g, stage, 'reply', 'stage == "reply"', 'Drop the take when a scene or a retry opens');
    g.gap(40);

    g.run(g.click(typeToggle, 'Type instead, or say it aloud'), set(typing, '!typing'), announce('typing ? "Typed reply box shown." : "Typed reply box hidden. Say your reply aloud."'));
    g.run(g.click(compare, 'Show the expert reply'), set(stage, '"review"'), announce('"The expert reply and the checklist are shown. Tick what you covered, then say how it landed."'));

    g.run(g.click(row, 'Tick or untick a point'), toggleItem(ticked, 'event.index'));

    g.run(g.click(retry, 'Try this scene again'), setVar(tries, '1', 'add'), ...fresh(), announce('"Try this scene again. Say a different reply out loud."'));

    const branch = (btn: SceneNode, note: string, counter: typeof calm, word: string, to: Artboard | 'ending') =>
      g.run(g.click(btn, note), setVar(counter, '1', 'add'), set(path, `path ? path + " > ${word}" : "${word}"`), go(to === 'ending' ? ending : to));
    branch(calmBtn, 'It calms them down', calm, 'calmer', cfg.calmTo);
    branch(tenseBtn, 'It makes it tenser', tense, 'tenser', cfg.tenseTo);
    graphNote(page, { anchor: labelled(page, /^A fresh scene$/), colour: 'sky', text: '**A scene opens and a retry resets the same way:** one Reset variables clears the stage, the typed reply and the ticks. Retry also adds to `tries`, which the ending reads.' });
    graphNote(page, { anchor: labelled(page, /^Play their line/), colour: 'sky', text: '[ ] **Pick the sound for this line** in the Play sound node after this button. Then set `audioLines` to true, which is what shows the button.' });
    graphNote(page, { anchor: labelled(page, /^Record my reply, or stop$/), colour: 'sky', text: '**Recording is off as shipped:** it needs Microphone ticked in Project > Microphone and camera. One recording name serves every scene, and the last flow drops the take when the next scene or a retry opens.' });
    graphNote(page, { anchor: labelled(page, /^It calms them down$/), colour: 'sky', text: '**A branch counts and leaves a trail:** `calm` or `tense` goes up and `path` grows by "calmer" or "tenser". The live `verdict` on the ending compares the two. [ ] Where each branch goes is set per scene.' });
    return { pic, who, line, expert, rows, slot, calmBtn, audio };
  };

  const a = scene(first, {
    who: 'Alex',
    role: 'A first-year student, upset about an assignment',
    mood: 'Right now: upset',
    line: 'I have been trying to finish this for two weeks and I just cannot. I need more time. Honestly I am not sure it is even worth submitting any more.',
    expert: 'It sounds like these two weeks have been really hard, Alex, and I am glad you came to talk about it. Can you tell me what has got in the way? Then we can look at what I can offer, and agree what happens by Friday.',
    calmTo: calmer,
    tenseTo: tenser,
  });
  scene(calmer, {
    who: 'Alex',
    role: 'A first-year student, worried about the next step',
    mood: 'Right now: calmer, but worried',
    line: 'Okay. It is mostly that my work shifts changed and I lost the days I planned to study. What can I actually do?',
    expert: 'Thank you for telling me. An extension is possible, and I can also point you to the study support team about your timetable. Would a new due date of next Friday work, and shall we check in on Wednesday?',
    calmTo: 'ending',
    tenseTo: tenser,
  });
  scene(tenser, {
    who: 'Alex',
    role: 'A first-year student, feeling unheard',
    mood: 'Right now: frustrated',
    line: 'You are not listening. Everyone just says the same thing. Just give me the extension and let me get on with it.',
    expert: 'You are right that I have not understood yet, and I am sorry. Let me stop and listen. What is the one thing that would help most right now? Then I will tell you what I can do today.',
    calmTo: 'ending',
    tenseTo: 'ending',
  });

  checklist.push(
    todo('Write each scene: the other person and what they say', 'Write each scene: who the other person is (picture, name, role and mood on the left of every scene page) and what they say in "Their line". That text is the transcript, so keep it even if you add audio', a.line, first),
    todo('Swap the grey character picture for your own', 'Swap the grey Character picture for your own, on every scene page, and give it a short description in the inspector', a.pic, first),
    todo('Add audio for each line if you want it', 'Optional audio: add a recording of the line as a sound, pick it in the "Play sound" node after "Play their line" (Interactions tab), then set Project > Variables > "audioLines" to true. The button is hidden until then', a.audio, first),
    todo('Write the framework learners tick', 'Write the framework learners tick: Project > Variables > "framework" (one point per line, up to five). The sample has four. For a clinical handover use ISBAR: Identify, Situation, Background, Assessment, Recommendation', a.rows, first),
    todo('Write the expert reply on each scene page', 'Write the expert reply on each scene page ("Expert reply"). Say it the way you would want to hear it, not as the only right answer', a.expert, first),
    todo('Set where each answer goes', 'Set where each answer goes: the two buttons on the review stage ("It calms them down" and "It makes it tenser") each end in a Go to page node. Add a scene by duplicating a scene page and pointing a button at it, or send both to the Ending', a.calmBtn, first),
    todo('Write what the three endings say', 'Write what the three outcomes on the Ending page say (settled, mixed, still tense). They read how many scenes calmed and how many got tenser', byName(ending, 'Outcome'), ending),
    todo('Keep it rehearsal: no marks, no real names', 'Keep it rehearsal: the starter scores nothing and says so. Do not turn the ticks into a mark, and keep scenario wording free of real people\'s names and details (the "Reply help" text says so)', a.rows, first),
    todo('Decide whether to offer recording', 'OPTIONAL RECORDING: it is off as shipped, so nothing is recorded and the "Recording step" layer on each scene page never shows. To offer it, tick Microphone in Project > Microphone and camera and write the one-sentence purpose that fills in "It is used to ...". Then every scene gets Record my reply and Play mine under the typed reply box, and Play my recording beside the expert reply, for learners whose microphone works. Anyone who says no, has no microphone or chooses "Do not use my microphone or camera" rehearses as before. The recording stays in the learner\'s browser, is dropped when the next scene or a retry opens, and is never sent', a.slot, first),
  );

  //The ending
  const outcome = text(
    ctx,
    'Outcome',
    '{verdict == "settled" ? "You listened first and gave them a clear way forward, so they could take it in. Notice what worked and say it again next time." : verdict == "mixed" ? "Some of it landed. Rehearse the scene that went tenser and try a different opening." : "It stayed difficult, which is normal for a hard conversation. Go back, try the scenes again, and tick honestly what you left out."}',
    112,
    396,
    800,
    { align: 'center', color: L.onGradient, fontSize: 18, lineHeight: 1.4 },
  );
  const result = text(ctx, 'Result', '{verdict == "settled" ? "The conversation settled" : verdict == "mixed" ? "A mixed result" : "Still tense"}   Scenes: {calm + tense}   Retries: {tries}', 112, 468, 800, { align: 'center', color: L.onGradient, fontSize: 18, fontWeight: 700 });
  const trail = text(ctx, 'Your path', 'Your path: {path}', 112, 500, 800, { align: 'center', color: L.onGradient, fontSize: 15 });
  const note = text(ctx, 'Rehearsal note', '{"This was rehearsal. Nothing here was marked, saved or sent to anyone." + (microphone == "ready" ? " Any recording you made stayed on this device and is gone." : "")}', 112, 528, 800, { align: 'center', color: L.onGradient, fontSize: 14 });
  const again = darkButton(ctx, 'Start again', 'Start again', 422, 566, 180);
  ending.children.push(outcome, result, trail, note, again);
  const eg = new Graph(ending);
  eg.run(eg.click(again, 'Start again'), ['action.startOver']);

  //Notes for whoever edits the template, below each page
  const below = (page: Artboard, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(first, { ...below(first, 0, 440), text: '**Three stages on one page** The reply, review and branch stages are frames shown by the `stage` variable, so a scene is one page. Duplicate the page to add a scene and point a branch button at it.', colour: 'sky' });
  addNote(first, { ...below(first, 456, 440), text: '**Recording is off** until you tick Microphone in Project > Microphone and camera. The record layers only show while it is ready, and Record is one Start or stop node.', colour: 'gold' });
  addNote(ending, { ...below(ending, 0, 440), text: '**Live variable** `verdict` is settled, mixed or tense from `calm` and `tense`. The outcome and the headline both read it.', colour: 'sky' });
  return { project, checklist };
}

/** States for the layout check: the review stage with a five point framework ticked, and the longest line. */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'review', vars: { stage: 'review', reply: 'I am sorry it has been so hard, Alex. Let me listen first and then we can work out what I can do.', ticked: [0, 1], framework: ['Acknowledged how they feel before anything else', 'Checked what is actually going on', 'Said clearly what you can and cannot do', 'Agreed a next step with a date', 'Asked how they would like to be supported'] } },
];

export const difficultConversation: BrandedStarter = {
  key: 'practice/difficult-conversation',
  set: 'practice',
  name: 'Difficult conversation rehearsal',
  description: 'A branching rehearsal for a hard conversation, with no microphone needed. Each scene shows the other person and their line with a transcript (and an optional audio slot), asks the learner to say a reply out loud or type it, then reveals an expert reply and the author\'s framework as a checklist to tick. The learner picks whether it calmed them or made it tenser, which decides the next scene, and can retry a scene. Rehearsal only, nothing is scored.',
  tags: ['speaking', 'scenario', 'branching', 'rehearsal'],
  build,
  layoutStates: LAYOUT_STATES,
};
