import { createArtboard, createNode, createProject, uid, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { HIDE_VAR, STAGE_H, STAGE_W, linesOf, SAMPLE_CHAPTER, storyStage } from './story';
import { starterThemes } from './themes';
import { addPuzzlePage } from './puzzle-page';

/**
 * The Visual novel starter: a title screen (New game, Continue, Load, Settings, Extras), the story stage, a page of save slots
 * that saves or loads, the reader's settings, the history of what was said, and the extras (gallery, endings, chapter select,
 * music room). Every page is plain layers bound to `story.*` values and wired with the Story nodes, so all of it restyles.
 */

const INK = '#f5f2ea';
const DARK = '#15141c';
const PANEL = 'rgba(255, 255, 255, 0.07)';
const ACCENT = '#c8a24a';
const solid = (color: string) => ({ type: 'solid' as const, color });

type Wiring = { nodes: LogicNode[]; edges: LogicEdge[] };
const wiring = (): Wiring => ({ nodes: [], edges: [] });

/** A click on `target` runs `actions` one after another. */
function onClick(w: Wiring, target: SceneNode, ...actions: { kind: string; params?: Record<string, unknown> }[]): void {
  const y = 40 + w.nodes.length * 40;
  const ev: LogicNode = { id: uid('n'), kind: 'event.pointer', x: 40, y, params: { type: 'click', target: target.id } };
  w.nodes.push(ev);
  let prev = ev;
  actions.forEach((a, i) => {
    const n: LogicNode = { id: uid('n'), kind: a.kind, x: 320 + i * 260, y, params: a.params ?? {} };
    w.nodes.push(n);
    w.edges.push({ id: uid('e'), from: prev.id, fromPort: 'out', to: n.id, toPort: 'in' });
    prev = n;
  });
}

const go = (artboard: string) => ({ kind: 'action.artboard', params: { to: 'picked', artboard, transition: 'fade', duration: 400 } });
const back = () => ({ kind: 'action.artboard', params: { to: 'back', transition: 'fade', duration: 300 } });

const heading = (text: string, y = 48) => createNode('text', { name: 'Heading', text, x: 80, y, width: STAGE_W - 160, height: 60, fontSize: 44, fontWeight: 700, color: INK, autoSize: 'none', role: 'heading', headingLevel: 1 } as never);

const button = (name: string, label: string, x: number, y: number, width = 280, extra: Record<string, unknown> = {}) =>
  createNode('button', { name, label, x, y, width, height: 54, fontSize: 20, fontWeight: 600, cornerRadius: 12, fill: solid('rgba(255, 255, 255, 0.92)'), color: DARK, ...extra } as never);

const page = (name: string, children: SceneNode[], w: Wiring, at: number): Artboard =>
  createArtboard({ name, width: STAGE_W, height: STAGE_H, background: solid(DARK), children, logic: w, canvasX: at * (STAGE_W + 160), canvasY: 0 } as Partial<Artboard>);

function titlePage(stageId: string, savesId: string, settingsId: string, extrasId: string, modeVar: string): Artboard {
  const w = wiring();
  const title = createNode('text', { name: 'Title', text: 'Your story', x: 0, y: 150, width: STAGE_W, height: 90, fontSize: 72, fontWeight: 700, color: INK, align: 'center', autoSize: 'none', role: 'heading', headingLevel: 1 } as never);
  const sub = createNode('text', { name: 'Subtitle', text: 'A visual novel', x: 0, y: 248, width: STAGE_W, height: 34, fontSize: 24, color: 'rgba(245, 242, 234, 0.7)', align: 'center', autoSize: 'none' } as never);
  const x = (STAGE_W - 280) / 2;
  const cont = button('Continue', 'Continue', x, 320, 280, { bindings: { visible: 'story.canContinue' } });
  const start = button('New game', 'New game', x, 394);
  const load = button('Load', 'Load', x, 468);
  const settings = button('Settings', 'Settings', x, 542);
  const extras = button('Extras', 'Extras', x, 616);
  onClick(w, start, { kind: 'action.storyStart', params: {} });
  onClick(w, cont, { kind: 'action.storyLoad', params: { slot: "'latest'" } });
  onClick(w, load, { kind: 'action.setVariable', params: { variable: modeVar, value: "'load'" } }, go(savesId));
  onClick(w, settings, go(settingsId));
  onClick(w, extras, go(extrasId));
  void stageId;
  return page('Title', [title, sub, cont, start, load, settings, extras], w, 0);
}

/** Save slots in a grid: the background that was showing, the chapter and scene, the last words and when. Saves or loads, by the mode variable. */
function savesPage(modeVar: string, modeName: string): Artboard {
  const w = wiring();
  const head = createNode('text', { name: 'Heading', text: 'Load', x: 80, y: 40, width: 800, height: 60, fontSize: 44, fontWeight: 700, color: INK, autoSize: 'none', role: 'heading', headingLevel: 1, bindings: { text: `${modeName} == 'save' ? 'Save' : 'Load'` } } as never);
  const pic = createNode('image', { name: 'Picture', x: 0, y: 0, width: 180, height: 101, fit: 'cover', cornerRadius: 8, bindings: { assetId: 'item.picture', visible: "item.picture != ''" } } as never);
  const words = createNode('text', { name: 'Slot words', text: 'Empty', x: 196, y: 4, width: 320, height: 94, overflow: 'ellipsis', fontSize: 17, lineHeight: 1.4, color: INK, align: 'left', autoSize: 'none', bindings: { text: "item.used ? 'Slot ' + item.slot + ': ' + item.chapter + (item.scene ? ', ' + item.scene : '') + '\\n' + item.when + '\\n' + item.text : 'Slot ' + item.slot + ': empty'" } } as never);
  const slot = createNode('frame', { name: 'Slot', x: 0, y: 0, width: 540, height: 117, cornerRadius: 12, fill: solid(PANEL), clip: true, cursor: 'pointer', role: 'button', children: [pic, words], bindings: { ariaLabel: "'Slot ' + item.slot + (item.used ? ', ' + item.chapter + ', ' + item.when : ', empty')" } } as never);
  slot.children.forEach((c) => {
    c.x += 8;
    c.y += 8;
  });
  const grid = createNode('frame', { name: 'Slots', x: 80, y: 130, width: 1100, height: 420, fill: null, repeat: { items: 'story.saves', layout: 'grid', gap: 20, columns: 2 }, children: [slot] });
  const done = button('Back', 'Back', 80, 620, 200);
  const ifSave: LogicNode = { id: uid('n'), kind: 'logic.if', x: 320, y: 40, params: { condition: `${modeName} == 'save'` } };
  void modeVar;
  const ev: LogicNode = { id: uid('n'), kind: 'event.pointer', x: 40, y: 40, params: { type: 'click', target: slot.id } };
  const save: LogicNode = { id: uid('n'), kind: 'action.storySave', x: 580, y: 0, params: { slot: 'event.index + 1' } };
  const load: LogicNode = { id: uid('n'), kind: 'action.storyLoad', x: 580, y: 100, params: { slot: 'event.index + 1' } };
  w.nodes.push(ev, ifSave, save, load);
  w.edges.push({ id: uid('e'), from: ev.id, fromPort: 'out', to: ifSave.id, toPort: 'in' }, { id: uid('e'), from: ifSave.id, fromPort: 'true', to: save.id, toPort: 'in' }, { id: uid('e'), from: ifSave.id, fromPort: 'false', to: load.id, toPort: 'in' });
  onClick(w, done, back());
  return page('Save and load', [head, grid, done], w, 3);
}

/** The reader's settings: a row of choices for each, the one in use picked out. */
function settingsPage(): Artboard {
  const w = wiring();
  const rows: [string, string, [string, string][]][] = [
    ['Text speed', 'textSpeed', [['Slow', '20'], ['Normal', 'null'], ['Fast', '90'], ['Instant', '0']]],
    ['Auto speed', 'autoSpeed', [['Slow', '0.6'], ['Normal', '1'], ['Fast', '1.6']]],
    ['Skip', 'skipUnread', [['Lines I have read', 'false'], ['Every line', 'true']]],
    ['Music', 'music', [['Off', '0'], ['Quiet', '0.4'], ['Normal', '0.8'], ['Full', '1']]],
    ['Voices', 'voice', [['Off', '0'], ['Quiet', '0.5'], ['Full', '1']]],
    ['Sound effects', 'effects', [['Off', '0'], ['Quiet', '0.4'], ['Normal', '0.8'], ['Full', '1']]],
    ['Text size', 'textSize', [['As designed', '1'], ['Large', '1.25'], ['Largest', '1.5']]],
    ['Font', 'readable', [['As designed', 'false'], ['Easier to read', 'true']]],
  ];
  const kids: SceneNode[] = [heading('Settings', 32)];
  const rowW = 760;
  rows.forEach(([label, pref, choices], i) => {
    const y = 112 + i * 62;
    kids.push(createNode('text', { name: label, text: label, x: 80, y: y + 12, width: 260, height: 30, fontSize: 20, color: INK, autoSize: 'none' } as never));
    //choices fill the row in equal parts, 20 px apart
    const bw = (rowW - 20 * (choices.length - 1)) / choices.length;
    choices.forEach(([name, value], j) => {
      const now = value === 'null' ? `story.prefs.${pref} === null` : `story.prefs.${pref} == ${value}`;
      const b = button(`${label}: ${name}`, name, 360 + j * (bw + 20), y, bw, { height: 48, fontSize: 17, bindings: { 'fill.color': `${now} ? '${ACCENT}' : 'rgba(255, 255, 255, 0.92)'`, ariaPressed: `${now} ? 'true' : 'false'` } });
      kids.push(b);
      onClick(w, b, { kind: 'action.storyPref', params: { pref, value } });
    });
  });
  const done = button('Back', 'Back', 80, 640, 200);
  kids.push(done);
  onClick(w, done, back());
  return page('Settings', kids, w, 4);
}

/** The last lines said, newest at the bottom; click one to go back to it. */
function historyPage(stageId: string): Artboard {
  const w = wiring();
  const line = createNode('text', { name: 'Said', text: 'Who: what they said', x: 0, y: 0, width: 1120, height: 52, fontSize: 19, lineHeight: 1.35, color: INK, autoSize: 'height', cursor: 'pointer', role: 'button', bindings: { text: "(item.speaker ? item.speaker + ': ' : '') + item.text" } } as never);
  const list = createNode('frame', { name: 'Lines', x: 80, y: 150, width: 1120, height: 460, fill: null, clip: true, repeat: { items: 'story.history.slice(-9)', layout: 'vertical', gap: 10, columns: 1 }, children: [line] });
  const done = button('Back to the story', 'Back to the story', 80, 640, 280);
  onClick(w, line, { kind: 'action.storyRollBack', params: { steps: 'story.history.length + 1 - story.history.slice(-9)[event.index].number' } }, go(stageId));
  onClick(w, done, go(stageId));
  const hint = createNode('text', { name: 'Hint', text: 'Click a line to go back to it.', x: 80, y: 100, width: 800, height: 26, fontSize: 16, color: 'rgba(245, 242, 234, 0.7)', autoSize: 'none' } as never);
  return page('History', [heading('What was said', 28), hint, list, done], w, 2);
}

function extrasPage(puzzlesId: string): Artboard {
  const w = wiring();
  const pic = createNode('image', { name: 'Picture', x: 0, y: 0, width: 200, height: 112, fit: 'cover', cornerRadius: 8, fill: solid(PANEL), bindings: { assetId: "item.seen ? item.image : ''" } } as never);
  const locked = createNode('text', { name: 'Locked', text: '?', x: 0, y: 30, width: 200, height: 50, fontSize: 36, color: 'rgba(245, 242, 234, 0.5)', align: 'center', autoSize: 'none', bindings: { visible: '!item.seen' } } as never);
  const cell = createNode('frame', { name: 'Gallery picture', x: 0, y: 0, width: 200, height: 112, fill: solid(PANEL), cornerRadius: 8, clip: true, children: [pic, locked] });
  const gallery = createNode('frame', { name: 'Gallery', x: 80, y: 150, width: 650, height: 380, fill: null, repeat: { items: 'story.gallery', layout: 'grid', gap: 20, columns: 3 }, children: [cell] });
  const ending = createNode('text', { name: 'Ending', text: 'An ending', x: 0, y: 0, width: 380, height: 30, fontSize: 19, color: INK, autoSize: 'none', bindings: { text: "item.reached ? item.name : '???'" } } as never);
  const endings = createNode('frame', { name: 'Endings', x: 800, y: 150, width: 400, height: 200, fill: null, repeat: { items: 'story.endings', layout: 'vertical', gap: 8, columns: 1 }, children: [ending] });
  const chapter = button('Chapter', 'A chapter', 0, 0, 380, { height: 44, fontSize: 17, bindings: { label: "item.reached ? item.name : '???'", disabled: '!item.reached' } });
  const chapters = createNode('frame', { name: 'Chapter select', x: 800, y: 420, width: 400, height: 200, fill: null, repeat: { items: 'story.chapters', layout: 'vertical', gap: 10, columns: 1 }, children: [chapter] });
  const song = button('Song', 'Play', 0, 0, 200, { height: 40, fontSize: 16, bindings: { label: "item.heard ? 'Track ' + item.number : '???'", disabled: '!item.heard' } });
  const songs = createNode('frame', { name: 'Music room', x: 80, y: 580, width: 650, height: 40, fill: null, repeat: { items: 'story.musicRoom', layout: 'horizontal', gap: 20, columns: 1 }, children: [song] });
  const label = (text: string, x: number, y: number) => createNode('text', { name: text, text, x, y, width: 400, height: 30, fontSize: 22, fontWeight: 700, color: INK, autoSize: 'none', role: 'heading', headingLevel: 2 } as never);
  onClick(w, chapter, { kind: 'action.storyStart', params: { from: '{story.chapters[event.index].name}' } });
  onClick(w, song, { kind: 'action.sound', params: { source: 'story.musicRoom[event.index].sound', soundtrack: true, loop: true } });
  const done = button('Back', 'Back', 80, 640, 200);
  onClick(w, done, { kind: 'action.stopSound', params: {} }, back());
  const puzzles = button('Puzzles', 'Puzzles', 300, 640, 200);
  onClick(w, puzzles, { kind: 'action.stopSound', params: {} }, go(puzzlesId));
  return page('Extras', [heading('Extras', 32), label('Gallery', 80, 110), gallery, label('Endings', 800, 110), endings, label('Chapters', 800, 380), chapters, label('Music', 80, 540), songs, done, puzzles], w, 5);
}

/** The puzzle index: every puzzle, ??? until it's found, its score once solved; a found one plays again. */
function puzzlesPage(): Artboard {
  const w = wiring();
  const sub = createNode('text', { name: 'Score', text: 'Score', x: 80, y: 100, width: 900, height: 28, fontSize: 18, color: 'rgba(245, 242, 234, 0.75)', autoSize: 'none', bindings: { text: "story.score + ' points from ' + story.puzzles.filter((p) => p.solved).length + ' of ' + story.puzzles.length + ' puzzles. Hint coins: ' + story.coins" } } as never);
  const row = button('Puzzle', 'A puzzle', 0, 0, 1120, {
    height: 48,
    fontSize: 18,
    align: 'left',
    bindings: {
      label: "item.found ? item.number + '. ' + item.title + (item.solved ? '  ·  Solved, ' + item.score + ' of ' + item.full + ' points' : item.skipped ? '  ·  Skipped' : '  ·  Not solved yet') : item.number + '. ???'",
      disabled: '!item.found',
      'fill.color': `item.solved ? '${ACCENT}' : 'rgba(255, 255, 255, 0.92)'`,
    },
  });
  const list = createNode('frame', { name: 'Puzzle list', x: 80, y: 150, width: 1120, height: 460, fill: null, clip: true, repeat: { items: 'story.puzzles', layout: 'vertical', gap: 12, columns: 1 }, children: [row] });
  onClick(w, row, { kind: 'action.artboard', params: { to: 'expression', expr: 'story.puzzles[event.index].page', transition: 'fade', duration: 400 } });
  const done = button('Back', 'Back', 80, 640, 200);
  onClick(w, done, back());
  return page('Puzzles', [heading('Puzzles', 32), sub, list, done], w, 6);
}

/** The fair's last scene calls the sample puzzle and answers to how it went. */
const PUZZLE_LINES = `The tables thinned out as the sun went down.
Millie: Wait! Before you go, settle an argument for us.
[call Puzzle 1]
if story.result == "solved"
    Millie: I knew it was me. You're good at this.
else
    Millie: We'll ask you again tomorrow.
`;

/** The whole starter. The stage is the one Start a story makes, with buttons for the menu pages added to its row. */
export function visualNovel(): { project: Project; checklist: TemplateChecklistItem[] } {
  const project = createProject('Visual novel');
  //It carries the themes like every starter, but a stage is dark on purpose and keeps its own colours whichever is on
  project.themes = starterThemes();
  const hide = { id: uid('v'), name: HIDE_VAR, type: 'boolean' as const, initial: false };
  const mode = { id: uid('v'), name: 'savesMode', type: 'string' as const, initial: 'load' };
  project.variables.push(hide, mode);
  project.fonts.push({ family: 'Open Sans', source: 'google', weights: [400, 600, 700] }, { family: 'Atkinson Hyperlegible', source: 'google', weights: [400, 700] });
  project.settings.stage = '16:9';
  const stage = storyStage(hide.id, { canvasX: STAGE_W + 160, canvasY: 0 });
  const saves = savesPage(mode.id, mode.name);
  const settings = settingsPage();
  const history = historyPage(stage.id);
  const puzzles = puzzlesPage();
  const extras = extrasPage(puzzles.id);
  const title = titlePage(stage.id, saves.id, settings.id, extras.id, mode.id);

  //The stage's row of buttons gets Save, Load, History and Menu, and its words follow the reader's text size and font
  const find = (name: string) => {
    let hit: SceneNode | undefined;
    const look = (list: SceneNode[]) => {
      for (const n of list) {
        if (!hit && n.name === name) hit = n;
        if ('children' in n && Array.isArray(n.children)) look(n.children as SceneNode[]);
      }
    };
    look(stage.children);
    return hit!;
  };
  const bar = find('Story buttons') as SceneNode & { children: SceneNode[] };
  const more = (name: string, label: string) => createNode('button', { name, x: 0, y: 0, width: 84, height: 32, label, fontSize: 15, cornerRadius: 8, fill: solid('rgba(18, 18, 28, 0.7)'), color: INK });
  const extra = [more('Save', 'Save'), more('Load', 'Load'), more('History', 'History'), more('Menu', 'Menu')];
  bar.children.forEach((b, i) => (b.x = (extra.length + i) * 94));
  extra.forEach((b, i) => (b.x = i * 94));
  bar.children.unshift(...extra);
  bar.width = (bar.children.length * 94) - 10;
  bar.x = STAGE_W - 80 - bar.width;
  const sw = stage.logic as Wiring;
  onClick(sw, extra[0], { kind: 'action.setVariable', params: { variable: mode.id, value: "'save'" } }, go(saves.id));
  onClick(sw, extra[1], { kind: 'action.setVariable', params: { variable: mode.id, value: "'load'" } }, go(saves.id));
  onClick(sw, extra[2], go(history.id));
  onClick(sw, extra[3], { kind: 'action.storySave', params: { slot: "'auto'" } }, go(title.id));
  const words = find('Words');
  words.bindings = { ...words.bindings, fontSize: '26 * story.prefs.textSize', fontFamily: "story.prefs.readable ? 'Atkinson Hyperlegible' : 'Open Sans'" };
  //At the end, back to the title
  const toTitle = createNode('button', { name: 'Back to the title', x: (STAGE_W - 280) / 2, y: STAGE_H / 2 + 60, width: 280, height: 54, label: 'Back to the title', fontSize: 20, fontWeight: 600, cornerRadius: 12, fill: solid('rgba(255, 255, 255, 0.92)'), color: DARK, bindings: { visible: 'story.ended' } } as never);
  stage.children.push(toTitle);
  onClick(sw, toTitle, go(title.id));

  title.canvasX = 0;
  project.artboards = [title, stage, history, saves, settings, extras, puzzles];
  //A sample puzzle the chapter calls, answered by its question, with hints that cost hint coins
  const puzzleId = addPuzzlePage(project, {
    name: 'Puzzle 1',
    title: 'Who brought the biscuits?',
    hints: ["Sam's snack is already known.", 'That leaves the biscuits and the crisps for Millie and Olive.'],
    bigHint: "Olive didn't bring the biscuits. So who did?",
    question: {
      prompt: 'Millie, Olive and Sam each brought one snack to the fair: biscuits, fruit or crisps. Olive didn\'t bring biscuits. Sam brought fruit. Who brought the biscuits?',
      options: [
        { id: 'o1', text: 'Millie', correct: true },
        { id: 'o2', text: 'Olive' },
        { id: 'o3', text: 'Sam' },
      ],
      shuffle: false,
    },
  });
  project.artboards.forEach((a, i) => (a.canvasX = i * (STAGE_W + 160)));
  project.settings.startArtboardId = title.id;
  project.story = {
    stage: stage.id,
    chapters: [{ id: uid('ch'), name: 'Chapter 1', lines: linesOf(SAMPLE_CHAPTER.replace('The tables thinned out as the sun went down.\n', PUZZLE_LINES)) }],
    cast: [
      { id: uid('cm'), name: 'Millie', colour: '#c2410c', expressions: [] },
      { id: uid('cm'), name: 'Olive', colour: '#1d4ed8', expressions: [] },
    ],
  };
  const item = (text: string, node?: SceneNode, artboard?: Artboard): TemplateChecklistItem => ({ id: uid('ck'), text, ...(node ? { nodeId: node.id } : {}), ...(artboard ? { artboardId: artboard.id } : {}), done: false });
  return {
    project,
    checklist: [
      item('Give it a title on the title screen', title.children[0], title),
      item('Write your story in the Story tab: the sample shows every kind of line'),
      item('Add your characters in the Story tab under Cast, with a picture for each face (pictures named after them fill the faces in)'),
      item('Add backgrounds to Assets and show them with a line like [bg Quad]'),
      item('Restyle the dialogue box: its colour, the name plate and the words', find('Dialogue box'), stage),
      item('Write your own puzzle on Puzzle 1: the question, and its title, value and hints under Puzzle in the page settings', undefined, project.artboards.find((a) => a.id === puzzleId)),
      item('Preview it from the title, play to an ending, and try Save, Load, History and Settings'),
    ],
  };
}
