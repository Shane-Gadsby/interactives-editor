//The command palette's list (Ctrl/Cmd+K): every "do this" the editor has, in plain words, with its shortcut where it has one. The
//menus, tool bar and key handler stay as they are; each command here calls the same function they do. Built fresh each time the
//palette opens, from the open project and selection, so "Go to page" lists the pages and a command that cannot run now says why.
import { clearGuidesCommand, guideCount, setGuidesLocked } from './guides';
import { openInsertComponentPicker } from './components';
import { QUESTION_KINDS, createNode, walk, type NodeType, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { prefs, setPrefs } from './prefs';
import { SNAP_ITEMS, toggleSnap } from './snapping';
import { TOOL_HELP } from '../help/context';
import { commandById, keyHints, keymapIdFor, runCommand } from './keymap';
import { openShortcuts } from './shortcuts-sheet';
import { ANIM_PRESETS, animOptions } from './animate-presets';
import { RECIPES } from './recipes';
import { ALL_PANELS, resetDock, setDock, showAll, showPanel, type PanelId } from './dock';
import { BUILT_IN, applyWorkspace, savedWorkspaces } from './workspaces';
import { lookDefaults } from './themes';
import { fontStack } from './font-catalog';
import { addQuestion } from './question-kit';
import { addPageNavigation } from './page-nav';
import { setShowRoutes, showRoutes } from './page-routes-pref';
import { openBehaviours } from '../components/BehaviourDialog';
import { requestAppAction, type AppAction } from './app-actions';
import { openShareForReview } from './comments';
import { importGiftFile } from './gift-import';
import { openPasteQuestions } from '../components/PasteQuestionsModal';
import { deleteSelectionCommand, fitPageCommand, groupArtboardsCommand, renameGroupCommand, selectionGroupInfo } from './artboard-commands';
import { pickedArtboardIds } from './artboard-groups';
import { addInteraction } from './interaction-add';
import { selectSameItems } from './layer-find';
import { linkColoursCommand } from './link-colours-action';
import { tidyArtboardsCommand } from './tidy-command';
import { openHelpSearch } from '../help/Help';
import type { BottomTab, Tool } from '../store/store';

export type CommandGroup = 'Add' | 'Selection' | 'Pages' | 'Layers' | 'Animate' | 'Behaviours' | 'View' | 'Tools' | 'Panels' | 'Workspaces' | 'Questions' | 'Project';

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** More words that find it ("box square" for Add rectangle). */
  words?: string;
  /** Its shortcut, as shown (not parsed). */
  hint?: string;
  /** A switch: whether it is on now (the palette says On or Off). */
  on?: boolean;
  /** One of a list that follows the project (a page, a layer, a saved workspace): it cannot have a key of its own. */
  dynamic?: boolean;
  /** Why it cannot run right now, when it cannot. */
  disabled?: string;
  run: () => void;
}

//Anything that wants to add commands (behaviour recipes, a later feature) registers a provider; the palette asks each when it opens
const providers = new Set<() => Command[]>();
export function registerCommandProvider(fn: () => Command[]): () => void {
  providers.add(fn);
  return () => void providers.delete(fn);
}

export const NEW_LAYERS: { type: NodeType; label: string; words: string }[] = [
  { type: 'rect', label: 'Rectangle', words: 'box square shape' },
  { type: 'ellipse', label: 'Ellipse', words: 'circle oval shape' },
  { type: 'polygon', label: 'Polygon', words: 'shape triangle' },
  { type: 'star', label: 'Star', words: 'shape' },
  { type: 'text', label: 'Text', words: 'words heading title paragraph label' },
  { type: 'frame', label: 'Frame', words: 'container group layout card' },
  { type: 'button', label: 'Button', words: 'click press' },
  { type: 'input', label: 'Input field', words: 'text box type answer form' },
  { type: 'link', label: 'Link', words: 'url hyperlink' },
  { type: 'embed', label: 'Embed', words: 'html iframe website' },
  { type: 'video', label: 'Video', words: 'movie clip' },
  { type: 'draw', label: 'Script layer', words: 'code generative' },
  { type: 'shader', label: 'Shader layer', words: 'gpu effect backdrop' },
  { type: 'progress', label: 'Progress bar', words: 'score meter' },
  { type: 'chart', label: 'Chart', words: 'graph bar pie line data' },
];

