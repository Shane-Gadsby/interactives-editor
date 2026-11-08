/**
 * Word cloud: the author's cloud (words and weights from a list, a word opens its details) and a cloud one learner builds from the
 * words they type (kept as user data). Both are drawn the same way: a live variable runs the list through `cloud(...)`, which sizes each
 * word from its weight and packs them with no overlaps, and one layer repeated over the result puts each word where it says. A list
 * view with the counts is the text alternative. The learner's cloud counts a plain list of what they typed (`answers`), and nothing on
 * its page cares where that list comes from, so a class-wide cloud can slot in by filling the same list from a shared store.
 */
import { createNode, uid, type FrameNode, type Keyframe, type LogicNode, type SceneNode, type Timeline, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, overlay, solid, stroke, text, type BrandedCtx, type BrandedStarter, type LayoutState } from '../../kit';
import { addVar, announce, bind, click, goNext, goPrevious, graph, graphNote, join, set, setVar, toggleVar } from '../../graph-kit';
import { dialogPanel, progressBar, stack } from '../../parts';
import { heroButtons } from './helpers';

const OUR_WORDS = [
  { text: 'practice', weight: 14, detail: 'A little every day beats one long session. Short, regular practice is what makes new skills stick.', link: 'https://www.unisq.edu.au/' },
  { text: 'sleep', weight: 11, detail: 'Sleep is when your brain files away what you studied. A tired mind remembers less.', link: '' },
  { text: 'notes', weight: 9, detail: 'Notes in your own words are easier to recall than a copy of the slides.', link: '' },
  { text: 'testing', weight: 8, detail: 'Quizzing yourself beats rereading. Getting it wrong first helps it stay.', link: '' },
  { text: 'spacing', weight: 8, detail: 'Spread your study over days and weeks, and come back to old material just as you start to forget it.', link: '' },
  { text: 'focus', weight: 7, detail: 'Put your phone out of reach for a focused block, then take a real break.', link: '' },
  { text: 'breaks', weight: 6, detail: 'A short walk or a drink of water lets your attention recover.', link: '' },
  { text: 'feedback', weight: 6, detail: 'Read the comments on your last assessment before you start the next one.', link: '' },
  { text: 'planning', weight: 5, detail: 'Put classes, work and study blocks in one calendar so a crowded week does not surprise you.', link: '' },
  { text: 'questions', weight: 5, detail: 'Ask your teaching team early. A small question now saves a big gap later.', link: '' },
  { text: 'reading', weight: 4, detail: 'Read with a question in mind, and stop to say what you just read in a sentence.', link: '' },
  { text: 'review', weight: 4, detail: 'Look back over the week every Friday: what stuck, what did not.', link: '' },
  { text: 'study groups', weight: 3, detail: 'Explaining an idea to someone else shows you what you do not know yet.', link: '' },
  { text: 'deadlines', weight: 3, detail: 'Work backwards from the due date and give each step its own earlier date.', link: '' },
  { text: 'coffee', weight: 2, detail: 'Fine in moderation, but it is no substitute for sleep.', link: '' },
  { text: 'music', weight: 2, detail: 'Music without words suits some people. Words in the song compete with words on the page.', link: '' },
  { text: 'stress', weight: 2, detail: 'A little pressure helps. When it grows, talk to someone: support is free.', link: '' },
  { text: 'apps', weight: 1, detail: 'A tool only helps if you open it. Pick one and use it for a month.', link: '' },
  { text: 'highlighters', weight: 1, detail: 'Highlighting feels productive, but it works best as a first step before notes.', link: '' },
];

//Words a learner might have said, for the layout check's crowded state
const MANY = 'practice sleep notes testing spacing focus breaks feedback planning questions reading review groups deadlines coffee music stress apps habit memory recall exam essay lecture library tutorial group-work revision timetable motivation reading-list summary quiz'.split(' ');
const crowd = [...MANY, ...MANY.slice(0, 18), ...MANY.slice(0, 9), ...MANY.slice(0, 4), 'a longer phrase to fit in', 'another quite long phrase'];

