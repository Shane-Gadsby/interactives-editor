/**
 * Mind map: an idea map to explore (fold and unfold branches, open an idea's details, move round with the arrow keys, read it as an
 * outline) and a blank one the learner builds (add, rename, delete, drag an idea onto another, move in and out, saved for next time,
 * downloadable). Both are data, a list of `{id, parent, label, detail}`, laid out by `mindMap(...)`, with one repeater for the boxes,
 * one for the lines (connectors joined to the boxes by their parents) and one for the fold buttons.
 */
import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, overlay, solid, stroke, text, type BrandedCtx, type BrandedStarter, type LayoutState } from '../../kit';
import { addVar, announce, bind, click, graph, graphNote, set, toggleVar, type ActionStep } from '../../graph-kit';
import { dialogPanel, fill, openDialog, stack } from '../../parts';
import { heroButtons } from './helpers';

const IDEAS = [
  { id: 'r', parent: '', label: 'Learning well', detail: 'Four habits that help most people learn: plan, read actively, practise remembering, and look after yourself.' },
  { id: 'plan', parent: 'r', label: 'Plan', detail: 'Decide what you will do and when, so study does not depend on how you feel on the day.' },
  { id: 'goals', parent: 'plan', label: 'Set goals', detail: 'Write one goal for each study session, small enough to finish: "do the practice questions on chapter 3".' },
  { id: 'week', parent: 'plan', label: 'Weekly timetable', detail: 'Put classes, work and study blocks in one calendar. Seeing the whole week shows a crowded day before you are in it.' },
  { id: 'read', parent: 'r', label: 'Read actively', detail: 'Reading is not learning until you do something with it: ask questions, say it back, make notes.' },
  { id: 'skim', parent: 'read', label: 'Skim first', detail: 'Read the headings and the summary before the detail, so you know where the chapter is going.' },
  { id: 'notes', parent: 'read', label: 'Take notes', detail: 'Write in your own words. Notes you have to think about are notes you are more likely to remember.' },
  { id: 'cornell', parent: 'notes', label: 'Cornell notes', detail: 'Leave a margin for questions and a space for a summary. Cover the notes and answer your own questions from the margin.' },
  { id: 'maps', parent: 'notes', label: 'Mind maps', detail: 'Like this one: the big idea in the middle and the parts branching out, so you see how they connect.' },
  { id: 'remember', parent: 'r', label: 'Remember', detail: 'Memory strengthens each time you pull something out of it, not each time you put it in.' },
  { id: 'spaced', parent: 'remember', label: 'Spaced practice', detail: 'Short sessions over several days beat one long cram, because each return comes just as you start to forget.' },
  { id: 'test', parent: 'remember', label: 'Test yourself', detail: 'Close the book and try to recall the main points. Retrieving an idea strengthens it far more than reading it again.' },
  { id: 'care', parent: 'r', label: 'Look after yourself', detail: 'A tired, stressed brain learns less. Rest and asking for help are part of studying, not a break from it.' },
  { id: 'sleep', parent: 'care', label: 'Sleep', detail: 'Sleep is when the day is filed away. Trading it for extra study hours usually costs more than it gains.' },
  { id: 'help', parent: 'care', label: 'Ask for help early', detail: 'A small question now saves a big gap later. Your teaching team and study support services want to be asked.' },
];

const MAP_H = 372;
//The learner's map is a little shorter, to leave room under it for keeping it (save, download, open, start again)
const BUILD_H = 330;
const EDIT_W = 640;
const NODE_H = 44;
//What a new learner's map, and Start a new map, begins with
const FIRST_MAP = { id: 'n1', parent: '', label: 'My topic' };

/** States for the layout check besides the start: the idea dialog open, the outline view, branches folded, and the learner's page with a deep map of long words. */
export const MINDMAP_LAYOUT_STATES: LayoutState[] = [
  { label: 'idea dialog open', page: 'Explore', vars: { detailOpen: true, focused: 7 } },
  { label: 'outline view', page: 'Explore', vars: { showOutline: true } },
  { label: 'branches folded', page: 'Explore', vars: { folded: ['plan', 'read', 'remember'] } },
  { label: 'map not kept', page: 'Build your own', vars: { keepMap: false } },
  { label: 'map saved', page: 'Build your own', vars: { mapSaved: true } },
  { label: 'new map question', page: 'Build your own', vars: { newMapOpen: true } },
  { label: 'open a saved map', page: 'Build your own', vars: { openMapOpen: true, openMapMessage: 'That is not a map saved from this page. Open the downloaded file in a text editor and paste all of it.' } },
  {
    label: 'a deep and wide map',
    page: 'Build your own',
    vars: {
      mine: [
        { id: 'n1', parent: '', label: 'A topic with a rather long name' },
        ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, parent: 'n1', label: `Branch number ${i + 1}` })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, parent: `a${i % 5}`, label: `A longer sub idea ${i + 1}` })),
        { id: 'c1', parent: 'b0', label: 'Deeper' },
        { id: 'c2', parent: 'c1', label: 'Deepest' },
      ],
    },
  },
];