export const PANEL_NAMES: Record<PanelId, { label: string; words: string }> = {
  layers: { label: 'Layers', words: 'pages artboards list' },
  assets: { label: 'Assets', words: 'files pictures images sounds media' },
  icons: { label: 'Icons', words: 'toolbox symbols tick bell arrows vector' },
  libraries: { label: 'Libraries', words: 'components styles share' },
  comments: { label: 'Comments', words: 'review feedback notes' },
  inspector: { label: 'Properties', words: 'inspector settings' },
  timeline: { label: 'Timeline', words: 'animation keyframes' },
  logic: { label: 'Interactions', words: 'graph events logic nodes' },
  scripts: { label: 'Scripts', words: 'javascript code' },
  variables: { label: 'Variables', words: 'values state' },
  data: { label: 'Data', words: 'json csv sources' },
  a11y: { label: 'Accessibility', words: 'checker contrast alt text' },
  insights: { label: 'Insights', words: 'analytics learners results' },
  interface: { label: 'Public interface', words: 'embed api' },
  checklist: { label: 'Checklist', words: 'template things to change' },
  content: { label: 'Fill in', words: 'fill in this starter form content words questions template' },
  themes: { label: 'Themes', words: 'colours tokens' },
  usage: { label: 'Usage', words: 'unused broken references' },
  credits: { label: 'Attributions', words: 'credits sources' },
};

const BOTTOM_TABS: PanelId[] = ['timeline', 'logic', 'scripts', 'variables', 'data', 'usage', 'a11y', 'insights', 'interface', 'checklist', 'content', 'themes', 'credits'];

/** Show a panel (and bring its tab forward when it lives in the bottom tabs). */
export function openPanel(id: PanelId): void {
  setDock((l) => showPanel(l, id));
  if (BOTTOM_TABS.includes(id)) store().set({ bottomTab: id as BottomTab });
}

/** The exports the top bar has, as the app actions that run them (the page ones need an open page). */
export const EXPORTS: readonly [string, string, string][] = [
  ['export-html', 'Export: single HTML file', 'download standalone'],
  ['export-package', 'Export: project package', 'download ixp backup'],
  ['export-json', 'Export: project JSON', 'download document'],
  ['export-dts', 'Export: TypeScript definitions (.d.ts)', 'download types public interface'],
  ['export-png', 'Export: PNG picture of this page', 'download image'],
  ['export-png-1x', 'Export: PNG picture of this page at actual size', 'download image 1x'],
  ['export-svg', 'Export: SVG picture of this page', 'download image vector'],
  ['export-lottie', 'Export: Lottie animation of this page', 'download json'],
  ['export-dotlottie', 'Export: dotLottie animation of this page', 'download lottie package'],
  ['motion', 'Export: video, GIF or frames', 'download mp4 webm animation'],
];
const NO_PAGE_NEEDED = ['export-html', 'export-package', 'export-json', 'export-dts'];

/** Put the view on a page: it becomes the open one and the canvas pans and zooms to it. */
export function goToPage(id: string): void {
  const s = store();
  const ab = s.get().project.artboards.find((a) => a.id === id);
  if (!ab) return;
  s.set({ activeArtboardId: ab.id, selection: [], artboardSelected: true, activeTimelineId: null });
  const el = document.querySelector('.canvas') as HTMLElement | null;
  if (!el) return;
  const zoom = Math.min(8, Math.max(0.05, Math.min((el.clientWidth - 120) / Math.max(1, ab.width), (el.clientHeight - 120) / Math.max(1, ab.height))));
  s.set({ zoom, panX: el.clientWidth / 2 - (ab.canvasX + ab.width / 2) * zoom, panY: el.clientHeight / 2 - (ab.canvasY + ab.height / 2) * zoom });
}

/** A new layer in the middle of the open page, selected (text opens for typing). */
export function addLayerHere(type: NodeType): string | null {
  const s = store();
  const ab = s.artboard();
  if (!ab) return null;
  const proto = createNode(type);
  const font = prefs().defaultFont.trim();
  const fontDefaults = font && (type === 'text' || type === 'button' || type === 'input' || type === 'link') ? { fontFamily: fontStack(font) } : {};
  const node = createNode(type, {
    x: Math.round((ab.width - (type === 'text' ? 0 : proto.width)) / 2),
    y: Math.round((ab.height - (type === 'text' ? 0 : proto.height)) / 2),
    ...fontDefaults,
    ...lookDefaults(s.get().project, type),
  } as never);
  s.addNodes([node], { artboardId: ab.id });
  if (node.type === 'text') s.set({ editingTextId: node.id });
  return node.id;
}