/** The states the layout check adds to how the pages start: a word's dialog open, the list view, and a learner's crowded cloud. */
export const WORD_CLOUD_LAYOUT_STATES: LayoutState[] = [
  { label: 'word open', page: 'Our cloud', vars: { ourOpen: true, ourPicked: 0 } },
  { label: 'list view', page: ['Our cloud', 'My cloud'], vars: { asList: true, answers: crowd } },
  { label: 'crowded cloud', page: 'My cloud', vars: { answers: crowd } },
  { label: 'word open, learner', page: 'My cloud', vars: { answers: crowd, myOpen: true, myPicked: 0 } },
  { label: 'clear dialog', page: 'My cloud', vars: { answers: crowd, clearOpen: true } },
  { label: 'refused word', page: 'My cloud', vars: { draft: 'a very long phrase that goes well past the limit for one word' } },
  //the looks the author settings make (pills on or off, word colour plain or the colourway), with the learner's crowded cloud and its newest word ringed
  { label: 'no pills', page: ['Our cloud', 'My cloud'], vars: { pills: false, answers: crowd, lastAdded: 'practice' } },
  { label: 'colourway words', page: ['Our cloud', 'My cloud'], vars: { wordColour: 'Colourway', answers: crowd, lastAdded: 'practice' } },
  { label: 'colourway words, no pills', page: ['Our cloud', 'My cloud'], vars: { pills: false, wordColour: 'Colourway', answers: crowd, lastAdded: 'practice' } },
  { label: 'colourway words, word open', page: 'Our cloud', vars: { pills: false, wordColour: 'Colourway', ourOpen: true, ourPicked: 0 } },
];

const STAGE_GAP = 16;
const WORD_FONT = 600;

/** What a stage needs to hang flows off afterwards. */
interface Stage {
  stage: FrameNode;
  words: FrameNode;
  list: FrameNode;
  word: SceneNode;
  picked: Variable;
  open: Variable;
}

/**
 * One cloud: the stage (a card), the words repeated over `<prefix>Cloud`, the list view of the same words with their counts, and a
 * line saying what to do when there are none yet. `unit` is how a count is said ("weight" for the author's, "times" for a learner's).
 * Words are buttons in the order of the list, the biggest first, so Tab lands once and the arrow keys walk through them.
 */
