//Difficult conversation rehearsal: built on the branching scenario. Each scene shows the other person (a picture, who they are, how they feel), their
//line with its transcript (and an optional audio slot), and asks the learner to say a reply out loud (or type it). Then it shows an expert reply and the
//author's framework as a checklist the learner ticks, and the learner picks the branch that fits how it went: the other person calms or gets tenser.
//Retrying a scene is one button. It is rehearsal, never assessment: nothing is scored, marked, recorded or sent anywhere.
//
//RECORDING SLOT (task 276, the media bridge, is not built yet): on every scene page there is a hidden layer called "Recording slot (media bridge)", below
//the typed reply box. When the bridge exists, the record button, the stop button and the "play my reply" player go in it (the review stage can show the
//player again beside the expert reply). Nothing records until then and the layer stays hidden, so learners never see it.
import { createNode, type Artboard, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT, type Colourway } from '../../looks';
import { Graph, addVar, announce, bind, darkButton, go, heroPage, set, spreadPages } from '../games/common';

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
  //Set to true once the scenes have audio: it shows the Play their line buttons. Every audio line still needs its transcript
  addVar(project, 'audioLines', 'boolean', false);

  const hero = heroPage(ctx, 'Rehearse a hard conversation', 'Say your reply out loud, compare it with an expert reply, and see where the conversation goes. Practice only: nothing is marked, recorded or sent.');
  const first = brandedPage(ctx, 'Alex asks for more time', { footer: 'Rehearsal, not assessed' });
  const calmer = brandedPage(ctx, 'Alex, a little calmer', { footer: 'Rehearsal, not assessed' });
  const tenser = brandedPage(ctx, 'Alex, still frustrated', { footer: 'Rehearsal, not assessed' });
  const ending = brandedPage(ctx, 'How the conversation went', { kind: 'end', name: 'Ending' });
  const checklist: TemplateChecklistItem[] = [];

  const intro = hero.page.children.find((n) => n.name === 'Subtitle')!;
  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(first));
  checklist.push(item('Write the title and the line under it on the first page. Keep it clear that this is practice and not assessed', intro, hero.page));

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
    const audio = bind(button(ctx, 'Play their line', 'Play their line', box.x, box.y + 312, 200, false), { visible: 'audioLines' });
    audio.ariaLabel = `Play ${cfg.who}'s line as audio`;

    //Their reply, shown back in review once the learner has typed one
    const mine = bind(card(ctx, 'Your reply panel', box.x, box.y + 366, 380, 100), { visible: 'stage == "review" && reply.trim() != ""' });
    const mineLabel = bind(text(ctx, 'Your reply label', 'Your reply', box.x + 20, box.y + 376, 340, { fontSize: 13, fontWeight: 700, color: L.muted }), { visible: 'stage == "review" && reply.trim() != ""' });
    const mineText = bind(text(ctx, 'Your reply text', '{reply}', box.x + 20, box.y + 398, 340, { fontSize: 15, lineHeight: 1.3, autoSize: 'none', height: 62, overflow: 'ellipsis' }), { visible: 'stage == "review" && reply.trim() != ""' });

    //Stage 1: say it out loud (or type it)
    const sayHead = heading(ctx, 'Reply heading', 'Say your reply out loud', 0, 0, rw, { fontSize: 24 });
    const sayHelp = text(ctx, 'Reply help', `Say what you would really say to ${cfg.who}, in your own words, out loud. Nobody hears it and nothing is recorded. Use made-up details, never a real person's name or story.`, 0, 44, rw, { fontSize: 17, lineHeight: 1.4 });
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
    //The recording slot: hidden, empty, waiting for the media bridge (see the note at the top of this file)
    const slot = createNode('frame', { name: 'Recording slot (media bridge)', visible: false, x: 0, y: 350, width: rw, height: 48, cornerRadius: 12, fill: solid(L.surface), stroke: null, clip: false, ariaLabel: 'Recording slot, not used yet' } as Partial<SceneNode>);
    const compare = button(ctx, 'Compare with the expert', 'Compare with the expert reply', 0, 408, 330, true);
    const replyStage = createNode('frame', { name: 'Reply stage', x: rx, y: box.y, width: rw, height: box.height, fill: null, stroke: null, clip: false, children: [sayHead, sayHelp, typeToggle, replyBox, slot, compare] }) as FrameNode;
    bind(replyStage, { visible: 'stage == "reply"' });

    //Stage 2: the expert reply, the framework to tick, and how it landed
    const expHead = heading(ctx, 'Expert heading', 'An expert might say', 0, 0, rw, { fontSize: 20 });
    const expCard = card(ctx, 'Expert panel', 0, 28, rw, 108);
    const expert = text(ctx, 'Expert reply', cfg.expert, 16, 38, rw - 32, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: 92 });
    const frameHead = heading(ctx, 'Framework heading', 'What a good reply includes. Tick what you covered.', 0, 146, rw, { fontSize: 17 });
    const tick = createNode('rect', { name: 'Tick box', x: 6, y: 6, width: 22, height: 22, cornerRadius: 6, fill: solid(L.background), stroke: stroke(L.border, 2), decorative: true });
    bind(tick, { 'fill.color': `ticked.includes(index) ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `ticked.includes(index) ? "${L.button}" : "${L.border}"` });
    const mark = text(ctx, 'Tick mark', '✓', 10, 5, 18, { fontSize: 16, fontWeight: 700, color: L.onButton, decorative: true });
    bind(mark, { visible: 'ticked.includes(index)' });
    const rowText = text(ctx, 'Framework point', '{item}', 40, 6, rw - 52, { fontSize: 16, decorative: true });
    const row = createNode('frame', { name: 'Framework row', x: 0, y: 0, width: rw, height: 34, cornerRadius: 8, fill: solid(L.background), stroke: null, clip: false, role: 'checkbox', focusable: true, cursor: 'pointer', children: [tick, mark, rowText] }) as FrameNode;
    bind(row, { ariaChecked: 'ticked.includes(index)', ariaLabel: 'item', 'fill.color': `ticked.includes(index) ? "${L.surface}" : "${L.background}"` });
    const rows = createNode('frame', { name: 'Framework', x: 0, y: 172, width: rw, height: 186, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'What a good reply includes', repeat: { items: 'framework', layout: 'grid', gap: 4, columns: 1 }, children: [row] }) as FrameNode;
    const status = text(ctx, 'Ticked count', 'You ticked {ticked.length} of {framework.length}. Now say how it landed.', 0, 370, rw - 196, { fontSize: 15, color: L.muted });
    const retry = button(ctx, 'Try this scene again', 'Try again', rw - 180, 362, 180, false);
    retry.ariaLabel = 'Try this scene again with a different reply';
    const calmBtn = button(ctx, 'It calms them', 'It calms them down', 0, 412, (rw - 10) / 2, true);
    const tenseBtn = button(ctx, 'It makes it tenser', 'It makes it tenser', (rw - 10) / 2 + 10, 412, (rw - 10) / 2, false);
    const reviewStage = createNode('frame', { name: 'Review stage', x: rx, y: box.y, width: rw, height: box.height, fill: null, stroke: null, clip: false, children: [expHead, expCard, expert, frameHead, rows, status, retry, calmBtn, tenseBtn] }) as FrameNode;
    bind(reviewStage, { visible: 'stage == "review"' });

    page.children.push(pic, who, role, mood, scenes, bubble, label, line, audio, mine, mineLabel, mineText, replyStage, reviewStage);

    const g = new Graph(page);
    const fresh = (): [string, Record<string, unknown>][] => [set(stage, '"reply"'), set(typing, 'false'), set(reply, '""'), ['action.setVariable', { variable: ticked.id, op: 'clear' }]];
    g.run(g.start('A fresh scene'), ...fresh());

    //Audio slot: pick the sound for this line in the node below. Nothing plays until one is chosen.
    g.run(g.click(audio, 'Play their line (pick the sound in the next node)'), ['action.sound', { asset: '', volume: 1 }]);

    g.run(g.click(typeToggle, 'Type instead, or say it aloud'), set(typing, '!typing'), announce('typing ? "Typed reply box shown." : "Typed reply box hidden. Say your reply aloud."'));
    g.run(g.click(compare, 'Show the expert reply'), set(stage, '"review"'), announce('"The expert reply and the checklist are shown. Tick what you covered, then say how it landed."'));

    const onRow = g.click(row, 'Tick or untick a point');
    const has = g.add('logic.if', { condition: 'ticked.includes(event.index)' }, onRow);
    g.add('action.setVariable', { variable: ticked.id, op: 'remove', value: 'ticked.indexOf(event.index)' }, has, 'true');
    g.add('action.setVariable', { variable: ticked.id, op: 'push', value: 'event.index' }, has, 'false', { dy: 70 });
    g.gap(80);

    g.run(g.click(retry, 'Try this scene again'), ['action.setVariable', { variable: tries.id, op: 'add', value: '1' }], ...fresh(), announce('"Try this scene again. Say a different reply out loud."'));

    const branch = (btn: SceneNode, note: string, counter: typeof calm, word: string, to: Artboard | 'ending') =>
      g.run(g.click(btn, note), ['action.setVariable', { variable: counter.id, op: 'add', value: '1' }], set(path, `path ? path + " > ${word}" : "${word}"`), go(to === 'ending' ? ending : to));
    branch(calmBtn, 'It calms them down', calm, 'calmer', cfg.calmTo);
    branch(tenseBtn, 'It makes it tenser', tense, 'tenser', cfg.tenseTo);
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
    item('Write each scene: who the other person is (picture, name, role and mood on the left of every scene page) and what they say in "Their line". That text is the transcript, so keep it even if you add audio', a.line, first),
    item('Swap the grey Character picture for your own, on every scene page, and give it a short description in the inspector', a.pic, first),
    item('Optional audio: add a recording of the line as a sound, pick it in the "Play sound" node after "Play their line" (Interactions tab), then set Project > Variables > "audioLines" to true. The button is hidden until then', a.audio, first),
    item('Write the framework learners tick: Project > Variables > "framework" (one point per line, up to five). The sample has four. For a clinical handover use ISBAR: Identify, Situation, Background, Assessment, Recommendation', a.rows, first),
    item('Write the expert reply on each scene page ("Expert reply"). Say it the way you would want to hear it, not as the only right answer', a.expert, first),
    item('Set where each answer goes: the two buttons on the review stage ("It calms them down" and "It makes it tenser") each end in a Go to page node. Add a scene by duplicating a scene page and pointing a button at it, or send both to the Ending', a.calmBtn, first),
    item('Write what the three outcomes on the Ending page say (settled, mixed, still tense). They read how many scenes calmed and how many got tenser', byName(ending, 'Outcome'), ending),
    item('Keep it rehearsal: the starter scores nothing and says so. Do not turn the ticks into a mark, and keep scenario wording free of real people\'s names and details (the "Reply help" text says so)', a.rows, first),
    item('RECORDING SLOT, for later: the hidden "Recording slot (media bridge)" layer on every scene page is where record, stop and play my reply go once the media bridge exists. Leave it hidden. Nothing is recorded until then', a.slot, first),
  );

  //The ending
  const outcome = text(
    ctx,
    'Outcome',
    '{calm > tense ? "You listened first and gave them a clear way forward, so they could take it in. Notice what worked and say it again next time." : calm == tense ? "Some of it landed. Rehearse the scene that went tenser and try a different opening." : "It stayed difficult, which is normal for a hard conversation. Go back, try the scenes again, and tick honestly what you left out."}',
    112,
    396,
    800,
    { align: 'center', color: L.onGradient, fontSize: 18, lineHeight: 1.4 },
  );
  const result = text(ctx, 'Result', '{calm > tense ? "The conversation settled" : calm == tense ? "A mixed result" : "Still tense"}   Scenes: {calm + tense}   Retries: {tries}', 112, 468, 800, { align: 'center', color: L.onGradient, fontSize: 18, fontWeight: 700 });
  const trail = text(ctx, 'Your path', 'Your path: {path}', 112, 500, 800, { align: 'center', color: L.onGradient, fontSize: 15 });
  const note = text(ctx, 'Rehearsal note', 'This was rehearsal. Nothing here was marked, recorded or sent to anyone.', 112, 528, 800, { align: 'center', color: L.onGradient, fontSize: 14 });
  const again = darkButton(ctx, 'Start again', 'Start again', 422, 566, 180);
  ending.children.push(outcome, result, trail, note, again);
  const eg = new Graph(ending);
  eg.run(eg.click(again, 'Start again'), ['action.startOver']);

  spreadPages(project);
  return { project, checklist };
}

export const difficultConversation: BrandedStarter = {
  key: 'practice/difficult-conversation',
  set: 'practice',
  name: 'Difficult conversation rehearsal',
  description: 'A branching rehearsal for a hard conversation, with no microphone needed. Each scene shows the other person and their line with a transcript (and an optional audio slot), asks the learner to say a reply out loud or type it, then reveals an expert reply and the author\'s framework as a checklist to tick. The learner picks whether it calmed them or made it tenser, which decides the next scene, and can retry a scene. Rehearsal only, nothing is scored.',
  tags: ['speaking', 'scenario', 'branching', 'rehearsal'],
  build,
};