export function buildCommands(): Command[] {
  const s = store();
  const st = s.get();
  const p = st.project;
  const ab = s.artboard();
  const sel = s.selectedNodes();
  const one: SceneNode | null = sel.length === 1 ? sel[0] : null;
  const noPage = ab ? undefined : 'Open a page first';
  const noSel = sel.length ? undefined : 'Select a layer first';
  const noOne = one ? undefined : 'Select one layer first';
  const pr = prefs();
  const out: Command[] = [];
  const add = (c: Command) => void out.push(c);

  //---- Add
  for (const l of NEW_LAYERS) add({ id: `add:${l.type}`, title: `Add ${l.label.toLowerCase()}`, group: 'Add', words: `new insert create ${l.words}`, disabled: noPage, run: () => void addLayerHere(l.type) });
  add({ id: 'add:page', title: 'Add a page', group: 'Pages', words: 'new artboard screen slide', run: () => void s.addArtboard() });

  //---- Questions
  for (const k of QUESTION_KINDS) {
    add({
      id: `question:${k.value}`,
      title: `Add question: ${k.label}`,
      group: 'Questions',
      words: `quiz test ${k.hint ?? ''}`,
      disabled: noPage,
      run: () => {
        let id: string | null = null;
        s.update((d) => void (id = addQuestion(d, ab!.id, k.value)));
        if (id) s.select([id], { artboardId: ab!.id });
      },
    });
  }
  add({ id: 'question:paste', title: 'Paste questions from Word or Excel', group: 'Questions', words: 'import quiz table spreadsheet docx xlsx csv', run: openPasteQuestions });
  add({ id: 'question:gift', title: 'Import questions from a GIFT file', group: 'Questions', words: 'moodle quiz', run: () => void importGiftFile() });

  //---- Pages
  p.artboards.forEach((a) => add({ id: `page:${a.id}`, title: `Go to page: ${a.name}`, group: 'Pages', words: 'open show jump', dynamic: true, run: () => goToPage(a.id) }));
  add({ id: 'page:component', title: 'Insert a component here…', group: 'Pages', words: 'place instance embed page artboard reuse', disabled: noPage ?? (p.artboards.length < 2 ? 'Needs two or more pages' : undefined), run: () => void openInsertComponentPicker() });
  add({ id: 'page:start', title: 'Make this the start page', group: 'Pages', words: 'first page opens', disabled: noPage ?? (p.settings.startArtboardId === ab?.id ? 'It already is' : undefined), run: () => s.update((d) => void (d.settings.startArtboardId = ab!.id)) });
  add({ id: 'page:duplicate', title: 'Duplicate this page', group: 'Pages', words: 'copy artboard', disabled: noPage, run: () => s.duplicateArtboards([ab!.id]) });
  add({ id: 'page:nav', title: 'Add Back and Next buttons to every page', group: 'Pages', words: 'navigation arrows move between pages', disabled: p.artboards.length < 2 ? 'Needs two or more pages' : undefined, run: () => s.update((d) => void addPageNavigation(d, d.artboards.map((a) => a.id), 'back-next')) });
  add({ id: 'page:tidy', title: 'Tidy up the pages on the canvas', group: 'Pages', words: 'arrange grid artboards', disabled: p.artboards.filter((a) => !a.canvasHidden).length < 2 ? 'Needs two or more pages' : undefined, run: () => tidyArtboardsCommand() });
  add({ id: 'page:zoom', title: 'Zoom to the open page', group: 'Pages', words: 'fit artboard view', disabled: noPage, run: () => void runCommand('zoom-page') });
  add({ id: 'page:fit-selection', title: 'Fit page to selection', group: 'Pages', words: 'artboard resize shrink wrap crop trim bounds selected layers', disabled: noPage ?? noSel, run: () => void fitPageCommand() });
  add({ id: 'page:fit-padding', title: 'Fit page to selection with space around…', group: 'Pages', words: 'artboard resize padding margin selected layers', disabled: noPage ?? noSel, run: () => void fitPageCommand({ ask: true }) });
  add({ id: 'page:fit-layers', title: 'Fit page to all its layers', group: 'Pages', words: 'artboard resize shrink wrap crop trim bounds', disabled: noPage ?? (ab?.children.length ? undefined : 'This page has no layers'), run: () => void fitPageCommand({ layers: true }) });
  add({ id: 'page:group', title: 'Group the picked pages…', group: 'Pages', words: 'folder artboards together', disabled: noPage, run: () => void groupArtboardsCommand(pickedArtboardIds(s.get())) });
  add({ id: 'page:master', title: 'Make this page a master', group: 'Pages', words: 'page master shared layers logo footer', disabled: noPage ?? (ab?.isMaster ? 'It already is' : ab?.master ? 'It uses a master itself' : ab?.library ? 'A library page is read-only' : undefined), run: () => s.markAsMaster(ab!.id, true) });
  {
    const picked = pickedArtboardIds(s.get());
    const group = picked.length ? selectionGroupInfo(picked) : null;
    add({ id: 'page:ungroup', title: 'Take the picked pages out of their group', group: 'Pages', words: 'folder artboards ungroup leave', disabled: noPage ?? (group?.inAGroup ? undefined : 'The picked pages are not in a group'), run: () => s.leaveArtboardGroups(picked) });
    add({ id: 'page:rename-group', title: 'Rename the group of the picked pages…', group: 'Pages', words: 'folder artboards', disabled: noPage ?? (group?.oneGroup ? undefined : 'Pick pages from one group first'), run: () => void renameGroupCommand(group!.oneGroup!) });
    add({ id: 'page:select-group', title: 'Pick every page in the same group', group: 'Pages', words: 'folder artboards select all', disabled: noPage ?? (group?.oneGroup ? undefined : 'Pick pages from one group first'), run: () => s.pickGroup(group!.oneGroup!) });
  }
  add({ id: 'page:edit-master', title: 'Select the master this page draws', group: 'Pages', words: 'page master shared layers', disabled: noPage ?? (ab?.master ? undefined : 'This page does not use a master'), run: () => s.editMasterOf(ab!.id) });
  add({ id: 'page:unmaster', title: 'Stop this page being a master', group: 'Pages', words: 'page master shared layers', disabled: noPage ?? (ab?.isMaster ? undefined : 'This page is not a master'), run: () => s.markAsMaster(ab!.id, false) });
  add({ id: 'page:link-colours', title: 'Link colours to tokens…', group: 'Pages', words: 'theme tokens plain colours', disabled: noPage, run: () => void linkColoursCommand(pickedArtboardIds(s.get())) });
  add({ id: 'page:arrows', title: 'Page arrows on the canvas', group: 'View', words: 'routes links between pages show hide', on: showRoutes(), run: () => setShowRoutes(!showRoutes()) });

  //---- Layers: go to one of the open page's layers
  if (ab) {
    let n = 0;
    walk(ab.children, (l) => {
      if (n++ < 80) add({ id: `layer:${l.id}`, title: `Select layer: ${l.name}`, group: 'Layers', words: `go to find ${l.type}`, dynamic: true, run: () => s.select([l.id], { artboardId: ab.id }) });
    });
  }

  //---- Selection
  const selCmd = (id: string, title: string, run: () => void, extra: Partial<Command> = {}) => add({ id: `sel:${id}`, title, group: 'Selection', disabled: noSel, run, ...extra });
  selCmd('all', 'Select all on this page', () => s.select(ab!.children.filter((l) => !l.locked).map((l) => l.id)), { hint: keyHints('select-all'), disabled: noPage });
  selCmd('duplicate', 'Duplicate', () => s.duplicateSelection(), { hint: keyHints('duplicate'), words: 'copy' });
  selCmd('delete', 'Delete', () => void deleteSelectionCommand(), { hint: keyHints('delete'), words: 'remove' });
  selCmd('group', 'Group', () => s.groupSelection(), { hint: keyHints('group'), words: 'together' });
  selCmd('ungroup', 'Ungroup', () => s.ungroupSelection(), { hint: keyHints('ungroup'), disabled: one && (one.type === 'group' || one.type === 'frame') ? undefined : 'Select a group or frame first' });
  selCmd('front', 'Bring to front', () => s.reorder(Infinity), { hint: keyHints('front'), words: 'order top' });
  selCmd('forward', 'Bring forward', () => s.reorder(1), { hint: keyHints('forward'), words: 'order' });
  selCmd('backward', 'Send backward', () => s.reorder(-1), { hint: keyHints('backward'), words: 'order' });
  selCmd('back', 'Send to back', () => s.reorder(-Infinity), { hint: keyHints('back'), words: 'order bottom' });
  const hidden = sel.length > 0 && sel.every((l) => l.visible === false);
  selCmd('hide', hidden ? 'Show the selected layers' : 'Hide the selected layers', () => s.setProps(sel.map((l) => l.id), { visible: hidden }), { words: hidden ? 'visible unhide' : 'invisible' });
  const locked = sel.length > 0 && sel.every((l) => l.locked);
  selCmd('lock', locked ? 'Unlock the selected layers' : 'Lock the selected layers', () => s.setProps(sel.map((l) => l.id), { locked: !locked }), { words: locked ? 'stop moving free' : 'stop moving' });
  for (const op of ['union', 'subtract', 'intersect', 'exclude'] as const) {
    selCmd(op, `Combine shapes: ${op}`, () => s.booleanSelection(op), { words: 'boolean pathfinder merge cut shapes', disabled: sel.length > 1 ? undefined : 'Select two or more shapes first' });
  }
  const same = (ab && one ? selectSameItems(ab, one) : []) as { disabled?: boolean; onClick?: () => void }[];
  selCmd('same-fill', 'Select every layer with the same fill', () => same[0]?.onClick?.(), { words: 'colour match', disabled: noOne ?? (same[0]?.disabled ? 'This layer has no fill' : undefined) });
  selCmd('same-font', 'Select every layer in the same font', () => same[1]?.onClick?.(), { words: 'typeface text match', disabled: noOne ?? (same[1]?.disabled ? 'This layer has no font' : undefined) });

  //---- Animate
  for (const a of ANIM_PRESETS) {
    add({ id: `animate:${a.id}`, title: `Animate: ${a.label}`, group: 'Animate', words: `animation preset entrance ${a.tip}`, disabled: noSel, run: () => void s.applyAnimation(sel.map((l) => l.id), a.id, animOptions()) });
  }

  //---- Behaviours
  for (const r of RECIPES) {
    add({
      id: `behaviour:${r.id}`,
      title: `When clicked: ${r.label}`,
      group: 'Behaviours',
      words: `interaction recipe behaviour ${r.group} ${r.hint}`,
      disabled: noOne,
      run: () => openBehaviours({ abId: ab!.id, layerId: one!.id, trigger: 'click', recipe: r.id }),
    });
  }

  for (const [id, title, trigger] of [['click', 'When clicked…', 'click'], ['hover', 'When hovered…', 'pointerenter']] as const) {
    add({ id: `behaviour:${id}`, title: `Add an interaction: ${title.toLowerCase()}`, group: 'Behaviours', words: 'interaction recipe behaviour choose', disabled: noOne, run: () => openBehaviours({ abId: ab!.id, layerId: one!.id, trigger }) });
  }
  for (const [id, title, type] of [['empty-click', 'an empty On click event', 'click'], ['empty-hover', 'an empty On hover event', 'pointerenter']] as const) {
    add({ id: `behaviour:${id}`, title: `Add ${title}`, group: 'Behaviours', words: 'interaction event graph pointer nothing joined', disabled: noOne, run: () => addInteraction(ab!, one!.id, type) });
  }

  //---- View and toggles
  add({ id: 'view:fit', title: 'Zoom to fit everything', group: 'View', hint: keyHints('zoom-fit'), run: () => void runCommand('zoom-fit') });
  add({ id: 'view:selection', title: 'Zoom to the selection', group: 'View', hint: keyHints('zoom-selection'), run: () => void runCommand('zoom-selection') });
  add({ id: 'view:100', title: 'Zoom to 100%', group: 'View', hint: keyHints('zoom-100'), words: 'actual size', run: () => void runCommand('zoom-100') });
  add({ id: 'view:zoom-in', title: 'Zoom in', group: 'View', words: 'bigger closer magnify', run: () => void runCommand('zoom-in') });
  add({ id: 'view:zoom-out', title: 'Zoom out', group: 'View', words: 'smaller further', run: () => void runCommand('zoom-out') });
  add({ id: 'view:grid', title: 'Show the grid', group: 'View', hint: keyHints('toggle-grid'), on: pr.showGrid, words: 'toggle lines', run: () => setPrefs({ showGrid: !prefs().showGrid }) });
  add({ id: 'view:rulers', title: 'Show rulers', group: 'View', hint: keyHints('toggle-rulers'), on: pr.rulers, words: 'toggle guides', run: () => setPrefs({ rulers: !prefs().rulers }) });
  {
    const nothing = guideCount(p) === 0;
    add({ id: 'view:guides-lock', title: p.guidesLocked ? 'Unlock the guides' : 'Lock the guides', group: 'View', words: 'ruler guides stop moving', on: !!p.guidesLocked, run: () => setGuidesLocked(!p.guidesLocked) });
    add({ id: 'view:guides-clear', title: 'Clear all guides', group: 'View', words: 'ruler guides remove delete', disabled: noPage ?? (nothing ? 'There are no guides' : p.guidesLocked ? 'The guides are locked' : undefined), run: () => clearGuidesCommand('all', ab!.id) });
  }
  add({ id: 'view:notes', title: 'Show notes', group: 'View', on: pr.showNotes, words: 'sticky toggle', run: () => setPrefs({ showNotes: !prefs().showNotes }) });
  add({ id: 'view:bones', title: 'Show bones', group: 'View', hint: keyHints('toggle-bones'), on: st.showBones, words: 'rig toggle', run: () => s.set({ showBones: !store().get().showBones }) });
  add({ id: 'snap:on', title: 'Snapping', group: 'View', on: pr.snapOn, words: 'snap toggle magnet align', run: () => toggleSnap('on') });
  for (const i of SNAP_ITEMS) add({ id: `snap:${i.kind}`, title: `Snap to ${i.label.toLowerCase()}`, group: 'View', hint: i.kind === 'grid' ? keyHints('snap-grid') : undefined, on: !!pr[i.pref], words: `snapping toggle ${i.tip}`, run: () => toggleSnap(i.kind) });

  //---- Tools
  for (const tool of Object.keys(TOOL_HELP) as Tool[]) add({ id: `tool:${tool}`, title: `Tool: ${TOOL_HELP[tool].label.replace(/ tool$/i, '')}`, group: 'Tools', hint: keyHints(`tool.${tool}`), words: 'draw pick', run: () => s.set({ tool, editingPathId: null }) });

  //---- Timeline
  add({ id: 'timeline:record', title: 'Record: property changes become keys', group: 'Animate', words: 'keyframe auto recording', on: st.recording, disabled: noPage, run: () => s.set({ recording: !store().get().recording }) });
  add({ id: 'timeline:new', title: 'New timeline', group: 'Animate', words: 'add animation', disabled: noPage, run: () => void s.addTimeline() });

  //---- Panels and workspaces
  for (const id of ALL_PANELS) {
    const n = PANEL_NAMES[id];
    add({
      id: `panel:${id}`,
      title: `Open ${n.label}`,
      group: 'Panels',
      words: `show panel tab ${n.words}`,
      run: () => openPanel(id),
    });
  }
  add({ id: 'dock:reset', title: 'Put the panels back where they started', group: 'Panels', words: 'reset layout dock arrangement', run: () => (resetDock(), s.set({ bottomTab: 'timeline' })) });
  add({ id: 'dock:show-all', title: 'Show all panels and tools', group: 'Panels', words: 'essentials unhide everything', run: () => setDock(showAll) });
  add({ id: 'dock:fold-top', title: 'Fold or unfold the top panels', group: 'Panels', words: 'collapse tabs', run: () => setDock((l) => ({ ...l, topFolded: !l.topFolded })) });
  for (const w of BUILT_IN) add({ id: `workspace:${w.id}`, title: `Workspace: ${w.name}`, group: 'Workspaces', words: `layout arrangement panels ${w.about}`, run: () => applyWorkspace(w.make()) });
  for (const w of savedWorkspaces()) add({ id: `workspace:${w.id}`, title: `Workspace: ${w.name}`, group: 'Workspaces', words: 'layout arrangement panels saved', dynamic: true, run: () => applyWorkspace(w) });

  //---- Project
  add({ id: 'project:preview', title: 'Preview', group: 'Project', words: 'play run test', run: () => requestAppAction('preview') });
  add({ id: 'project:share', title: 'Share', group: 'Project', words: 'link publish studydesk embed learners', run: () => requestAppAction('share') });
  add({ id: 'project:invite', title: 'Invite people to edit', group: 'Project', words: 'collaborate share', run: () => requestAppAction('invite') });
  add({ id: 'project:review', title: 'Share for review', group: 'Project', words: 'comments reviewers feedback link', run: () => openShareForReview() });
  add({ id: 'project:template', title: 'Save as a template', group: 'Project', words: 'starter copy', run: () => requestAppAction('template') });
  add({ id: 'project:history', title: 'Revision history', group: 'Project', words: 'versions restore earlier', run: () => requestAppAction('history') });
  add({ id: 'project:prefs', title: 'Preferences', group: 'Project', words: 'settings options', run: () => requestAppAction('prefs') });
  add({ id: 'project:save', title: 'Save now', group: 'Project', hint: keyHints('save'), run: () => void (window as unknown as { __ixForceSave?: () => Promise<void> }).__ixForceSave?.() });
  add({ id: 'project:undo', title: 'Undo', group: 'Project', hint: keyHints('undo'), disabled: s.canUndo() ? undefined : 'Nothing to undo', run: () => s.undo() });
  add({ id: 'project:redo', title: 'Redo', group: 'Project', hint: keyHints('redo'), disabled: s.canRedo() ? undefined : 'Nothing to redo', run: () => s.redo() });
  for (const [id, title, words] of EXPORTS) {
    add({ id: `project:${id}`, title, group: 'Project', words, disabled: NO_PAGE_NEEDED.includes(id) ? undefined : noPage, run: () => requestAppAction(id as AppAction) });
  }
  add({ id: 'project:reference', title: 'Public interface reference…', group: 'Project', words: 'embedding page set read hear api', run: () => requestAppAction('reference') });
  add({ id: 'project:home', title: 'Back to all projects', group: 'Project', words: 'home close projects list', run: () => requestAppAction('home') });
  add({ id: 'project:keys', title: 'Keyboard shortcuts', group: 'Project', hint: keyHints('shortcuts'), words: 'keys sheet rebind customise keymap', run: () => openShortcuts(false) });
  add({ id: 'project:help', title: 'Search the help', group: 'Project', hint: keyHints('help-search'), words: 'docs how to', run: () => openHelpSearch() });

  for (const fn of providers) {
    try {
      out.push(...fn());
    } catch {
      /* a provider that breaks only loses its own commands */
    }
  }
  //Any command with a key in the keymap shows it (the person's own keys too), whether or not it was given a hint above
  for (const c of out) if (!c.hint) c.hint = commandById(keymapIdFor(c.id)) ? keyHints(keymapIdFor(c.id)) || undefined : undefined;
  return out;
}