function cloudStage(ctx: BrandedCtx, page: ReturnType<typeof brandedPage>, o: { prefix: 'our' | 'my'; x: number; y: number; width: number; height: number; unit: string; newest?: boolean; empty: string }): Stage {
  const { L, project } = ctx;
  const p = o.prefix;
  const cloudVar = `${p}Cloud`;
  const W = `${p}Width`;
  const H = `${p}Height`;
  const picked = addVar(project, `${p}Picked`, 'number', -1);
  const open = addVar(project, `${p}Open`, 'boolean', false);

  //Each word is a button on the page: the size and place come from its row of the layout. The two author settings pick the look: `pills` draws a chip behind each word
  //(off, the chip takes the stage's own colour), and `wordColour` is Plain (the theme's text colour) or Colourway. In the colourway the biggest words sit in the
  //button colour when there are pills, and every word big enough to count as large text takes the primary colour (a small one stays plain, because primary on its own
  //is just under 4.5:1 in one colourway). Everything is a token, so High contrast and a dark theme change it without a thing to edit
  const tint = 'wordColour == "Colourway"';
  const fillExpr = `pills ? (${tint} && item.tier == 0 ? ${JSON.stringify(L.button)} : ${JSON.stringify(L.surfaceMuted)}) : ${JSON.stringify(L.surface)}`;
  const colourExpr = `pills && ${tint} && item.tier == 0 ? ${JSON.stringify(L.onButton)} : ${tint} && item.size >= 24 ? ${JSON.stringify(L.primary)} : ${JSON.stringify(L.text)}`;
  //A word is a clickable frame (a chip with its text inside) rather than a button: a chip that is only a soft grey on the card has no 3:1 edge of its own to be
  //checked as a button's, and with pills off it has no paint at all. The words say it is there, which is what a clickable frame is held to
  const label = text(ctx, 'Word label', '{item.text}', 0, 0, 120, { fontSize: 20, fontWeight: WORD_FONT, align: 'center', color: L.text, autoSize: 'none', verticalAlign: 'middle', height: 40, decorative: true } as never);
  bind(label, { width: 'item.w', height: 'item.h', fontSize: 'item.size', color: colourExpr });
  const word = createNode('frame', {
    name: 'Cloud word',
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    cornerRadius: 20,
    fill: solid(L.surfaceMuted),
    stroke: stroke(L.border, 1.5),
    clip: false,
    role: 'button',
    bindings: {
      x: 'item.x',
      y: 'item.y',
      width: 'item.w',
      height: 'item.h',
      cornerRadius: 'item.h / 2',
      visible: 'item.shown',
      'fill.color': fillExpr,
      ariaLabel: `item.text + ", ${o.unit} " + item.weight`,
      //a chip has a thin edge in the border colour (none without pills), and the learner's newest word is ringed in the text colour
      ...(o.newest
        ? { 'stroke.width': 'item.text.toLowerCase() == lastAdded ? 3 : pills ? 1.5 : 0', 'stroke.color': `item.text.toLowerCase() == lastAdded ? ${JSON.stringify(L.text)} : ${JSON.stringify(L.border)}` }
        : { 'stroke.width': 'pills ? 1.5 : 0' }),
    },
    children: [label],
  } as never);
  const words = createNode('frame', {
    name: 'Cloud words',
    x: STAGE_GAP,
    y: STAGE_GAP,
    width: o.width,
    height: o.height,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Words, biggest first',
    repeat: { items: cloudVar, layout: 'none', gap: 0, columns: 1 },
    keyNav: { mode: 'list', orientation: 'both', countHidden: true },
    bindings: { width: W, height: H, visible: '!asList' },
    children: [word],
  } as never) as FrameNode;

  //The list view: the same words as rows, biggest first, each with a bar and its count (the text alternative to the picture)
  const rowW = o.width;
  const rowWord = text(ctx, 'Row word', `{item.text}{item.shown ? "" : "  (too small to show in the cloud)"}`, 18, 9, rowW - 330, { fontSize: 18, fontWeight: 600, autoSize: 'none', height: 24, decorative: true } as never);
  const bar = progressBar(ctx, 'Row bar', rowW - 300, 15, 220, { value: 'item.weight', max: `${cloudVar}[0].weight`, decorative: true });
  const count = text(ctx, 'Row count', '{item.weight}', rowW - 70, 9, 54, { fontSize: 18, fontWeight: 700, align: 'right', autoSize: 'none', height: 24, decorative: true } as never);
  const row = createNode('frame', {
    name: 'Cloud row',
    x: 0,
    y: 0,
    width: rowW,
    height: 42,
    cornerRadius: 12,
    fill: solid(L.background),
    stroke: null,
    clip: false,
    role: 'button',
    bindings: { width: W, ariaLabel: `item.text + ", ${o.unit} " + item.weight` },
    children: [rowWord, bar, count],
  } as never);
  const list = createNode('frame', {
    name: 'Cloud list',
    x: STAGE_GAP,
    y: STAGE_GAP,
    width: o.width,
    height: o.height,
    fill: null,
    stroke: null,
    clip: true,
    scroll: 'vertical',
    role: 'region',
    ariaLabel: `Words with their ${o.unit}, biggest first`,
    repeat: { items: cloudVar, layout: 'vertical', gap: 6, columns: 1 },
    keyNav: { mode: 'list', orientation: 'vertical' },
    bindings: { width: W, height: H, visible: 'asList' },
    children: [row],
  } as never) as FrameNode;

  //Nothing to show yet
  const none = text(ctx, 'Empty cloud text', o.empty, 0, 0, o.width - 80, { fontSize: 20, align: 'center', color: L.text, autoSize: 'none', verticalAlign: 'middle', height: 60 } as never);
  bind(none, { visible: `${cloudVar}.length == 0`, x: `(${W} + 32 - (${W} - 80)) / 2`, y: `(${H} + 32 - 60) / 2`, width: `${W} - 80` });

  const stage = createNode('frame', {
    name: 'Cloud stage',
    x: o.x,
    y: o.y,
    width: o.width + STAGE_GAP * 2,
    height: o.height + STAGE_GAP * 2,
    cornerRadius: 16,
    fill: solid(L.surface),
    stroke: null,
    clip: true,
    role: 'region',
    ariaLabel: 'Word cloud',
    bindings: {
      width: `${W} + ${STAGE_GAP * 2}`,
      height: `${H} + ${STAGE_GAP * 2}`,
      ariaDescription: `${cloudVar}.length == 0 ? "No words yet." : ${cloudVar}.length + " words. The biggest are " + ${cloudVar}.slice(0, 5).map(w => w.text + " (" + w.weight + ")").join(", ") + ". The list view has every word with its count."`,
    },
    children: [words, list, none],
  } as never) as FrameNode;
  page.children.push(stage);

  //The words come in with a soft fade when the page opens (viewers who ask for less motion see them at once)
  const key = (t: number, value: number): Keyframe => ({ id: uid('k'), t, value, ease: 'easeOut' });
  words.opacity = 0;
  const intro: Timeline = { id: uid('tl'), name: 'Words in', duration: 700, loop: 'once', autoplay: true, speed: 1, tracks: [{ id: uid('tr'), nodeId: words.id, prop: 'opacity', keys: [key(0, 0), key(700, 1)] }], markers: [] };
  page.timelines.push(intro);

  return { stage, words, list, word, picked, open };
}