/** The look of an idea by how deep it is, as expressions over `item` giving token references: the root deep and white, the first level outlined in the text colour, the rest quiet. */
function look(L: BrandedCtx['L']) {
  const by = (root: string, first: string, rest: string) => `item.depth == 0 ? "${root}" : item.depth == 1 ? "${first}" : "${rest}"`;
  return {
    fill: by(L.deep, L.surface, L.background),
    color: by(L.onDeep, L.text, L.text),
    line: by(L.onDeep, L.text, L.muted),
    width: 'item.depth == 1 ? 2.5 : item.depth == 0 ? 2 : 1.5',
  };
}

/**
 * The repeaters of a map over a layout list (`from`): the lines behind, the idea boxes (each a button; the list is one Tab stop and
 * the arrow keys move the focus, which `focus` holds as a number) and, for a map that folds, a fold button on the outer edge of every
 * idea that has others under it. Everything is placed by the layout's numbers, so nothing is positioned by hand.
 */
function mapLayers(ctx: BrandedCtx, o: { from: string; focus: Variable; area: { width: number; height: number }; folds?: boolean; ariaLabel: string; nodeW: number; nodeH: number }) {
  const { L } = ctx;
  const lk = look(L);
  //The idea that has the keyboard is drawn with a heavy outline (in the text colour, or white on the deep root), so it shows without a layer of its own
  const here = `index == ${o.focus.name}`;
  const idea = createNode('button', {
    name: 'Idea',
    label: '{item.label}',
    x: 0,
    y: 0,
    width: o.nodeW,
    height: o.nodeH,
    cornerRadius: 14,
    fill: solid(L.background),
    stroke: stroke(L.muted, 1.5),
    color: L.text,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: BRAND_FONT,
    role: 'button',
    focusable: true,
    bindings: {
      x: 'item.x',
      y: 'item.y',
      width: 'item.w',
      height: 'item.h',
      visible: 'item.visible',
      'fill.color': lk.fill,
      color: lk.color,
      'stroke.paint.color': `${here} ? (item.depth == 0 ? "${L.onDeep}" : "${L.text}") : ${lk.line}`,
      'stroke.width': `${here} ? 4 : ${lk.width}`,
      ariaLabel: 'item.label + (item.kids > 0 ? ", " + item.kids + (item.kids == 1 ? " idea under it" : " ideas under it") + (item.folded ? ", folded" : "") : "")',
    },
  } as never);
  const repeat = { items: o.from, layout: 'none' as const, gap: 0, columns: 1 };
  //The repeaters' boxes are a point: their layers are placed by the layout, and a box the size of the map would sit over the ideas and take their clicks
  const area = { x: 0, y: 0, width: 1, height: 1, fitContents: false };
  const ideas = createNode('group', { name: 'Ideas', ...area, repeat, keyNav: { mode: 'list', orientation: 'both', countHidden: true, indexVariable: o.focus.id }, children: [idea] } as never);
  //A line to each idea from its parent: the connector's ends pick the copy of the idea box by number, so it follows a box wherever the layout puts it
  const line = createNode('connector', {
    name: 'Branch line',
    from: { layer: { repeat: idea.id, index: 'item.parentIndex' }, side: 'right' },
    to: { layer: { repeat: idea.id, index: 'index' }, side: 'left' },
    route: 'curved',
    endCap: 'none',
    gap: 2,
    fill: null,
    color: L.text,
    fontFamily: BRAND_FONT,
    stroke: stroke(L.muted, 2.5),
    bindings: { 'from.side': 'item.side == "left" ? "left" : "right"', 'to.side': 'item.side == "left" ? "right" : "left"' },
  } as never);
  const lines = createNode('group', { name: 'Branch lines', ...area, repeat, children: [line] } as never);
  const layers: SceneNode[] = [lines, ideas];
  let folds: SceneNode | undefined;
  if (o.folds) {
    const dot = createNode('button', {
      name: 'Fold button',
      label: '{item.folded ? "+" : "–"}',
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      cornerRadius: 12,
      fill: solid(L.background),
      stroke: stroke(L.muted, 1.5),
      color: L.text,
      fontSize: 16,
      fontWeight: 700,
      fontFamily: BRAND_FONT,
      focusable: false,
      bindings: {
        x: 'item.side == "left" ? item.x - 12 : item.x + item.w - 12',
        y: 'item.y + item.h / 2 - 12',
        visible: 'item.visible && item.kids > 0 && item.side != "root"',
        ariaLabel: '(item.folded ? "Unfold " : "Fold ") + item.label',
      },
    } as never);
    folds = createNode('group', { name: 'Folds', ...area, repeat, children: [dot] } as never);
    layers.push(folds);
  }
  const map = createNode('frame', { name: 'Mind map', x: 0, y: 0, width: o.area.width, height: o.area.height, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: o.ariaLabel, children: layers } as never) as FrameNode;
  return { map, ideas, folds, idea };
}