//---------------------------------------------------------------------------------------------------------------------
//Finding

/** Rank commands for what was typed: every word has to turn up somewhere, earlier and in the title is better. */
export function searchCommands(list: Command[], query: string, limit = 30): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { c: Command; score: number; at: number }[] = [];
  list.forEach((c, at) => {
    const title = c.title.toLowerCase();
    const extra = `${c.group} ${c.words ?? ''}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const t = title.indexOf(w);
      if (t >= 0) score += (t === 0 ? 12 : title[t - 1] === ' ' || title[t - 1] === ':' ? 8 : 4) + (title === w ? 10 : 0);
      else if (extra.split(/\s+/).some((x) => x.startsWith(w))) score += 3;
      else if (extra.includes(w)) score += 1;
      else return;
    }
    scored.push({ c, score: score - (c.disabled ? 2 : 0), at });
  });
  return scored.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, limit).map((x) => x.c);
}

const RECENT_KEY = 'ix-palette-recent';
export function recentCommandIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').filter((x: unknown) => typeof x === 'string').slice(0, 6);
  } catch {
    return [];
  }
}
export function noteCommandUsed(id: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCommandIds().filter((x) => x !== id)].slice(0, 6)));
  } catch {
    /* storage unavailable: no recents */
  }
}

/** What shows before anything is typed: the ones used lately, then the first few of the usual. */
export function suggestedCommands(list: Command[]): Command[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const recent = recentCommandIds().map((id) => byId.get(id)).filter((c): c is Command => !!c);
  const usual = ['add:text', 'add:button', 'add:page', 'project:preview', 'project:share', 'view:grid', 'panel:timeline', 'panel:logic'].map((id) => byId.get(id)).filter((c): c is Command => !!c && !recent.includes(c));
  return [...recent, ...usual].slice(0, 10);
}