/** The pick flows: a word (or a row of the list) opens its dialog. One flow serves every copy (event.childIndex). */
function wirePicks(page: ReturnType<typeof brandedPage>, s: Stage): LogicNode {
  const g = graph(page);
  const open = (target: FrameNode, note: string) => {
    const ev = g.event('event.pointer', { target: target.id, type: 'click', childrenOnly: true }, note);
    g.run(ev, setVar(s.picked, 'event.childIndex'), set(s.open, 'true'));
    return ev;
  };
  const first = open(s.words, 'Open a word');
  open(s.list, 'Open a word');
  return first;
}

export const wordCloud: BrandedStarter = {
  key: 'explore/word-cloud',
  set: 'explore',
  name: 'Word cloud',
  description: 'A word cloud made from a list of words and weights, packed with no overlaps and sized by weight, where a word opens its details (chips behind the words and the words\' colour are author settings); and a page where a learner types words and watches their own cloud grow (kept as user data, with a word blocklist). A list view with the counts is the text alternative, and the words are one Tab stop with the arrow keys moving between them. A class-wide cloud can use the same layers, waiting on a shared store.',
  tags: ['word cloud', 'tag cloud', 'keyboard friendly', 'user data', 'explore'],
  layoutStates: WORD_CLOUD_LAYOUT_STATES,
  build(colourway) {
    const ctx = brandedProject(colourway, 'Word cloud');
    const { L, project } = ctx;
    //Viewers who ask for less motion see the finished cloud straight away
    project.settings.reducedMotion = true;
    const hero = brandedPage(ctx, 'Word cloud', { kind: 'hero', subtitle: 'See how a cloud of words shows what matters most, then build one of your own.' });
    const ours = brandedPage(ctx, 'What helps people learn', { name: 'Our cloud', footer: 'Word cloud  ·  Page {pageNumber} of {pageCount}' });
    const mine = brandedPage(ctx, 'Build your own cloud', { name: 'My cloud', footer: '{cloudShared ? "Shared with everyone in this class" : "Only you can see this cloud"}  ·  Page {pageNumber} of {pageCount}' });
    heroButtons(ctx, hero, [{ name: 'See the cloud', label: 'See the cloud', to: 'next', width: 200 }]);
    const box = contentBox(ours);

    //The settings both clouds share: how big the biggest and smallest word are, who is not allowed, and the list view
    addVar(project, 'minSize', 'number', 16);
    addVar(project, 'maxSize', 'number', 64);
    addVar(project, 'minCount', 'number', 1);
    addVar(project, 'blocked', 'list', ['spam']);
    const asList = addVar(project, 'asList', 'boolean', false);
    //How the words look, for both clouds: a chip behind each word or not, and the words in the theme's text colour or following the colourway
    addVar(project, 'pills', 'boolean', true);
    addVar(project, 'wordColour', 'enum', 'Plain', { options: ['Plain', 'Colourway'] });
    const opts = '{minSize: minSize, maxSize: maxSize, grow: 1.4, blocked: blocked, minCount: minCount}';

    //The author's cloud: words and weights, written in a list. The size of the cloud area is a pair of variables
    addVar(project, 'ourWords', 'list', OUR_WORDS);
    addVar(project, 'ourWidth', 'number', 896);
    addVar(project, 'ourHeight', 'number', 380);
    addVar(project, 'ourCloud', 'list', [], { formula: `cloud(ourWords, ourWidth, ourHeight, ${opts})`, live: true });
    addVar(project, 'ourHidden', 'number', 0, { formula: 'ourCloud.filter(w => !w.shown).length', live: true });

    //The learner's cloud: what they typed, a word each time, kept as user data
    const answers = addVar(project, 'answers', 'list', [], { userData: true });
    //Who sees it, one author setting. "Only me" is whole today. The class option reads `sharedAnswers`, which a shared data source will fill
    //when shared responses exist; until `sharedReady` is true the page quietly keeps showing the learner's own words
    addVar(project, 'whoSees', 'enum', 'Only me', { options: ['Only me', 'Everyone in this class'] });
    addVar(project, 'sharedAnswers', 'list', []);
    addVar(project, 'sharedReady', 'boolean', false);
    addVar(project, 'cloudShared', 'boolean', false, { formula: 'whoSees == "Everyone in this class" && sharedReady', live: true });
    addVar(project, 'cloudSource', 'list', [], { formula: 'cloudShared ? sharedAnswers : answers', live: true });
    const draft = addVar(project, 'draft', 'string', '');
    const lastAdded = addVar(project, 'lastAdded', 'string', '');
    addVar(project, 'maxLength', 'number', 40);
    addVar(project, 'myWidth', 'number', 896);
    addVar(project, 'myHeight', 'number', 328);
    addVar(project, 'draftText', 'string', '', { formula: 'draft.trim().split(" ").filter(w => w != "").join(" ")', live: true });
    addVar(project, 'draftState', 'string', 'empty', { formula: 'draftText == "" ? "empty" : draftText.length > maxLength ? "long" : includesAny(blocked, draftText.split(" ")) ? "blocked" : "ok"', live: true });
    addVar(project, 'draftNote', 'string', '', { formula: 'lookup(draftState, {empty: "Type a word or a short phrase, then press Enter or Add.", long: "That is too long. Keep it to " + maxLength + " characters.", blocked: "That word is not allowed in this cloud.", ok: "Press Enter or Add to put it in your cloud."})', live: true });
    addVar(project, 'myCloud', 'list', [], { formula: `cloud(cloudSource, myWidth, myHeight, ${opts})`, live: true });
    addVar(project, 'myHidden', 'number', 0, { formula: 'myCloud.filter(w => !w.shown).length', live: true });
    const clearOpen = addVar(project, 'clearOpen', 'boolean', false);

    // ------------------------------------------------------------------ our cloud
    const sum = text(ctx, 'Summary', '{ourCloud.length} words, select one to read more{ourHidden > 0 ? ", " + ourHidden + " not shown (see the list)" : ""}', box.x, box.y + 9, 536, { fontSize: 16, color: L.muted });
    const view1 = bind(button(ctx, 'View button', 'View as list', 592, box.y, 170, false), { label: 'asList ? "View as cloud" : "View as list"' });
    const next = bind(button(ctx, 'Next button', 'Make my own', 778, box.y, 198, true), { visible: 'pageNumber < pageCount' });
    ours.children.push(sum, view1, next);
    const our = cloudStage(ctx, ours, { prefix: 'our', x: box.x, y: box.y + 52, width: 896, height: 380, unit: 'weight', empty: 'No words yet. Write some in the ourWords list.' });
    const ourDialogOpen = our.open;
    const body1 = text(ctx, 'Word detail', '{ourCloud[ourPicked]?.detail}', 0, 0, 100, { fontSize: 18, lineHeight: 1.4, layoutItem: { width: 'fill' } } as never);
    const meta1 = text(ctx, 'Word weight', 'Weight {ourCloud[ourPicked]?.weight}', 0, 0, 100, { fontSize: 15, fontWeight: 600, color: L.muted, layoutItem: { width: 'fill' } } as never);
    const more = bind(button(ctx, 'Read more button', 'Read more', 0, 0, 170), { visible: '!!ourCloud[ourPicked]?.link' });
    const moreRow = stack('Read more row', 0, 0, 552, { direction: 'row', align: 'start', children: [more] });
    const d1 = stack('Word dialog body', 24, 64, 552, { gap: 10, children: [meta1, body1, moreRow] });
    const dialog1 = dialogPanel(ctx, ours, 'Word dialog', ourDialogOpen, { x: 212, y: 150, width: 600, height: 340, title: 'Word', children: [d1] });
    bind(dialog1.title, { text: 'ourCloud[ourPicked]?.text' });
    bind(dialog1.frame, { ariaLabel: 'ourCloud[ourPicked]?.text' });
    overlay(dialog1.frame);
    {
      const pick = wirePicks(ours, our);
      const g = graph(ours);
      const swap = click(g, view1, 'View as a list');
      g.run(swap, toggleVar(asList), announce('asList ? "Showing the list, biggest first" : "Showing the cloud"'));
      graphNote(ours, { anchor: pick, colour: 'sky', text: '**One flow per view serves every word.** *Only when a child is hit* is on, so `event.childIndex` says which copy was clicked and the dialog reads that word from `ourCloud`. The list has its own copy of the flow for its rows.' });
      graphNote(ours, { anchor: swap, colour: 'sky', text: '**One switch, `asList`.** The cloud shows while it is false and the list while it is true, so the picture and its text alternative are never out of step.' });
      g.run(click(g, next, 'Pages'), goNext());
      g.run(click(g, more, 'Read more'), ['action.url', { url: 'ourCloud[ourPicked].link' }]);
    }

    // ------------------------------------------------------------------ my cloud
    const input = createNode('input', {
      name: 'Word box',
      ...lookDefaults(project, 'input'),
      inputType: 'text',
      placeholder: 'Type a word or a short phrase',
      ariaLabel: 'A word or short phrase for your cloud',
      variableId: draft.id,
      x: box.x,
      y: box.y,
      width: 500,
      height: 46,
      cornerRadius: 23,
      fontSize: 18,
      fontFamily: BRAND_FONT,
      stroke: stroke(L.border, 2),
    } as never);
    bind(input, { ariaDescription: 'lookup(draftState, {empty: "", long: "Too long.", blocked: "That word is not allowed.", ok: ""}, "")' });
    const add = bind(button(ctx, 'Add button', 'Add', box.x + 516, box.y, 104), { disabled: 'draftState != "ok"' });
    const undo = bind(button(ctx, 'Undo button', 'Undo last', box.x + 636, box.y, 132, false), { disabled: 'answers.length == 0' });
    const clear = bind(button(ctx, 'Clear button', 'Clear all', box.x + 784, box.y, 144, false), { disabled: 'answers.length == 0' });
    const note = bind(text(ctx, 'Word note', '{draftNote}', box.x, box.y + 63, 536, { fontSize: 16, color: L.muted }), {
      color: `draftState == "long" || draftState == "blocked" ? ${JSON.stringify(L.error)} : ${JSON.stringify(L.muted)}`,
    });
    const view2 = bind(button(ctx, 'View button', 'View as list', 592, box.y + 54, 170, false), { label: 'asList ? "View as cloud" : "View as list"' });
    const back = button(ctx, 'Back button', 'Our cloud', 778, box.y + 54, 198, false);
    mine.children.push(input, add, undo, clear, note, view2, back);
    const my = cloudStage(ctx, mine, { prefix: 'my', x: box.x, y: box.y + 106, width: 896, height: 328, unit: 'times', newest: true, empty: 'Your cloud is empty. Type a word above and press Add.' });

    const body2 = text(ctx, 'Word times', 'You added this {myCloud[myPicked]?.weight == 1 ? "once" : myCloud[myPicked]?.weight + " times"}.', 0, 0, 100, { fontSize: 18, lineHeight: 1.4, layoutItem: { width: 'fill' } } as never);
    const removeWord = button(ctx, 'Remove word button', 'Remove this word', 0, 0, 220, false);
    const removeRow = stack('Remove row', 0, 0, 552, { direction: 'row', align: 'start', children: [removeWord] });
    const d2 = stack('Learner word body', 24, 64, 552, { gap: 14, children: [body2, removeRow] });
    const dialog2 = dialogPanel(ctx, mine, 'Word dialog', my.open, { x: 212, y: 200, width: 600, height: 240, title: 'Word', children: [d2] });
    bind(dialog2.title, { text: 'myCloud[myPicked]?.text' });
    bind(dialog2.frame, { ariaLabel: 'myCloud[myPicked]?.text' });
    overlay(dialog2.frame);

    //Clearing everything asks first
    const sure = text(ctx, 'Clear question', 'This takes every word out of your cloud. You cannot get them back.', 24, 64, 552, { fontSize: 18, lineHeight: 1.4 });
    const wipe = button(ctx, 'Clear all words button', 'Clear all words', 600 - 24 - 140 - 16 - 180, 220 - 24 - 46, 180, true);
    const dialog3 = dialogPanel(ctx, mine, 'Clear dialog', clearOpen, { x: 212, y: 210, width: 600, height: 220, title: 'Clear your cloud?', closeLabel: 'Keep them', children: [sure, wipe] });
    overlay(dialog3.frame);

    {
      const pick2 = wirePicks(mine, my);
      const g = graph(mine);
      //Add, from the button or from Enter in the box: push the word, mark it as the newest, say so, empty the box
      const addEv = click(g, add, 'Add a word');
      g.run(addEv, ['action.setVariable', { variable: answers.id, op: 'push', value: 'draftText' }], setVar(lastAdded, 'draftText.toLowerCase()'), announce('draftText + " added. " + (answers.length) + " words in your cloud."'), ['action.setVariable', { variable: draft.id, op: 'clear' }]);
      const first = mine.logic.edges.find((e) => e.from === addEv.id)!;
      const enter = g.event('event.key', { key: 'Enter', type: 'keydown', typing: true, target: input.id, onlyIf: 'draftState == "ok"' }, 'Add a word');
      join(mine, enter, mine.logic.nodes.find((n) => n.id === first.to)!);
      graphNote(mine, { anchor: addEv, colour: 'sky', text: '**Add and Enter share one chain.** The word is pushed onto `answers`, remembered in `lastAdded` (the ringed word), announced, and the box emptied. Enter only joins in while `draftState` is "ok", so a refused word is never added.' });
      graphNote(mine, { anchor: pick2, colour: 'sky', text: '**A word opens a small dialog** with its count and Remove. Remove filters `answers` by the word, whatever its capitals, so the cloud has no counter to keep in step.' });
      g.run(click(g, undo, 'Undo the last word'), setVar(answers, 'answers.slice(0, -1)'), setVar(lastAdded, '""'), announce('"Took the last word out. " + answers.length + " left."'));
      g.run(click(g, clear, 'Clear all'), set(clearOpen, 'true'));
      g.run(click(g, wipe, 'Clear all'), setVar(answers, '[]'), setVar(lastAdded, '""'), set(clearOpen, 'false'), announce('"Your cloud is empty."'));
      g.run(click(g, removeWord, 'Remove a word'), setVar(answers, 'answers.filter(a => a.toLowerCase() != myCloud[myPicked].text.toLowerCase())'), set(my.open, 'false'), announce('"Word removed."'));
      g.run(click(g, view2, 'View as a list'), toggleVar(asList), announce('asList ? "Showing the list, biggest first" : "Showing the cloud"'));
      g.run(click(g, back, 'Pages'), goPrevious());
    }

    // ------------------------------------------------------------------ notes
    const below = (page: typeof ours, x: number) => ({ x, y: page.height + 14, w: 300, h: 130 });
    addNote(ours, { ...below(ours, 0), colour: 'sky', text: '**Layout** `ourCloud` is a live variable, `cloud(ourWords, ...)`. It sizes each word from its weight and packs them with no overlaps, the same way every time, so the canvas and the player agree and the picture never jumps. Words that cannot fit are left out of the picture but stay in the list.' });
    addNote(ours, { ...below(ours, 316), colour: 'sky', text: '**Text alternative** View as list is the same words as rows with a bar and the count, so size is never the only cue. The words are one Tab stop in the picture: the arrow keys walk through them, biggest first, and Enter opens one.' });
    addNote(ours, { ...below(ours, 632), colour: 'gold', text: '[ ] Write your words in `ourWords` (Variables tab): text, weight, and a detail and link if you want them. Change `minSize`, `maxSize` and the cloud area (`ourWidth`, `ourHeight`) there too, not by resizing the stage.' });
    addNote(ours, { x: 0, y: ours.height + 160, w: 300, h: 130, colour: 'gold', text: '[ ] Choose the look in the Variables tab: `pills` (on or off) and `wordColour` (Plain or Colourway). Both clouds follow them. Plain words use the theme text colour, so they read in High contrast and on dark themes too. In the colourway the biggest words fill with the button colour when pills are on.' });
    addNote(mine, { ...below(mine, 0), colour: 'sky', text: '**User data** `answers` keeps what the learner typed, one entry a time, and puts it back next visit. `myCloud` counts that list (the same word in other capitals is one word), so there are no counters to keep in step.' });
    addNote(mine, { ...below(mine, 316), colour: 'purple', text: '**Who sees it** `whoSees` is the one setting: Only me (works now) or Everyone in this class. The class option arrives with shared responses: it will fill `sharedAnswers` and set `sharedReady`, and `cloudSource` then switches the whole page over. Hang the send step after Add. Until then the page keeps showing the learner\'s own words.' });
    addNote(mine, { ...below(mine, 632), colour: 'gold', text: '[ ] Add words you do not want to the `blocked` list (a phrase goes if any one word is on it), and set `minCount` to 2 or more to show only words said more than once. A blocked word cannot be added at all.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
      item('Write your own words: the "ourWords" list variable (Variables tab) has a text, a weight (the bigger, the bigger the word), a detail that shows when the word is opened and, if you want one, a link', our.word, ours),
      item('Choose how big the words are: "minSize" and "maxSize" (px). When there are many words, every size shrinks together until they fit. To change the size of the cloud, change "ourWidth" and "ourHeight" (the stage follows them)', our.stage, ours),
      item('Choose the look of the words: "pills" is on to put a soft grey chip behind each word or off for plain words, and "wordColour" is Plain (the theme text colour) or Colourway (the biggest words fill with the button colour when there are pills, and big words take the primary colour). Both clouds follow them', our.stage, ours),
      item('Check the colours in each colourway and in High contrast: every word colour is a theme token, so nothing is set by hand', our.stage, ours),
      item('The learner page keeps what people type as user data. Add words you do not want to the "blocked" list, and set "minCount" if only words said more than once should show', byName(mine, 'Word box'), mine),
      item('Choose who sees the learner cloud: the "whoSees" variable is Only me (each learner sees only their own words, kept as user data) or Everyone in this class. The class option arrives with shared responses: until then it keeps showing the learner\'s own words, so leave it on Only me', byName(mine, 'Word box'), mine),
      item('If you only want your own cloud, delete the "My cloud" page: the button on the first cloud page hides itself', next, ours),
      item('Make sure learners can read it without the picture: View as list shows every word with its count. Keep it, and say what the cloud shows in the page title', view1, ours),
      item('Try it with the keyboard: Tab into the cloud, the arrow keys to move between words, Enter to open one, Esc to close it', our.words, ours),
      item('Change the footer lines', byName(ours, 'Footer text'), ours),
    ];
    return { project, checklist };
  },
};