/** The idea an arrow key goes to from the one with the keyboard (the layout says which), or where it already is. */
const go = (focus: string, list: string, key: 'right' | 'left' | 'up' | 'down') => `${list}[${focus}].${key} >= 0 ? ${list}[${focus}].${key} : ${focus}`;

export const mindMapStarter: BrandedStarter = {
  key: 'explore/mind-map',
  set: 'explore',
  name: 'Mind map',
  description: 'A mind map to explore and one to build. Explore: ideas branching both ways from the middle, each a button that opens its details, branches that fold and unfold, arrow keys that move between ideas, and an outline view as text. Build: the learner adds, renames, deletes, drags and moves in and out their own ideas, saved for next time (or not, as the author chooses) and downloadable, with a way to open a download again. Drawn from one list of ideas, so you edit data, not shapes.',
  tags: ['mind map', 'diagram', 'connectors', 'keyboard friendly', 'saved'],
  layoutStates: MINDMAP_LAYOUT_STATES,
  build(colourway) {
    const ctx = brandedProject(colourway, 'Mind map');
    const { L, project } = ctx;

    //The pages first, so the first page's buttons can go to them
    const hero = brandedPage(ctx, 'Mind maps', { kind: 'hero', subtitle: 'Explore a map of ideas, or build one of your own.', name: 'Start' });
    const explore = brandedPage(ctx, 'Learning well: a mind map', { name: 'Explore', footer: 'Explore  ·  Page {pageNumber} of {pageCount}' });
    const build = brandedPage(ctx, 'Build your own mind map', { name: 'Build your own', footer: 'Build your own  ·  Page {pageNumber} of {pageCount}' });
    heroButtons(ctx, hero, [
      { name: 'Explore button', label: 'Explore a mind map', to: explore, width: 250 },
      { name: 'Build button', label: 'Build your own', to: build, width: 210 },
    ]);
    const box = contentBox(explore);

    // ------------------------------------------------------------------ explore
    addVar(project, 'ideas', 'list', IDEAS);
    //The ids of the branches that are folded away
    const folded = addVar(project, 'folded', 'list', []);
    //Which idea has the keyboard, as its place in the list from 0: the list's key navigation writes it, and the flows below read it
    const focused = addVar(project, 'focused', 'number', 0);
    const detailOpen = addVar(project, 'detailOpen', 'boolean', false);
    const showOutline = addVar(project, 'showOutline', 'boolean', false);
    addVar(project, 'place', 'list', [], { formula: `mindMap(ideas, {width: ${box.width}, height: ${MAP_H}, nodeW: 120, nodeH: ${NODE_H}, gapX: 40, collapsed: folded})`, live: true });
    addVar(project, 'outline', 'string', '', { formula: 'mindMapOutline(ideas, {detail: "detail"})', live: true });

    const layers = mapLayers(ctx, { from: 'place', focus: focused, area: { width: box.width, height: MAP_H }, folds: true, nodeW: 120, nodeH: NODE_H, ariaLabel: 'Mind map of learning well. Tab to reach the ideas, then use the arrow keys to move between them. Enter opens an idea, plus and minus fold and unfold a branch. The outline view lists every idea as text.' });
    const mapFrame = bind(Object.assign(layers.map, { x: box.x, y: box.y }), { visible: '!showOutline' });
    const outlineText = text(ctx, 'Outline text', '{outline}', 24, 18, box.width - 48, { fontSize: 17, lineHeight: 1.5 });
    const outlineFrame = bind(
      createNode('frame', { name: 'Outline', x: box.x, y: box.y, width: box.width, height: MAP_H, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: true, scroll: 'vertical', role: 'region', ariaLabel: 'Outline of the mind map', children: [outlineText] } as never),
      { visible: 'showOutline' },
    );
    explore.children.push(mapFrame, outlineFrame);

    const unfold = button(ctx, 'Unfold all button', 'Unfold all', 0, 0, 150, false);
    const fold = button(ctx, 'Fold all button', 'Fold all', 0, 0, 150, false);
    const view = button(ctx, 'View button', '{showOutline ? "Show as a map" : "Show as an outline"}', 0, 0, 230, false);
    const rowY = box.y + MAP_H + 12;
    explore.children.push(stack('Map controls', box.x, rowY, box.width, { direction: 'row', gap: 12, align: 'start', children: [unfold, fold, view] }));
    const hint = bind(text(ctx, 'Keyboard hint', 'Arrow keys move between ideas, Enter opens one, plus and minus fold and unfold a branch.', box.x, rowY + 58, box.width, { fontSize: 15, color: L.muted }), { visible: '!showOutline' });
    const hintOutline = bind(text(ctx, 'Outline hint', 'The outline lists every idea, with what each one says, in reading order.', box.x, rowY + 58, box.width, { fontSize: 15, color: L.muted }), { visible: 'showOutline' });
    explore.children.push(hint, hintOutline);

    //The idea dialog: its title and words follow the idea that has the keyboard
    const detail = text(ctx, 'Idea detail', '{place[focused].detail}', 24, 64, 552, { fontSize: 18, lineHeight: 1.45 });
    const partOf = text(ctx, 'Idea parent', '{place[focused].parentIndex >= 0 ? "Part of: " + place[place[focused].parentIndex].label : "The big idea in the middle."}', 24, 190, 552, { fontSize: 15, color: L.muted });
    const dialog = dialogPanel(ctx, explore, 'Idea dialog', detailOpen, { x: (explore.width - 600) / 2, y: 150, width: 600, height: 300, title: 'Idea', children: [detail, partOf] });
    //(it is meant to sit over the map)
    overlay(dialog.frame);
    bind(dialog.title, { text: 'place[focused].label' });

    {
      const g = graph(explore);
      //One flow for every idea: the click lands on a copy of the box (event.childIndex), which then has the keyboard, and opens its dialog
      const onIdea = g.event('event.pointer', { target: layers.ideas.id, type: 'click', childrenOnly: true }, 'Open an idea');
      graphNote(explore, { anchor: onIdea, colour: 'sky', text: '**One flow serves every idea.** The click lands on a copy of the box, `event.childIndex` says which, and that idea then has the keyboard (`focused`) and its dialog opens.' });
      g.run(onIdea, set(focused, 'event.childIndex'), openDialog(detailOpen), announce('place[focused].label + ". " + (place[focused].detail ?? "")'));
      //...and one for every fold button
      const onFold = g.event('event.pointer', { target: layers.folds!.id, type: 'click', childrenOnly: true }, 'Fold or unfold a branch');
      g.run(onFold, set(focused, 'event.childIndex'), ['action.setVariable', { variable: folded.id, op: 'toggleItem', value: 'place[focused].id' }]);
      //The arrow keys: the layout says which idea each one goes to. Outwards on a folded branch unfolds it first
      for (const [key, side] of [['ArrowRight', 'right'], ['ArrowLeft', 'left']] as const) {
        const k = g.event('event.key', { key, type: 'keydown', target: layers.ideas.id }, `${key} goes ${side}`);
        const closed = g.then(k, 'logic.if', { condition: `place[focused].folded && place[focused].side == "${side}"` });
        g.then(closed, 'action.setVariable', { variable: folded.id, op: 'toggleItem', value: 'place[focused].id' }, 'true');
        g.then(closed, 'action.setVariable', { variable: focused.id, op: 'set', value: go('focused', 'place', side) }, 'false');
      }
      for (const [key, dir] of [['ArrowUp', 'up'], ['ArrowDown', 'down']] as const) {
        const k = g.event('event.key', { key, type: 'keydown', target: layers.ideas.id }, `${key} goes ${dir}`);
        g.run(k, set(focused, go('focused', 'place', dir)));
      }
      const more = g.event('event.key', { key: '+', type: 'keydown', target: layers.ideas.id }, 'Unfold the branch');
      g.then(g.then(more, 'logic.if', { condition: 'place[focused].folded' }), 'action.setVariable', { variable: folded.id, op: 'toggleItem', value: 'place[focused].id' }, 'true');
      const less = g.event('event.key', { key: '-', type: 'keydown', target: layers.ideas.id }, 'Fold the branch');
      g.then(g.then(less, 'logic.if', { condition: 'place[focused].kids > 0 && !place[focused].folded && place[focused].side != "root"' }), 'action.setVariable', { variable: folded.id, op: 'toggleItem', value: 'place[focused].id' }, 'true');
      g.run(click(g, unfold, 'Unfold everything'), set(folded, '[]'));
      g.run(click(g, fold, 'Fold every branch'), set(folded, 'ideas.filter(n => n.parent != "" && ideas.some(m => m.parent == n.id)).map(n => n.id)'), set(focused, '0'));
      g.run(click(g, view, 'Map or outline'), toggleVar(showOutline), set(detailOpen, 'false'));
    }

    // ------------------------------------------------------------------ build your own
    const bbox = contentBox(build);
    //The author's setting: keep the learner's map for next time (true) or only until they leave (false). Change it in the Variables panel.
    addVar(project, 'keepMap', 'boolean', true);
    //Set once the saved map has been looked for (nothing is saved before that, or the starting map would overwrite it), and while what is on screen is what was saved
    const ready = addVar(project, 'mapReady', 'boolean', false);
    const saved = addVar(project, 'mapSaved', 'boolean', false);
    const mine = addVar(project, 'mine', 'list', [FIRST_MAP]);
    const at = addVar(project, 'mineAt', 'number', 0);
    const draft = addVar(project, 'draft', 'string', 'My topic');
    //The id of the idea a change is about, kept across it because the change can move the idea in the list
    const picked = addVar(project, 'picked', 'string', '');
    const newOpen = addVar(project, 'newMapOpen', 'boolean', false);
    const openOpen = addVar(project, 'openMapOpen', 'boolean', false);
    //What the learner pastes in to open a saved map, and what is said when it is not one
    const pasted = addVar(project, 'pastedMap', 'string', '');
    const openMessage = addVar(project, 'openMapMessage', 'string', '');
    addVar(project, 'mineLayout', 'list', [], { formula: `mindMap(mine, {width: ${EDIT_W}, height: ${BUILD_H}, nodeW: 112, nodeH: ${NODE_H}, gapX: 36})`, live: true });
    addVar(project, 'mineOutline', 'string', '', { formula: 'mindMapOutline(mine)', live: true });

    const mineLayers = mapLayers(ctx, { from: 'mineLayout', focus: at, area: { width: EDIT_W, height: BUILD_H }, nodeW: 112, nodeH: NODE_H, ariaLabel: 'Your mind map. Tab to reach the ideas, then use the arrow keys to move between them. Drag an idea onto another to move it there.' });
    build.children.push(Object.assign(mineLayers.map, { x: bbox.x, y: bbox.y }));

    const word = createNode('input', {
      name: 'Idea text box',
      ...lookDefaults(project, 'input'),
      inputType: 'text',
      placeholder: 'Type an idea',
      ariaLabel: 'Idea text',
      bindings: { value: 'draft' },
      bindingModes: { value: 'both' },
      x: 0,
      y: 0,
      width: 100,
      height: 46,
      cornerRadius: 12,
      fontSize: 17,
      fontFamily: BRAND_FONT,
      stroke: stroke(L.border, 2),
    } as never);
    const cell = (name: string, label: string, off?: string) => {
      const b = button(ctx, name, label, 0, 0, 100, false);
      b.height = 40;
      b.fontSize = 14;
      if (off) bind(b, { disabled: off });
      return fill(b);
    };
    const isRoot = 'mineLayout[mineAt].depth == 0';
    const addIn = cell('Add inside button', 'Add inside');
    const addBeside = cell('Add beside button', 'Add beside', isRoot);
    const rename = cell('Rename button', 'Rename');
    const remove = cell('Delete button', 'Delete', isRoot);
    const up = cell('Move up button', 'Move up', isRoot);
    const down = cell('Move down button', 'Move down', isRoot);
    const moveIn = cell('Move in button', 'Move in', isRoot);
    const moveOut = cell('Move out button', 'Move out', isRoot);
    const pair = (name: string, a: SceneNode, b: SceneNode) => stack(name, 0, 0, 100, { direction: 'row', gap: 10, children: [a, b] });
    fill(word);
    build.children.push(
      stack('Build controls', bbox.x + EDIT_W + 24, bbox.y, bbox.width - EDIT_W - 24, {
        gap: 10,
        children: [heading(ctx, 'Controls heading', 'Selected idea', 0, 0, 100, { fontSize: 18 }), word, pair('Add row', addIn, addBeside), pair('Rename row', rename, remove), pair('Order row', up, down), pair('Level row', moveIn, moveOut)],
      }),
    );
    //Where the map is kept, said in words: the author's keepMap setting decides which line shows
    const keepStatus = text(ctx, 'Keep status', '{keepMap ? (mapSaved ? "Saved for you on this course page." : "Saving...") : "Only until you leave. Download a copy to keep it."}', bbox.x + EDIT_W + 24, bbox.y + BUILD_H - 40, bbox.width - EDIT_W - 24, { fontSize: 15, color: L.muted });
    build.children.push(keepStatus);

    //Keeping the map, in two rows under it: what stays on the course page, then what leaves it as a file
    const keepBtn = (name: string, label: string, width: number, primary = false) => {
      const b = button(ctx, name, label, 0, 0, width, primary);
      Object.assign(b, { height: 40, cornerRadius: 20, fontSize: 15 });
      return b;
    };
    const saveBtn = bind(keepBtn('Save button', 'Save', 110, true), { label: 'mapSaved ? "Saved" : "Save"', disabled: 'mapSaved', visible: 'keepMap' });
    const newBtn = keepBtn('New map button', 'Start a new map', 190);
    const openBtn = keepBtn('Open map button', 'Open a saved map', 200);
    const dlText = keepBtn('Download outline button', 'Download as text outline', 250);
    const dlPage = keepBtn('Download page button', 'Download as a picture', 230);
    const dlCopy = keepBtn('Download copy button', 'Download a copy to open later', 300);
    const keepY = bbox.y + BUILD_H + 12;
    build.children.push(
      stack('Keep row', bbox.x, keepY, bbox.width, { direction: 'row', gap: 12, align: 'start', children: [saveBtn, newBtn, openBtn] }),
      stack('Download row', bbox.x, keepY + 48, bbox.width, { direction: 'row', gap: 12, align: 'start', children: [dlText, dlPage, dlCopy] }),
    );
    build.children.push(text(ctx, 'Build hint', 'Click an idea or use the arrow keys, type its words, then use the buttons. Drag one idea onto another to move it.', bbox.x, keepY + 96, bbox.width, { fontSize: 15, color: L.muted }));

    //Start a new map asks first, and Open a saved map takes the file's words pasted in (there is no file picker in a page like this)
    const sure = text(ctx, 'New map warning', 'This clears every idea on your map and leaves the one in the middle. If you want to keep this map, download a copy first.', 24, 64, 512, { fontSize: 18, lineHeight: 1.45 });
    const clearIt = button(ctx, 'Clear map button', 'Clear it and start again', 560 - 24 - 140 - 12 - 250, 260 - 24 - 46, 250, true);
    const newDialog = dialogPanel(ctx, build, 'New map dialog', newOpen, { x: (build.width - 560) / 2, y: 170, width: 560, height: 260, title: 'Start a new map?', closeLabel: 'Keep my map', children: [sure, clearIt] });
    overlay(newDialog.frame);
    const how = text(ctx, 'Open map help', 'Open the file you got from "Download a copy to open later" in any text editor, copy everything in it and paste it here.', 24, 64, 592, { fontSize: 17, lineHeight: 1.45 });
    const paste = createNode('input', {
      name: 'Saved map box',
      ...lookDefaults(project, 'input'),
      inputType: 'textarea',
      placeholder: 'Paste the saved map here',
      ariaLabel: 'The saved map, pasted from its file',
      bindings: { value: 'pastedMap' },
      bindingModes: { value: 'both' },
      x: 24,
      y: 130,
      width: 592,
      height: 130,
      cornerRadius: 12,
      fontSize: 15,
      fontFamily: BRAND_FONT,
      stroke: stroke(L.border, 2),
    } as never);
    const sorry = bind(text(ctx, 'Open map message', '{openMapMessage}', 24, 272, 592, { fontSize: 16, fontWeight: 600, color: L.error }), { visible: 'openMapMessage != ""' });
    const openIt = button(ctx, 'Open this map button', 'Open this map', 640 - 24 - 140 - 12 - 200, 400 - 24 - 46, 200, true);
    const openDialog2 = dialogPanel(ctx, build, 'Open map dialog', openOpen, { x: (build.width - 640) / 2, y: 110, width: 640, height: 400, title: 'Open a saved map', closeLabel: 'Cancel', children: [how, paste, sorry, openIt] });
    overlay(openDialog2.frame);

    {
      const g = graph(build);
      //Any change that can move an idea in the list: remember which one it was by its id, change, then find it again
      const change = (expr: string): ActionStep[] => [set(picked, 'mine[mineAt].id'), set(mine, expr), set(at, 'mine.findIndex(n => n.id == picked)')];
      const adds = (parent: string): ActionStep[] => [set(picked, 'mindMapNextId(mine)'), set(mine, `mindMapEdit(mine, "add", ${parent}, draft)`), set(at, 'mine.findIndex(n => n.id == picked)'), announce('"Added " + mine[mineAt].label')];
      const onStart = g.event('event.start', {}, 'Coming back: show the selected idea in the box');
      graphNote(build, { anchor: onStart, colour: 'sky', text: '**Every change goes through mindMapEdit.** An idea can move in the list when it is changed, so each flow keeps its id in `picked` and finds it again.' });
      g.run(onStart, set(draft, 'mineLayout[mineAt].label'));
      g.run(g.event('event.variable', { variable: at.id }, 'A different idea is selected'), set(draft, 'mineLayout[mineAt].label'));
      g.run(g.event('event.pointer', { target: mineLayers.ideas.id, type: 'click', childrenOnly: true }, 'Select an idea'), set(at, 'event.childIndex'));
      g.run(click(g, addIn, 'Add an idea inside the selected one'), ...adds('mineAt'));
      g.run(click(g, addBeside, 'Add an idea beside the selected one'), ...adds('mineLayout[mineAt].parentIndex'));
      g.run(click(g, rename, 'Rename the selected idea'), ...change('mindMapEdit(mine, "rename", mineAt, draft)'));
      for (const [btn, op, note] of [[up, 'up', 'Move before the idea above'], [down, 'down', 'Move after the idea below'], [moveIn, 'indent', 'Move into the idea above it'], [moveOut, 'outdent', 'Move out beside its parent']] as const)
        g.run(click(g, btn, note), ...change(`mindMapEdit(mine, "${op}", mineAt, "")`), announce(`mine[mineAt].label + " moved"`));
      //Deleting: the selection goes to the idea it hung from, found again by id once the list has changed
      const dropIdea = (): ActionStep[] => [announce('"Deleted " + mine[mineAt].label'), set(picked, 'mine[mineLayout[mineAt].parentIndex].id'), set(mine, 'mindMapEdit(mine, "delete", mineAt, "")'), set(at, 'mine.findIndex(n => n.id == picked)')];
      //A branch of steps off one output of a node (an If's true), for the flows that only run when something holds
      const onlyIf = (from: ReturnType<typeof g.event>, condition: string, steps: ActionStep[]) => {
        let last = g.then(from, 'logic.if', { condition });
        steps.forEach(([kind, params], i) => (last = g.then(last, kind, params, i === 0 ? 'true' : 'out')));
      };
      onlyIf(g.event('event.key', { key: 'Delete', type: 'keydown', target: mineLayers.ideas.id }, 'The Delete key'), 'mineLayout[mineAt].depth > 0', dropIdea());
      g.run(click(g, remove, 'Delete the selected idea and what is under it'), ...dropIdea());
      //Drag one idea onto another to put it inside
      onlyIf(g.event('event.pointer', { target: mineLayers.ideas.id, type: 'dragend', childrenOnly: true }, 'Drag an idea onto another'), 'event.startIndex != null && event.index != null && event.startIndex != event.index', [
        set(picked, 'mine[event.startIndex].id'),
        set(mine, 'mindMapEdit(mine, "reparent", event.startIndex, event.index)'),
        set(at, 'mine.findIndex(n => n.id == picked)'),
      ]);
      //The arrow keys, the same as the explore page's
      for (const [key, dir] of [['ArrowRight', 'right'], ['ArrowLeft', 'left'], ['ArrowUp', 'up'], ['ArrowDown', 'down']] as const) {
        g.run(g.event('event.key', { key, type: 'keydown', target: mineLayers.ideas.id }, `${key} goes ${dir}`), set(at, go('mineAt', 'mineLayout', dir)));
      }
      g.run(click(g, dlText, 'Download the outline'), ['action.saveFile', { name: '"my-mind-map"', text: 'mineOutline', mime: 'text/plain' }]);
      g.run(click(g, dlPage, 'Download a page with the picture'), ['action.saveFile', { name: '"my-mind-map"', text: '"<!doctype html><html lang=\\"en\\"><meta charset=\\"utf-8\\"><title>My mind map</title><body style=\\"font-family:sans-serif\\"><h1>My mind map</h1>" + mindMapSvg(mineLayout, {width: 640, height: ' + BUILD_H + ', title: "My mind map"}) + "<h2>Outline</h2><pre>" + html(mineOutline) + "</pre></body></html>"', mime: 'text/html' }]);
      //A copy that Open a saved map can read back: the ideas, as the list itself
      g.run(click(g, dlCopy, 'Download a copy to open again'), ['action.saveFile', { name: '"my-mind-map"', text: 'JSON.stringify(mine)', mime: 'application/json' }]);

      //Keeping it: the saved map is looked for as the page opens (when the author keeps it), and every change after that is saved
      const saveMine: ActionStep = ['action.saveUserData', { variables: [mine.id] }];
      const looked = g.then(g.then(onStart, 'logic.if', { condition: 'keepMap' }), 'action.loadUserData', { variables: [mine.id] }, 'true');
      g.run(looked, set(ready, 'true'), set(draft, 'mineLayout[mineAt].label'), set(saved, 'true'));
      g.then(g.then(looked, 'action.setVariable', { variable: ready.id, op: 'set', value: 'true' }, 'none'), 'action.setVariable', { variable: saved.id, op: 'set', value: 'true' });
      onlyIf(g.event('event.variable', { variable: mine.id }, 'The map changed'), 'keepMap && mapReady', [set(saved, 'false'), saveMine, set(saved, 'true')]);
      onlyIf(click(g, saveBtn, 'Save the map now'), 'keepMap', [saveMine, set(saved, 'true'), announce('"Your map is saved"')]);

      //Start a new map, after asking
      g.run(click(g, newBtn, 'Ask before starting a new map'), set(newOpen, 'true'));
      g.run(click(g, clearIt, 'Start a new map'), set(mine, `[${JSON.stringify(FIRST_MAP).replace(/"(\w+)":/g, '$1: ')}]`), set(at, '0'), set(draft, '"My topic"'), set(newOpen, 'false'), announce('"A new map: My topic"'));

      //Open a saved map: what was pasted has to be a list of ideas, each with an id and words, and is then trimmed to just those
      const valid = 'pastedMap.trim().startsWith("[") && JSON.parse(pastedMap).length > 0 && JSON.parse(pastedMap).length <= 80 && JSON.parse(pastedMap).every(n => typeof n.id == "string" && typeof n.label == "string")';
      g.run(click(g, openBtn, 'Open a saved map'), set(pasted, '""'), set(openMessage, '""'), set(openOpen, 'true'));
      const opened = g.then(click(g, openIt, 'Open the pasted map'), 'logic.if', { condition: valid });
      graphNote(build, { anchor: opened, colour: 'sky', text: '**Only a map saved from here opens.** The pasted words must be a list of ideas, each with an `id` and a `label`, or the dialog says so and the map on the page is left alone.' });
      let last = g.then(opened, 'action.setVariable', { variable: mine.id, op: 'set', value: 'JSON.parse(pastedMap).map(n => ({id: String(n.id), parent: String(n.parent || ""), label: String(n.label)}))' }, 'true');
      for (const [kind, params] of [set(at, '0'), set(draft, 'mineLayout[mineAt].label'), set(openOpen, 'false'), announce('"Opened your map"')]) last = g.then(last, kind, params);
      g.then(opened, 'action.setVariable', { variable: openMessage.id, op: 'set', value: '"That is not a map saved from this page. Open the downloaded file in a text editor and paste all of it."' }, 'false');
    }

    // ------------------------------------------------------------------ notes and checklist
    const below = (page: typeof explore, x: number) => ({ x, y: page.height + 14, w: 440, h: 96 });
    addNote(explore, { ...below(explore, 0), text: '**Data, not shapes** The map is the `ideas` list. The live variable `place` lays it out with `mindMap(...)`, and one repeater draws the boxes, one the lines and one the fold buttons.', colour: 'sky' });
    addNote(explore, { ...below(explore, 456), text: '**Connectors** Each line joins its parent\'s box to its own box (`item.parentIndex`), so it follows when a branch folds. Lines are decoration: the outline view is the text version.', colour: 'sky' });
    addNote(explore, { ...below(explore, 912), text: '**Arrow keys** `place` says where each arrow goes from every idea (`right`, `left`, `up`, `down`). Pointing away from a folded branch unfolds it first.', colour: 'sky' });
    addNote(explore, { ...below(explore, 1368), text: '[ ] Write your own `ideas`: an empty `parent` is the middle idea, the rest name their parent by id. The order of the list is the order of the branches.', colour: 'gold' });
    addNote(build, { ...below(build, 0), text: '**Saved** `keepMap` is the setting: true saves `mine` for each learner (Save user data after every change, Load user data when the page opens), false keeps it only until they leave. Every change goes through `mindMapEdit(...)`, which adds, renames, moves and deletes.', colour: 'sky' });
    addNote(build, { ...below(build, 456), text: '**Without dragging** Move up, down, in and out do what a drag does, from the keyboard. Download writes the outline, a page with the map as a picture, or a copy that Open a saved map reads back.', colour: 'sky' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
      item('Write your own mind map: the "ideas" variable (Variables panel) is a list with an id, a parent (the id of the idea it hangs from, empty for the one in the middle), a label and a detail for each', layers.idea, explore),
      item('Keep the map to about ten ideas on a side and three levels deep. Larger maps shrink their boxes to fit, and a branch can start folded: put its id in the "folded" variable', layers.ideas, explore),
      item('Change the page title and the footer line on the Explore page', byName(explore, 'Page title'), explore),
      item('Decide whether the learner\'s map is kept for next time: the "keepMap" variable is true (kept) or false (only until they leave). The line beside the map and the Save button follow it', byName(build, 'Keep status'), build),
      item('Write what the learner should do on the Build page in the line under the map, and pick the starting idea in the "mine" variable', byName(build, 'Build hint'), build),
      item('Try Save, a download, Start a new map and Open a saved map on the Build page: open the file from "Download a copy to open later", copy it and paste it into Open a saved map', byName(build, 'Open map button'), build),
      item('Check the text version: switch to the outline on the Explore page and read it as a learner using a screen reader would. It lists every idea and its detail, so check the details say enough', byName(explore, 'View button'), explore),
      item('Try it with the keyboard: Tab to the map, arrow between ideas, Enter to open one, plus and minus to fold', undefined, explore),
    ];
    return { project, checklist };
  },
};
